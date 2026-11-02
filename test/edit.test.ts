import { describe, expect, it } from "vitest";
import { applyOps } from "../src/core/edit";
import { lint } from "../src/core/lint";
import type { PenDocument } from "../src/core/schema";

const base = (): PenDocument => ({ version: "2.21", children: [
  { id: "f", type: "frame", children: [{ id: "a", type: "rectangle", width: 10, height: 10 }, { id: "btn", type: "frame", reusable: true, children: [{ id: "lbl", type: "text", content: "x", fill: "#000" }] }] },
] });

describe("applyOps", () => {
  it("inserts with generated ids and keeps the input untouched", () => {
    const input = base();
    const before = JSON.stringify(input);
    const r = applyOps(input, [{ op: "insert", parent: "f", node: { id: "", type: "frame", children: [{ id: "", type: "rectangle" }] } }]);
    expect(r.errors).toEqual([]);
    expect(r.created).toHaveLength(2);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("updates props, deletes a prop with null, rejects id/type changes", () => {
    const r = applyOps(base(), [{ op: "update", id: "a", props: { width: 20, height: null } }, { op: "update", id: "a", props: { type: "ellipse" } }]);
    expect(r.errors.join("|")).toMatch(/"type" cannot be changed/);
    const ok = applyOps(base(), [{ op: "update", id: "a", props: { width: 20, height: null } }]);
    expect(ok.errors).toEqual([]);
    expect(ok.doc.children[0].children![0]).toEqual({ id: "a", type: "rectangle", width: 20 });
  });
  it("rejects duplicate ids, slash ids, children on leaves and dangling refs", () => {
    const r = applyOps(base(), [
      { op: "insert", parent: "f", node: { id: "a", type: "rectangle" } },
      { op: "insert", parent: "f", node: { id: "x/y", type: "rectangle" } },
      { op: "insert", parent: "a", node: { id: "z", type: "rectangle" } },
      { op: "insert", parent: "f", node: { id: "r", type: "ref", ref: "ghost" } },
    ]);
    const m = r.errors.join("|");
    expect(m).toMatch(/duplicate id "a"/);
    expect(m).toMatch(/must not contain "\/"/);
    expect(m).toMatch(/cannot have children/);
    expect(m).toMatch(/target "ghost" not found/);
  });
  it("moves, replaces and deletes; refuses to move a node into itself", () => {
    const r = applyOps(base(), [{ op: "move", id: "a", parent: "document" }, { op: "replace", id: "btn", node: { id: "btn2", type: "frame" } }, { op: "delete", id: "f" }]);
    expect(r.errors).toEqual([]);
    expect(r.doc.children.map((c) => c.id)).toEqual(["a"]);
    expect(applyOps(base(), [{ op: "move", id: "f", parent: "btn" }]).errors.join()).toMatch(/into itself/);
  });
  it("writes instance overrides into descendants for path ids", () => {
    const r = applyOps({ ...base(), children: [...base().children, { id: "i", type: "ref", ref: "btn" }] }, [
      { op: "update", id: "i/lbl", props: { content: "Hi" } },
      { op: "replace", id: "i/other", node: { id: "n", type: "icon", icon: "check" } },
    ]);
    expect(r.errors).toEqual([]);
    expect(r.doc.children[1].descendants).toEqual({ lbl: { content: "Hi" }, other: { id: "n", type: "icon", icon: "check" } });
  });
  it("setVariables registers theme axes", () => {
    const r = applyOps(base(), [{ op: "setVariables", variables: { bg: { type: "color", value: [{ value: "#fff", theme: { mode: "light" } }, { value: "#000", theme: { mode: "dark" } }] } } }]);
    expect(r.doc.themes).toEqual({ mode: ["light", "dark"] });
  });
});

describe("lint", () => {
  it("flags invisible text, misplaced fill_container and script nodes", () => {
    const text = JSON.stringify({ version: "2.21", children: [{ id: "f", type: "frame", layout: "none", children: [
      { id: "t", type: "text", content: "x" }, { id: "r", type: "rectangle", width: "fill_container" }, { id: "s", type: "script" },
    ] }] });
    const m = lint(text).map((i) => i.message).join("|");
    expect(m).toMatch(/invisible/);
    expect(m).toMatch(/fill_container used outside/);
    expect(m).toMatch(/never run/);
  });
});
