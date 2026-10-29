/**
 * Fork (matt/single-pane): nested fly-in targets and stair landing.
 *
 * Pure, DOM-free helpers shared by the card and the unit tests. See FORK.md
 * §3 (focus regions) and §1 (stairs fly-landing).
 *
 * Coordinates: a focus region is stored in the space's normalized plan
 * coordinates (both axes divided by NORM_W, exactly like `room.poly`,
 * `partitions[].a/b` and stairs). `x/y` is the top-left corner, `w/h` the
 * positive size. Render units are the normalized values multiplied by NORM_W.
 */
import { clientToScenePoint, unprojectFloorPoint } from './iso-projection';

export interface FocusRegion {
  id: string;
  name?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Parent focus region (a region nested inside another region). */
  parent_id?: string | null;
  /** Owning room: the region is reachable once that room is the focus. */
  room_id?: string | null;
}

/** Where the camera currently "is" in the fly-in hierarchy. */
export type FocusNode =
  | { kind: 'room'; id: string }
  | { kind: 'region'; id: string }
  | null;

export const MAX_FOCUS_REGIONS = 200;
export const FOCUS_REGION_ID_MAX = 64;
export const FOCUS_REGION_NAME_MAX = 64;
/** The same garbage-insurance bound the backend uses (docs/CANVAS.md §3). */
export const FOCUS_REGION_LIMIT = 5000;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const optionalId = (value: unknown): boolean =>
  value === undefined || value === null
  || (typeof value === 'string' && value.length >= 1 && value.length <= FOCUS_REGION_ID_MAX);

/** Structural record check mirrored by `FOCUS_REGION_SCHEMA` in validation.py. */
export function isFocusRegion(value: unknown): value is FocusRegion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && v.id.length >= 1 && v.id.length <= FOCUS_REGION_ID_MAX
    && finite(v.x) && Math.abs(v.x) <= FOCUS_REGION_LIMIT
    && finite(v.y) && Math.abs(v.y) <= FOCUS_REGION_LIMIT
    && finite(v.w) && v.w > 0 && v.w <= FOCUS_REGION_LIMIT
    && finite(v.h) && v.h > 0 && v.h <= FOCUS_REGION_LIMIT
    && (v.name === undefined || v.name === null
      || (typeof v.name === 'string' && v.name.length <= FOCUS_REGION_NAME_MAX))
    && optionalId(v.parent_id) && optionalId(v.room_id);
}

/**
 * Read boundary: keep valid records only (first id wins), bounded. A parent
 * that is missing or that would create a cycle is dropped from the *view* of
 * the record (the stored data is never rewritten here), so a damaged chain
 * degrades to a room-level or level-level region instead of disappearing.
 */
export function focusRegionList(value: unknown): FocusRegion[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const valid: FocusRegion[] = [];
  for (const item of value) {
    if (valid.length >= MAX_FOCUS_REGIONS) break;
    if (!isFocusRegion(item) || seen.has(item.id)) continue;
    seen.add(item.id);
    valid.push(item);
  }
  const byId = new Map(valid.map((region) => [region.id, region]));
  return valid.map((region) => {
    const parent = region.parent_id;
    if (!parent) return region;
    if (!byId.has(parent) || parent === region.id) return { ...region, parent_id: null };
    // Walk the chain; a cycle detaches this record from its parent.
    const visited = new Set<string>([region.id]);
    let cursor: string | null | undefined = parent;
    while (cursor) {
      if (visited.has(cursor)) return { ...region, parent_id: null };
      visited.add(cursor);
      cursor = byId.get(cursor)?.parent_id;
    }
    return region;
  });
}

export function sameFocusNode(a: FocusNode, b: FocusNode): boolean {
  return a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);
}

/** Room that ultimately owns a region (walking up its parents). */
export function regionRoomId(region: FocusRegion, regions: readonly FocusRegion[]): string | null {
  const byId = new Map(regions.map((item) => [item.id, item]));
  let cursor: FocusRegion | undefined = region;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (cursor.parent_id) cursor = byId.get(cursor.parent_id);
    else return cursor.room_id || null;
  }
  return null;
}

/** One step out: region → parent region → owning room → whole level (null). */
export function focusParent(node: FocusNode, regions: readonly FocusRegion[]): FocusNode {
  if (!node || node.kind === 'room') return null;
  const region = regions.find((item) => item.id === node.id);
  if (!region) return null;
  if (region.parent_id && regions.some((item) => item.id === region.parent_id)) {
    return { kind: 'region', id: region.parent_id };
  }
  return region.room_id ? { kind: 'room', id: region.room_id } : null;
}

/** Direct children of a focus node. `null` = the whole level. */
export function focusChildren(node: FocusNode, regions: readonly FocusRegion[]): FocusRegion[] {
  return regions.filter((region) => {
    if (!node) return !region.parent_id && !region.room_id;
    if (node.kind === 'room') return !region.parent_id && region.room_id === node.id;
    return region.parent_id === node.id;
  });
}

export function regionContains(region: FocusRegion, point: readonly [number, number]): boolean {
  return point[0] >= region.x && point[0] <= region.x + region.w
    && point[1] >= region.y && point[1] <= region.y + region.h;
}

const area = (region: FocusRegion): number => region.w * region.h;

/**
 * Which region a clean tap at `point` (normalized) flies to, given the
 * current focus. The children of the current node win first; then the
 * children of each ancestor (siblings, then the parent's siblings, …) up to
 * the level, so tapping the surroundings of a zoomed region steps out to the
 * region that contains the tap. Among overlapping candidates of the same
 * level the smallest wins. `null` means "no region": the caller keeps the
 * ordinary room/background behaviour.
 */
export function resolveFocusTap(
  point: readonly [number, number],
  node: FocusNode,
  regions: readonly FocusRegion[],
): FocusRegion | null {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !regions.length) return null;
  const visited = new Set<string>();
  let cursor: FocusNode = node;
  for (;;) {
    const key = cursor ? `${cursor.kind}:${cursor.id}` : 'level';
    if (visited.has(key)) return null;
    visited.add(key);
    const hits = focusChildren(cursor, regions).filter((region) => regionContains(region, point));
    if (hits.length) return hits.reduce((best, region) => (area(region) < area(best) ? region : best));
    if (!cursor) return null;
    cursor = focusParent(cursor, regions);
  }
}

/** The current node and every ancestor: the regions/room you are "inside". */
export function focusPath(node: FocusNode, regions: readonly FocusRegion[]): Set<string> {
  const path = new Set<string>();
  let cursor = node;
  while (cursor && !path.has(`${cursor.kind}:${cursor.id}`)) {
    path.add(`${cursor.kind}:${cursor.id}`);
    cursor = focusParent(cursor, regions);
  }
  return path;
}

/**
 * True when `point` lies inside a region you have not flown into yet (a region
 * that is neither the current node nor one of its ancestors). Markers there
 * are detail of a deeper level: they stay painted but do not take the tap, so
 * the tap reaches the region and flies in. Once you are inside the region
 * they are ordinary tappable markers again.
 */
export function nestedAway(
  point: readonly [number, number],
  path: ReadonlySet<string>,
  regions: readonly FocusRegion[],
): boolean {
  return regions.some((region) => !path.has(`region:${region.id}`) && regionContains(region, point));
}

/** Render-unit rectangle of a region. */
export function focusRegionBounds(
  region: FocusRegion, normW: number,
): { x: number; y: number; w: number; h: number } {
  return { x: region.x * normW, y: region.y * normW, w: region.w * normW, h: region.h * normW };
}

let regionSequence = 0;
/** Stable-enough id for a new region (collision-checked by the caller). */
export function newFocusRegionId(existing: readonly { id: string }[], now = Date.now()): string {
  const used = new Set(existing.map((item) => item.id));
  for (;;) {
    regionSequence += 1;
    const id = `focus-${now.toString(36)}-${regionSequence.toString(36)}`;
    if (!used.has(id)) return id;
  }
}

/**
 * A new region from the camera rectangle the user framed (render units):
 * the middle 80% of the view, matching the 80% safe frame a fly-in uses,
 * so flying back to it reproduces what the user saw.
 */
export function focusRegionFromView(
  view: { x: number; y: number; w: number; h: number },
  normW: number,
  parent: FocusNode,
  id: string,
): FocusRegion | null {
  if (![view.x, view.y, view.w, view.h, normW].every(Number.isFinite)
      || view.w <= 0 || view.h <= 0 || normW <= 0) return null;
  const inset = 0.1;
  const round = (value: number) => Number(value.toFixed(6));
  const region: FocusRegion = {
    id,
    x: round((view.x + view.w * inset) / normW),
    y: round((view.y + view.h * inset) / normW),
    w: round((view.w * (1 - 2 * inset)) / normW),
    h: round((view.h * (1 - 2 * inset)) / normW),
  };
  if (parent?.kind === 'region') region.parent_id = parent.id;
  else if (parent?.kind === 'room') region.room_id = parent.id;
  return isFocusRegion(region) ? region : null;
}

// ---------------------------------------------------------------- stairs

export interface StairLike {
  id: string;
  x: number;
  y: number;
  target_space_id?: string | null;
}

/**
 * The stair on the target space that leads back to the source space. With
 * several, the one nearest to the source stair's normalized position wins
 * (ties keep stored order). `null` when no stair links back: the caller fits
 * the whole target level instead.
 */
export function stairLanding<T extends StairLike>(
  targetStairs: readonly T[],
  sourceSpaceId: string,
  sourcePosition?: { x: number; y: number } | null,
): T | null {
  const back = targetStairs.filter((stair) => stair.target_space_id === sourceSpaceId
    && Number.isFinite(stair.x) && Number.isFinite(stair.y));
  if (!back.length) return null;
  if (!sourcePosition || !Number.isFinite(sourcePosition.x) || !Number.isFinite(sourcePosition.y)) {
    return back[0];
  }
  let best = back[0];
  let bestDistance = Infinity;
  for (const stair of back) {
    const distance = Math.hypot(stair.x - sourcePosition.x, stair.y - sourcePosition.y);
    if (distance < bestDistance) {
      best = stair;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Grow a small rectangle so that it occupies at most `fraction` of the base
 * frame's longer side once fitted — a stair fitted edge-to-edge would zoom in
 * so far that the landing loses all context.
 */
export function inflateToContext(
  bounds: { x: number; y: number; w: number; h: number },
  minSide: number,
): { x: number; y: number; w: number; h: number } {
  if (!(minSide > 0)) return { ...bounds };
  const w = Math.max(bounds.w, minSide);
  const h = Math.max(bounds.h, minSide);
  return {
    x: bounds.x + bounds.w / 2 - w / 2,
    y: bounds.y + bounds.h / 2 - h / 2,
    w,
    h,
  };
}

// ---------------------------------------------------------------- chrome insets

export interface StageInsets { left: number; right: number; top: number; bottom: number }
export const NO_INSETS: StageInsets = Object.freeze({ left: 0, right: 0, top: 0, bottom: 0 });

export interface InsetCameraInput {
  bounds: { x: number; y: number; w: number; h: number };
  /** The whole-stage fit rectangle that defines zoom 1 (render units). */
  baseFit: { x: number; y: number; w: number; h: number };
  stageWidth: number;
  stageHeight: number;
  insets: StageInsets;
  minZoom: number;
  maxZoom: number;
  safeFraction: number;
  /** Force this zoom (still clamped) and only centre `bounds` in the free area. */
  zoom?: number;
}

/**
 * Fit `bounds` into the part of the stage not covered by on-map chrome
 * (level indicator, scene dock), then express the camera for the WHOLE stage
 * in the card's zoom model (`viewBox.w = baseFit.w / zoom`, same aspect as the
 * stage). With zero insets this equals `roomFitCameraTarget`.
 */
export function insetCameraTarget(input: InsetCameraInput): { zoom: number; viewBox: { x: number; y: number; w: number; h: number } } | null {
  const { bounds, baseFit, stageWidth: W, stageHeight: H, insets, minZoom, maxZoom, safeFraction } = input;
  if (![bounds.x, bounds.y, bounds.w, bounds.h, baseFit.w, baseFit.h, W, H].every(Number.isFinite)
      || bounds.w <= 0 || bounds.h <= 0 || baseFit.w <= 0 || W <= 0 || H <= 0
      || !(safeFraction > 0) || safeFraction > 1 || !(minZoom > 0) || maxZoom < minZoom) return null;
  const l = Math.max(0, insets.left), r = Math.max(0, insets.right);
  const t = Math.max(0, insets.top), b = Math.max(0, insets.bottom);
  // Never let chrome eat more than half of an axis.
  const scaleX = l + r > W * 0.5 ? (W * 0.5) / (l + r) : 1;
  const scaleY = t + b > H * 0.5 ? (H * 0.5) / (t + b) : 1;
  const left = l * scaleX, top = t * scaleY;
  const innerW = W - (l + r) * scaleX;
  const innerH = H - (t + b) * scaleY;
  // Screen pixels per render unit so that bounds fill `safeFraction` of the inner rect.
  const ppuWanted = Math.min((innerW * safeFraction) / bounds.w, (innerH * safeFraction) / bounds.h);
  const zoomWanted = input.zoom !== undefined && Number.isFinite(input.zoom) && input.zoom > 0
    ? input.zoom : (ppuWanted * baseFit.w) / W;
  const zoom = Math.min(maxZoom, Math.max(minZoom, zoomWanted));
  const w = baseFit.w / zoom;
  const h = w * (H / W);
  const ppu = W / w;
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  return {
    zoom,
    viewBox: {
      x: cx - (left + innerW / 2) / ppu,
      y: cy - (top + innerH / 2) / ppu,
      w,
      h,
    },
  };
}

// ---------------------------------------------------------------- §7 progressive disclosure

/** Explicit reveal rule of a marker or decor item (`reveal` field). */
export type RevealRule =
  | { kind: 'room' }
  | { kind: 'region'; id: string }
  | { kind: 'zoom'; min: number };

/** Read boundary for `reveal`: "room" | "region:<id>" | {"min_zoom": n}. */
export function parseReveal(value: unknown): RevealRule | null {
  if (value === 'room') return { kind: 'room' };
  if (typeof value === 'string' && value.startsWith('region:') && value.length > 7 && value.length <= 71) {
    return { kind: 'region', id: value.slice(7) };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const min = (value as { min_zoom?: unknown }).min_zoom;
    if (typeof min === 'number' && Number.isFinite(min) && min > 0 && min <= 64) return { kind: 'zoom', min };
  }
  return null;
}

/** A region counts as "zoomed into" by hand once it spans this much of the
 *  view (high on purpose: a region one tap away must be entered by the tap,
 *  not revealed early, or its markers would cover it). */
export const REVEAL_SCREEN_FRACTION = 0.85;
/** A room counts as "zoomed into" once it spans this much of the view. */
export const REVEAL_ROOM_FRACTION = 0.7;

export interface RevealContext {
  regions: readonly FocusRegion[];
  path: ReadonlySet<string>;
  /** Current camera rectangle in render units and zoom. */
  view: { w: number; h: number };
  zoom: number;
  normW: number;
  /** Screen fraction (0..1, larger axis) a room occupies, or 0 when unknown. */
  roomFraction(roomId: string): number;
}

const regionFraction = (region: FocusRegion, ctx: RevealContext): number =>
  Math.max((region.w * ctx.normW) / ctx.view.w, (region.h * ctx.normW) / ctx.view.h);

const innermostOffPath = (
  point: readonly [number, number], ctx: RevealContext,
): FocusRegion | null => {
  let best: FocusRegion | null = null;
  for (const region of ctx.regions) {
    if (ctx.path.has(`region:${region.id}`) || !regionContains(region, point)) continue;
    if (!best || region.w * region.h < best.w * best.h) best = region;
  }
  return best;
};

/** The region's parent (room, region, or the level) is where the camera is. */
const oneTapAway = (region: FocusRegion, ctx: RevealContext): boolean => {
  const parent = focusParent({ kind: 'region', id: region.id }, ctx.regions);
  return !parent ? ctx.path.size === 0 : ctx.path.has(`${parent.kind}:${parent.id}`);
};

/**
 * Is a marker / decor item visible at the current fly-in position and zoom?
 *
 * - explicit `room`: inside its room (room on the path) or the room fills
 *   ≥ 70 % of the view;
 * - explicit `region:<id>`: that region on the path, or it fills ≥ 85 %;
 * - explicit `{min_zoom}`: camera zoom ≥ min;
 * - otherwise a MARKER inside a region you have not entered is hidden until
 *   you enter it (or zoom until it fills ≥ 85 %), and a DECOR item inside a
 *   region shows one level earlier — once the region's parent (its room or
 *   parent region) is on the path — so you see the rack drawing in the room
 *   and its ports inside the rack.
 */
export function revealShown(
  point: readonly [number, number],
  rule: RevealRule | null,
  roomId: string | null,
  kind: 'marker' | 'decor',
  ctx: RevealContext,
): boolean {
  if (rule?.kind === 'zoom') return ctx.zoom >= rule.min;
  if (rule?.kind === 'room') {
    if (!roomId) return true;
    return ctx.path.has(`room:${roomId}`) || ctx.roomFraction(roomId) >= REVEAL_ROOM_FRACTION;
  }
  if (rule?.kind === 'region') {
    const region = ctx.regions.find((item) => item.id === rule.id);
    if (!region) return true;
    if (ctx.path.has(`region:${region.id}`)) return true;
    // matt.3: same guard as automatic markers — a region one tap away is
    // entered by the tap, never revealed early by zoom. On a 390 px phone the
    // rack's 44 px-target zoom made the UDM faceplate fill ≥ 85 % of the view,
    // its ports appeared on top of it and swallowed the tap meant to enter it.
    if (oneTapAway(region, ctx)) return false;
    return regionFraction(region, ctx) >= REVEAL_SCREEN_FRACTION;
  }
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return true;
  if (kind === 'marker') {
    // Every enclosing region must be entered (or zoomed into).
    for (const region of ctx.regions) {
      if (ctx.path.has(`region:${region.id}`) || !regionContains(region, point)) continue;
      // matt.2: a region one tap away (its parent is where you are) is entered
      // by the tap, never revealed early by zoom — its markers would cover it.
      if (oneTapAway(region, ctx) || regionFraction(region, ctx) < REVEAL_SCREEN_FRACTION) return false;
    }
    return true;
  }
  const region = innermostOffPath(point, ctx);
  if (!region) return true;
  const parent = focusParent({ kind: 'region', id: region.id }, ctx.regions);
  if (!parent || ctx.path.has(`${parent.kind}:${parent.id}`)) return true;
  return regionFraction(region, ctx) >= 0.4;
}

/** Client point → normalized plan point; 2.5D taps land on the floor plane. */
export function clientToPlanNorm(
  client: readonly [number, number],
  rect: { left: number; top: number; width: number; height: number },
  view: { x: number; y: number; w: number; h: number },
  iso: boolean,
  normW: number,
): [number, number] | null {
  try {
    const scene = clientToScenePoint([client[0], client[1]], rect, view);
    const plan = iso ? unprojectFloorPoint(scene) : scene;
    return [plan[0] / normW, plan[1] / normW];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- matt.2: region depth

export interface RegionZoomInput {
  bounds: { w: number; h: number };
  baseFitW: number;
  stageWidth: number;
  stageHeight: number;
  insets: StageInsets;
  safeFraction: number;
  /** matt.3: false = never fit a wide region by its height (turned frame). */
  cover?: boolean;
  /** Zoom of the parent position (room or parent region), 0 when none. */
  parentZoom: number;
  /** Zoom at which the smallest interactive marker inside reaches 44 px, 0 when none. */
  markerZoom: number;
  minZoom: number;
  maxZoom: number;
}

/** A nested level always lands at least this much deeper than its parent. */
export const NESTED_DEPTH_STEP = 1.35;
/** How far "fit by the short side" may go past "fit the whole region". */
export const COVER_LIMIT = 2.5;

/**
 * Zoom of a focus region (FORK.md §3, matt.2): fit the whole region, or — for
 * a region wider than the stage — fit its height, up to 2.5× (the rest is
 * reached by panning); never shallower than 1.35× its parent; and deep enough that
 * every interactive marker inside is a 44 px touch target. Clamped to limits.
 */
export function regionZoom(input: RegionZoomInput): number {
  const { bounds, baseFitW, stageWidth: W, stageHeight: H, insets } = input;
  const innerW = Math.max(W * 0.5, W - insets.left - insets.right);
  const innerH = Math.max(H * 0.5, H - insets.top - insets.bottom);
  const zW = (innerW * input.safeFraction / bounds.w) * baseFitW / W;
  const zH = (innerH * input.safeFraction / bounds.h) * baseFitW / W;
  const contain = Math.min(zW, zH);
  // Only a region WIDER than the free stage (a faceplate on a portrait iPad)
  // is fitted by its height; a tall region keeps "fit whole" so its top and
  // bottom (e.g. the faceplate at the top of a rack) stay on screen.
  // matt.3 §15: a turned frame already lays the wide region along the long
  // screen axis — fit it whole (`cover: false`).
  const byHeight = input.cover !== false && zW < zH ? zH : contain;
  const wanted = Math.max(
    contain,
    Math.min(byHeight, contain * COVER_LIMIT),
    input.parentZoom > 0 ? input.parentZoom * NESTED_DEPTH_STEP : 0,
    input.markerZoom > 0 ? input.markerZoom : 0,
  );
  return Math.min(input.maxZoom, Math.max(input.minZoom, wanted));
}

/** Zoom at which a marker of plan-relative size reaches `px` CSS pixels. */
export function markerTouchZoom(
  devicePct: number, iconUnit: number, scale: number, stageWidth: number, baseFitW: number, px = 44,
): number {
  const perZoom = (devicePct * iconUnit * scale * stageWidth) / (100 * baseFitW);
  return perZoom > 0 && Number.isFinite(perZoom) ? px / perZoom : 0;
}
