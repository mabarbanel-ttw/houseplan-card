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
  const out: string[] = [];
  for (const raw of Array.isArray(marker?.extra_entities) ? marker!.extra_entities! : []) {
    const id = String(raw || '').trim();
    if (ENTITY.test(id) && !out.includes(id) && out.length < MAX_EXTRA_ENTITIES) out.push(id);
  }
  return out;
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
] as const;
export function forkMarkerCarry(previous: Marker | null | undefined): Partial<Marker> {
  const out: Record<string, unknown> = {};
  if (!previous) return out;
  for (const key of FORK_MARKER_CARRY) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) out[key] = (previous as any)[key];
  }
  return out as Partial<Marker>;
}
