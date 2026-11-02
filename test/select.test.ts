import { describe, expect, it } from "vitest";
import { outermostEnclosed, rectBetween, type FrameBox } from "../src/core/select";

// Page A (0..400) holds card A1 (20..120) and A2 (200..300). Page B (500..900) holds card B1. Group nesting is ignored.
const frames: FrameBox[] = [
  { id: "A", x: 0, y: 0, w: 400, h: 300, ancestors: [] },
  { id: "A1", x: 20, y: 20, w: 100, h: 100, ancestors: ["A"] },
  { id: "A2", x: 200, y: 20, w: 100, h: 100, ancestors: ["A"] },
  { id: "A1x", x: 30, y: 30, w: 20, h: 20, ancestors: ["A", "A1"] },
  { id: "B", x: 500, y: 0, w: 400, h: 300, ancestors: [] },
  { id: "B1", x: 520, y: 20, w: 100, h: 100, ancestors: ["B"] },
  { id: "empty", x: 10, y: 10, w: 0, h: 0, ancestors: ["A"] },
];

describe("marquee selection", () => {
  it("selects only the outermost frames that lie completely inside", () => {
    expect(outermostEnclosed(frames, { x: -10, y: -10, w: 1000, h: 400 })).toEqual(["A", "B"]); // everything is inside, parents stand for children
  });
  it("selects the children when the parent sticks out of the area", () => {
    expect(outermostEnclosed(frames, { x: 10, y: 10, w: 320, h: 150 })).toEqual(["A1", "A2"]);
    expect(outermostEnclosed(frames, { x: 25, y: 25, w: 40, h: 40 })).toEqual(["A1x"]); // deepest one, its parents do not fit
  });
  it("needs the whole frame inside, a touch is not enough", () => {
    const touching = outermostEnclosed(frames, { x: 10, y: 10, w: 100, h: 100 }); // A1 sticks out by 10 on the right and bottom
    expect(touching).not.toContain("A1");
    expect(touching).toEqual(["A1x"]); // but the small frame inside A1 is completely inside, and its parent does not fit
    expect(outermostEnclosed(frames, { x: 60, y: 60, w: 100, h: 100 })).toEqual([]); // nothing fits entirely
    expect(outermostEnclosed(frames, { x: 20, y: 20, w: 100, h: 100 })).toEqual(["A1"]); // an exact fit counts
  });
  it("mixes a whole page and a card of another page", () => {
    // The area ends at x=635: page A fits, page B does not, but the card B1 inside B does.
    expect(outermostEnclosed(frames, { x: -5, y: -5, w: 640, h: 320 })).toEqual(["A", "B1"]);
  });
  it("skips frames without a size and returns nothing for an empty area", () => {
    expect(outermostEnclosed(frames, { x: 0, y: 0, w: 15, h: 15 })).toEqual([]);
    expect(outermostEnclosed([], { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });
  it("builds the rectangle whichever way the drag went", () => {
    expect(rectBetween({ x: 50, y: 40 }, { x: 10, y: 90 })).toEqual({ x: 10, y: 40, w: 40, h: 50 });
  });
});
