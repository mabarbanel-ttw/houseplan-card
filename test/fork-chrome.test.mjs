// Fork (matt/single-pane): card options of the on-map chrome (FORK.md §2, §5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { forkCardOptions, levelGlyphs, sceneDockService } from '../test-build/fork-chrome.js';

test('fork §2 level_nav defaults to upstream tabs and accepts only known values', () => {
  assert.equal(forkCardOptions({}).levelNav, 'tabs');
  assert.equal(forkCardOptions({ level_nav: 'indicator' }).levelNav, 'indicator');
  assert.equal(forkCardOptions({ level_nav: 'Indicator' }).levelNav, 'tabs');
  assert.equal(forkCardOptions(null).levelNavOrder, 'tabs');
  assert.equal(forkCardOptions({ level_nav_order: 'reverse' }).levelNavOrder, 'reverse');
});

test('fork §2 glyphs follow tab order top-to-bottom, or its reverse', () => {
  const spaces = [{ id: 'up', title: 'Upper' }, { id: 'main', title: 'Main' }, { id: 'low' }];
  assert.deepEqual(levelGlyphs(spaces, 'main', 'tabs'), [
    { id: 'up', title: 'Upper', current: false },
    { id: 'main', title: 'Main', current: true },
    { id: 'low', title: 'low', current: false },
  ]);
  assert.deepEqual(levelGlyphs(spaces, 'main', 'reverse').map((g) => g.id), ['low', 'main', 'up']);
});
