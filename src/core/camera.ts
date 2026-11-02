import type { Rect } from "./select";

export interface Insets { left: number; top: number; right: number; bottom: number; }
/** A camera as the world point at the centre of the screen and the width of world the screen shows. */
export interface View { cx: number; cy: number; w: number; }

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 64;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Smallest rectangle that contains all the rectangles, or null for none. */
export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x1 = Math.min(...rects.map((r) => r.x)), y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w)), y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** The view that shows `r` completely inside the free part of the screen (the screen minus the floating panels in `ins`),
 *  with `pad` pixels of air around it. It zooms in or out as much as needed, within the zoom limits. */
export function fitView(r: Rect, sw: number, sh: number, ins: Insets, pad = 48): View {
  const freeW = Math.max(1, sw - ins.left - ins.right), freeH = Math.max(1, sh - ins.top - ins.bottom);
  const s = clamp(Math.min(Math.max(1, freeW - 2 * pad) / Math.max(r.w, 1), Math.max(1, freeH - 2 * pad) / Math.max(r.h, 1)), MIN_SCALE, MAX_SCALE);
  const px = ins.left + freeW / 2, py = ins.top + freeH / 2; // where the rectangle's centre should land on screen
  return { cx: r.x + r.w / 2 + (sw / 2 - px) / s, cy: r.y + r.h / 2 + (sh / 2 - py) / s, w: sw / s };
}

/** Pixi container position and scale for a view. */
export function toCamera(v: View, sw: number, sh: number) {
  const scale = sw / v.w;
  return { scale, x: sw / 2 - v.cx * scale, y: sh / 2 - v.cy * scale };
}
export const fromCamera = (scale: number, x: number, y: number, sw: number, sh: number): View => ({ cx: (sw / 2 - x) / scale, cy: (sh / 2 - y) / scale, w: sw / scale });

const RHO = Math.SQRT2;

/** Smooth zoom-and-pan path between two views (van Wijk and Nuij, "Smooth and efficient zooming and panning").
 *  Far apart views make the camera zoom out, travel and zoom back in, so you keep your bearings. `at(s)` is the view after
 *  path length `s` in [0, S]; the speed on screen is constant along the path. */
export function flight(a: View, b: View): { S: number; at: (s: number) => View } {
  const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    // Same centre: a pure zoom.
    const S = Math.abs(Math.log(b.w / a.w)) / RHO;
    return { S, at: (s) => ({ cx: a.cx, cy: a.cy, w: S === 0 ? a.w : a.w * Math.pow(b.w / a.w, clamp(s / S, 0, 1)) }) };
  }
  const r2 = RHO * RHO, r4 = r2 * r2;
  const b0 = (b.w * b.w - a.w * a.w + r4 * d * d) / (2 * a.w * r2 * d);
  const b1 = (b.w * b.w - a.w * a.w - r4 * d * d) / (2 * b.w * r2 * d);
  const q0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), q1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (q1 - q0) / RHO;
  return {
    S,
    at: (s) => {
      const t = clamp(s, 0, S);
      const u = (a.w / r2) * (Math.cosh(q0) * Math.tanh(RHO * t + q0) - Math.sinh(q0));
      return { cx: a.cx + (dx / d) * u, cy: a.cy + (dy / d) * u, w: (a.w * Math.cosh(q0)) / Math.cosh(RHO * t + q0) };
    },
  };
}

/** Milliseconds for a flight of path length S: quick for short hops, never slower than about a second. */
export const flightMs = (S: number) => clamp(320 + 380 * S, 360, 1100);
export const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
