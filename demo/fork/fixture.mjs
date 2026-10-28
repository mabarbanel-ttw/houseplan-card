// Fork (matt/single-pane) demo fixture: a synthetic three-level house shaped
// like the owner's — upper office, main level with a living-room equipment
// rack, lower ADU + yard beds — linked by stairs. Used only by the fork
// screenshot/verification script (demo/fork/shots.mjs). Fully synthetic.

export const FORK_SPACES = ['upper', 'main', 'lower'];

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const stair = (id, x, y, angle, target) => ({
  id, kind: 'straight', x, y, angle, length: 0.11, width: 0.045,
  direction: 'forward', target_space_id: target,
  color: '#9fb3c8', opacity: 1, fill_color: '#9fb3c8', fill_opacity: 0.12,
});

export const FORK_CONFIG = {
  spaces: [
    {
      id: 'upper', title: 'Upper', view_box: [0, 0, 1, 1],
      settings: { show_borders: true, show_names: true },
      rooms: [
        { id: 'office', name: 'Office', area: 'office', poly: rect(0.1, 0.12, 0.66, 0.6) },
        { id: 'landing', name: 'Landing', area: 'landing', poly: rect(0.66, 0.12, 0.9, 0.6) },
      ],
      stairs: [stair('up-down', 0.78, 0.5, 90, 'main')],
      focus_regions: [
        { id: 'office-printers', x: 0.14, y: 0.16, w: 0.2, h: 0.1, room_id: 'office' },
      ],
    },
    {
      id: 'main', title: 'Main', view_box: [0, 0, 1, 1],
      settings: { show_borders: true, show_names: true },
      rooms: [
        { id: 'living', name: 'Living room', area: 'living_room', poly: rect(0.05, 0.1, 0.5, 0.55) },
        { id: 'kitchen', name: 'Kitchen', area: 'kitchen', poly: rect(0.5, 0.1, 0.8, 0.4) },
        { id: 'dining', name: 'Dining', area: 'dining', poly: rect(0.8, 0.1, 0.95, 0.4) },
        { id: 'hall', name: 'Hallway', area: 'hallway', poly: rect(0.5, 0.4, 0.95, 0.55) },
        { id: 'bed', name: 'Bedroom', area: 'bedroom', poly: rect(0.05, 0.55, 0.5, 0.85) },
        { id: 'bath', name: 'Bath', area: 'bath', poly: rect(0.5, 0.55, 0.7, 0.85) },
      ],
      stairs: [
        stair('main-up', 0.88, 0.475, 0, 'upper'),
        stair('main-down', 0.62, 0.475, 180, 'lower'),
      ],
      focus_regions: [
        // The equipment rack in the living room's NE corner …
        { id: 'rack', x: 0.395, y: 0.115, w: 0.09, h: 0.12, room_id: 'living' },
        // … and the UDM faceplate inside the rack.
        { id: 'udm', x: 0.402, y: 0.128, w: 0.076, h: 0.022, parent_id: 'rack' },
      ],
    },
    {
      id: 'lower', title: 'Lower', view_box: [0, 0, 1, 1],
      settings: { show_borders: true, show_names: true },
      rooms: [
        { id: 'adu', name: 'ADU', area: 'adu', poly: rect(0.08, 0.12, 0.58, 0.62) },
        { id: 'bed-north', name: 'Beds N', area: 'garden', poly: rect(0.66, 0.12, 0.95, 0.32) },
        { id: 'bed-south', name: 'Beds S', area: 'garden', poly: rect(0.66, 0.42, 0.95, 0.62) },
      ],
      stairs: [stair('lower-up', 0.45, 0.55, 0, 'main')],
    },
  ],
  markers: [
    // Rack contents (living room).
    { id: 'm-udm', binding: 'entity:sensor.udm_state', name: 'UDM Pro', icon: 'mdi:router-network',
      space: 'main', room_id: 'living', size: 0.45,
      value_badge: { enabled: true, position: 'bottom',
        source: { kind: 'entity_state', entity_id: 'sensor.udm_wan_speed' } } },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({
      id: `m-port-${n}`, binding: `entity:sensor.udm_port_${n}_speed`, name: `Port ${n}`,
      icon: 'mdi:ethernet', space: 'main', room_id: 'living', size: 0.16,
      tap_action: 'callout',
      value_badge: { enabled: true, position: 'bottom',
        source: { kind: 'entity_state', entity_id: `sensor.udm_port_${n}_speed` } },
    })),
    { id: 'm-poe', binding: 'entity:switch.rack_poe', name: 'Rack PoE', icon: 'mdi:power-socket-us',
      space: 'main', room_id: 'living', size: 0.45, tap_action: 'callout' },
    { id: 'm-hue', binding: 'virtual', name: 'Hue bridge', icon: 'mdi:hub-outline',
      space: 'main', room_id: 'living', size: 0.45, presentation: 'ghost' },
    { id: 'm-ikea', binding: 'virtual', name: 'IKEA gateway', icon: 'mdi:access-point',
      space: 'main', room_id: 'living', size: 0.45, presentation: 'ghost' },
    // A dumb fixture that is not in HA at all.
    { id: 'm-candles', binding: 'virtual', name: 'Candles', icon: 'mdi:candle',
      space: 'main', room_id: 'living', presentation: 'ghost' },
    { id: 'm-lamp', binding: 'entity:light.living_lamp', name: 'Lamp', icon: 'mdi:floor-lamp',
      space: 'main', room_id: 'living', tap_action: 'callout' },
    // Upper office printers.
    { id: 'm-x1c', binding: 'virtual', name: 'X1C', icon: 'mdi:printer-3d', space: 'upper',
      room_id: 'office', presentation: 'ghost' },
    { id: 'm-p1s', binding: 'virtual', name: 'P1S', icon: 'mdi:printer-3d-nozzle', space: 'upper',
      room_id: 'office', presentation: 'ghost' },
    // Lower yard beds.
    { id: 'm-valve', binding: 'entity:switch.bed_valve', name: 'Drip', icon: 'mdi:sprinkler-variant',
      space: 'lower', room_id: 'bed-north', tap_action: 'callout' },
  ],
  settings: { filter_seeded: true },
};

export const FORK_LAYOUT = {
  'm-udm': { s: 'main', x: 0.44, y: 0.139 },
  'm-port-1': { s: 'main', x: 0.408, y: 0.141 },
  'm-port-2': { s: 'main', x: 0.4155, y: 0.141 },
  'm-port-3': { s: 'main', x: 0.423, y: 0.141 },
  'm-port-4': { s: 'main', x: 0.4555, y: 0.141 },
  'm-port-5': { s: 'main', x: 0.463, y: 0.141 },
  'm-port-6': { s: 'main', x: 0.4705, y: 0.141 },
  'm-poe': { s: 'main', x: 0.44, y: 0.175 },
  'm-hue': { s: 'main', x: 0.418, y: 0.212 },
  'm-ikea': { s: 'main', x: 0.462, y: 0.212 },
  'm-candles': { s: 'main', x: 0.2, y: 0.18 },
  'm-lamp': { s: 'main', x: 0.3, y: 0.42 },
  'm-x1c': { s: 'upper', x: 0.19, y: 0.21 },
  'm-p1s': { s: 'upper', x: 0.28, y: 0.21 },
  'm-valve': { s: 'lower', x: 0.8, y: 0.22 },
};

/** Entities the fixture adds to the synthetic HA registry/state. */
export const FORK_ENTITIES = [
  ['sensor.udm_state', 'living_room', 'online', { friendly_name: 'UDM Pro' }],
  ['sensor.udm_wan_speed', 'living_room', '940', { friendly_name: 'WAN', unit_of_measurement: 'Mbit/s' }],
  ...[1, 2, 3, 4, 5, 6].map((n) => [
    `sensor.udm_port_${n}_speed`, 'living_room', n === 3 ? '100' : n === 6 ? '0' : '1000',
    { friendly_name: `Port ${n}`, unit_of_measurement: 'Mbit/s' },
  ]),
  ['switch.rack_poe', 'living_room', 'on', { friendly_name: 'Rack PoE' }],
  ['light.living_lamp', 'living_room', 'on', { friendly_name: 'Living lamp', brightness: 180 }],
  ['switch.bed_valve', 'garden', 'off', { friendly_name: 'Bed drip valve' }],
  ['script.night_study', null, 'off', { friendly_name: 'Night Study', icon: 'mdi:book-open-variant' }],
  ['script.late_night_chill', null, 'off', { friendly_name: 'Late Night Chill' }],
  ['scene.all_off', null, 'scening', { friendly_name: 'All off' }],
];
