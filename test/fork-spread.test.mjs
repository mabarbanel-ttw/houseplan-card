// Fork matt.3 (FORK.md §17): focused markers that would stack step aside.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadMarkers } from '../test-build/fork-spread.js';

const box = { left: 0, top: 0, right: 390, bottom: 700 };
const placedOf = (pts, out) => pts.map((p) => ({ ...p, ...(out.get(p.id) ?? {}) }));
const apart = (pts) => pts.every((a, i) => pts.every((b, j) => j <= i
  || Math.abs(a.x - b.x) >= ((a.w ?? 60) + (b.w ?? 60)) / 2 - 1e-6
  || Math.abs(a.y - b.y) >= ((a.h ?? 80) + (b.h ?? 80)) / 2 - 1e-6));

test('matt.3 §17 markers that do not overlap never move', () => {
  const out = spreadMarkers({ points: [{ id: 'a', x: 50, y: 50 }, { id: 'b', x: 200, y: 50 }], gapX: 60, gapY: 80, bounds: box });
  assert.equal(out.size, 0);
});

test('matt.3 §17 a faceplate row of ports becomes an even strip in plan order, wrapping on a narrow screen', () => {
  const ports = Array.from({ length: 9 }, (_, i) => ({ id: `p${i + 1}`, x: 150 + i * 8, y: 300 }));
  const placed = placedOf(ports, spreadMarkers({ points: ports, gapX: 60, gapY: 80, bounds: box }));
  assert.ok(apart(placed), 'no two markers overlap after the spread');
  const rows = [...new Set(placed.map((p) => Math.round(p.y)))].sort((a, b) => a - b);
  assert.equal(rows.length, 2, '390 px holds 6 per row');
  const first = placed.filter((p) => Math.round(p.y) === rows[0]);
  assert.deepEqual(first.map((p) => p.id), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  const gaps = first.slice(1).map((p, i) => p.x - first[i].x);
  assert.ok(gaps.every((g) => Math.abs(g - 60) < 1e-6), 'even spacing');
  assert.ok(placed.every((p) => p.x >= 30 - 1e-6 && p.x <= 360 + 1e-6), 'stays on screen');
});

test('matt.3 §17 a turned faceplate (a column on screen) becomes a column strip', () => {
  const col = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, x: 200, y: 200 + i * 10 }));
  const placed = placedOf(col, spreadMarkers({ points: col, gapX: 60, gapY: 80, bounds: box }));
  assert.ok(apart(placed));
  assert.ok(placed.every((p) => Math.abs(p.x - 200) < 1e-6), 'one column');
  assert.deepEqual([...placed].sort((a, b) => a.y - b.y).map((p) => p.id), ['c0', 'c1', 'c2', 'c3', 'c4']);
});

test('matt.3 §17 a scattered crowd steps aside by at most about one box, never onto an obstacle', () => {
  const crowd = [
    { id: 'a', x: 200, y: 300, w: 60, h: 80 }, { id: 'b', x: 230, y: 330, w: 60, h: 80 },
    { id: 'c', x: 190, y: 350, w: 60, h: 80 }, { id: 'd', x: 400 / 2, y: 120, w: 60, h: 80 },
  ];
  const rack = { left: 100, top: 160, right: 160, bottom: 240 };
  const out = spreadMarkers({ points: crowd, gapX: 60, gapY: 80, bounds: box, obstacles: [rack] });
  const placed = placedOf(crowd, out);
  assert.ok(apart(placed), 'the crowd no longer overlaps');
  for (const p of placed) {
    const o = crowd.find((q) => q.id === p.id);
    assert.ok(Math.abs(p.x - o.x) <= o.w + 1e-6 && Math.abs(p.y - o.y) <= o.h + 1e-6, `${p.id} stepped aside, did not travel`);
    assert.ok(!(p.x > rack.left && p.x < rack.right && p.y > rack.top && p.y < rack.bottom), `${p.id} kept off the region`);
  }
  assert.equal(out.has('d'), false, 'a marker clear of the crowd stays put');
});

test('matt.3 §17 a focused faceplate row that runs off a phone becomes an on-screen strip', () => {
  // 6 ports 70 px apart starting off the left edge (no overlap at all).
  const ports = Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, x: -60 + i * 70, y: 300 }));
  const none = spreadMarkers({ points: ports, gapX: 60, gapY: 80, bounds: box });
  assert.equal(none.size, 0, 'without a line hint nothing overlaps, nothing moves');
  const placed = placedOf(ports, spreadMarkers({ points: ports, gapX: 60, gapY: 80, bounds: box, lines: [ports.map((p) => p.id)] }));
  assert.ok(placed.every((p) => p.x >= 30 - 1e-6 && p.x <= 360 + 1e-6), 'every port on screen');
  assert.ok(apart(placed));
  assert.deepEqual([...placed].sort((a, b) => a.y - b.y || a.x - b.x).map((p) => p.id), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
});

test('matt.3 §17 a crowd boxed in by walls, chrome and a region still ends with nothing covered', () => {
  // The owner's office on a 430 px phone (live-audit capture): relaxation alone left two fans stacked.
  const c = {"points": [{"id": "m0", "x": 400.7, "y": 322.5, "w": 59.9, "h": 99.5}, {"id": "m1", "x": 355.5, "y": 323.4, "w": 59.9, "h": 59.9}, {"id": "m2", "x": 216.3, "y": 492.3, "w": 59.9, "h": 59.9}, {"id": "m3", "x": 67.6, "y": 60.1, "w": 138.2, "h": 59.9}, {"id": "m4", "x": 375.7, "y": 191.1, "w": 59.9, "h": 59.9}, {"id": "m5", "x": 395.5, "y": 256.1, "w": 138.2, "h": 59.9}, {"id": "m6", "x": 355.5, "y": 257.0, "w": 138.2, "h": 59.9}, {"id": "m7", "x": 272.3, "y": 268.2, "w": 59.9, "h": 59.9}, {"id": "m8", "x": 183.5, "y": 268.2, "w": 59.9, "h": 59.9}, {"id": "m9", "x": 225.8, "y": 195.0, "w": 59.9, "h": 59.9}, {"id": "m10", "x": 34.4, "y": 494.5, "w": 59.9, "h": 59.9}, {"id": "m11", "x": 103.4, "y": 494.5, "w": 59.9, "h": 59.9}, {"id": "m12", "x": 329.6, "y": 494.5, "w": 59.9, "h": 59.9}, {"id": "m13", "x": 398.5, "y": 494.5, "w": 59.9, "h": 59.9}, {"id": "m14", "x": 288.7, "y": 419.0, "w": 59.9, "h": 59.9}, {"id": "m15", "x": 168.0, "y": 492.3, "w": 59.9, "h": 59.9}, {"id": "m16", "x": 271.4, "y": 492.3, "w": 59.9, "h": 59.9}], "obstacles": [{"left": 69.8, "right": 193.9, "top": 281.2, "bottom": 393.2}], "bounds": {"left": 4, "top": 4, "right": 426, "bottom": 526}};
  const out = spreadMarkers({ ...c, gapX: 60, gapY: 80 });
  const placed = placedOf(c.points, out);
  assert.ok(apart(placed), 'no marker box overlaps another');
  const o = c.obstacles[0];
  const cover = (p) => Math.max(0, Math.min(p.x + p.w / 2, o.right) - Math.max(p.x - p.w / 2, o.left))
    * Math.max(0, Math.min(p.y + p.h / 2, o.bottom) - Math.max(p.y - p.h / 2, o.top));
  placed.forEach((p, i) => assert.ok(cover(p) <= cover(c.points[i]) + 1, `${p.id} covers no more of the region`));
  assert.ok(placed.filter((p) => out.has(p.id)).every((p) => p.x - p.w / 2 >= c.bounds.left - 1e-6 && p.x + p.w / 2 <= c.bounds.right + 1e-6
    && p.y - p.h / 2 >= c.bounds.top - 1e-6 && p.y + p.h / 2 <= c.bounds.bottom + 1e-6), 'a marker that moved lands inside the free area');
});
