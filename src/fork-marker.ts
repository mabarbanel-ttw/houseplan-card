/**
 * Fork (matt/single-pane, matt.2): per-marker rules that keep "one marker per
 * physical device" readable — inactive (disconnected) look, badge suppression,
 * and the callout's extra actions/entity rows (FORK.md §11–§13). Pure.
 */
import { normalizeMarkerStateSource } from './marker-state-source';
import type { Marker } from './types';

const UNKNOWN = new Set(['', 'unknown', 'unavailable']);

/**
 * True when the marker's `state_source` declares `active_states` and the
 * source entity is currently NOT in one of them (or is unknown/unavailable).
 * A marker without explicit active states is never "inactive" here.
 */
export function markerInactive(hass: any, marker: Marker | null | undefined): boolean {
  const source = normalizeMarkerStateSource(marker?.state_source);
  if (!source?.active_states?.length) return false;
  const row = hass?.states?.[source.entity_id];
  const state = row?.state == null ? '' : String(row.state).trim();
  if (UNKNOWN.has(state.toLowerCase())) return true;
  return !source.active_states.includes(state);
}

/** Inactive markers with `inactive_presentation: ghost` look disconnected. */
export function markerGhostNow(hass: any, marker: Marker | null | undefined): boolean {
  if (marker?.presentation === 'ghost') return true;
  return marker?.inactive_presentation === 'ghost' && markerInactive(hass, marker);
}

const sameValue = (raw: string, token: string): boolean => {
  const a = raw.trim();
  const b = token.trim();
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const na = Number(a), nb = Number(b);
  return a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb) && na === nb;
};

/**
 * Should the value badge be hidden right now?
 * - `hide_badge_when_inactive` while the state source is inactive;
 * - `badge_hide_when` lists raw source values ("0" also matches "0.0") and the
 *   token `primary_off` (the marker's primary entity is `off`).
 */
export function badgeSuppressed(
  hass: any, marker: Marker | null | undefined, sourceValue: unknown, primary?: string | null,
): boolean {
  if (marker?.hide_badge_when_inactive === true && markerInactive(hass, marker)) return true;
  const list = Array.isArray(marker?.badge_hide_when) ? marker!.badge_hide_when! : [];
  if (!list.length) return false;
  const raw = sourceValue == null ? '' : String(sourceValue);
  for (const token of list) {
    if (typeof token !== 'string') continue;
    if (token === 'primary_off') {
      if (primary && String(hass?.states?.[primary]?.state) === 'off') return true;
      continue;
    }
    if (sameValue(raw, token)) return true;
  }
  return false;
}

export interface CalloutAction { entity: string; icon: string; name: string }
const RUNNABLE = /^(script|scene)\.[A-Za-z0-9_]+$/;
const ENTITY = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const ICON = /^[a-z0-9-]+:[a-z0-9-]+$/;
export const MAX_MARKER_ACTIONS = 12;
export const MAX_EXTRA_ENTITIES = 16;

export function markerActions(marker: Marker | null | undefined): CalloutAction[] {
  const out: CalloutAction[] = [];
  for (const raw of Array.isArray(marker?.actions) ? marker!.actions! : []) {
    if (out.length >= MAX_MARKER_ACTIONS) break;
    const entity = String(raw?.entity || '').trim();
    if (!RUNNABLE.test(entity) || out.some((a) => a.entity === entity)) continue;
    const icon = String(raw?.icon || '').trim();
    out.push({
      entity,
      icon: ICON.test(icon) ? icon : entity.startsWith('scene.') ? 'mdi:palette' : 'mdi:play',
      name: String(raw?.name || '').trim().slice(0, 32),
    });
  }
  return out;
}

export function markerExtraEntities(marker: Marker | null | undefined): string[] {
  return markerExtraRows(marker).map((row) => row.entity);
}

/** matt.4: extra rows — a plain entity id, or `{entity, name}` with a label override. */
export function markerExtraRows(marker: Marker | null | undefined): Array<{ entity: string; name: string }> {
  const out: Array<{ entity: string; name: string }> = [];
  for (const raw of Array.isArray(marker?.extra_entities) ? marker!.extra_entities! : []) {
    const item = raw && typeof raw === 'object' ? raw as { entity?: unknown; name?: unknown } : { entity: raw };
    const id = String(item.entity ?? '').trim();
    if (!ENTITY.test(id) || out.some((row) => row.entity === id) || out.length >= MAX_EXTRA_ENTITIES) continue;
    out.push({ entity: id, name: typeof item.name === 'string' ? item.name.trim().slice(0, 32) : '' });
  }
  return out;
}

/** matt.4: a row label is at most two words (one when two run long). */
export function shortLabel(text: string): string {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words[0] ?? '';
  const two = words.slice(0, 2).join(' ');
  return two.length > 12 ? words[0] : two;
}

/**
 * matt.4: the label of a callout row — the entity's OWN name, never the
 * device's: an explicit override; else the registry entity name; else the
 * friendly name with the device-name prefix stripped (HA entity naming,
 * "Living Room Floor Heater Target temperature" → "Target temperature");
 * then cut to 1–2 words (UI copy rule): → "Target".
 */
export function rowLabel(hass: any, entityId: string, override?: string | null): string {
  if (override && override.trim()) return override.trim();
  const reg = hass?.entities?.[entityId];
  const dev = reg?.device_id ? hass?.devices?.[reg.device_id] : null;
  const deviceName = String(dev?.name_by_user || dev?.name || '').trim();
  const strip = (text: string): string => {
    const t = String(text || '').trim();
    if (deviceName && t.toLowerCase().startsWith(deviceName.toLowerCase() + ' ')) return t.slice(deviceName.length + 1).trim();
    return t;
  };
  const own = strip(reg?.name || '');
  const friendly = strip(hass?.states?.[entityId]?.attributes?.friendly_name || '');
  const fallback = entityId.split('.')[1]?.replace(/_/g, ' ') ?? entityId;
  const name = own || friendly || fallback;
  return shortLabel(name.charAt(0).toUpperCase() + name.slice(1));
}

/** Domains a callout row may toggle (never locks, covers, alarm panels). */
export const ROW_TOGGLE_DOMAINS = ['switch', 'light', 'fan', 'input_boolean', 'siren', 'humidifier'] as const;
export function rowToggleable(entityId: string): boolean {
  return (ROW_TOGGLE_DOMAINS as readonly string[]).includes(entityId.split('.')[0]);
}

/** Fork keys the device dialog has no field for: carried through a dialog
 *  save unchanged, so editing a marker never drops them (FORK.md §7, §11–§13). */
export const FORK_MARKER_CARRY = [
  'reveal', 'inactive_presentation', 'hide_badge_when_inactive', 'badge_hide_when', 'actions', 'extra_entities',
  'hold_action',
] as const;

/** matt.3 §16: what a 600 ms hold on a View marker opens. */
export function markerHoldAction(marker: Marker | null | undefined): 'callout' | 'card' {
  const explicit = marker?.hold_action;
  if (explicit === 'callout' || explicit === 'card') return explicit;
  return markerActions(marker).length || markerExtraEntities(marker).length ? 'callout' : 'card';
}

/** matt.3 §16: the in-place control a callout row gets for its entity. */
export type RowControl =
  | { kind: 'toggle'; on: boolean; available: boolean }
  | { kind: 'select'; options: string[]; current: string; available: boolean }
  | { kind: 'number'; value: number; min: number; max: number; step: number; available: boolean; unit: string }
  | null;

const finiteOr = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function rowControl(entityId: string, row: any): RowControl {
  const domain = entityId.split('.')[0];
  const available = !!row && row.state !== 'unavailable' && row.state !== 'unknown';
  if (rowToggleable(entityId)) return { kind: 'toggle', on: row?.state === 'on', available };
  if (domain === 'select' || domain === 'input_select') {
    const options = Array.isArray(row?.attributes?.options)
      ? row.attributes.options.map((o: unknown) => String(o)) : [];
    return { kind: 'select', options, current: String(row?.state ?? ''), available: available && options.length > 0 };
  }
  if (domain === 'number' || domain === 'input_number') {
    const a = row?.attributes || {};
    const min = finiteOr(a.min, 0);
    const max = Math.max(min, finiteOr(a.max, 100));
    const step = finiteOr(a.step, 1) > 0 ? finiteOr(a.step, 1) : 1;
    const value = Number(row?.state);
    return {
      kind: 'number', min, max, step, unit: String(a.unit_of_measurement || ''),
      value: Number.isFinite(value) ? value : min,
      available: available && Number.isFinite(value),
    };
  }
  return null; // update.*, sensors, … : state only
}

/** Next stepper value: one `step` up/down from `value`, snapped to the step grid and clamped. */
export function stepNumber(value: number, dir: 1 | -1, min: number, max: number, step: number): number {
  const s = step > 0 ? step : 1;
  const k = Math.round((value - min) / s);
  const onGrid = Math.abs(min + k * s - value) < s * 1e-6;
  const base = onGrid ? k + dir : (dir > 0 ? Math.ceil((value - min) / s) : Math.floor((value - min) / s));
  const next = min + base * s;
  const decimals = Math.min(6, Math.max(0, (String(s).split('.')[1] || '').length));
  return Math.min(max, Math.max(min, Number(next.toFixed(decimals))));
}

/** Service call that sets a select/number row. */
export function rowSetService(entityId: string, value: string | number): { domain: string; service: string; data: Record<string, unknown> } | null {
  const domain = entityId.split('.')[0];
  if (domain === 'select' || domain === 'input_select') {
    return { domain, service: 'select_option', data: { entity_id: entityId, option: String(value) } };
  }
  if (domain === 'number' || domain === 'input_number') {
    return { domain, service: 'set_value', data: { entity_id: entityId, value: Number(value) } };
  }
  return null;
}
export function forkMarkerCarry(previous: Marker | null | undefined): Partial<Marker> {
  const out: Record<string, unknown> = {};
  if (!previous) return out;
  for (const key of FORK_MARKER_CARRY) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) out[key] = (previous as any)[key];
  }
  return out as Partial<Marker>;
}
