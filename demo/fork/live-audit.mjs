// matt.3: overlap audit of the owner's house config (the dashboards/ generator
// output, never HA) — every level overview and every room fly-in: no marker
// icon may intersect another marker's icon or name label.
// Usage: node demo/fork/live-audit.mjs [width] [height] [outdir]
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, check, finish } from '../serve.mjs';

const W = Number(process.argv[2] || 390), H = Number(process.argv[3] || 844);
const OUT = resolve(process.argv[4] || '/Users/matta/gitlab/home-assistant/dashboards/v2/houseplan/fork-shots/live-audit');
const HP = '/Users/matta/gitlab/home-assistant/dashboards/v2/houseplan/out';
const unwrap = (x, k) => { x = x.result ?? x; return x[k] ?? x; };
const config = unwrap(JSON.parse(readFileSync(`${HP}/${process.env.LIVE_CONFIG || 'config.template.json'}`, 'utf8')), 'config');
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
    // Not created by HA yet / failing setup (apple_tv setup_retry): as in the house.
    const MISSING = new Set(['media_player.kitchen']), UNAVAILABLE = new Set(['media_player.shilohs_palace_homepod']);
    for (const id of entities) if (!MISSING.has(id)) window.__addRegistryEntity(id, null, UNAVAILABLE.has(id) ? 'unavailable' : id.startsWith('sensor.') ? '1000' : 'on', 'demo', {}, { friendly_name: id.split('.')[1] });
    for (const id of []) window.__addRegistryEntity(id, null, id.startsWith('sensor.') ? '1000' : 'on', 'demo', {}, { friendly_name: id.split('.')[1] });
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

  const audit = (where) => page.evaluate((where) => {
    const r = window.__card.renderRoot;
    const items = [...r.querySelectorAll('.devlayer [data-hp="device"]')].filter((el) => {
      if (/fork-(hidden|nested|outside)/.test(el.className)) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.3;
    }).map((el) => {
      const b = el.getBoundingClientRect(); const lab = el.querySelector('.fork-label')?.getBoundingClientRect();
      return { id: el.dataset.id, name: el.getAttribute('aria-label')?.split(',')[0] ?? el.dataset.id, icon: [b.left, b.top, b.right, b.bottom], label: lab ? [lab.left, lab.top, lab.right, lab.bottom] : null };
    }).filter((x) => x.icon[2] > 0 && x.icon[0] < innerWidth && x.icon[3] > 0 && x.icon[1] < innerHeight);
    const hit = (a, b, slack = 1) => a && b && a[0] < b[2] - slack && b[0] < a[2] - slack && a[1] < b[3] - slack && b[1] < a[3] - slack;
    const bad = [];
    for (let i = 0; i < items.length; i += 1) for (let j = 0; j < items.length; j += 1) {
      if (i === j) continue;
      const a = items[i], b = items[j];
      if (i < j && hit(a.icon, b.icon)) bad.push(`${where}: icon ${a.name} × icon ${b.name}`);
      if (hit(a.label, b.icon)) bad.push(`${where}: label ${a.name} over icon ${b.name}`);
    }
    return { n: items.length, bad };
  }, where);
  const results = [];
  for (const space of config.spaces) {
    await page.evaluate((id) => window.__card._tabClick(id), space.id); await settle(300);
    await page.evaluate(() => window.__card._fitAll('fit')); await settle(400);
    let a = await audit(`${space.id} overview`); results.push(a); await shot(`${space.id}-0-overview`);
    for (const room of space.rooms) {
      await page.evaluate((id) => window.__card._fitRoom(id), room.id); await settle(1200);
      a = await audit(`${space.id}/${room.id}`); results.push(a); await shot(`${space.id}-${room.id}`);
    }
    for (const region of space.focus_regions || []) {
      await page.evaluate((id) => window.__card._fitRegion(id), region.id); await settle(1200);
      a = await audit(`${space.id}/${region.id}`); results.push(a); await shot(`${space.id}-${region.id}`);
    }
  }
  const lava = await page.evaluate(async () => {
    const c = window.__card; c._tabClick('main'); await c.updateComplete; c._fitAll('fit');
    await new Promise((r) => setTimeout(r, 700));
    const el = c.renderRoot.querySelector('[data-hp="device"][data-id="lg_switch.lr_weat_wall_south_out_outlet_2"]');
    if (!el) return { rendered: false };
    const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const top = c.renderRoot.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest?.('[data-hp="device"]')?.dataset.id;
    return { rendered: true, cls: el.className, visibility: cs.visibility, opacity: cs.opacity, w: Math.round(b.width), topmost: top };
  });
  console.log('LAVA@level', JSON.stringify(lava));
  for (const r of results) for (const line of r.bad) console.log('OVERLAP', line);
  check(`${W}: no marker icon or label covers another marker`, results.flatMap((r) => r.bad), []);
} finally { await browser.close(); }
await finish(null, { out: OUT });
