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

test('matt.3 §16 hold opens the callout for markers with extras (or hold_action), else the device card', async () => {
  const { markerHoldAction } = await import('../test-build/fork-marker.js');
  assert.equal(markerHoldAction({ id: 'a', binding: 'virtual' }), 'card');
  assert.equal(markerHoldAction({ id: 'a', binding: 'virtual', extra_entities: ['select.x'] }), 'callout');
  assert.equal(markerHoldAction({ id: 'a', binding: 'virtual', actions: [{ entity: 'script.x' }] }), 'callout');
  assert.equal(markerHoldAction({ id: 'a', binding: 'virtual', hold_action: 'callout' }), 'callout');
  assert.equal(markerHoldAction({ id: 'a', binding: 'virtual', extra_entities: ['select.x'], hold_action: 'card' }), 'card');
  assert.ok(forkMarkerCarry({ id: 'a', binding: 'virtual', hold_action: 'callout' }).hold_action === 'callout');
});

test('matt.3 §16 callout row controls: select picker, number stepper, update state only', async () => {
  const { rowControl, rowSetService, stepNumber } = await import('../test-build/fork-marker.js');
  assert.deepEqual(rowControl('select.fan', { state: 'Low', attributes: { options: ['Low', 'High'] } }),
    { kind: 'select', options: ['Low', 'High'], current: 'Low', available: true });
  assert.equal(rowControl('select.fan', { state: 'unavailable', attributes: { options: ['Low'] } }).available, false);
  assert.deepEqual(rowControl('number.t', { state: '70', attributes: { min: 50, max: 85, step: 0.5, unit_of_measurement: '°F' } }),
    { kind: 'number', min: 50, max: 85, step: 0.5, unit: '°F', value: 70, available: true });
  assert.equal(rowControl('update.fw', { state: 'off', attributes: {} }), null);
  assert.equal(rowControl('sensor.x', { state: '1' }), null);
  assert.equal(rowControl('fan.x', { state: 'on' }).kind, 'toggle');
  // Stepper respects step, min and max, and snaps off-grid values onto the grid.
  assert.equal(stepNumber(70, 1, 50, 85, 1), 71);
  assert.equal(stepNumber(85, 1, 50, 85, 1), 85);
  assert.equal(stepNumber(50, -1, 50, 85, 1), 50);
  assert.equal(stepNumber(0.3, 1, 0, 1, 0.1), 0.4);
  assert.equal(stepNumber(70.25, 1, 50, 85, 0.5), 70.5);
  assert.equal(stepNumber(70.25, -1, 50, 85, 0.5), 70);
  assert.deepEqual(rowSetService('select.fan', 'High'), { domain: 'select', service: 'select_option', data: { entity_id: 'select.fan', option: 'High' } });
  assert.deepEqual(rowSetService('input_number.t', 71), { domain: 'input_number', service: 'set_value', data: { entity_id: 'input_number.t', value: 71 } });
  assert.equal(rowSetService('update.fw', 1), null);
});

test('matt.4 callout row labels: the entity\'s own 1–2 word name, never the device name', async () => {
  const { rowLabel, shortLabel, markerExtraRows } = await import('../test-build/fork-marker.js');
  const hass = {
    devices: { h: { name: 'Living Room Floor Heater' }, t: { name: 'Opae Ula Tank', name_by_user: null }, b: { name: 'Brass floor lamp' } },
    entities: {
      'number.heater_target': { device_id: 'h', name: null },
      'select.heater_fan': { device_id: 'h', name: 'Fan speed' },
      'switch.heater_osc': { device_id: 'h' },
      'switch.heater_auto_stop': { device_id: 'h' },
      'select.tank_mode': { device_id: 't' },
      'number.tank_pink': { device_id: 't' },
      'light.brass_floor_lamp_1': { device_id: 'b' },
    },
    states: {
      'number.heater_target': { attributes: { friendly_name: 'Living Room Floor Heater Target temperature' } },
      'select.heater_fan': { attributes: { friendly_name: 'Living Room Floor Heater Fan speed' } },
      'switch.heater_osc': { attributes: { friendly_name: 'Living Room Floor Heater Oscillation' } },
      'switch.heater_auto_stop': { attributes: { friendly_name: 'Living Room Floor Heater Auto stop' } },
      'select.tank_mode': { attributes: { friendly_name: 'Opae Ula Tank Mode' } },
      'number.tank_pink': { attributes: { friendly_name: 'Opae Ula Tank Pink' } },
      'light.brass_floor_lamp_1': { attributes: { friendly_name: 'Brass floor lamp Bulb 1' } },
    },
  };
  assert.equal(rowLabel(hass, 'number.heater_target'), 'Target');
  assert.equal(rowLabel(hass, 'select.heater_fan'), 'Fan speed');
  assert.equal(rowLabel(hass, 'switch.heater_osc'), 'Oscillation');
  assert.equal(rowLabel(hass, 'switch.heater_auto_stop'), 'Auto stop');
  assert.equal(rowLabel(hass, 'select.tank_mode'), 'Mode');
  assert.equal(rowLabel(hass, 'number.tank_pink'), 'Pink');
  assert.equal(rowLabel(hass, 'light.brass_floor_lamp_1'), 'Bulb 1');
  assert.equal(rowLabel(hass, 'number.heater_target', 'Set temp'), 'Set temp', 'a data override wins');
  assert.equal(rowLabel({}, 'switch.lamp_fx'), 'Lamp fx', 'no registry: object id, 1–2 words');
  assert.equal(shortLabel('Very long multi word name'), 'Very long');
  assert.deepEqual(markerExtraRows({ id: 'm', binding: 'virtual', extra_entities: ['select.a', { entity: 'number.b', name: 'Target' }, { entity: 'bad id' }, 'select.a'] }),
    [{ entity: 'select.a', name: '' }, { entity: 'number.b', name: 'Target' }]);
});

