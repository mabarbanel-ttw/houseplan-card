// Fork matt.2 (FORK.md §11–§13): one marker per physical device.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  badgeSuppressed, forkMarkerCarry, markerActions, markerExtraEntities, markerGhostNow, markerInactive, rowToggleable,
} from '../test-build/fork-marker.js';

const hass = (states) => ({ states: Object.fromEntries(Object.entries(states).map(([id, state]) => [id, { state }])) });
const port = {
  id: 'p', binding: 'entity:sensor.p', inactive_presentation: 'ghost', hide_badge_when_inactive: true,
  state_source: { entity_id: 'sensor.p', active_states: ['100', '1000', '2500', '10000'] },
};

test('matt.2 §11 a port reporting 10 (no link) is inactive and looks disconnected', () => {
  assert.equal(markerInactive(hass({ 'sensor.p': '10' }), port), true);
  assert.equal(markerInactive(hass({ 'sensor.p': '1000' }), port), false);
  assert.equal(markerInactive(hass({ 'sensor.p': 'unavailable' }), port), true);
  assert.equal(markerGhostNow(hass({ 'sensor.p': '10' }), port), true);
  assert.equal(markerGhostNow(hass({ 'sensor.p': '1000' }), port), false);
  assert.equal(markerInactive(hass({ 'sensor.p': '10' }), { ...port, state_source: { entity_id: 'sensor.p' } }), false,
    'without explicit active states nothing is inactive');
  assert.equal(badgeSuppressed(hass({ 'sensor.p': '10' }), port, '10', null), true);
  assert.equal(badgeSuppressed(hass({ 'sensor.p': '1000' }), port, '1000', null), false);
});

test('matt.2 §13 badge_hide_when: listed values (numeric-aware) and primary_off', () => {
  const oven = { id: 'o', binding: 'entity:switch.oven', badge_hide_when: ['0', 'unknown', 'primary_off'] };
  assert.equal(badgeSuppressed(hass({}), oven, '0.0', null), true);
  assert.equal(badgeSuppressed(hass({}), oven, 'Unknown', null), true);
  assert.equal(badgeSuppressed(hass({ 'switch.oven': 'on' }), oven, '350', 'switch.oven'), false);
  assert.equal(badgeSuppressed(hass({ 'switch.oven': 'off' }), oven, '350', 'switch.oven'), true);
  assert.equal(badgeSuppressed(hass({}), { id: 'x', binding: 'virtual' }, '0', null), false);
});

test('matt.2 §12 callout actions (script/scene only) and extra entity rows', () => {
  assert.deepEqual(markerActions({ id: 'l', binding: 'virtual', actions: [
    { entity: 'script.lanterns_candle', icon: 'mdi:candle' }, { entity: 'light.x' }, { entity: 'scene.night' },
    { entity: 'script.lanterns_candle' }, { entity: 'script.y', icon: '<b>' },
  ] }), [
    { entity: 'script.lanterns_candle', icon: 'mdi:candle', name: '' },
    { entity: 'scene.night', icon: 'mdi:palette', name: '' },
    { entity: 'script.y', icon: 'mdi:play', name: '' },
  ]);
  assert.deepEqual(markerExtraEntities({ id: 'l', binding: 'virtual', extra_entities: ['select.fx', 'bad id', 'select.fx', 'fan.heater'] }),
    ['select.fx', 'fan.heater']);
  assert.equal(rowToggleable('switch.fx'), true);
  assert.equal(rowToggleable('lock.front'), false);
  assert.equal(rowToggleable('cover.garage'), false);
});

test('matt.2 a device-dialog save carries the fork keys it has no field for', () => {
  const prev = { id: 'm', binding: 'virtual', reveal: 'room', actions: [{ entity: 'script.a' }], extra_entities: ['fan.x'],
    badge_hide_when: ['0'], inactive_presentation: 'ghost', hide_badge_when_inactive: true, name: 'n' };
  assert.deepEqual(forkMarkerCarry(prev), { reveal: 'room', inactive_presentation: 'ghost', hide_badge_when_inactive: true,
    badge_hide_when: ['0'], actions: [{ entity: 'script.a' }], extra_entities: ['fan.x'] });
  assert.deepEqual(forkMarkerCarry(null), {});
});
