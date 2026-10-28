// Fork (matt/single-pane) verification + screenshots.
//
//   node demo/fork/shots.mjs [--out=<dir>] [--only=desktop,ipad-land,...] [--scenarios=stairs,...]
//
// For every viewport (desktop 1440, iPad 1366x1024 and 1024x1366 with touch
// emulation, phone 390) it loads the synthetic three-level fixture
// (demo/fork/fixture.mjs), drives each fork feature with REAL input
// (page.mouse / page.touchscreen), asserts the observable outcome through
// check(), and saves screenshots. Exit code is non-zero on any failed check.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, check, finish } from '../serve.mjs';
import { FORK_CONFIG, FORK_LAYOUT, FORK_ENTITIES } from './fixture.mjs';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = resolve(arg('out', '/Users/matta/gitlab/home-assistant/dashboards/v2/houseplan/fork-shots'));
const VIEWPORTS = [
  { key: 'desktop', size: { width: 1440, height: 900 }, touch: false },
  { key: 'ipad-land', size: { width: 1366, height: 1024 }, touch: true },
  { key: 'ipad-port', size: { width: 1024, height: 1366 }, touch: true },
  { key: 'phone', size: { width: 390, height: 844 }, touch: true },
];
const only = arg('only', '').split(',').filter(Boolean);
const scenarios = arg('scenarios', '').split(',').filter(Boolean);
const want = (name) => !scenarios.length || scenarios.includes(name);
const CARD_OPTIONS = {
  level_nav: 'indicator',
  scene_dock: [
    { entity: 'script.night_study', icon: 'mdi:book-open-variant', name: 'Study' },
    { entity: 'script.late_night_chill', icon: 'mdi:weather-night', name: 'Chill' },
    { entity: 'scene.all_off', icon: 'mdi:power', name: 'All off' },
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(page, options = CARD_OPTIONS) {
  await page.evaluate(async ({ config, layout, entities, options }) => {
    const host = document.getElementById('host');
    host.style.width = '100vw'; host.style.padding = '0'; host.style.boxSizing = 'border-box';
    document.body.style.margin = '0';
    for (const [id, area, state, attributes] of entities) {
      window.__addRegistryEntity(id, area, state, 'demo', {}, attributes);
    }
    const card = window.__card;
    card.hass = {
      ...card.hass,
      services: { ...card.hass.services, script: { turn_on: {} }, scene: { turn_on: {} } },
    };
    card.setConfig({ type: 'custom:houseplan-card', title: 'House', icon_size: 3, ...options });
    await window.__hpTest.setServerConfig(config);
    await window.__hpTest.setLayout(layout);
    await window.__hpTest.setMode('view');
    await window.__card._tabClick('main');
    card.hass = { ...card.hass };
    await window.__hpTest.settled();
  }, { config: FORK_CONFIG, layout: FORK_LAYOUT, entities: FORK_ENTITIES, options });
  await settle(page);
}

/** Wait for boot, camera transition and Lit to settle. */
async function settle(page, extra = 120) {
  await page.waitForFunction(() => {
    const c = window.__card;
    return c && !c._booting && !c._bootSoft && !c._cameraTransition?.active && !c._refitRaf;
  }, { timeout: 8000 });
  await page.evaluate(() => window.__card.updateComplete);
  await sleep(extra);
}

const state = (page) => page.evaluate(() => {
  const c = window.__card;
  return {
    space: c._space, zoom: c._zoom, view: c._view ? { ...c._view } : null,
    focus: c._focusNode ? { ...c._focusNode } : null,
  };
});

/** Screen centre of an element inside the card's shadow tree. */
const centerOf = (page, selector) => page.evaluate((sel) => {
  const el = window.__card.renderRoot.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}, selector);

/** Screen point of a normalized plan coordinate (flat projection). */
const screenOfPlan = (page, nx, ny) => page.evaluate(([x, y]) => {
  const c = window.__card;
  const svg = c.renderRoot.querySelector('.plan-svg');
  const p = new DOMPoint(x * 1000, y * 1000).matrixTransform(svg.getScreenCTM());
  return { x: p.x, y: p.y };
}, [nx, ny]);

async function tap(page, vp, point) {
  if (vp.touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

/** Where a plan point sits relative to the chrome-free part of the stage:
 *  fx/fy are 0.5 when it is centred in the area left by the fork chrome. */
const stageFraction = (page, nx, ny) => page.evaluate(([x, y]) => {
  const c = window.__card;
  const v = c._view;
  const stage = c.renderRoot.querySelector('.stage');
  const W = stage.clientWidth, H = stage.clientHeight;
  const i = c._chromeInsets();
  const px = ((x * 1000 - v.x) / v.w) * W, py = ((y * 1000 - v.y) / v.h) * H;
  return { fx: (px - i.left) / (W - i.left - i.right), fy: (py - i.top) / (H - i.top - i.bottom) };
}, [nx, ny]);

/** Close any surface left open, return to the main level, fit all. */
async function reset(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(async () => {
    const c = window.__card;
    c._closeInfoCard?.();
    c._tapConfirm = null;
    if (c._space !== 'main') c._tabClick('main');
    await c.updateComplete;
    c._fitAll('fit');
  });
  await settle(page, 200);
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function shot(page, vp, name) {
  const dir = resolve(OUT, vp.key);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${name}.png`);
  await page.screenshot({ path });
  return path;
}

// ---------------------------------------------------------------- scenarios

async function scenarioStairs(page, vp) {
  const tag = `${vp.key}.stairs`;
  await page.evaluate(() => window.__card._fitAll('fit'));
  await settle(page);
  await shot(page, vp, '01-stairs-0-main');
  const up = await centerOf(page, '[data-hp="stair"][data-id="main-up"] .hp-stair-hit');
  check(`${tag}: main-up stair rendered`, !!up);
  if (!up) return;
  await tap(page, vp, up);
  await sleep(90);
  await shot(page, vp, '01-stairs-1-flying-to-upper');
  await settle(page, 250);
  let s = await state(page);
  check(`${tag}: stair switched to upper`, s.space, 'upper');
  let f = await stageFraction(page, 0.78, 0.5);
  check(`${tag}: upper landing stair centred`, near(f.fx, 0.5, 0.06) && near(f.fy, 0.5, 0.06), true);
  check(`${tag}: upper landing not zoomed out`, s.zoom >= 0.99, true);
  await shot(page, vp, '01-stairs-2-landed-upper');
  const down = await centerOf(page, '[data-hp="stair"][data-id="up-down"] .hp-stair-hit');
  await tap(page, vp, down);
  await sleep(90);
  await shot(page, vp, '01-stairs-3-flying-back-main');
  await settle(page, 250);
  s = await state(page);
  check(`${tag}: return trip switched to main`, s.space, 'main');
  f = await stageFraction(page, 0.88, 0.475);
  check(`${tag}: main landing is the stair that leads up`, near(f.fx, 0.5, 0.06) && near(f.fy, 0.5, 0.06), true);
  await shot(page, vp, '01-stairs-4-landed-main');
  // Down to the lower level and back.
  await page.evaluate(() => window.__card._fitAll('fit'));
  await settle(page);
  const mainDown = await centerOf(page, '[data-hp="stair"][data-id="main-down"] .hp-stair-hit');
  await tap(page, vp, mainDown);
  await settle(page, 300);
  s = await state(page);
  check(`${tag}: main-down switched to lower`, s.space, 'lower');
  f = await stageFraction(page, 0.45, 0.55);
  check(`${tag}: lower landing centred`, near(f.fx, 0.5, 0.06) && near(f.fy, 0.5, 0.06), true);
  await shot(page, vp, '01-stairs-5-landed-lower');
  await page.evaluate(() => window.__card._tabClick('main'));
  await settle(page);
}

async function scenarioLevels(page, vp) {
  const tag = `${vp.key}.levels`;
  await page.evaluate(() => window.__card._tabClick('main'));
  await page.evaluate(() => window.__card._fitAll('fit'));
  await settle(page);
  const info = await page.evaluate(() => {
    const root = window.__card.renderRoot;
    return {
      tabs: root.querySelectorAll('[data-hp="space-tab"]').length,
      glyphs: [...root.querySelectorAll('[data-hp="fork-level"]')].map((b) => ({
        id: b.dataset.id, current: b.classList.contains('current'), text: b.textContent.trim(),
      })),
    };
  });
  check(`${tag}: View has no text tab strip`, info.tabs, 0);
  check(`${tag}: one glyph per level, tab order top-to-bottom`, info.glyphs.map((g) => g.id), ['upper', 'main', 'lower']);
  check(`${tag}: current level highlighted`, info.glyphs.filter((g) => g.current).map((g) => g.id), ['main']);
  check(`${tag}: glyphs carry no text`, info.glyphs.every((g) => g.text === ''), true);
  await shot(page, vp, '02-levels-0-main');
  const upper = await centerOf(page, '[data-hp="fork-level"][data-id="upper"]');
  await tap(page, vp, upper);
  await sleep(80);
  await shot(page, vp, '02-levels-1-flying-upper');
  await settle(page, 250);
  let s = await state(page);
  check(`${tag}: glyph switched to upper`, s.space, 'upper');
  const frame = await page.evaluate(() => {
    const c = window.__card;
    const [x, y, w, h] = c._baseVb();
    const v = c._view;
    const stage = c.renderRoot.querySelector('.stage').getBoundingClientRect();
    const levels = c.renderRoot.querySelector('[data-hp="fork-levels"]').getBoundingClientRect();
    const ppu = stage.width / v.w;
    return {
      inside: x >= v.x - 1e-6 && y >= v.y - 1e-6 && x + w <= v.x + v.w + 1e-6 && y + h <= v.y + v.h + 1e-6,
      clear: stage.left + (x + w - v.x) * ppu <= levels.left + 1,
    };
  });
  check(`${tag}: glyph lands on fit-all (whole level visible)`, frame.inside, true);
  check(`${tag}: fit-all keeps the level clear of the indicator`, frame.clear, true);
  await shot(page, vp, '02-levels-2-upper');
  const lower = await centerOf(page, '[data-hp="fork-level"][data-id="lower"]');
  await tap(page, vp, lower);
  await settle(page, 300);
  s = await state(page);
  check(`${tag}: glyph switched to lower`, s.space, 'lower');
  await shot(page, vp, '02-levels-3-lower');
  // Editors keep the text tabs.
  const editorTabs = await page.evaluate(async () => {
    await window.__hpTest.setMode('plan');
    const n = window.__card.renderRoot.querySelectorAll('[data-hp="space-tab"]').length;
    await window.__hpTest.setMode('view');
    return n;
  });
  check(`${tag}: editors keep the tab strip`, editorTabs, 3);
  await page.evaluate(() => window.__card._tabClick('main'));
  await settle(page);
}

async function scenarioNested(page, vp) {
  const tag = `${vp.key}.nested`;
  const hints = () => page.evaluate(() => [...window.__card.renderRoot
    .querySelectorAll('[data-hp="fork-focus-hint"]')].map((n) => n.dataset.id));
  await shot(page, vp, '03-nested-0-level');
  check(`${tag}: no step-out at the level`, !!(await centerOf(page, '[data-hp="fork-stepout"]')), false);
  // 1. living room (clean tap on an empty spot, after the double-tap window)
  await tap(page, vp, await screenOfPlan(page, 0.12, 0.42));
  await sleep(420);
  await settle(page, 200);
  let s = await state(page);
  check(`${tag}: tap on room fits the room`, s.focus, { kind: 'room', id: 'living' });
  check(`${tag}: rack target hinted inside the room`, await hints(page), ['rack']);
  await shot(page, vp, '03-nested-1-room');
  const roomZoom = s.zoom;
  // 2. rack — tap ON the Hue bridge marker inside the rack: markers of a
  // target you have not entered are painted but inert, the rack takes it.
  const hueInert = await page.evaluate(() => window.__card.renderRoot
    .querySelector('[data-hp="device"][data-id="m-hue"]')?.classList.contains('fork-nested'));
  check(`${tag}: rack markers inert before entering the rack`, hueInert, true);
  await tap(page, vp, await centerOf(page, '[data-hp="device"][data-id="m-hue"]'));
  await sleep(420);
  await settle(page, 200);
  s = await state(page);
  check(`${tag}: tap inside rack flies to rack`, s.focus, { kind: 'region', id: 'rack' });
  check(`${tag}: rack is a deeper zoom level`, s.zoom > roomZoom * 1.5, true);
  check(`${tag}: faceplate target hinted inside the rack`, await hints(page), ['udm']);
  await shot(page, vp, '03-nested-2-rack');
  const rackZoom = s.zoom;
  // 3. UDM faceplate — tap ON a port marker (inert until the faceplate is entered)
  check(`${tag}: rack markers tappable inside the rack`, await page.evaluate(() => window.__card.renderRoot
    .querySelector('[data-hp="device"][data-id="m-hue"]')?.classList.contains('fork-nested')), false);
  await tap(page, vp, await centerOf(page, '[data-hp="device"][data-id="m-port-4"]'));
  await sleep(420);
  await settle(page, 200);
  s = await state(page);
  check(`${tag}: tap inside faceplate flies to faceplate`, s.focus, { kind: 'region', id: 'udm' });
  check(`${tag}: faceplate is a deeper zoom level`, s.zoom > rackZoom * 1.1, true);
  await shot(page, vp, '03-nested-3-faceplate');
  // 4. a marker inside the zoomed faceplate keeps its own tap (never a fly-in)
  const before = await state(page);
  const port = await centerOf(page, '[data-hp="device"][data-id="m-port-2"]');
  check(`${tag}: port marker painted at faceplate zoom`, !!port && port.w >= 12, true);
  if (port) {
    await tap(page, vp, port);
    await sleep(450);
    await settle(page, 150);
    const after = await state(page);
    check(`${tag}: marker tap keeps the faceplate focus`, after.focus, before.focus);
    check(`${tag}: marker tap keeps the camera`, Math.abs(after.zoom - before.zoom) < 1e-6, true);
    await shot(page, vp, '03-nested-4-marker-tap');
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => { window.__card._closeInfoCard?.(); window.__card._callout = null; window.__card.requestUpdate(); });
    await settle(page, 100);
  }
  // 5. step out one level at a time
  const stepOut = async (expect, name) => {
    await tap(page, vp, await centerOf(page, '[data-hp="fork-stepout"]'));
    await settle(page, 250);
    const now = await state(page);
    check(`${tag}: step out → ${name}`, now.focus, expect);
    return now;
  };
  await stepOut({ kind: 'region', id: 'rack' }, 'rack');
  await shot(page, vp, '03-nested-5-back-rack');
  await stepOut({ kind: 'room', id: 'living' }, 'room');
  await shot(page, vp, '03-nested-6-back-room');
  const level = await stepOut(null, 'level');
  check(`${tag}: step out reaches the whole level`, level.zoom < roomZoom, true);
  await shot(page, vp, '03-nested-7-back-level');
  // 6. from the faceplate, double-tap = Fit all (whole level) at once
  await page.evaluate(() => window.__card._fitRegion('udm'));
  await settle(page, 200);
  const p = await screenOfPlan(page, 0.4605, 0.131);
  await tap(page, vp, p); await sleep(120); await tap(page, vp, p);
  await settle(page, 300);
  s = await state(page);
  check(`${tag}: double-tap at faceplate = Fit all`, s.focus, null);
}

async function scenarioAuthoring(page, vp) {
  const tag = `${vp.key}.authoring`;
  await page.evaluate((options) => window.__card.setConfig({
    type: 'custom:houseplan-card', title: 'House', icon_size: 3, ...options, focus_edit: true,
  }), CARD_OPTIONS);
  await settle(page);
  await page.evaluate(() => window.__card._fitRoom('living'));
  await settle(page, 200);
  // Frame the TV corner by zooming the camera, then save it as a target.
  await page.evaluate(() => {
    const c = window.__card;
    c._applyView(c._zoom * 2.4, 90, 480);
    c.requestUpdate();
  });
  await settle(page, 150);
  await shot(page, vp, '03-nested-8-author-framed');
  await tap(page, vp, await centerOf(page, '[data-hp="fork-focus-add"]'));
  await page.evaluate(() => window.__hpTest.waitForWrites());
  await settle(page, 150);
  const saved = await page.evaluate(() => window.__card._serverCfg.spaces
    .find((s) => s.id === 'main').focus_regions.map((r) => ({ ...r })));
  const added = saved.find((r) => !['rack', 'udm'].includes(r.id));
  check(`${tag}: + saves the framed view as a target inside the room`, !!added && added.room_id === 'living', true);
  check(`${tag}: the new target is the current position`, (await state(page)).focus?.id, added?.id);
  await shot(page, vp, '03-nested-9-author-saved');
  await tap(page, vp, await centerOf(page, '[data-hp="fork-focus-remove"]'));
  await page.evaluate(() => window.__hpTest.waitForWrites());
  await settle(page, 250);
  const after = await page.evaluate(() => window.__card._serverCfg.spaces
    .find((s) => s.id === 'main').focus_regions.map((r) => r.id));
  check(`${tag}: − removes the current target and steps out`, after, ['rack', 'udm']);
  check(`${tag}: after removal the room is the position`, (await state(page)).focus, { kind: 'room', id: 'living' });
  await page.evaluate((options) => window.__card.setConfig({
    type: 'custom:houseplan-card', title: 'House', icon_size: 3, ...options,
  }), CARD_OPTIONS);
  await settle(page);
}

async function scenarioCallout(page, vp) {
  const tag = `${vp.key}.callout`;
  await page.evaluate(() => {
    window.__moreInfo = [];
    if (!window.__moreInfoHooked) {
      window.__moreInfoHooked = true;
      window.addEventListener('hass-more-info', (e) => window.__moreInfo.push(e.detail?.entityId), true);
      window.__card.addEventListener('hass-more-info', (e) => window.__moreInfo.push(e.detail?.entityId), true);
    }
  });
  await page.evaluate(() => window.__card._fitRoom('living'));
  await settle(page, 200);
  const callout = () => page.evaluate(() => {
    const el = window.__card.renderRoot.querySelector('[data-hp="fork-callout"]');
    if (!el) return null;
    return {
      id: el.dataset.id,
      name: el.querySelector('.fork-callout-name')?.textContent.trim(),
      state: el.querySelector('[data-hp="fork-callout-state"]')?.textContent.trim() || '',
      value: el.querySelector('[data-hp="fork-callout-value"]')?.textContent.trim() || '',
      toggle: el.querySelector('[data-hp="fork-callout-toggle"]')?.getAttribute('aria-checked') ?? null,
      dialog: !!window.__card._infoCard,
    };
  });
  const lamp = await centerOf(page, '[data-hp="device"][data-id="m-lamp"]');
  await tap(page, vp, lamp);
  await settle(page, 150);
  let c = await callout();
  check(`${tag}: tap opens the in-place callout (not a dialog)`, c && c.id === 'm-lamp' && !c.dialog, true);
  check(`${tag}: callout shows the light state and an on toggle`, c && c.state === 'on' && c.toggle === 'true', true);
  await shot(page, vp, '04-callout-1-light');
  const calls = await page.evaluate(() => window.__serviceCalls.length);
  await tap(page, vp, await centerOf(page, '[data-hp="fork-callout-toggle"]'));
  await settle(page, 200);
  const last = await page.evaluate((n) => window.__serviceCalls.slice(n), calls);
  check(`${tag}: toggle calls light.toggle on the binding`, last.map((x) => [x[0], x[1], x[2]?.entity_id]),
    [['light', 'toggle', 'light.living_lamp']]);
  c = await callout();
  check(`${tag}: callout follows the new state`, c?.toggle, 'false');
  await shot(page, vp, '04-callout-2-toggled');
  // Outside tap closes it and does nothing else.
  const before = await state(page);
  await tap(page, vp, await screenOfPlan(page, 0.12, 0.42));
  await sleep(450);
  await settle(page, 100);
  check(`${tag}: tap outside closes the callout`, await callout(), null);
  const after = await state(page);
  check(`${tag}: dismissing tap does not move the camera`, Math.abs(after.zoom - before.zoom) < 1e-6, true);
  // Sensor marker in the faceplate: value, no toggle, more-info.
  await page.evaluate(() => window.__card._fitRegion('udm'));
  await settle(page, 200);
  await tap(page, vp, await centerOf(page, '[data-hp="device"][data-id="m-port-3"]'));
  await settle(page, 150);
  c = await callout();
  check(`${tag}: port callout shows its link value, no toggle`, c && c.id === 'm-port-3' && c.toggle === null && !!(c.state || c.value), true);
  await shot(page, vp, '04-callout-3-port');
  await tap(page, vp, await centerOf(page, '[data-hp="fork-callout-more"]'));
  await settle(page, 100);
  check(`${tag}: more opens HA more-info for the binding`, await page.evaluate(() => window.__moreInfo.slice(-1)), ['sensor.udm_port_3_speed']);
  check(`${tag}: more closes the callout`, await callout(), null);
  // Upstream actions unchanged: a default marker still opens the device card.
  await page.evaluate(() => window.__card._fitRoom('living'));
  await settle(page, 200);
  await tap(page, vp, await centerOf(page, '[data-hp="device"][data-id="d_tv"]'));
  await settle(page, 150);
  check(`${tag}: other actions unchanged (info card)`, await page.evaluate(() => !!window.__card._infoCard), true);
}

async function scenarioDock(page, vp) {
  const tag = `${vp.key}.dock`;
  const dock = await page.evaluate(() => {
    const root = window.__card.renderRoot;
    const el = root.querySelector('[data-hp="fork-dock"]');
    const stage = root.querySelector('.stage').getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    const levels = root.querySelector('[data-hp="fork-levels"]')?.getBoundingClientRect();
    return el ? {
      items: [...el.querySelectorAll('[data-hp="fork-dock-item"]')].map((b) => ({
        entity: b.dataset.entity, title: b.title, text: b.textContent.trim(),
      })),
      bottomLeft: r.left - stage.left < 40 && stage.bottom - r.bottom < 40,
      overlapsLevels: !!levels && !(r.right <= levels.left || r.left >= levels.right
        || r.bottom <= levels.top || r.top >= levels.bottom),
    } : null;
  });
  check(`${tag}: dock renders configured items`, dock?.items.map((i) => i.entity),
    ['script.night_study', 'script.late_night_chill', 'scene.all_off']);
  check(`${tag}: dock buttons carry no text, name only as hover title`, dock?.items.every((i) => i.text === '' && !!i.title), true);
  check(`${tag}: default corner bottom-left`, dock?.bottomLeft, true);
  check(`${tag}: dock never covers the level indicator`, dock?.overlapsLevels, false);
  const clear = await page.evaluate(() => {
    const c = window.__card;
    const [x, y, w, h] = c._baseVb();
    const v = c._view;
    const root = c.renderRoot;
    const stage = root.querySelector('.stage').getBoundingClientRect();
    const dockR = root.querySelector('[data-hp="fork-dock"]').getBoundingClientRect();
    const ppu = stage.width / v.w;
    return stage.top + (y + h - v.y) * ppu <= dockR.top + 1;
  });
  check(`${tag}: fit-all keeps the plan above the dock`, clear, true);
  await shot(page, vp, '05-dock-0');
  const n = await page.evaluate(() => window.__serviceCalls.length);
  await tap(page, vp, await centerOf(page, '[data-hp="fork-dock-item"][data-entity="script.night_study"]'));
  await sleep(60);
  await shot(page, vp, '05-dock-1-pressed');
  await tap(page, vp, await centerOf(page, '[data-hp="fork-dock-item"][data-entity="scene.all_off"]'));
  await settle(page, 100);
  const calls = await page.evaluate((k) => window.__serviceCalls.slice(k).map((x) => [x[0], x[1], x[2]?.entity_id]), n);
  check(`${tag}: dock runs script.turn_on / scene.turn_on`, calls,
    [['script', 'turn_on', 'script.night_study'], ['scene', 'turn_on', 'scene.all_off']]);
  check(`${tag}: dock tap does not move the camera or fly`, (await state(page)).focus, null);
}

const RUN = [
  ['stairs', scenarioStairs],
  ['levels', scenarioLevels],
  ['nested', scenarioNested],
  ['authoring', scenarioAuthoring],
  ['callout', scenarioCallout],
  ['dock', scenarioDock],
];

for (const vp of VIEWPORTS) {
  if (only.length && !only.includes(vp.key)) continue;
  const { page, browser } = await launch(vp.size, 1, [],
    vp.touch ? { hasTouch: true } : {});
  try {
    await setup(page);
    for (const [name, fn] of RUN) {
      if (!want(name)) continue;
      try { await reset(page); await fn(page, vp); } catch (error) {
        check(`${vp.key}.${name}: threw`, String(error?.stack || error), 'no exception');
      }
    }
  } finally {
    await browser.close();
  }
}
await finish(null, { out: OUT });
