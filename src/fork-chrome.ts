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
): TemplateResult | typeof nothing {
  if (glyphs.length < 2) return nothing;
  return html`<nav class="fork-levels" data-hp="fork-levels" data-scene-surface
    aria-label="Levels">
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
): TemplateResult | typeof nothing {
  if (!items.length) return nothing;
  return html`<div class="fork-dock ${corner}" data-hp="fork-dock" data-scene-surface role="toolbar"
    aria-label="Scenes">
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
