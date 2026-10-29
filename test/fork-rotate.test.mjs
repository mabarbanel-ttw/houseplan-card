// Fork matt.3 (FORK.md §15): rotate-to-fit — frame maths, client↔frame
// mapping both ways, insets, the rotation choice, and hit-testing in a turned
// frame (client point → plan point through the same path the card uses).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseRotation, deltaToFrame, frameStyle, frameToStage, insetsToFrame, reframeView, rotFrameSize,
  rotateVec, spinFrameSide, stageToFrame,
} from '../test-build/fork-rotate.js';
import { clientToPlanNorm, insetCameraTarget, NO_INSETS } from '../test-build/fork-focus.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('matt.3 §15 rotateVec follows CSS rotate (clockwise, y down)', () => {
  assert.deepEqual(rotateVec(1, 0, 90), [0, 1]);
  assert.deepEqual(rotateVec(0, -1, 90), [1, 0]);   // frame top → screen right
  assert.deepEqual(rotateVec(-1, 0, 90), [0, -1]);  // frame left → screen top
  assert.deepEqual(rotateVec(0, -1, -90), [-1, 0]); // frame top → screen left
  const [x, y] = rotateVec(3, 4, 30);
  close(Math.hypot(x, y), 5);
});

test('matt.3 §15 stage ↔ frame mapping is exact both ways (0, ±90, mid-turn)', () => {
  const W = 390, H = 788;
  for (const deg of [0, 90, -90, 37.5]) {
    const [fw, fh] = deg === 37.5 ? [spinFrameSide(W, H), spinFrameSide(W, H)] : rotFrameSize(W, H, deg);
    for (const [sx, sy] of [[0, 0], [W, H], [12.5, 700], [W / 2, H / 2]]) {
      const [fx, fy] = stageToFrame(sx, sy, W, H, fw, fh, deg);
      const [bx, by] = frameToStage(fx, fy, W, H, fw, fh, deg);
      close(bx, sx, 1e-9); close(by, sy, 1e-9);
    }
  }
  // +90: frame is H × W; the stage's top-left corner is the frame's bottom-left.
  const [fw, fh] = rotFrameSize(W, H, 90);
  assert.deepEqual([fw, fh], [H, W]);
  const [fx, fy] = stageToFrame(0, 0, W, H, fw, fh, 90);
  close(fx, 0); close(fy, W);
  // The stage centre is always the frame centre.
  assert.deepEqual(stageToFrame(W / 2, H / 2, W, H, fw, fh, 90), [fw / 2, fh / 2]);
});

test('matt.3 §15 a finger drag maps onto the turned frame axes', () => {
  assert.deepEqual(deltaToFrame(10, 20, 0), [10, 20]);
  // +90: dragging DOWN on screen moves along the frame's +x.
  assert.deepEqual(deltaToFrame(0, 30, 90), [30, 0]);
  assert.deepEqual(deltaToFrame(30, 0, 90), [0, -30]);
  assert.deepEqual(deltaToFrame(0, 30, -90), [-30, 0]);
});

test('matt.3 §15 chrome insets follow the turned edges', () => {
  const screen = { top: 10, right: 72, bottom: 66, left: 0 };
  assert.deepEqual(insetsToFrame(screen, 0), screen);
  assert.deepEqual(insetsToFrame(screen, 90), { top: 72, right: 66, bottom: 0, left: 10 });
  assert.deepEqual(insetsToFrame(screen, -90), { top: 0, right: 10, bottom: 72, left: 66 });
});

test('matt.3 §15 rotation choice: landscape room on portrait free area turns, others stay', () => {
  const phone = { stageWidth: 390, stageHeight: 788, insets: { top: 0, right: 0, bottom: 66, left: 0 }, direction: 90 };
  assert.equal(chooseRotation({ ...phone, bounds: { w: 450, h: 300 } }), 90);   // bedroom
  assert.equal(chooseRotation({ ...phone, bounds: { w: 450, h: 450 } }), 0);    // square living room
  assert.equal(chooseRotation({ ...phone, bounds: { w: 200, h: 400 } }), 0);    // portrait room
  assert.equal(chooseRotation({ ...phone, bounds: { w: 450, h: 300 }, direction: 0 }), 0); // option off
  assert.equal(chooseRotation({ ...phone, bounds: { w: 450, h: 300 }, direction: -90 }), -90);
  const land = { stageWidth: 1366, stageHeight: 960, insets: NO_INSETS, direction: 90 };
  assert.equal(chooseRotation({ ...land, bounds: { w: 450, h: 300 } }), 0);
  assert.equal(chooseRotation({ ...land, bounds: { w: 100, h: 400 } }), 90);   // tall room on a landscape screen
  // Marginal gains (< 15 %) do not turn the screen.
  assert.equal(chooseRotation({ ...phone, insets: NO_INSETS, bounds: { w: 390, h: 370 } }), 0);
});

test('matt.3 §15 reframe keeps centre and screen scale; frame style', () => {
  const view = { x: 100, y: 200, w: 50, h: 100 };
  const next = reframeView(view, 390, 788, 390);
  close(next.x + next.w / 2, 125); close(next.y + next.h / 2, 250);
  close(788 / next.w, 390 / view.w);
  assert.match(frameStyle(390, 788, 788, 390, 90), /left:-199\.00px;top:199\.00px;width:788px;height:390px;rotate:90deg;--fork-unrot:-90deg/);
  assert.ok(spinFrameSide(390, 788) >= Math.hypot(390, 788));
});

test('matt.3 §15 hit-testing in the turned frame: client point → plan point', () => {
  // A 390×788 phone stage at client (0, 56), turned +90; camera fitted to a
  // landscape room 450×300 (render units) in the H×W frame.
  const W = 390, H = 788, left = 0, top = 56;
  const [fw, fh] = rotFrameSize(W, H, 90);
  const baseFit = { x: 0, y: 0, w: 1000 * (fw / fh) / 1, h: 1000 };
  const target = insetCameraTarget({
    bounds: { x: 50, y: 550, w: 450, h: 300 }, baseFit, stageWidth: fw, stageHeight: fh,
    insets: insetsToFrame({ top: 0, right: 0, bottom: 66, left: 0 }, 90), minZoom: 1 / 3, maxZoom: 32, safeFraction: 0.96,
  });
  const view = target.viewBox;
  // Plan point → frame px → stage px → client px, then back through the
  // card's own path (stageToFrame + clientToPlanNorm on the frame rect).
  for (const [px, py] of [[0.05, 0.55], [0.5, 0.85], [0.27, 0.62]]) {
    const fx = ((px * 1000 - view.x) / view.w) * fw, fy = ((py * 1000 - view.y) / view.h) * fh;
    const [sx, sy] = frameToStage(fx, fy, W, H, fw, fh, 90);
    const [bx, by] = stageToFrame(sx, sy, W, H, fw, fh, 90);
    const plan = clientToPlanNorm([bx, by], { left: 0, top: 0, width: fw, height: fh }, view, false, 1000);
    close(plan[0], px, 1e-9); close(plan[1], py, 1e-9);
    assert.ok(sx >= -1 && sx <= W + 1 && sy + top >= top - 1 && sy <= H + 1, 'room corner on screen');
    void left;
  }
  // The room's long side now runs down the screen: its two left corners are a column.
  const at = (px, py) => frameToStage(((px * 1000 - view.x) / view.w) * fw, ((py * 1000 - view.y) / view.h) * fh, W, H, fw, fh, 90);
  const a = at(0.05, 0.55), b = at(0.5, 0.55), c = at(0.05, 0.85);
  close(a[0], b[0], 1e-6);
  assert.ok(b[1] > a[1] && b[1] - a[1] > 450 / 300 * (c[0] - a[0] > 0 ? a[0] - c[0] : c[0] - a[0]) * 0.99, 'long side runs down the screen');
  // …and the short side spans the full width (96 % safe fraction).
  close(Math.abs(c[0] - a[0]), 0.96 * W, 1e-6);
});
