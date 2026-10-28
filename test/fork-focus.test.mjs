// Fork (matt/single-pane): pure helpers for stair landing and nested fly-in
// targets (FORK.md §1, §3).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  focusChildren, focusParent, focusRegionFromView, focusRegionList, inflateToContext,
  isFocusRegion, regionRoomId, resolveFocusTap, sameFocusNode, stairLanding,
} from '../test-build/fork-focus.js';

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
