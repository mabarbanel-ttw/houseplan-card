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
