// matt.3: the owner's live house config (read from the dashboards/ exports,
// never from HA) in the demo harness — the 390×844 faceplate tap that matt.2
// failed. Usage: node demo/fork/live-faceplate.mjs [width] [height] [outdir]
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, check, finish } from '../serve.mjs';

const W = Number(process.argv[2] || 390), H = Number(process.argv[3] || 844);
const OUT = resolve(process.argv[4] || '/Users/matta/gitlab/home-assistant/dashboards/v2/houseplan/fork-shots/live');
const HP = '/Users/matta/gitlab/home-assistant/dashboards/v2/houseplan/out';
const unwrap = (x, k) => { x = x.result ?? x; return x[k] ?? x; };
const config = unwrap(JSON.parse(readFileSync(`${HP}/config.json`, 'utf8')), 'config');
const layout = unwrap(JSON.parse(readFileSync(`${HP}/layout.json`, 'utf8')), 'layout');
// Decor images reference assets that live only in the owner's HA store.
if (process.env.LIVE_STRIP !== '0') for (const sp of config.spaces) { sp.decor = (sp.decor || []).filter((d) => d.kind !== 'image'); delete sp.bg; delete sp.plan_url; }
const entities = [...new Set(config.markers.map((m) => String(m.binding || '')).filter((b) => b.startsWith('entity:')).map((b) => b.slice(7)))];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { page, browser } = await launch({ width: W, height: H }, 1, [], { hasTouch: true });
page.on('console', (m) => { if (/error|warn/i.test(m.type())) console.log('[console]', m.type(), m.text().slice(0, 300)); });
const settle = async (extra = 150) => {
  await page.waitForFunction(() => { const c = window.__card; return c && !c._booting && !c._cameraTransition?.active && !c._forkSpin && !c._refitRaf; }, { timeout: 8000 });
  await sleep(extra);
};
mkdirSync(OUT, { recursive: true });
const shot = (name) => page.screenshot({ path: resolve(OUT, `${W}x${H}-${name}.png`) });
try {
  await page.evaluate(async ({ config, layout, entities }) => {
    for (const id of entities) window.__addRegistryEntity(id, null, id.startsWith('sensor.') ? '1000' : 'on', 'demo', {}, { friendly_name: id.split('.')[1] });
    const host = document.getElementById('host');
    host.style.width = '100vw'; host.style.padding = '0'; host.style.boxSizing = 'border-box';
    document.body.style.margin = '0';
    const card = window.__card;
    card.setConfig({ type: 'custom:houseplan-card', kiosk: true, default_floor: 'main', level_nav: 'indicator', level_density: 'reduced',
      scene_dock: ['script.early_morning', 'script.night_study', 'script.late_night_chill', 'script.chill_off', 'script.house_lights_off'] });
    await window.__hpTest.setServerConfig(config);
    await window.__hpTest.setLayout(layout);
    await window.__hpTest.setMode('view');
    await window.__card._tabClick('main');
    card.hass = { ...card.hass };
    await window.__hpTest.settled();
    // The harness's own demo devices are not in the owner's house: park them.
    const own = new Set(config.markers.map((m) => m.id));
    const parked = { ...layout };
    for (const d of card._devices || []) if (!own.has(d.id)) parked[d.id] = { s: 'lower', x: 0.99, y: 0.99 };
    await window.__hpTest.setLayout(parked);
    await window.__hpTest.settled();
  }, { config, layout, entities });
  await settle(300);
  const center = (sel) => page.evaluate((s) => { const el = window.__card.renderRoot.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  await page.evaluate(() => window.__card._fitRoom('m_living')); await settle(300);
  console.log(JSON.stringify(await page.evaluate(() => ({ focus: window.__card._focusNode, rot: window.__card._forkRot,
    hints: [...window.__card.renderRoot.querySelectorAll('[data-hp="fork-focus-hint"]')].map((h) => h.dataset.id) }))));
  await shot('0-living');
  console.log(JSON.stringify(await page.evaluate(() => {
    const c = window.__card, r = c.renderRoot;
    const h = r.querySelector('[data-hp="fork-focus-hint"][data-id="fr_rack"]').getBoundingClientRect();
    const x = h.left + h.width / 2, y = h.top + h.height / 2;
    const top = r.elementFromPoint ? r.elementFromPoint(x, y) : null;
    const dev = top?.closest?.('[data-hp="device"]');
    const dt = c._renderDevices.find((d) => d.id === 'd_temp');
    const dbg = dt ? { space: dt.space, pos: c._pos(dt), lay: c._layout?.d_temp, inDevices: !!(c._devices || []).find((d) => d.id === 'd_temp'), n: (c._devices || []).length } : null;
    return { dbg, hint: [h.left, h.top, h.width, h.height].map(Math.round), view: c._view, zoom: c._zoom, at: top?.className?.baseVal ?? top?.className, dev: dev?.dataset.id };
  })));
  await page.touchscreen.tap(...Object.values(await center('[data-hp="fork-focus-hint"][data-id="fr_rack"]'))); await sleep(450); await settle(300);
  const rack = await page.evaluate(() => ({ faceplateFraction: Math.max(0.042776471 * 1000 / window.__card._view.w, 0.004517647 * 1000 / window.__card._view.h), focus: window.__card._focusNode, zoom: window.__card._zoom, rot: window.__card._forkRot,
    portsShown: [...window.__card.renderRoot.querySelectorAll('[data-hp="device"][data-id^="lg_switch.dream_machine_professional_port"]')].filter((el) => !el.classList.contains('fork-hidden')).length }));
  check(`${W}: rack entered`, rack.focus, { kind: 'region', id: 'fr_rack' });
  check(`${W}: faceplate ports hidden at the rack`, rack.portsShown, 0);
  await shot('1-rack');
  await page.touchscreen.tap(...Object.values(await center('[data-hp="fork-focus-hint"][data-id="fr_faceplate"]'))); await sleep(450); await settle(300);
  const face = await page.evaluate(() => {
    const c = window.__card;
    const boxes = [...c.renderRoot.querySelectorAll('[data-hp="device"][data-id^="lg_switch.dream_machine_professional_port"]')].map((el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; });
    const ports = [...c._renderDevices].filter((d) => d.id.includes('professional_port'));
    return { focus: c._focusNode, zoom: c._zoom, rot: c._forkRot, boxes, spread: c._forkSpreadMap(c._view).size, dbg: ports.slice(0, 2).map((d) => [d.id, d.hidden, c._forkInFocus(d, c._pos(d)), c._forkMarkerClass(d, c._pos(d))]) };
  });
  check(`${W}: faceplate tap enters the faceplate`, face.focus, { kind: 'region', id: 'fr_faceplate' });
  const overlap = face.boxes.some((a, i) => face.boxes.some((b, j) => j > i && a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1));
  check(`${W}: the 9 ports do not stack`, [face.boxes.length, overlap], [9, false]);
  console.log(JSON.stringify({ rack: { ...rack }, face: { ...face, boxes: face.boxes.map((b) => b.map(Math.round)) } }));
  await shot('2-faceplate');
} finally { await browser.close(); }
await finish(null, { out: OUT });
