// Fork (matt/single-pane, FORK.md §8): compact value badges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compactBadgeValue, compactDuration, compactRate } from '../test-build/fork-format.js';
import { valueWithUnit } from '../test-build/logic.js';

test('fork §8 data rates are compact SI: 1G, 100M, 10G', () => {
  assert.equal(compactRate(1000, 'Mbit/s'), '1G');
  assert.equal(compactRate(100, 'Mbit/s'), '100M');
  assert.equal(compactRate(10000, 'Mbit/s'), '10G');
  assert.equal(compactRate(940, 'Mbit/s'), '940M');
  assert.equal(compactRate(2500, 'Mbit/s'), '2.5G');
  assert.equal(compactRate(10, 'Mbit/s'), '10M');
  assert.equal(compactRate(0, 'Mbit/s'), '0');
  assert.equal(compactRate(999.7, 'Mbit/s'), '1G');
  assert.equal(compactRate(12.5, 'MB/s'), '13MB');
  assert.equal(compactRate(1, 'Gbit/s'), '1G');
  assert.equal(compactRate(5, 'W'), null);
});

test('fork §8 durations: 95m, 2h15m, 3d, 45s', () => {
  assert.equal(compactDuration(95, 'min'), '95m');
  assert.equal(compactDuration(135, 'min'), '2h15m');
  assert.equal(compactDuration(120, 'min'), '2h');
  assert.equal(compactDuration(3, 'd'), '3d');
  assert.equal(compactDuration(45, 's'), '45s');
  assert.equal(compactDuration(1.5, 'h'), '90m');
  assert.equal(compactDuration(5, 'kg'), null);
});

test('fork §8 badge value: compact only for rates/durations, every result ≤ 5 chars', () => {
  assert.equal(compactBadgeValue('1000', 'Mbit/s'), '1G');
  assert.equal(compactBadgeValue('95', 'min', 'duration'), '95m');
  assert.equal(compactBadgeValue('73.4', '°F', 'temperature'), null);
  assert.equal(compactBadgeValue('unavailable', 'Mbit/s'), null);
  for (const [v, u] of [[1000, 'Mbit/s'], [100, 'Mbit/s'], [95, 'min'], [135, 'min'], [10000, 'Mbit/s'], [1.5, 'h']]) {
    assert.ok(compactBadgeValue(String(v), u).length <= 5, `${v} ${u}`);
  }
});

test('fork §8 a unit is never doubled', () => {
  // HA formatted a duration as "95m" for a `min` sensor: no " min" appended.
  assert.equal(valueWithUnit({ text: '95m', formatted: true }, 'min'), '95m');
  // HA appended the unit itself: kept once.
  assert.equal(valueWithUnit({ text: '1,000 Mbit/s', formatted: true }, 'Mbit/s'), '1,000 Mbit/s');
  // HA formatted only the number: unit appended once.
  assert.equal(valueWithUnit({ text: '22.4', formatted: true }, '°C'), '22.4 °C');
  // Raw fallback unchanged.
  assert.equal(valueWithUnit({ text: '22.4', formatted: false }, '°C'), '22.4 °C');
});
