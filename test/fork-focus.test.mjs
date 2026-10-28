// Fork (matt/single-pane): pure helpers for stair landing and nested fly-in
// targets (FORK.md §1, §3).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  focusChildren, focusParent, focusRegionFromView, focusRegionList, inflateToContext,
  insetCameraTarget, isFocusRegion, NO_INSETS, regionRoomId, resolveFocusTap, sameFocusNode,
  stairLanding,
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
