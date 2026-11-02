import { beforeAll, describe, expect, it } from "vitest";
import { computeLayout, initLayout } from "../src/core/layout";
import type { PenDocument, PenNode } from "../src/core/schema";

beforeAll(initLayout);

const doc = (children: PenNode[]): PenDocument => ({ version: "2.21", children });
const rect = (id: string, w: number | string, h: number | string, extra: object = {}): PenNode => ({ id, type: "rectangle", width: w, height: h, ...extra });
const measure = (n: PenNode, maxW?: number) => ({ w: Math.min(maxW ?? 1e9, String(n.content).length * 10), h: 12 });
const run = (d: PenDocument) => computeLayout(d, measure).boxes;

describe("computeLayout", () => {
  it("horizontal gap and padding [t,r,b,l]", () => {
    const b = run(doc([{ id: "f", type: "frame", x: 5, y: 7, layout: "horizontal", gap: 8, padding: [1, 2, 3, 4], children: [rect("a", 10, 10), rect("b", 20, 30)] }]));
    expect(b.get("f")).toEqual({ x: 5, y: 7, w: 4 + 10 + 8 + 20 + 2, h: 1 + 30 + 3 });
    expect(b.get("b")).toEqual({ x: 4 + 10 + 8, y: 1, w: 20, h: 30 });
  });
  it("fill_container takes the remaining main-axis space", () => {
    const b = run(doc([{ id: "f", type: "frame", layout: "horizontal", width: 200, height: 40, gap: 8, children: [rect("a", 40, 40), rect("m", "fill_container", 40), rect("c", 30, 40)] }]));
    expect(b.get("m")!.w).toBe(200 - 40 - 30 - 16);
  });
  it("justifyContent space_between and alignItems end", () => {
    const b = run(doc([{ id: "f", type: "frame", layout: "horizontal", width: 100, height: 50, justifyContent: "space_between", alignItems: "end", children: [rect("a", 10, 10), rect("z", 10, 20)] }]));
    expect(b.get("z")).toMatchObject({ x: 90, y: 30 });
    expect(b.get("a")).toMatchObject({ x: 0, y: 40 });
  });
  it("layout none uses x/y; layoutPosition absolute escapes flex", () => {
    const b = run(doc([{ id: "f", type: "frame", layout: "vertical", width: 100, height: 100, children: [rect("a", 10, 10), rect("abs", 5, 5, { layoutPosition: "absolute", x: 70, y: -3 })] }]));
    expect(b.get("abs")).toMatchObject({ x: 70, y: -3 });
  });
  it("text: auto, fixed-width wraps, fixed-width-height keeps its box", () => {
    const t = (id: string, o: object): PenNode => ({ id, type: "text", content: "x".repeat(10), ...o });
    const b = run(doc([{ id: "f", type: "frame", layout: "vertical", width: 300, height: 300, children: [t("auto", {}), t("fw", { textGrowth: "fixed-width", width: 50 }), t("fwh", { textGrowth: "fixed-width-height", width: 40, height: 9 })] }]));
    expect(b.get("auto")).toMatchObject({ w: 100, h: 12 });
    expect(b.get("fw")!.w).toBe(50);
    expect(b.get("fwh")).toMatchObject({ w: 40, h: 9 });
  });
  it("skips disabled nodes", () => {
    const b = run(doc([{ id: "f", type: "frame", width: 10, height: 10, children: [rect("gone", 5, 5, { enabled: false })] }]));
    expect(b.has("gone")).toBe(false);
  });
});
