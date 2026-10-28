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
  { key: 'phone-max', size: { width: 430, height: 932 }, touch: true },
];
const only = arg('only', '').split(',').filter(Boolean);
// matt.2: --panel mounts the card the way the owner's dashboard does — a
// Lovelace panel view under HA's 56 px app toolbar, `kiosk: true`, and on the
// desktop a docked 256 px sidebar — and runs the View scenarios there.
const PANEL = process.argv.includes('--panel');
const scenarios = arg('scenarios', '').split(',').filter(Boolean);
const want = (name) => !scenarios.length || scenarios.includes(name);
const CARD_OPTIONS = {
  ...(PANEL ? { kiosk: true, default_floor: 'main', level_density: 'reduced' } : {}),
  level_nav: 'indicator',
  scene_dock: [
    { entity: 'script.night_study', icon: 'mdi:book-open-variant', name: 'Study' },
    { entity: 'script.late_night_chill', icon: 'mdi:weather-night', name: 'Chill' },
    { entity: 'scene.all_off', icon: 'mdi:power', name: 'All off' },
    ...(PANEL ? [
      { entity: 'script.early_morning', icon: 'mdi:weather-sunset-up', name: 'Morning' },
      { entity: 'script.house_lights_off', icon: 'mdi:lightbulb-group-off', name: 'Lights off' },
    ] : []),
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(page, options = CARD_OPTIONS, vp = null) {
  await page.evaluate(async ({ config, layout, entities, options, panel, sidebar }) => {
    const host = document.getElementById('host');
    host.style.width = sidebar ? `calc(100vw - ${sidebar}px)` : '100vw';
    host.style.padding = '0'; host.style.boxSizing = 'border-box';
    document.body.style.margin = '0';
    if (panel && !document.getElementById('ha-toolbar')) {
      // HA's app toolbar (56 px) above a panel view, plus the docked sidebar.
      const bar = document.createElement('div');
      bar.id = 'ha-toolbar';
      bar.style.cssText = 'height:56px;background:#1c1c1c;color:#e1e1e1;display:flex;align-items:center;padding:0 16px;font:20px sans-serif;box-sizing:border-box';
      bar.textContent = 'Home';
      host.before(bar);
      if (sidebar) {
        document.body.style.display = 'grid';
        document.body.style.gridTemplateColumns = `${sidebar}px 1fr`;
        const side = document.createElement('div');
        side.style.cssText = 'grid-row:1 / span 2;background:#181818;height:100vh';
        document.body.prepend(side);
        bar.style.gridColumn = '2'; host.style.gridColumn = '2'; host.style.width = '100%';
      }
    }
    for (const [id, area, state, attributes] of entities) {
      if (!window.__addedFork?.has(id)) window.__addRegistryEntity(id, area, state, 'demo', {}, attributes);
      (window.__addedFork ||= new Set()).add(id);
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
  }, { config: FORK_CONFIG, layout: FORK_LAYOUT, entities: FORK_ENTITIES, options,
    panel: PANEL, sidebar: PANEL && vp?.key === 'desktop' ? 256 : 0 });
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
  const dir = resolve(OUT, PANEL ? `panel-${vp.key}` : vp.key);
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
  check(`${tag}: upper landing not zoomed out`, s.zoom >= 0.9, true);
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
    const pl = stage.left + (x - v.x) * ppu, pr = stage.left + (x + w - v.x) * ppu;
    const pt = stage.top + (y - v.y) * ppu, pb = stage.top + (y + h - v.y) * ppu;
    return {
      inside: x >= v.x - 1e-6 && y >= v.y - 1e-6 && x + w <= v.x + v.w + 1e-6 && y + h <= v.y + v.h + 1e-6,
      clear: pr <= levels.left + 1 || pb <= levels.top + 1 || pl >= levels.right - 1 || pt >= levels.bottom - 1,
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
  // Editors keep the text tabs (not reachable in kiosk).
  if (PANEL) { await page.evaluate(() => window.__card._tabClick('main')); await settle(page); return; }
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
  const hueHidden = await page.evaluate(() => window.__card.renderRoot
    .querySelector('[data-hp="device"][data-id="m-hue"]')?.classList.contains('fork-hidden'));
  check(`${tag}: rack markers hidden before entering the rack`, hueHidden, true);
  await tap(page, vp, await screenOfPlan(page, 0.418, 0.212));
  await sleep(420);
  await settle(page, 200);
  s = await state(page);
  check(`${tag}: tap inside rack flies to rack`, s.focus, { kind: 'region', id: 'rack' });
  check(`${tag}: rack is a deeper zoom level`, s.zoom > roomZoom * 1.5, true);
  check(`${tag}: faceplate target hinted inside the rack`, await hints(page), ['udm']);
  await shot(page, vp, '03-nested-2-rack');
  const rackZoom = s.zoom;
  // 3. UDM faceplate — tap ON a port marker (inert until the faceplate is entered)
  check(`${tag}: rack markers shown inside the rack`, await page.evaluate(() => window.__card.renderRoot
    .querySelector('[data-hp="device"][data-id="m-hue"]')?.classList.contains('fork-hidden')), false);
  await tap(page, vp, await screenOfPlan(page, 0.432, 0.141));
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
  // An empty plan spot just below the step-out control (never a marker or the sheet).
  const st = await centerOf(page, '.stage');
  const p = { x: st.x, y: st.y - st.h / 2 + 90 };
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
  // Outside tap closes it and does nothing else (a plan spot clear of chrome/sheet).
  const before = await state(page);
  const stBox = await centerOf(page, '.stage');
  await tap(page, vp, { x: stBox.x - stBox.w / 2 + 30, y: stBox.y - stBox.h / 2 + 150 });
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
    CARD_OPTIONS.scene_dock.map((i) => i.entity));
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

async function scenarioGhost(page, vp) {
  const tag = `${vp.key}.ghost`;
  await page.evaluate(() => window.__card._fitRegion('rack'));
  await settle(page, 200);
  const info = await page.evaluate(() => {
    const root = window.__card.renderRoot;
    const el = root.querySelector('[data-hp="device"][data-id="m-hue"]');
    const real = root.querySelector('[data-hp="device"][data-id="m-poe"]');
    return {
      ghost: el?.classList.contains('presentation-ghost'),
      text: el?.querySelector('.device-sections, .valtext')?.offsetParent ? 'visible' : '',
      dashed: el ? getComputedStyle(el.querySelector('.device-shell-frame')).borderTopStyle : null,
      dim: el ? Number(getComputedStyle(el.querySelector('.device-shell')).opacity) : null,
      realGhost: real?.classList.contains('presentation-ghost'),
    };
  });
  check(`${tag}: virtual marker with presentation ghost is a ghost`, info.ghost, true);
  check(`${tag}: ghost has a dashed outline`, info.dashed, 'dashed');
  check(`${tag}: ghost icon is dimmed`, info.dim < 0.7, true);
  check(`${tag}: ghost paints no text`, info.text, '');
  check(`${tag}: real HA marker is not a ghost`, info.realGhost, false);
  await shot(page, vp, '06-ghost-rack');
  const before = await page.evaluate(() => ({ n: window.__serviceCalls.length }));
  await tap(page, vp, await centerOf(page, '[data-hp="device"][data-id="m-hue"]'));
  await sleep(450);
  await settle(page, 120);
  const after = await page.evaluate(() => ({
    n: window.__serviceCalls.length, card: !!window.__card._infoCard,
    callout: !!window.__card.renderRoot.querySelector('[data-hp="fork-callout"]'),
    focus: window.__card._focusNode,
  }));
  check(`${tag}: ghost tap does nothing (no card, no call, no fly)`,
    [after.n === before.n, after.card, after.callout, after.focus?.id], [true, false, false, 'rack']);
  if (vp.key === 'desktop') {
    await page.mouse.move(0, 0);
    const p = await centerOf(page, '[data-hp="device"][data-id="m-hue"]');
    await page.mouse.move(p.x, p.y);
    await sleep(250);
    const tip = await page.evaluate(() => !window.__card.renderRoot.querySelector('.tip')?.hidden);
    check(`${tag}: ghost shows no hover text`, tip, false);
  }
}

async function scenarioReveal(page, vp) {
  const tag = `${vp.key}.reveal`;
  const look = () => page.evaluate(() => {
    const root = window.__card.renderRoot;
    const dev = (id) => {
      const el = root.querySelector(`[data-hp="device"][data-id="${id}"]`);
      return el ? (el.classList.contains('fork-hidden') ? 'hidden' : 'shown') : 'absent';
    };
    const dec = (id) => {
      const el = root.querySelector(`[data-hp="decor"][data-id="${id}"]`)?.closest('.fork-reveal');
      return el ? (el.classList.contains('fork-hidden') ? 'hidden' : 'shown') : 'absent';
    };
    const badge = (id) => root.querySelector(`[data-hp="device"][data-id="${id}"] .value-badge`)?.textContent.trim() || '';
    return {
      port: dev('m-port-2'), poe: dev('m-poe'), candles: dev('m-candles'), lamp: dev('m-lamp'),
      rackDecor: dec('dec-rack'), udmDecor: dec('dec-udm'),
      reduced: root.querySelector('[data-hp="device"][data-id="m-lamp"]')?.classList.contains('fork-reduced'),
      port1: badge('m-port-1'), port3: badge('m-port-3'), wan: badge('m-udm'), timer: badge('m-timer'),
    };
  });
  let r = await look();
  check(`${tag}: level — rack/faceplate markers hidden`, [r.port, r.poe], ['hidden', 'hidden']);
  check(`${tag}: level — room-detail marker hidden`, r.candles, 'hidden');
  check(`${tag}: level — room devices shown at reduced density`, [r.lamp, r.reduced], ['shown', true]);
  check(`${tag}: level — rack drawings hidden`, [r.rackDecor, r.udmDecor], ['hidden', 'hidden']);
  check(`${tag}: duration badge compact, unit once`, r.timer, '95m');
  await shot(page, vp, '07-reveal-0-level');
  await page.evaluate(() => window.__card._fitRoom('living'));
  await sleep(110);
  await shot(page, vp, '07-reveal-1-fading-in');
  await settle(page, 300);
  r = await look();
  check(`${tag}: room — room detail and rack drawing appear`, [r.candles, r.rackDecor, r.reduced], ['shown', 'shown', false]);
  check(`${tag}: room — rack contents still hidden`, [r.poe, r.port, r.udmDecor], ['hidden', 'hidden', 'hidden']);
  await shot(page, vp, '07-reveal-2-room');
  await page.evaluate(() => window.__card._fitRegion('rack'));
  await settle(page, 300);
  r = await look();
  check(`${tag}: rack — rack markers and faceplate drawing appear, ports still hidden`, [r.poe, r.udmDecor, r.port], ['shown', 'shown', 'hidden']);
  await shot(page, vp, '07-reveal-3-rack');
  await page.evaluate(() => window.__card._fitRegion('udm'));
  await settle(page, 300);
  r = await look();
  check(`${tag}: faceplate — ports appear`, r.port, 'shown');
  check(`${tag}: link speeds compact (1G / 100M / 940M)`, [r.port1, r.port3, r.wan], ['1G', '100M', '940M']);
  await shot(page, vp, '07-reveal-4-faceplate');
  await page.evaluate(() => window.__card._stepOut());
  await sleep(110);
  await shot(page, vp, '07-reveal-5-fading-out');
  await settle(page, 300);
  r = await look();
  check(`${tag}: back out to rack — ports fade out again`, r.port, 'hidden');
  // Manual zoom alone also reveals (no focus change).
  await page.evaluate(() => { const c = window.__card; c._fitAll('fit'); });
  await settle(page, 250);
  await page.evaluate(() => {
    const c = window.__card; c._focusNode = null;
    c._applyView(28, 440, 140); c.requestUpdate();
  });
  await settle(page, 200);
  r = await look();
  check(`${tag}: zooming in by hand past the threshold reveals the ports`, r.port, 'shown');
}

async function scenarioPanel(page, vp) {
  const tag = `${vp.key}.panel`;
  const chrome = () => page.evaluate(() => {
    const c = window.__card;
    const root = c.renderRoot;
    const box = (sel) => { const r = root.querySelector(sel)?.getBoundingClientRect(); return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null; };
    const card = c.getBoundingClientRect();
    return {
      vw: window.innerWidth, vh: window.innerHeight, cardBottom: card.bottom,
      dock: box('[data-hp="fork-dock"]'), levels: box('[data-hp="fork-levels"]'),
      stepout: box('[data-hp="fork-stepout"]'), stage: box('.stage'),
    };
  });
  const visible = (b, c) => !!b && b.l >= 0 && b.t >= 0 && b.r <= c.vw + 0.5 && b.b <= c.vh + 0.5
    && b.t >= c.stage.t - 0.5 && b.b <= c.stage.b + 0.5;
  let c = await chrome();
  check(`${tag}: card ends inside the viewport under the 56 px toolbar`, c.cardBottom <= c.vh + 0.5, true);
  check(`${tag}: stage starts below the toolbar`, c.stage.t >= 55.5, true);
  check(`${tag}: dock fully visible`, visible(c.dock, c), true);
  check(`${tag}: level indicator fully visible`, visible(c.levels, c), true);
  if (vp.size.width <= 560) check(`${tag}: compact level switcher on the phone`, c.levels.h <= 52 && c.levels.w <= 130, true);
  await shot(page, vp, '08-panel-0-house');
  // Rack, then faceplate: interactive markers ≥ 44 px, deeper each time.
  const markers = (region) => page.evaluate((rid) => {
    const c = window.__card;
    const r = c._focusRegions.find((x) => x.id === rid);
    return [...c.renderRoot.querySelectorAll('[data-hp="device"]')].map((el) => {
      const d = c._renderDevices.find((x) => x.id === el.dataset.id);
      const p = d ? c._pos(d) : null;
      const inside = !!p && p.x / 1000 >= r.x && p.x / 1000 <= r.x + r.w && p.y / 1000 >= r.y && p.y / 1000 <= r.y + r.h;
      const cs = getComputedStyle(el);
      return {
        id: el.dataset.id, inside, w: el.getBoundingClientRect().width,
        hidden: el.classList.contains('fork-hidden'), outside: el.classList.contains('fork-outside'),
        ghost: el.classList.contains('presentation-ghost'), opacity: Number(cs.opacity),
      };
    });
  }, region);
  await page.evaluate(() => window.__card._fitRoom('living'));
  await settle(page, 300);
  await page.evaluate(() => window.__card._fitRegion('rack'));
  await settle(page, 350);
  const rackZoom = (await state(page)).zoom;
  let m = await markers('rack');
  const rackTargets = m.filter((x) => x.inside && !x.hidden && !x.ghost);
  if (process.env.FORK_DEBUG) console.log(tag, rackZoom, JSON.stringify(rackTargets));
  check(`${tag}: rack markers are ≥ 44 px`, rackTargets.length > 0 && rackTargets.every((x) => x.w >= 43.5), true);
  const out = m.filter((x) => !x.inside && !x.hidden);
  check(`${tag}: markers outside the rack dimmed (25 %) and marked inert`, out.length > 0
    && out.every((x) => x.outside && Math.abs(x.opacity - 0.25) < 0.01), true);
  c = await chrome();
  check(`${tag}: step-out and dock visible at the rack`, visible(c.stepout, c) && visible(c.dock, c), true);
  await shot(page, vp, '08-panel-1-rack');
  await page.evaluate(() => window.__card._fitRegion('udm'));
  await settle(page, 350);
  const udmZoom = (await state(page)).zoom;
  check(`${tag}: faceplate lands visibly deeper than the rack (≥ 1.35×)`, udmZoom >= rackZoom * 1.349, true);
  m = await markers('udm');
  const ports = m.filter((x) => x.inside && !x.hidden && !x.ghost);
  check(`${tag}: faceplate ports are ≥ 44 px`, ports.length >= 6 && ports.every((x) => x.w >= 43.5), true);
  await shot(page, vp, '08-panel-2-faceplate');
  // A tap on a dimmed outside marker falls through (no card, no callout).
  const poe = await centerOf(page, '[data-hp="device"][data-id="m-poe"]');
  const sheetBox = await centerOf(page, '[data-hp="fork-sheet"]');
  const underSheet = !!sheetBox && poe && Math.abs(poe.y - sheetBox.y) < sheetBox.h / 2;
  if (poe && !underSheet && poe.x > 0 && poe.y > 0 && poe.x < c.vw && poe.y < c.vh) {
    await tap(page, vp, poe);
    await sleep(450);
    await settle(page, 100);
    check(`${tag}: outside marker is inert`, await page.evaluate(() => !window.__card._infoCard
      && !window.__card.renderRoot.querySelector('[data-hp="fork-callout"]')), true);
  }
  // Pan across the faceplate (overflow is reached by panning).
  const st = c.stage;
  if (vp.touch) {
    await page.evaluate(() => 0);
  }
  await page.mouse.move(st.l + st.w * 0.5, st.t + st.h * 0.6);
  // Step out: rack again, outside markers come back on the way out of regions.
  await tap(page, vp, await centerOf(page, '[data-hp="fork-stepout"]'));
  await settle(page, 300);
  await tap(page, vp, await centerOf(page, '[data-hp="fork-stepout"]'));
  await settle(page, 300);
  m = await markers('rack');
  check(`${tag}: step out to the room restores the rack's markers`, m.filter((x) => x.inside && !x.hidden).every((x) => !x.outside), true);
  await shot(page, vp, '08-panel-3-back-room');
}

async function scenarioOnePane(page, vp) {
  const tag = `${vp.key}.onepane`;
  const root = (fn, arg) => page.evaluate(fn, arg);
  // B: everyday chrome
  const header = await root(() => {
    const r = window.__card.renderRoot;
    const shown = (sel) => [...r.querySelectorAll(sel)].some((el) => el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && el.offsetParent !== null);
    return {
      modes: shown('[data-hp="mode-tab"]'), settings: shown('[data-hp="settings"]'), pdf: shown('[data-hp="pdf"]'),
      support: shown('[data-hp="support"]'), eye: shown('[data-hp="hidden-devices"]'),
      menu: shown('[data-hp="header-menu"]'), fit: shown('[data-hp="zoom-fit"]'),
      zoomIn: shown('[data-hp="zoom-in"]'), summary: shown('.summary-control'),
      kioskMenu: shown('.fork-kiosk-menu [data-hp="header-menu"]'),
    };
  });
  if (!PANEL) {
    check(`${tag}: View shows no editor tabs or admin buttons`,
      [header.modes, header.settings, header.pdf, header.support, header.eye], [false, false, false, false, false]);
    check(`${tag}: one menu button and Fit all stay`, [header.menu, header.fit], [true, true]);
    check(`${tag}: zoom ± only with a mouse on a wide screen`, header.zoomIn, !vp.touch && vp.size.width >= 900);
    await tap(page, vp, await centerOf(page, '[data-hp="header-menu"]'));
    await settle(page, 120);
    const items = await root(() => [...window.__card.renderRoot.querySelectorAll('[data-hp="header-menu-item"]')].map((b) => b.dataset.id));
    check(`${tag}: editors live in the menu`, ['mode-plan', 'mode-devices', 'mode-decor'].every((id) => items.includes(id)), true);
    await shot(page, vp, '09-onepane-0-menu');
    await page.keyboard.press('Escape');
    await settle(page, 80);
  } else {
    check(`${tag}: kiosk shows no floating summary buttons`, header.summary, false);
    await shot(page, vp, '09-onepane-0-kiosk');
  }
  // D: oven reads 0 while off → no badge
  const ovenBadge = await root(() => !!window.__card.renderRoot
    .querySelector('[data-hp="device"][data-id="m-oven"] .value-badge'));
  check(`${tag}: oven display 0 shows no badge`, ovenBadge, false);
  // C: one marker, extras in its callout
  await page.evaluate(() => window.__card._fitRoom('living'));
  await settle(page, 300);
  await tap(page, vp, await centerOf(page, '[data-hp="device"][data-id="m-lamp"]'));
  await settle(page, 150);
  const lamp = await root(() => {
    const el = window.__card.renderRoot.querySelector('[data-hp="fork-callout"]');
    return el ? {
      actions: [...el.querySelectorAll('[data-hp="fork-callout-action"]')].map((b) => b.dataset.entity),
      rows: [...el.querySelectorAll('[data-hp="fork-callout-row"]')].map((r) => ({
        entity: r.dataset.entity, toggle: !!r.querySelector('[data-hp="fork-callout-row-toggle"]'),
        state: r.querySelector('.fork-callout-row-state')?.textContent.trim() })),
      box: (() => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; })(),
    } : null;
  });
  check(`${tag}: lantern callout offers its 6 scripts`, lamp?.actions.length, 6);
  check(`${tag}: extra entity rows, toggle only where toggleable`, lamp?.rows.map((r) => [r.entity, r.toggle]),
    [['select.lamp_scene', false], ['switch.lamp_fx', true], ['number.lamp_speed', false]]);
  const vpSize = page.viewportSize();
  check(`${tag}: callout fits on screen`, !!lamp && lamp.box[0] >= 0 && lamp.box[2] <= vpSize.width && lamp.box[1] >= 0 && lamp.box[3] <= vpSize.height, true);
  await shot(page, vp, '09-onepane-1-lantern-callout');
  const n0 = await page.evaluate(() => window.__serviceCalls.length);
  await tap(page, vp, await centerOf(page, '[data-hp="fork-callout-action"][data-entity="script.lanterns_candle"]'));
  await settle(page, 100);
  await tap(page, vp, await centerOf(page, '[data-hp="fork-callout-row"][data-entity="switch.lamp_fx"] [data-hp="fork-callout-row-toggle"]'));
  await settle(page, 100);
  check(`${tag}: callout script and row toggle call the right services`,
    await page.evaluate((k) => window.__serviceCalls.slice(k).map((x) => [x[0], x[1], x[2]?.entity_id]), n0),
    [['script', 'turn_on', 'script.lanterns_candle'], ['switch', 'toggle', 'switch.lamp_fx']]);
  await page.keyboard.press('Escape');
  // A: down port at the faceplate
  await page.evaluate(() => window.__card._fitRegion('udm'));
  await settle(page, 350);
  const port6 = await root(() => {
    const el = window.__card.renderRoot.querySelector('[data-hp="device"][data-id="m-port-6"]');
    return { ghost: el?.classList.contains('presentation-ghost'), badge: !!el?.querySelector('.value-badge'),
      text: el?.textContent.trim() };
  });
  check(`${tag}: port with no link (10) looks disconnected, no badge`, [port6.ghost, port6.badge, port6.text], [true, false, '']);
  await tap(page, vp, await centerOf(page, '[data-hp="device"][data-id="m-port-6"]'));
  await settle(page, 150);
  const downCallout = await root(() => {
    const el = window.__card.renderRoot.querySelector('[data-hp="fork-callout"]');
    return el ? { down: !!el.querySelector('[data-hp="fork-callout-down"]'), text: el.textContent.replace(/\s+/g, ' ').trim() } : null;
  });
  check(`${tag}: down port callout shows "down" visually, never 10M`, !!downCallout?.down && !/10\s*M/.test(downCallout.text), true);
  await shot(page, vp, '09-onepane-2-down-port');
  await page.keyboard.press('Escape');
}

async function scenarioPhoneRoom(page, vp) {
  const tag = `${vp.key}.room`;
  const narrow = vp.size.width <= 560;
  await shot(page, vp, '10-room-0-level');
  await tap(page, vp, await screenOfPlan(page, 0.12, 0.42));
  await sleep(420);
  await settle(page, 300);
  const s = await state(page);
  check(`${tag}: tap fits the living room`, s.focus, { kind: 'room', id: 'living' });
  const fill = await page.evaluate(() => {
    const c = window.__card;
    const room = c._spaceModel().rooms.find((r) => r.id === 'living');
    const b = c._roomFitBounds(room, c._spaceModel());
    const v = c._view;
    const st = c.renderRoot.querySelector('.stage');
    const i = c._chromeInsets();
    const W = st.clientWidth - i.left - i.right, H = st.clientHeight - i.top - i.bottom;
    const ppu = st.clientWidth / v.w;
    return Math.max((b.w * ppu) / W, (b.h * ppu) / H);
  });
  check(`${tag}: the focused room fills the free stage edge to edge (≥ 0.94)`, fill >= 0.94, true);
  const m = await page.evaluate(() => [...window.__card.renderRoot.querySelectorAll('[data-hp="device"]')]
    .filter((el) => getComputedStyle(el).visibility !== 'hidden' && !el.classList.contains('fork-hidden'))
    .map((el) => ({ id: el.dataset.id, w: el.getBoundingClientRect().width,
      focused: el.classList.contains('fork-focused'), outside: el.classList.contains('fork-outside'),
      label: el.querySelector('.fork-label')?.textContent.trim() || '' })));
  const inRoom = m.filter((x) => x.focused);
  check(`${tag}: focused-room markers are ≥ 44 px`, inRoom.length >= 5 && inRoom.every((x) => x.w >= 43.5), true);
  check(`${tag}: focused-room markers carry a 1–2 word name`, inRoom.filter((x) => !['m-candles'].includes(x.id))
    .every((x) => x.label && x.label.split(' ').length <= 2), true);
  check(`${tag}: everything outside the room is dimmed and inert`, m.filter((x) => !x.focused).every((x) => x.outside), true);
  const sheet = await page.evaluate(() => {
    const el = window.__card.renderRoot.querySelector('[data-hp="fork-sheet"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { rows: el.querySelectorAll('[data-hp="fork-sheet-row"]').length, bottom: r.bottom, top: r.top };
  });
  check(`${tag}: dense room on a phone gets the in-map device sheet`, !!sheet, narrow);
  const chrome = await page.evaluate(() => {
    const r = window.__card.renderRoot;
    const box = (sel) => { const b = r.querySelector(sel)?.getBoundingClientRect(); return b ? [b.left, b.top, b.right, b.bottom] : null; };
    return { dock: box('[data-hp="fork-dock"]'), levels: box('[data-hp="fork-levels"]'), vw: innerWidth, vh: innerHeight };
  });
  const inside = (b) => !!b && b[0] >= 0 && b[1] >= 0 && b[2] <= chrome.vw + 0.5 && b[3] <= chrome.vh + 0.5;
  check(`${tag}: dock and levels fully on screen`, inside(chrome.dock) && inside(chrome.levels), true);
  if (narrow) check(`${tag}: phone level switcher is a compact pill docked bottom-right`,
    chrome.levels[2] > chrome.vw - 30 && chrome.levels[3] > chrome.vh - 80 && chrome.levels[3] - chrome.levels[1] <= 52, true);
  await shot(page, vp, '10-room-1-living');
  // Tap a device (via the sheet on the phone, the marker elsewhere) → callout.
  if (sheet) await tap(page, vp, await centerOf(page, '[data-hp="fork-sheet-row"][data-id="m-lamp"]'));
  else await tap(page, vp, await centerOf(page, '[data-hp="device"][data-id="m-lamp"]'));
  await settle(page, 200);
  const callout = await page.evaluate(() => {
    const el = window.__card.renderRoot.querySelector('[data-hp="fork-callout"]');
    const b = el?.getBoundingClientRect();
    return el ? { id: el.dataset.id, box: [b.left, b.top, b.right, b.bottom] } : null;
  });
  check(`${tag}: device tap opens its popup`, callout?.id, 'm-lamp');
  const stageTop = (await centerOf(page, '.stage')).y - (await centerOf(page, '.stage')).h / 2;
  check(`${tag}: popup fully on screen, inside the stage (not under the toolbar)`, !!callout && callout.box[0] >= 0
    && callout.box[1] >= stageTop - 0.5 && callout.box[2] <= chrome.vw + 0.5 && callout.box[3] <= chrome.vh + 0.5, true);
  await shot(page, vp, '10-room-2-popup');
  await page.keyboard.press('Escape');
  await settle(page, 100);
  await tap(page, vp, await centerOf(page, '[data-hp="fork-stepout"]'));
  await settle(page, 300);
  check(`${tag}: back to the level`, (await state(page)).focus, null);
  check(`${tag}: no sheet, nothing dimmed at the level`, await page.evaluate(() =>
    !window.__card.renderRoot.querySelector('[data-hp="fork-sheet"]')
    && !window.__card.renderRoot.querySelector('.dev.fork-outside')), true);
  await shot(page, vp, '10-room-3-back');
}

const RUN = [
  ['stairs', scenarioStairs],
  ['levels', scenarioLevels],
  ['nested', scenarioNested],
  ['authoring', scenarioAuthoring],
  ['callout', scenarioCallout],
  ['dock', scenarioDock],
  ['ghost', scenarioGhost],
  ['reveal', scenarioReveal],
  ['panel', scenarioPanel],
  ['onepane', scenarioOnePane],
  ['room', scenarioPhoneRoom],
];

for (const vp of VIEWPORTS) {
  if (only.length && !only.includes(vp.key)) continue;
  const { page, browser } = await launch(vp.size, 1, [],
    vp.touch ? { hasTouch: true } : {});
  try {
    await setup(page, CARD_OPTIONS, vp);
    for (const [name, fn] of RUN) {
      if (!want(name)) continue;
      if (PANEL && name === 'authoring') continue;      // writer tools: not in kiosk
      if (!PANEL && name === 'panel') continue;
      try { await reset(page); await fn(page, vp); } catch (error) {
        check(`${vp.key}.${name}: threw`, String(error?.stack || error), 'no exception');
      }
    }
  } finally {
    await browser.close();
  }
}
await finish(null, { out: OUT });
