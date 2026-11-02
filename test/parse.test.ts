import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parsePen } from "../src/core/parse";
import { defaultTheme, resolveVariable } from "../src/core/variables";

const fixture = readFileSync("fixtures/test.pen.json", "utf8");

describe("parsePen", () => {
  it("parses the fixture without warnings", () => {
    const { doc, warnings } = parsePen(fixture);
    expect(warnings).toEqual([]);
    expect(doc.children.length).toBeGreaterThan(0);
  });
  it("warns on version, bad id, unknown type, dangling ref; ignores unknown props", () => {
    const { warnings, doc } = parsePen(JSON.stringify({ version: "9.9", weird: 1, children: [
      { id: "a/b", type: "frame", future: true },
      { id: "c", type: "hologram" },
      { id: "d", type: "ref", ref: "nope" },
    ] }));
    expect(warnings.join("|")).toMatch(/version/);
    expect(warnings.join("|")).toMatch(/contains "\/"/);
    expect(warnings.join("|")).toMatch(/unknown type "hologram"/);
    expect(warnings.join("|")).toMatch(/target "nope" not found/);
    expect((doc.children[0] as any).future).toBe(true);
  });
  it("rejects non-JSON input", () => {
    expect(() => parsePen("\u0001\u0002 encrypted")).toThrow(/Not valid JSON/);
  });
});

describe("variables", () => {
  const { doc } = parsePen(fixture);
  it("resolves themed values", () => {
    expect(resolveVariable(doc, "color.bg", defaultTheme(doc))).toBe("#FFFFFF");
    expect(resolveVariable(doc, "color.bg", { mode: "dark" })).toBe("#111827");
    expect(resolveVariable(doc, "spacing.md", {})).toBe(16);
  });
});
