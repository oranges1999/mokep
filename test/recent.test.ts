import { describe, expect, it } from "vitest";
import { dropRecent, MAX_RECENT, pushRecent } from "../src/core/recent";

describe("recent files", () => {
  it("puts the newest first and moves a reopened file to the top", () => {
    expect(pushRecent(["a", "b"], "c")).toEqual(["c", "a", "b"]);
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });
  it("caps the list", () => {
    const many = Array.from({ length: MAX_RECENT + 5 }, (_, i) => `f${i}`);
    const out = pushRecent(many, "new");
    expect(out).toHaveLength(MAX_RECENT);
    expect(out[0]).toBe("new");
  });
  it("treats paths case-insensitively only when asked (Windows)", () => {
    expect(pushRecent(["C:\\A.pen"], "c:\\a.pen", true)).toEqual(["c:\\a.pen"]);
    expect(pushRecent(["/x/A.pen"], "/x/a.pen", false)).toEqual(["/x/a.pen", "/x/A.pen"]);
  });
  it("drops one file and leaves the rest", () => {
    expect(dropRecent(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(dropRecent(["a"], "missing")).toEqual(["a"]);
  });
});
