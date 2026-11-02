import { describe, expect, it } from "vitest";
import { expandRefs } from "../src/core/instances";
import type { PenDocument, PenNode } from "../src/core/schema";

const text = (id: string, content: string, extra: object = {}): PenNode => ({ id, type: "text", content, ...extra });
const find = (n: PenNode, id: string): PenNode | undefined => (n.id === id ? n : n.children?.map((c) => find(c, id)).find(Boolean));

const button: PenNode = { id: "btn", type: "frame", reusable: true, fill: "#2563EB", children: [text("lbl", "Button", { fill: "#FFFFFF" })] };
const card: PenNode = { id: "card", type: "frame", reusable: true, children: [text("title", "Card"), { id: "cta", type: "ref", ref: "btn" }] };
const panel: PenNode = { id: "panel", type: "frame", reusable: true, children: [{ id: "slot", type: "frame", slot: ["btn"], children: [] }] };
const run = (children: PenNode[]) => expandRefs({ version: "2.21", children: [button, card, panel, ...children] } as PenDocument);

describe("expandRefs", () => {
  it("copies the component and prefixes ids with the instance id", () => {
    const { doc } = run([{ id: "i1", type: "ref", ref: "btn" }]);
    const inst = doc.children.find((c) => c.id === "i1")!;
    expect(inst.type).toBe("frame");
    expect(inst.reusable).toBeUndefined();
    expect(inst.children![0].id).toBe("i1/lbl");
  });
  it("overrides root props and descendant props by id and by unique name", () => {
    const { doc } = run([{ id: "i2", type: "ref", ref: "btn", fill: "#10B981", x: 5, y: 6, descendants: { lbl: { content: "Hi", fill: "#FACC15" } } }]);
    const inst = doc.children.find((c) => c.id === "i2")!;
    expect(inst).toMatchObject({ fill: "#10B981", x: 5, y: 6 });
    expect(inst.children![0]).toMatchObject({ content: "Hi", fill: "#FACC15" });
  });
  it("overrides a nested instance's label with the path inner/leaf", () => {
    const { doc, warnings } = run([{ id: "c1", type: "ref", ref: "card", descendants: { "cta/lbl": { content: "Buy now" } } }]);
    expect(warnings).toEqual([]);
    const c = doc.children.find((x) => x.id === "c1")!;
    expect(find(c, "c1/cta/lbl")).toMatchObject({ content: "Buy now" });
  });
  it("replaces a node when the override has a type (node replacement, slot)", () => {
    const { doc } = run([
      { id: "i3", type: "ref", ref: "btn", descendants: { lbl: { type: "icon", id: "ic", icon: "check" } } },
      { id: "p1", type: "ref", ref: "panel", descendants: { slot: { type: "frame", id: "filled", children: [{ id: "b1", type: "ref", ref: "btn" }, { id: "b2", type: "ref", ref: "btn", descendants: { lbl: { content: "Two" } } }] } } },
    ]);
    const i3 = doc.children.find((c) => c.id === "i3")!;
    expect(i3.children![0].type).toBe("icon");
    const p1 = doc.children.find((c) => c.id === "p1")!;
    const filled = p1.children![0];
    expect(filled.children!.map((c) => c.id)).toEqual(["p1/b1", "p1/b2"]);
    expect(find(filled, "p1/b2/lbl")).toMatchObject({ content: "Two" });
  });
  it("warns on missing component, missing descendant and cycles; keeps the original untouched", () => {
    const cyc: PenNode = { id: "cyc", type: "frame", reusable: true, children: [{ id: "self", type: "ref", ref: "cyc" }] };
    const input = { version: "2.21", children: [button, cyc, { id: "x", type: "ref", ref: "nope" }, { id: "y", type: "ref", ref: "btn", descendants: { ghost: { content: "?" } } }, { id: "z", type: "ref", ref: "cyc" }] } as PenDocument;
    const before = JSON.stringify(input);
    const { warnings } = expandRefs(input);
    expect(warnings.join("|")).toMatch(/not found/);
    expect(warnings.join("|")).toMatch(/descendant "ghost" not found/);
    expect(warnings.join("|")).toMatch(/cyclic/);
    expect(JSON.stringify(input)).toBe(before);
  });
});
