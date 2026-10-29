/**
 * Fork (matt/single-pane): on-map chrome — level indicator (FORK.md §2),
 * the step-out control of nested fly-in (§3) and the scene dock (§5).
 *
 * Card options are Lovelace YAML (the dashboard card's own config); every
 * reader normalizes them here, so a typo degrades to the upstream default
 * instead of breaking the card. No text is ever painted: names travel only as
 * aria-label / hover title (UI copy rule).
 */
import { html, nothing, svg, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { stepNumber, type RowControl } from './fork-marker';

export type LevelNavMode = 'tabs' | 'indicator';
export type LevelNavOrder = 'tabs' | 'reverse';
export type SceneDockCorner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface SceneDockItem {
  entity: string;
  icon: string;
  name: string;
}

export interface ForkCardOptions {
  levelNav: LevelNavMode;
  levelNavOrder: LevelNavOrder;
  sceneDock: SceneDockItem[];
  sceneDockCorner: SceneDockCorner;
  /** matt.3 §15: turn the camera ±90° so a focused room fills the screen. */
  rotateToFit: 'auto' | 'off' | 'cw' | 'ccw';
}

export const MAX_SCENE_DOCK_ITEMS = 12;
const SCENE_DOMAINS = ['script', 'scene'] as const;
const ENTITY_RE = /^(script|scene)\.[A-Za-z0-9_]+$/;
const ICON_RE = /^[a-z0-9-]+:[a-z0-9-]+$/;
const CORNERS: readonly SceneDockCorner[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];

/** The run service of a dock target, or null when it is not runnable. */
export function sceneDockService(entity: string): { domain: string; service: string } | null {
  const domain = String(entity || '').split('.')[0];
  return (SCENE_DOMAINS as readonly string[]).includes(domain) && ENTITY_RE.test(entity)
    ? { domain, service: 'turn_on' } : null;
}

function normalizeDock(value: unknown): SceneDockItem[] {
  if (!Array.isArray(value)) return [];
  const out: SceneDockItem[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (out.length >= MAX_SCENE_DOCK_ITEMS) break;
    const item = typeof raw === 'string' ? { entity: raw } : raw;
    if (!item || typeof item !== 'object') continue;
    const entity = String((item as { entity?: unknown }).entity || '').trim();
    if (!ENTITY_RE.test(entity) || seen.has(entity)) continue;
    seen.add(entity);
    const icon = String((item as { icon?: unknown }).icon || '').trim();
    const name = String((item as { name?: unknown }).name || '').trim().slice(0, 32);
    out.push({
      entity,
      icon: ICON_RE.test(icon) ? icon : entity.startsWith('scene.') ? 'mdi:palette' : 'mdi:play',
      name,
    });
  }
  return out;
}

export function forkCardOptions(config: Record<string, unknown> | null | undefined): ForkCardOptions {
  const c = config || {};
  const corner = String(c.scene_dock_corner || '');
  return {
    levelNav: c.level_nav === 'indicator' ? 'indicator' : 'tabs',
    levelNavOrder: c.level_nav_order === 'reverse' ? 'reverse' : 'tabs',
    sceneDock: normalizeDock(c.scene_dock),
    sceneDockCorner: (CORNERS as readonly string[]).includes(corner)
      ? corner as SceneDockCorner : 'bottom-left',
    rotateToFit: c.rotate_to_fit === false || c.rotate_to_fit === 'off' ? 'off'
      : c.rotate_to_fit === 'ccw' ? 'ccw' : c.rotate_to_fit === 'cw' ? 'cw' : 'auto',
  };
}

export interface LevelGlyph {
  id: string;
  title: string;
  current: boolean;
}

/** Glyphs top-to-bottom: tab order (first tab on top) or its reverse. */
export function levelGlyphs(
  spaces: readonly { id: string; title?: string }[],
  current: string,
  order: LevelNavOrder,
): LevelGlyph[] {
  const list = spaces.map((space) => ({
    id: space.id, title: space.title || space.id, current: space.id === current,
  }));
  return order === 'reverse' ? list.reverse() : list;
}

/** One floor slab in a stylised section: a thin parallelogram. */
const slab = svg`<path d="M5 3 H27 L23 11 H1 Z"></path>`;

export function renderLevelIndicator(
  glyphs: readonly LevelGlyph[],
  onPick: (id: string) => void,
  label = 'Levels',
  style = '',
): TemplateResult | typeof nothing {
  if (glyphs.length < 2) return nothing;
  return html`<nav class="fork-levels" data-hp="fork-levels" data-scene-surface
    aria-label=${label} style=${style || nothing}>
    ${repeat(glyphs, (glyph) => glyph.id, (glyph) => html`<button type="button"
        class="fork-level ${glyph.current ? 'current' : ''}" data-hp="fork-level" data-id=${glyph.id}
        aria-label=${glyph.title} title=${glyph.title}
        aria-current=${glyph.current ? 'page' : nothing}
        @click=${(event: Event) => { event.stopPropagation(); onPick(glyph.id); }}>
        <svg viewBox="0 0 28 14" aria-hidden="true">${slab}</svg>
      </button>`)}
  </nav>`;
}

export function renderStepOut(
  visible: boolean,
  depth: number,
  label: string,
  onStepOut: () => void,
): TemplateResult | typeof nothing {
  if (!visible) return nothing;
  return html`<button type="button" class="fork-stepout" data-hp="fork-stepout" data-scene-surface
    data-depth=${depth} aria-label=${label} title=${label}
    @click=${(event: Event) => { event.stopPropagation(); onStepOut(); }}>
    <ha-icon icon="mdi:arrow-left"></ha-icon>
    <span class="fork-depth" aria-hidden="true">${Array.from({ length: Math.min(depth, 4) },
      () => html`<i></i>`)}</span>
  </button>`;
}

export function renderSceneDock(
  items: readonly SceneDockItem[],
  corner: SceneDockCorner,
  activeEntity: (entity: string) => boolean,
  available: (entity: string) => boolean,
  onRun: (item: SceneDockItem) => void,
  pressed: string | null,
  label = 'Scenes',
): TemplateResult | typeof nothing {
  if (!items.length) return nothing;
  return html`<div class="fork-dock ${corner}" data-hp="fork-dock" data-scene-surface role="toolbar"
    aria-label=${label}>
    ${repeat(items, (item) => item.entity, (item) => {
      const ok = available(item.entity);
      return html`<button type="button"
        class="fork-dock-btn ${activeEntity(item.entity) ? 'on' : ''} ${ok ? '' : 'missing'} ${pressed === item.entity ? 'pressed' : ''}"
        data-hp="fork-dock-item" data-entity=${item.entity}
        aria-label=${item.name || item.entity} title=${item.name || item.entity}
        ?disabled=${!ok}
        @click=${(event: Event) => { event.stopPropagation(); if (ok) onRun(item); }}>
        <ha-icon icon=${item.icon}></ha-icon>
      </button>`;
    })}
  </div>`;
}

// ---------------------------------------------------------------- §4 callout

export interface CalloutModel {
  id: string;
  name: string;
  icon: string;
  /** Formatted primary-entity state (empty when the marker has none). */
  state: string;
  /** Primary state is "on"-like (drives the accent). */
  on: boolean;
  /** Value-badge source value, e.g. link speed (empty when none). */
  value: string;
  valueLabel: string;
  /** Toggle target (switch/light primary), or null. */
  toggle: { entity: string; on: boolean; available: boolean } | null;
  /** HA more-info target, or null. */
  more: string | null;
  /** Anchor in % of the stage (camera-layer coordinates). */
  left: number;
  top: number;
  /** Horizontal shift (px) keeping the card on screen; the beak shifts back. */
  shift: number;
  /** matt.2 §11: the state source is inactive (e.g. a port with no link). */
  inactive?: boolean;
  /** matt.2 §12: script/scene buttons. */
  actions?: Array<{ entity: string; icon: string; name: string }>;
  /** matt.2 §12: extra entity rows. */
  rows?: Array<{
    entity: string; name: string; state: string;
    toggle: { on: boolean; available: boolean } | null;
    /** matt.3 §16: select → option picker, number → −/+ stepper. */
    control?: RowControl;
  }>;
  /** Open below the marker (near the top edge) instead of above. */
  below: boolean;
  /** Room on that side (px); the card scrolls inside it. */
  maxHeight?: number;
  /** matt.3 §15: the camera frame is turned; the card is counter-turned
   *  about its anchor so it reads upright. */
  unrot?: number;
}

export const CALLOUT_TOGGLE_DOMAINS = ['switch', 'light'] as const;

export function calloutToggleEntity(primary: string | null | undefined): string | null {
  const domain = String(primary || '').split('.')[0];
  return (CALLOUT_TOGGLE_DOMAINS as readonly string[]).includes(domain) ? String(primary) : null;
}

export function renderCallout(
  model: CalloutModel,
  labels: { toggle: string; more: string; close: string },
  actions: {
    toggle: (entity: string) => void; more: (entity: string) => void; close: () => void;
    run?: (entity: string) => void;
    /** matt.3 §16: set a select option / number value. */
    set?: (entity: string, value: string | number) => void;
  },
): TemplateResult {
  const turned = !!model.unrot;
  const card = html`<div class="fork-callout ${model.below ? 'below' : 'above'} ${model.on ? 'on' : ''} ${model.inactive ? 'inactive' : ''} ${turned ? 'turned' : ''}"
    data-hp="fork-callout" data-id=${model.id} data-scene-surface role="dialog" aria-label=${model.name}
    style="${turned ? `left:${model.shift}px;top:0` : `left:calc(${model.left}% + ${model.shift}px);top:${model.top}%`};--fork-beak:${-model.shift}px;${model.maxHeight ? `max-height:${model.maxHeight}px` : ''}"
    @pointerdown=${(event: Event) => event.stopPropagation()}
    @click=${(event: Event) => event.stopPropagation()}>
    <div class="fork-callout-head">
      <ha-icon class="fork-callout-icon" icon=${model.icon}></ha-icon>
      <span class="fork-callout-name">${model.name}</span>
    </div>
    ${model.inactive ? html`<div class="fork-callout-vals"><span class="fork-callout-down" data-hp="fork-callout-down"
      role="img" aria-label="down"><ha-icon icon="mdi:lan-disconnect"></ha-icon></span></div>` : nothing}
    ${!model.inactive && (model.state || model.value) ? html`<div class="fork-callout-vals">
      ${model.state ? html`<span class="fork-callout-state" data-hp="fork-callout-state">${model.state}</span>` : nothing}
      ${model.value ? html`<span class="fork-callout-value" data-hp="fork-callout-value"
        title=${model.valueLabel}>${model.value}</span>` : nothing}
    </div>` : nothing}
    ${model.toggle || model.more ? html`<div class="fork-callout-actions">
      ${model.toggle ? html`<button type="button" role="switch" class="fork-callout-toggle ${model.toggle.on ? 'on' : ''}"
          data-hp="fork-callout-toggle" aria-checked=${model.toggle.on ? 'true' : 'false'}
          aria-label=${labels.toggle} title=${labels.toggle} ?disabled=${!model.toggle.available}
          @click=${() => actions.toggle(model.toggle!.entity)}><i></i></button>` : nothing}
      <span class="fork-callout-spacer"></span>
      ${model.more ? html`<button type="button" class="fork-callout-more" data-hp="fork-callout-more"
          aria-label=${labels.more} title=${labels.more}
          @click=${() => actions.more(model.more!)}><ha-icon icon="mdi:dots-horizontal"></ha-icon></button>` : nothing}
    </div>` : nothing}
    ${model.rows?.length ? html`<div class="fork-callout-rows">${model.rows.map((row) => html`<div
        class="fork-callout-row ${row.control && row.control.kind !== 'toggle' ? `has-${row.control.kind}` : ''}" data-hp="fork-callout-row" data-entity=${row.entity}>
        <span class="fork-callout-row-name">${row.name}</span>
        ${row.control?.kind === 'select' ? nothing : html`<span class="fork-callout-row-state">${row.state}</span>`}
        ${row.toggle ? html`<button type="button" role="switch" class="fork-callout-toggle small ${row.toggle.on ? 'on' : ''}"
          data-hp="fork-callout-row-toggle" aria-checked=${row.toggle.on ? 'true' : 'false'} aria-label=${row.name}
          ?disabled=${!row.toggle.available} @click=${() => actions.toggle(row.entity)}><i></i></button>` : nothing}
        ${renderRowControl(row.entity, row.name, row.control ?? null, actions.set)}
      </div>`)}</div>` : nothing}
    ${model.actions?.length ? html`<div class="fork-callout-run" role="toolbar">${model.actions.map((item) => html`<button
        type="button" class="fork-callout-run-btn" data-hp="fork-callout-action" data-entity=${item.entity}
        aria-label=${item.name || item.entity} title=${item.name || item.entity}
        @click=${() => actions.run?.(item.entity)}><ha-icon icon=${item.icon}></ha-icon></button>`)}</div>` : nothing}
  </div>`;
  // Turned camera: a zero-size anchor at the marker, counter-rotated, holds
  // the card in screen orientation (its own offsets stay in screen px).
  return turned
    ? html`<div class="fork-callout-anchor" style="left:${model.left}%;top:${model.top}%;rotate:${model.unrot}deg">${card}</div>`
    : card;
}

/** matt.3 §16: select → option picker, number → −/+ stepper; else nothing. */
function renderRowControl(
  entity: string, name: string, control: RowControl,
  set: ((entity: string, value: string | number) => void) | undefined,
): TemplateResult | typeof nothing {
  if (!control || control.kind === 'toggle' || !set) return nothing;
  if (control.kind === 'select') {
    return html`<select class="fork-callout-select" data-hp="fork-callout-select" aria-label=${name}
      ?disabled=${!control.available}
      @change=${(event: Event) => set(entity, (event.target as HTMLSelectElement).value)}>
      ${control.options.includes(control.current) ? nothing : html`<option value="" selected disabled>—</option>`}
      ${control.options.map((option) => html`<option value=${option} ?selected=${option === control.current}>${option}</option>`)}
    </select>`;
  }
  const down = stepNumber(control.value, -1, control.min, control.max, control.step);
  const up = stepNumber(control.value, 1, control.min, control.max, control.step);
  return html`<span class="fork-callout-stepper" data-hp="fork-callout-stepper" role="group" aria-label=${name}>
    <button type="button" class="fork-callout-step" data-hp="fork-callout-step-down" aria-label="−"
      ?disabled=${!control.available || down === control.value}
      @click=${() => set(entity, down)}><ha-icon icon="mdi:minus"></ha-icon></button>
    <button type="button" class="fork-callout-step" data-hp="fork-callout-step-up" aria-label="+"
      ?disabled=${!control.available || up === control.value}
      @click=${() => set(entity, up)}><ha-icon icon="mdi:plus"></ha-icon></button>
  </span>`;
}

// ---------------------------------------------------------------- matt.2 room sheet

export interface SheetRow {
  id: string;
  name: string;
  icon: string;
  state: string;
  on: boolean;
  ghost: boolean;
}

/**
 * The focused room's devices as a list inside the map view (never a page):
 * icon, name, state; a tap runs the marker's own tap action and highlights it
 * on the map. Shown on narrow stages when the room is too dense for labelled
 * 44 px targets (FORK.md §14).
 */
export function renderRoomSheet(
  rows: readonly SheetRow[], height: number, bottom: number, label: string,
  onRow: (id: string) => void, onHover: (id: string | null) => void, highlighted: string | null,
): TemplateResult | typeof nothing {
  if (!rows.length || height <= 0) return nothing;
  return html`<section class="fork-sheet" data-hp="fork-sheet" data-scene-surface aria-label=${label}
    style="height:${height}px;bottom:${bottom}px">
    <div class="fork-sheet-grip" aria-hidden="true"></div>
    <div class="fork-sheet-list" role="list">
      ${repeat(rows, (row) => row.id, (row) => html`<button type="button" role="listitem"
        class="fork-sheet-row ${row.on ? 'on' : ''} ${row.ghost ? 'ghost' : ''} ${highlighted === row.id ? 'hl' : ''}"
        data-hp="fork-sheet-row" data-id=${row.id}
        @pointerenter=${() => onHover(row.id)} @pointerleave=${() => onHover(null)}
        @click=${(event: Event) => { event.stopPropagation(); onRow(row.id); }}>
        <ha-icon icon=${row.icon}></ha-icon>
        <span class="fork-sheet-name">${row.name}</span>
        <span class="fork-sheet-state">${row.state}</span>
      </button>`)}
    </div>
  </section>`;
}
