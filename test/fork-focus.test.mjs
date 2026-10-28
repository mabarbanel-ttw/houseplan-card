// Fork (matt/single-pane): pure helpers for stair landing and nested fly-in
// targets (FORK.md §1, §3).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  focusChildren, focusParent, focusRegionFromView, focusRegionList, inflateToContext,
  focusPath, insetCameraTarget, isFocusRegion, nestedAway, NO_INSETS, regionRoomId,
  resolveFocusTap, sameFocusNode, stairLanding,
} from '../test-build/fork-focus.js';
import { roomFitCameraTarget } from '../test-build/room-fit.js';

test('fork §1 stair landing picks the stair that links back, nearest first', () => {
  const stairs = [
    { id: 'a', x: 0.1, y: 0.1, target_space_id: 'other' },
    { id: 'b', x: 0.9, y: 0.9, target_space_id: 'main' },
    { id: 'c', x: 0.2, y: 0.2, target_space_id: 'main' },
  ];
  assert.equal(stairLanding(stairs, 'main', { x: 0.85, y: 0.8 })?.id, 'b');
  assert.equal(stairLanding(stairs, 'main', { x: 0.25, y: 0.1 })?.id, 'c');
  assert.equal(stairLanding(stairs, 'main', null)?.id, 'b', 'stored order without a source position');
  assert.equal(stairLanding(stairs, 'nowhere', { x: 0, y: 0 }), null, 'no link back → fit all');
  assert.equal(stairLanding([], 'main', null), null);
});

test('fork §1 landing context grows a small stair rectangle around its centre', () => {
  assert.deepEqual(inflateToContext({ x: 10, y: 20, w: 10, h: 40 }, 100), { x: -35, y: -10, w: 100, h: 100 });
  assert.deepEqual(inflateToContext({ x: 0, y: 0, w: 200, h: 50 }, 100), { x: 0, y: -25, w: 200, h: 100 });
  assert.deepEqual(inflateToContext({ x: 1, y: 2, w: 3, h: 4 }, 0), { x: 1, y: 2, w: 3, h: 4 });
});

test('fork §2 chrome-aware camera equals room fit without insets and clears the chrome with them', () => {
  const input = {
    bounds: { x: 300, y: 200, w: 120, h: 60 },
    baseFit: { x: 0, y: -100, w: 1000, h: 800 },
    stageWidth: 1000, stageHeight: 800, minZoom: 1 / 3, maxZoom: 32, safeFraction: 0.8,
  };
  const plain = roomFitCameraTarget(input);
  const inset = insetCameraTarget({ ...input, insets: NO_INSETS });
  for (const key of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(plain.viewBox[key] - inset.viewBox[key]) < 1e-9, key);
  assert.ok(Math.abs(plain.zoom - inset.zoom) < 1e-9);
  const right = insetCameraTarget({ ...input, insets: { left: 0, right: 200, top: 0, bottom: 0 } });
  const ppu = 1000 / right.viewBox.w;
  const screenRight = (input.bounds.x + input.bounds.w - right.viewBox.x) * ppu;
  const screenLeft = (input.bounds.x - right.viewBox.x) * ppu;
  assert.ok(screenRight <= 800 + 1e-6, 'bounds end left of the 200 px chrome');
  assert.ok(Math.abs((screenLeft + screenRight) / 2 - 400) < 1e-6, 'centred in the free 800 px');
  assert.ok(Math.abs(right.viewBox.w / right.viewBox.h - 1000 / 800) < 1e-9, 'stage aspect kept');
  assert.equal(insetCameraTarget({ ...input, bounds: { x: 0, y: 0, w: 0, h: 1 }, insets: NO_INSETS }), null);
});

const REGIONS = [
  { id: 'rack', x: 0.4, y: 0.1, w: 0.1, h: 0.12, room_id: 'living' },
  { id: 'udm', x: 0.41, y: 0.12, w: 0.08, h: 0.02, parent_id: 'rack' },
  { id: 'switch', x: 0.41, y: 0.16, w: 0.08, h: 0.02, parent_id: 'rack' },
  { id: 'yard', x: 2, y: 2, w: 0.5, h: 0.5 },
];

test('fork §3 focus regions: read boundary keeps valid unique records and detaches broken parents', () => {
  const list = focusRegionList([
    ...REGIONS,
    { id: 'rack', x: 0, y: 0, w: 1, h: 1 },               // duplicate id: first wins
    { id: 'bad', x: 0, y: 0, w: 0, h: 1 },                 // zero size
    { id: 'orphan', x: 0, y: 0, w: 1, h: 1, parent_id: 'gone' },
    { id: 'a', x: 0, y: 0, w: 1, h: 1, parent_id: 'b' },
    { id: 'b', x: 0, y: 0, w: 1, h: 1, parent_id: 'a' },  // cycle
    'junk', null,
  ]);
  assert.deepEqual(list.map((r) => r.id), ['rack', 'udm', 'switch', 'yard', 'orphan', 'a', 'b']);
  assert.equal(list.find((r) => r.id === 'orphan').parent_id, null);
  assert.ok(list.filter((r) => r.id === 'a' || r.id === 'b').every((r) => r.parent_id === null));
  assert.equal(isFocusRegion({ id: 'x', x: 1, y: 1, w: 1, h: 1, room_id: 7 }), false);
  assert.deepEqual(focusRegionList('nope'), []);
});

test('fork §3 hierarchy: children, parent chain and owning room', () => {
  assert.deepEqual(focusChildren(null, REGIONS).map((r) => r.id), ['yard']);
  assert.deepEqual(focusChildren({ kind: 'room', id: 'living' }, REGIONS).map((r) => r.id), ['rack']);
  assert.deepEqual(focusChildren({ kind: 'region', id: 'rack' }, REGIONS).map((r) => r.id), ['udm', 'switch']);
  assert.deepEqual(focusParent({ kind: 'region', id: 'udm' }, REGIONS), { kind: 'region', id: 'rack' });
  assert.deepEqual(focusParent({ kind: 'region', id: 'rack' }, REGIONS), { kind: 'room', id: 'living' });
  assert.equal(focusParent({ kind: 'room', id: 'living' }, REGIONS), null);
  assert.equal(focusParent({ kind: 'region', id: 'yard' }, REGIONS), null);
  assert.equal(regionRoomId(REGIONS[1], REGIONS), 'living');
  assert.ok(sameFocusNode({ kind: 'room', id: 'a' }, { kind: 'room', id: 'a' }));
  assert.ok(!sameFocusNode({ kind: 'room', id: 'a' }, { kind: 'region', id: 'a' }));
});

test('fork §3 tap resolution: step by step in, siblings and surroundings step across/out', () => {
  const living = { kind: 'room', id: 'living' };
  const rack = { kind: 'region', id: 'rack' };
  const udm = { kind: 'region', id: 'udm' };
  // From the whole level a room-level region is not reachable directly.
  assert.equal(resolveFocusTap([0.45, 0.13], null, REGIONS), null);
  assert.equal(resolveFocusTap([2.2, 2.2], null, REGIONS)?.id, 'yard');
  // Room → rack → faceplate.
  assert.equal(resolveFocusTap([0.45, 0.13], living, REGIONS)?.id, 'rack');
  assert.equal(resolveFocusTap([0.45, 0.13], rack, REGIONS)?.id, 'udm');
  // Sibling inside the same rack.
  assert.equal(resolveFocusTap([0.45, 0.17], udm, REGIONS)?.id, 'switch');
  // Rack surroundings from the faceplate → the rack itself.
  assert.equal(resolveFocusTap([0.405, 0.2], udm, REGIONS)?.id, 'rack');
  // Outside everything → no region (caller keeps room/background behaviour).
  assert.equal(resolveFocusTap([0.1, 0.5], udm, REGIONS), null);
  assert.equal(resolveFocusTap([Number.NaN, 0], udm, REGIONS), null);
});

test('fork §3 markers inside a region you have not entered do not take the tap', () => {
  const at = (node) => focusPath(node, REGIONS);
  const port = [0.45, 0.13];
  assert.equal(nestedAway(port, at(null), REGIONS), true);
  assert.equal(nestedAway(port, at({ kind: 'room', id: 'living' }), REGIONS), true);
  assert.equal(nestedAway(port, at({ kind: 'region', id: 'rack' }), REGIONS), true, 'still inside the unentered faceplate');
  assert.equal(nestedAway(port, at({ kind: 'region', id: 'udm' }), REGIONS), false);
  assert.equal(nestedAway([0.405, 0.2], at({ kind: 'region', id: 'rack' }), REGIONS), false);
  assert.equal(nestedAway([0.1, 0.5], at(null), REGIONS), false);
});

test('fork §3 a framed view becomes a child target of the current position', () => {
  const view = { x: 400, y: 100, w: 100, h: 50 };
  assert.deepEqual(focusRegionFromView(view, 1000, { kind: 'region', id: 'rack' }, 'r1'),
    { id: 'r1', x: 0.41, y: 0.105, w: 0.08, h: 0.04, parent_id: 'rack' });
  assert.deepEqual(focusRegionFromView(view, 1000, { kind: 'room', id: 'living' }, 'r2'),
    { id: 'r2', x: 0.41, y: 0.105, w: 0.08, h: 0.04, room_id: 'living' });
  assert.deepEqual(focusRegionFromView(view, 1000, null, 'r3'), { id: 'r3', x: 0.41, y: 0.105, w: 0.08, h: 0.04 });
  assert.equal(focusRegionFromView({ ...view, w: 0 }, 1000, null, 'r4'), null);
});
