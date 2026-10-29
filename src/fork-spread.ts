/**
 * Fork (matt/single-pane, matt.3): focused markers that would stack on screen
 * step aside instead (FORK.md §17). Pure: screen boxes in, screen points out.
 *
 * Every marker is a box (its icon, value pill and name label, in screen px)
 * centred on its plan spot. Markers whose boxes overlap form clusters:
 *
 * - a LINE cluster (centres on one row or one column, e.g. the ports of a
 *   switch faceplate) is re-laid along its line in plan order, evenly spaced,
 *   wrapping into more rows/columns when the free area is too short — a neat
 *   strip, never a heap;
 * - any other cluster loosens up by relaxation: overlapping pairs push apart
 *   along the axis that needs the smaller move, first by at most about one
 *   box from the plan spot; whatever is still covered then tries the other
 *   axis (a too-long row becomes two rows) and finally may go further.
 *
 * Markers stay inside the free area and never move onto an obstacle (a focus
 * region one tap away — its tap must reach the region). Markers that do not
 * overlap never move.
 */

export interface SpreadPoint {
  id: string;
  x: number;
  y: number;
  /** Box size (px); defaults to the input's gapX / gapY. */
  w?: number;
  h?: number;
}
export interface SpreadBox { left: number; top: number; right: number; bottom: number }

export interface SpreadInput {
  points: readonly SpreadPoint[];
  /** Default box size (px) for points without their own. */
  gapX: number;
  gapY: number;
  /** Free screen area markers must stay inside. */
  bounds: SpreadBox;
  /** Areas a marker that started outside them may not be pushed into. */
  obstacles?: readonly SpreadBox[];
  /** Relaxation pass budget (default 80). */
  passes?: number;
  /** How far a relaxed marker may step aside, in its own box sizes (default 1). */
  reach?: number;
  /** Ids that form a line to lay out as a strip even without overlap (e.g. a
   *  focused faceplate row that runs off the screen). */
  lines?: readonly (readonly string[])[];
}

const EPS = 0.01;

export function spreadMarkers(input: SpreadInput): Map<string, { x: number; y: number }> {
  const { points, bounds } = input;
  const result = new Map<string, { x: number; y: number }>();
  const n = points.length;
  if (n < 2 || !(input.gapX > 0) || !(input.gapY > 0)) return result;
  const W = points.map((p) => (p.w && p.w > 0 ? p.w : input.gapX));
  const H = points.map((p) => (p.h && p.h > 0 ? p.h : input.gapY));
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  /** Where a marker steps aside FROM: its plan spot, or its slot in a laid-out strip. */
  const ax = points.map((p) => p.x), ay = points.map((p) => p.y);
  const lineOf = points.map(() => -1);
  let reach = input.reach ?? 1;
  const inside = (b: SpreadBox, x: number, y: number): boolean => x > b.left && x < b.right && y > b.top && y < b.bottom;
  const binds = points.map((p) => (input.obstacles ?? []).filter((b) => !inside(b, p.x, p.y)));
  const needX = (i: number, j: number): number => (W[i] + W[j]) / 2 - Math.abs(xs[j] - xs[i]);
  const needY = (i: number, j: number): number => (H[i] + H[j]) / 2 - Math.abs(ys[j] - ys[i]);
  const overlap = (i: number, j: number): boolean => needX(i, j) > EPS && needY(i, j) > EPS;
  // Obstacles (focus regions one tap away) are fixed boxes: a marker's box may
  // not move onto one — unless it already touched it at its plan spot.
  const obstacles = input.obstacles ?? [];
  const boxHits = (b: SpreadBox, i: number, x: number, y: number): boolean =>
    x + W[i] / 2 > b.left + EPS && x - W[i] / 2 < b.right - EPS && y + H[i] / 2 > b.top + EPS && y - H[i] / 2 < b.bottom - EPS;
  const cover = (b: SpreadBox, i: number, x: number, y: number): number =>
    Math.max(0, Math.min(x + W[i] / 2, b.right) - Math.max(x - W[i] / 2, b.left))
    * Math.max(0, Math.min(y + H[i] / 2, b.bottom) - Math.max(y - H[i] / 2, b.top));
  // how much of each obstacle a marker covered at its plan spot: it may never cover more
  const covered0 = points.map((p, i) => obstacles.map((b) => cover(b, i, p.x, p.y)));
  const onObstacle = (i: number): SpreadBox | null => {
    for (let k = 0; k < obstacles.length; k += 1) {
      if (boxHits(obstacles[k], i, xs[i], ys[i]) && cover(obstacles[k], i, xs[i], ys[i]) > covered0[i][k] + 1) return obstacles[k];
    }
    return null;
  };
  /** Clamp into the free area (and the step-aside reach), then out of obstacles. */
  const place = (i: number, x: number, y: number, leash: boolean): void => {
    const hx = W[i] / 2, hy = H[i] / 2;
    let nx = x, ny = y;
    if (leash) {
      nx = Math.min(ax[i] + W[i] * reach, Math.max(ax[i] - W[i] * reach, nx));
      ny = Math.min(ay[i] + H[i] * reach, Math.max(ay[i] - H[i] * reach, ny));
    }
    const fx = bounds.right - bounds.left >= 2 * hx;
    const fy = bounds.bottom - bounds.top >= 2 * hy;
    nx = fx ? Math.min(bounds.right - hx, Math.max(bounds.left + hx, nx)) : (bounds.left + bounds.right) / 2;
    ny = fy ? Math.min(bounds.bottom - hy, Math.max(bounds.top + hy, ny)) : (bounds.top + bounds.bottom) / 2;
    for (const b of binds[i]) {
      if (!inside(b, nx, ny)) continue;
      // out through the nearest edge (the marker's centre never sits on the region)
      const exits: [number, number, number][] = [
        [nx - b.left, b.left, ny], [b.right - nx, b.right, ny], [ny - b.top, nx, b.top], [b.bottom - ny, nx, b.bottom],
      ];
      exits.sort((a, c) => a[0] - c[0]);
      nx = exits[0][1]; ny = exits[0][2];
    }
    xs[i] = nx; ys[i] = ny;
  };

  /** Lay `group` out as an even strip (row or column) in plan order around
   *  its centre (plan spots, or current spots when `current`), wrapping into
   *  more lines when the free area is too short, shifted into the free area. */
  const layoutStrip = (group: readonly number[], row: boolean, gx: number, gy: number, current: boolean): void => {
    const px = (i: number): number => (current ? xs[i] : points[i].x);
    const py = (i: number): number => (current ? ys[i] : points[i].y);
    const sorted = [...group].sort((a, b) => row
      ? points[a].x - points[b].x || points[a].y - points[b].y
      : points[a].y - points[b].y || points[a].x - points[b].x);
    const cx = group.reduce((sum, i) => sum + px(i), 0) / group.length;
    const cy = group.reduce((sum, i) => sum + py(i), 0) / group.length;
    const room = row ? bounds.right - bounds.left : bounds.bottom - bounds.top;
    const step = row ? gx : gy;
    const perLine = Math.max(1, Math.min(sorted.length, Math.floor(room / step) || 1));
    const lines = Math.ceil(sorted.length / perLine);
    const spot = sorted.map((_, k): [number, number] => {
      const line = Math.floor(k / perLine);
      const inLine = line === lines - 1 ? sorted.length - line * perLine : perLine;
      const along = (k % perLine - (inLine - 1) / 2) * step;
      const across = (line - (lines - 1) / 2) * (row ? gy : gx);
      return row ? [cx + along, cy + across] : [cx + across, cy + along];
    });
    const fit = (lo: number, hi: number, half: number, min: number, max: number): number =>
      hi - lo + 2 * half > max - min ? (min + max) / 2 - (lo + hi) / 2
        : lo - half < min ? min - (lo - half) : hi + half > max ? max - (hi + half) : 0;
    const dx = fit(Math.min(...spot.map((p) => p[0])), Math.max(...spot.map((p) => p[0])), gx / 2, bounds.left, bounds.right);
    const dy = fit(Math.min(...spot.map((p) => p[1])), Math.max(...spot.map((p) => p[1])), gy / 2, bounds.top, bounds.bottom);
    sorted.forEach((index, k) => {
      place(index, spot[k][0] + dx, spot[k][1] + dy, false);
      ax[index] = xs[index]; ay[index] = ys[index]; lineOf[index] = group[0];
    });
  };

  // ---- clusters of overlapping boxes (at the plan spots); forced lines first
  const parent = points.map((_, i) => i);
  const index = new Map(points.map((p, i) => [p.id, i]));
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const line of input.lines ?? []) {
    const ids = line.map((id) => index.get(id)).filter((i): i is number => i !== undefined);
    for (let k = 1; k < ids.length; k += 1) parent[find(ids[k])] = find(ids[0]);
  }
  const forced = new Set((input.lines ?? []).flat().map((id) => index.get(id)).filter((i) => i !== undefined));
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (overlap(i, j)) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  points.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const relaxed = new Set<number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const gx = Math.max(...group.map((i) => W[i])), gy = Math.max(...group.map((i) => H[i]));
    const spanX = Math.max(...group.map((i) => points[i].x)) - Math.min(...group.map((i) => points[i].x));
    const spanY = Math.max(...group.map((i) => points[i].y)) - Math.min(...group.map((i) => points[i].y));
    const isForced = group.some((i) => forced.has(i));
    const row = (spanY <= gy * 0.25 || isForced) && spanX >= spanY;
    const col = !row && (spanX <= gx * 0.25 || isForced);
    if (!row && !col) { for (const i of group) relaxed.add(i); continue; }
    layoutStrip(group, row, gx, gy, false);
  }

  // Any overlap left (relaxed crowds, or a strip landing on a neighbour) is relaxed.
  const anyLeft = (): boolean => {
    for (let i = 0; i < n; i += 1) {
      if (onObstacle(i)) return true;
      for (let j = i + 1; j < n; j += 1) if (overlap(i, j)) return true;
    }
    return false;
  };
  /** Push marker `i` off an obstacle it was moved onto (the shortest way out). */
  const clearObstacle = (i: number): boolean => {
    const b = onObstacle(i);
    if (!b) return false;
    const exits: [number, number, number][] = [
      [xs[i] + W[i] / 2 - b.left, b.left - W[i] / 2, ys[i]], [b.right - (xs[i] - W[i] / 2), b.right + W[i] / 2, ys[i]],
      [ys[i] + H[i] / 2 - b.top, xs[i], b.top - H[i] / 2], [b.bottom - (ys[i] - H[i] / 2), xs[i], b.bottom + H[i] / 2],
    ];
    exits.sort((a, c) => a[0] - c[0]);
    for (const [, x, y] of exits) {
      const before = [xs[i], ys[i]];
      place(i, x, y, false);
      if (!onObstacle(i)) return true;
      xs[i] = before[0]; ys[i] = before[1];
    }
    return false;
  };
  if (relaxed.size || anyLeft()) {
    const order = (i: number, j: number, axis: 'x' | 'y'): number => {
      const d = axis === 'x' ? points[j].x - points[i].x : points[j].y - points[i].y;
      return d !== 0 ? Math.sign(d) : (j > i ? 1 : -1);
    };
    const passes = input.passes ?? 150;
    // First a short step aside; whatever still overlaps may go a little further.
    const phases = [reach, reach * 2.5, reach * 6, reach * 12];
    for (let pass = 0, phase = 0; pass < passes * phases.length; pass += 1) {
      if (pass === passes * (phase + 1)) { phase += 1; reach = phases[phase]; }
      let moved = false;
      for (let i = 0; i < n; i += 1) if (clearObstacle(i)) moved = true;
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          // two slots of the same strip never overlap; leave a strip intact
          if (lineOf[i] >= 0 && lineOf[i] === lineOf[j]) continue;
          if (!overlap(i, j)) continue;
          const ox = needX(i, j), oy = needY(i, j);
          const dx = xs[j] - xs[i], dy = ys[j] - ys[i];
          const sx = dx !== 0 ? Math.sign(dx) : order(i, j, 'x');
          const sy = dy !== 0 ? Math.sign(dy) : order(i, j, 'y');
          // a marker of a laid-out line stays put; the relaxed one moves the whole way
          const fixedI = lineOf[i] >= 0, fixedJ = lineOf[j] >= 0;
          let wi = fixedI === fixedJ ? 0.5 : fixedI ? 0 : 1;
          let wj = 1 - wi;
          const tryAxis = (axis: 'x' | 'y'): boolean => {
            const before = [xs[i], ys[i], xs[j], ys[j]];
            if (axis === 'x') { place(i, xs[i] - sx * ox * wi, ys[i], true); place(j, xs[j] + sx * ox * wj, ys[j], true); }
            else { place(i, xs[i], ys[i] - sy * oy * wi, true); place(j, xs[j], ys[j] + sy * oy * wj, true); }
            const gained = (Math.abs(xs[j] - xs[i]) - Math.abs(before[2] - before[0]) > EPS
              || Math.abs(ys[j] - ys[i]) - Math.abs(before[3] - before[1]) > EPS)
              && !onObstacle(i) && !onObstacle(j);
            if (!gained) { xs[i] = before[0]; ys[i] = before[1]; xs[j] = before[2]; ys[j] = before[3]; }
            return gained;
          };
          // Phase 1 tries the smaller move; a crowd still stuck (e.g. a row
          // wider than the screen) then steps across instead: a second row.
          const smaller: 'x' | 'y' = ox / (W[i] + W[j]) <= oy / (H[i] + H[j]) ? 'x' : 'y';
          const first: 'x' | 'y' = phase === 1 ? (smaller === 'x' ? 'y' : 'x') : smaller;
          const other: 'x' | 'y' = first === 'x' ? 'y' : 'x';
          if (tryAxis(first) || tryAxis(other)) moved = true;
          else if (fixedI !== fixedJ) {
            // the free one is cornered: the strip member gives way too
            wi = 0.5; wj = 0.5;
            if (tryAxis(first) || tryAxis(other)) moved = true;
          }
        }
      }
      if (!moved) {
        if (phase + 1 >= phases.length) break;
        phase += 1; reach = phases[phase]; pass = passes * phase - 1;
      }
    }
  }

  // Last resort for what relaxation left covered (a crowd boxed in by walls,
  // chrome and a region): move the marker to the nearest free spot — searched
  // outward from where it is — that covers no marker and no more of a region.
  const conflicts = (i: number): number => {
    let k = onObstacle(i) ? 1 : 0;
    for (let j = 0; j < n; j += 1) if (j !== i && overlap(i, j)) k += 1;
    return k;
  };
  for (let round = 0; round < 3; round += 1) {
    const stuck = points.map((_, i) => i).filter((i) => conflicts(i) > 0).sort((a, b) => conflicts(b) - conflicts(a));
    if (!stuck.length) break;
    for (const i of stuck) {
      if (conflicts(i) === 0) continue;
      const ox = xs[i], oy = ys[i];
      const step = Math.max(4, Math.min(W[i], H[i]) / 6);
      const maxR = Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top);
      let found = false;
      for (let r = step; r <= maxR && !found; r += step) {
        const count = Math.max(8, Math.round((2 * Math.PI * r) / step));
        for (let k = 0; k < count && !found; k += 1) {
          const t = (k / count) * 2 * Math.PI;
          const x = ox + r * Math.cos(t), y = oy + r * Math.sin(t);
          if (x - W[i] / 2 < bounds.left || x + W[i] / 2 > bounds.right || y - H[i] / 2 < bounds.top || y + H[i] / 2 > bounds.bottom) continue;
          xs[i] = x; ys[i] = y;
          if (conflicts(i) === 0) found = true;
        }
      }
      if (!found) { xs[i] = ox; ys[i] = oy; }
    }
  }

  // A marker whose centre is on the free area but whose box hangs over its
  // edge (a value pill cut by the screen edge) moves just inside.
  for (let i = 0; i < n; i += 1) {
    const hx = W[i] / 2, hy = H[i] / 2;
    const centreIn = xs[i] >= bounds.left && xs[i] <= bounds.right && ys[i] >= bounds.top && ys[i] <= bounds.bottom;
    const hangs = xs[i] - hx < bounds.left || xs[i] + hx > bounds.right || ys[i] - hy < bounds.top || ys[i] + hy > bounds.bottom;
    if (!centreIn || !hangs) continue;
    const before = [xs[i], ys[i]];
    place(i, xs[i], ys[i], false);
    let clash = !!onObstacle(i);
    for (let j = 0; j < n && !clash; j += 1) if (j !== i && overlap(i, j)) clash = true;
    if (clash) { xs[i] = before[0]; ys[i] = before[1]; }
  }

  points.forEach((p, i) => {
    if (Math.abs(xs[i] - p.x) > EPS || Math.abs(ys[i] - p.y) > EPS) result.set(p.id, { x: xs[i], y: ys[i] });
  });
  return result;
}
