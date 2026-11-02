import { describe, expect, it } from "vitest";
import { flight, fitView, flightMs, fromCamera, MAX_SCALE, MIN_SCALE, toCamera, unionRect, type Insets, type View } from "../src/core/camera";

const SW = 1400, SH = 900;
const none: Insets = { left: 0, top: 0, right: 0, bottom: 0 };
/** Where the rectangle lands on screen for a view. */
const onScreen = (r: { x: number; y: number; w: number; h: number }, v: View) => { const c = toCamera(v, SW, SH); return { x1: r.x * c.scale + c.x, y1: r.y * c.scale + c.y, x2: (r.x + r.w) * c.scale + c.x, y2: (r.y + r.h) * c.scale + c.y }; };

describe("camera", () => {
  it("unions rectangles", () => {
    expect(unionRect([])).toBeNull();
    expect(unionRect([{ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 50, w: 20, h: 20 }])).toEqual({ x: 0, y: 0, w: 120, h: 70 });
  });

  it("fits any rectangle completely inside the free part of the screen, zooming in or out as needed", () => {
    const ins: Insets = { left: 340, top: 68, right: 352, bottom: 90 };
    const rects = [{ x: 0, y: 0, w: 1200, h: 1000 }, { x: -5000, y: 300, w: 30, h: 20 }, { x: 0, y: 0, w: 60000, h: 40000 }, { x: 10, y: 10, w: 800, h: 40 }, { x: 0, y: 0, w: 40, h: 900 }];
    for (const r of rects) for (const i of [none, ins]) {
      const v = fitView(r, SW, SH, i, 48);
      const p = onScreen(r, v), s = SW / v.w;
      if (s > MIN_SCALE + 1e-9 && s < MAX_SCALE - 1e-9) { // within the zoom limits the rectangle must fit with its air
        expect(p.x1).toBeGreaterThanOrEqual(i.left + 48 - 0.5);
        expect(p.y1).toBeGreaterThanOrEqual(i.top + 48 - 0.5);
        expect(p.x2).toBeLessThanOrEqual(SW - i.right - 48 + 0.5);
        expect(p.y2).toBeLessThanOrEqual(SH - i.bottom - 48 + 0.5);
      }
      expect(s).toBeGreaterThanOrEqual(MIN_SCALE); expect(s).toBeLessThanOrEqual(MAX_SCALE);
    }
  });

  it("centres the rectangle in the free area", () => {
    const ins: Insets = { left: 300, top: 0, right: 0, bottom: 0 };
    const r = { x: 100, y: 100, w: 200, h: 100 };
    const p = onScreen(r, fitView(r, SW, SH, ins, 48));
    expect((p.x1 + p.x2) / 2).toBeCloseTo(300 + (SW - 300) / 2, 3);
    expect((p.y1 + p.y2) / 2).toBeCloseTo(SH / 2, 3);
  });

  it("converts between a camera and a view without loss", () => {
    const v = fromCamera(1.5, -300, 120, SW, SH);
    const c = toCamera(v, SW, SH);
    expect(c.scale).toBeCloseTo(1.5, 9); expect(c.x).toBeCloseTo(-300, 6); expect(c.y).toBeCloseTo(120, 6);
  });

  it("flies from the first view to the second one and no further", () => {
    const a: View = { cx: 0, cy: 0, w: 1400 }, b: View = { cx: 8000, cy: 3000, w: 900 };
    const f = flight(a, b);
    const start = f.at(0), end = f.at(f.S);
    for (const k of ["cx", "cy", "w"] as const) { expect(start[k]).toBeCloseTo(a[k], 6); expect(end[k]).toBeCloseTo(b[k], 4); }
    expect(f.at(f.S * 5)).toEqual(end); // clamped
  });

  it("zooms out on a long trip and zooms back in", () => {
    const a: View = { cx: 0, cy: 0, w: 1400 }, b: View = { cx: 20000, cy: 0, w: 1400 };
    const f = flight(a, b);
    const widest = Math.max(...Array.from({ length: 101 }, (_, i) => f.at((f.S * i) / 100).w));
    expect(widest).toBeGreaterThan(a.w * 3); // it pulls back to see the way
    const mid = f.at(f.S / 2);
    expect(mid.cx).toBeCloseTo(10000, 0); // symmetric trip: halfway is the middle
  });

  it("does not zoom out for a short hop, and moves forward all the time", () => {
    const a: View = { cx: 0, cy: 0, w: 1400 }, b: View = { cx: 300, cy: 0, w: 1400 };
    const f = flight(a, b);
    expect(Math.max(...Array.from({ length: 51 }, (_, i) => f.at((f.S * i) / 50).w))).toBeLessThan(a.w * 1.5);
    let last = -Infinity;
    for (let i = 0; i <= 50; i++) { const x = f.at((f.S * i) / 50).cx; expect(x).toBeGreaterThanOrEqual(last); last = x; }
  });

  it("handles a pure zoom and an identical view", () => {
    const a: View = { cx: 10, cy: 20, w: 1000 };
    const zoom = flight(a, { ...a, w: 250 });
    expect(zoom.at(zoom.S).w).toBeCloseTo(250, 6);
    expect(zoom.at(zoom.S / 2).cx).toBe(10);
    const same = flight(a, a);
    expect(same.S).toBe(0);
    expect(same.at(0)).toEqual(a);
  });

  it("keeps the duration reasonable", () => {
    expect(flightMs(0)).toBeGreaterThanOrEqual(360);
    expect(flightMs(100)).toBeLessThanOrEqual(1100);
  });
});
