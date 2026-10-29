/**
 * Fork (matt/single-pane, matt.3): rotate-to-fit (FORK.md §15). Pure maths.
 *
 * The card's camera is an axis-aligned viewBox drawn into the `.zoomwrap`
 * "camera frame". Rotation does not touch that model: the frame itself is
 * laid out with swapped sides (stage H × W) and turned ±90° about the stage
 * centre with one CSS `rotate`. Every camera layer inside the frame (plan
 * SVG, 2.5D layers, marker/label/callout HTML layers, live pan/pinch
 * projections) keeps working in frame-local pixels; only the few places that
 * turn a CLIENT point or delta into frame pixels, and the stage-edge chrome
 * insets, need the rotation term — they all go through this module.
 *
 * Angles are CSS angles: positive = clockwise on screen (y points down).
 */
import type { StageInsets } from './fork-focus';

export type ForkRot = 0 | 90 | -90;

/** Camera-frame size (local, before rotation) for a stage W × H. */
export function rotFrameSize(W: number, H: number, rot: number): [number, number] {
  return rot === 90 || rot === -90 ? [H, W] : [W, H];
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Rotate a vector by `deg` (CSS sense, y down). Exact for multiples of 90. */
export function rotateVec(x: number, y: number, deg: number): [number, number] {
  const n = ((Math.round(deg) % 360) + 360) % 360;
  if (deg === Math.round(deg) && n % 90 === 0) {
    // `+ 0` keeps exact multiples of 90 free of negative zeros.
    if (n === 0) return [x + 0, y + 0];
    if (n === 90) return [-y + 0, x + 0];
    if (n === 180) return [-x + 0, -y + 0];
    return [y + 0, -x + 0];
  }
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return [x * c - y * s, x * s + y * c];
}

/**
 * Stage point (px from the stage's top-left) → frame-local px. The frame of
 * size fw × fh is centred on the stage and turned by `deg`.
 */
export function stageToFrame(
  sx: number, sy: number, W: number, H: number, fw: number, fh: number, deg: number,
): [number, number] {
  const [x, y] = rotateVec(sx - W / 2, sy - H / 2, -deg);
  return [x + fw / 2, y + fh / 2];
}

/** Frame-local px → stage px (inverse of `stageToFrame`). */
export function frameToStage(
  fx: number, fy: number, W: number, H: number, fw: number, fh: number, deg: number,
): [number, number] {
  const [x, y] = rotateVec(fx - fw / 2, fy - fh / 2, deg);
  return [x + W / 2, y + H / 2];
}

/** A screen-space drag/pinch delta expressed along the frame's axes. */
export function deltaToFrame(dx: number, dy: number, deg: number): [number, number] {
  return rotateVec(dx, dy, -deg);
}

/**
 * Stage-edge insets (screen: chrome bands along the stage's edges) as insets
 * of the rotated frame. +90: frame top = screen right, frame left = screen
 * top; −90: frame top = screen left, frame left = screen bottom.
 */
export function insetsToFrame(insets: StageInsets, rot: number): StageInsets {
  if (rot === 90) return { top: insets.right, right: insets.bottom, bottom: insets.left, left: insets.top };
  if (rot === -90) return { top: insets.left, right: insets.top, bottom: insets.right, left: insets.bottom };
  return { ...insets };
}

/** Minimum fill gain (rotated ÷ upright on-screen scale) that earns a rotation. */
export const ROTATE_MIN_GAIN = 1.15;

export interface RotationChoiceInput {
  /** Target bounds (plan units). */
  bounds: { w: number; h: number };
  stageWidth: number;
  stageHeight: number;
  /** Screen chrome insets of the stage. */
  insets: StageInsets;
  /** Direction used when rotating (card option); 0 = never rotate. */
  direction: ForkRot;
  minGain?: number;
}

/**
 * Rotate the frame when a landscape target on a portrait free area (or the
 * reverse) would be shown meaningfully larger turned by 90°: compare the
 * on-screen scale of the target fitted upright with the scale fitted turned.
 */
export function chooseRotation(input: RotationChoiceInput): ForkRot {
  const { bounds, stageWidth: W, stageHeight: H, insets, direction } = input;
  if (!direction || !(bounds.w > 0) || !(bounds.h > 0) || !(W > 0) || !(H > 0)) return 0;
  const fw = Math.max(W * 0.5, W - insets.left - insets.right);
  const fh = Math.max(H * 0.5, H - insets.top - insets.bottom);
  const upright = Math.min(fw / bounds.w, fh / bounds.h);
  const turned = Math.min(fh / bounds.w, fw / bounds.h);
  return turned >= upright * (input.minGain ?? ROTATE_MIN_GAIN) ? direction : 0;
}

/** Inline style of the `.zoomwrap` frame for a rotated (or animating) camera. */
export function frameStyle(W: number, H: number, fw: number, fh: number, deg: number): string {
  return `inset:auto;left:${((W - fw) / 2).toFixed(2)}px;top:${((H - fh) / 2).toFixed(2)}px;`
    + `width:${fw}px;height:${fh}px;rotate:${deg}deg;--fork-unrot:${-deg}deg`;
}

/** Side of the square frame used while the camera turns (covers the stage at every angle). */
export function spinFrameSide(W: number, H: number): number {
  return Math.ceil(Math.hypot(W, H)) + 2;
}

export interface ViewRect { x: number; y: number; w: number; h: number }

/**
 * The same camera (same centre, same screen pixels per plan unit) expressed
 * for another frame size: used to swap frames without any visible jump.
 */
export function reframeView(view: ViewRect, fromW: number, toW: number, toH: number): ViewRect {
  const ppu = fromW / view.w;
  const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
  const w = toW / ppu, h = toH / ppu;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Screen-space interpolation of the turn angle (eased progress 0..1). */
export const lerpAngle = (from: number, to: number, p: number): number => from + (to - from) * p;
