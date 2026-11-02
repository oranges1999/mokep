import { node, cell } from "../lib.mjs";

const cols = ["#2563EB", "#EF4444", "#10B981"];
const kids = (sizes) => sizes.map(([w, h], k) => node("rectangle", { name: `child ${k + 1}`, width: w, height: h, fill: cols[k] }));
const G = { type: "frame", fill: "#F3F4F6", stroke: "#9CA3AF", strokeWidth: 1 };
const S3 = [[32, 32], [32, 32], [32, 32]];
const J3 = [[30, 30], [30, 30], [30, 30]];
const txt = (name, content, extra) => node("text", { name, content, fontFamily: "Inter", fontSize: 12, fill: "#111827", ...extra });

const flexCells = [];
for (const g of [0, 8, 24]) flexCells.push([`horizontal layout gap ${g}`, { ...G, layout: "horizontal", gap: g }, S3]);
for (const g of [0, 8, 24]) flexCells.push([`vertical layout gap ${g}`, { ...G, layout: "vertical", gap: g }, [[28, 24], [28, 24], [28, 24]]]);
flexCells.push(["padding 16 (single value)", { ...G, layout: "horizontal", padding: 16 }, [[40, 40]]]);
flexCells.push(["padding [8,24] (v,h)", { ...G, layout: "horizontal", padding: [8, 24] }, [[40, 40]]]);
flexCells.push(["padding [4,8,12,16] (t,r,b,l)", { ...G, layout: "horizontal", padding: [4, 8, 12, 16] }, [[40, 40]]]);

const justify = ["start", "center", "end", "space_between", "space_around"].map((j) => [`justifyContent ${j}`, { ...G, layout: "horizontal", width: 200, height: 50, justifyContent: j, alignItems: "center" }, J3]);
const align = ["start", "center", "end"].map((a) => [`alignItems ${a} (heights 20/40/30)`, { ...G, layout: "horizontal", width: 200, height: 70, gap: 8, alignItems: a }, [[30, 20], [30, 40], [30, 30]]]);

export function frame05() {
  const out = [];
  let i = 0;
  const pos = () => { const k = i++; return [40 + (k % 5) * 230, 40 + Math.floor(k / 5) * 185]; };
  const add = (l, content) => { const [x, y] = pos(); out.push(cell(l, x, y, 215, 175, content)); };
  const frameCell = ([l, props, sizes]) => { const { type, ...rest } = props; add(l, [node("frame", { name: l, x: 0, y: 34, ...rest }, kids(sizes))]); };

  flexCells.forEach(frameCell);

  add("fill_container child among fixed (parent w200)", [node("frame", { ...G, name: "fill_container demo", x: 0, y: 34, layout: "horizontal", width: 200, height: 40, gap: 8 }, [
    node("rectangle", { name: "fixed 40", width: 40, height: 40, fill: cols[0] }),
    node("rectangle", { name: "fill_container", width: "fill_container", height: 40, fill: cols[1] }),
    node("rectangle", { name: "fixed 30", width: 30, height: 40, fill: cols[2] }),
  ])]);
  add("parent fit_content hugs fixed children", [node("frame", { ...G, name: "fit_content demo", x: 0, y: 34, layout: "horizontal", width: "fit_content", height: "fit_content", padding: 8, gap: 8 }, [
    ...kids([[30, 30], [50, 20]]), txt("hug text", "Hug", { fontSize: 14 }),
  ])]);

  justify.forEach(frameCell);
  align.forEach(frameCell);

  for (const cl of [true, false]) {
    add(`clip ${cl} with overflowing child`, [node("frame", { ...G, name: "clip " + cl, x: 20, y: 44, layout: "none", width: 100, height: 60, clip: cl }, [
      node("rectangle", { name: "overflow child 140x100", x: 30, y: 20, width: 140, height: 100, fill: "#F59E0B" }),
    ])]);
  }

  add("layoutPosition absolute badge on card corner", [node("frame", { name: "card", x: 10, y: 44, layout: "vertical", gap: 6, padding: 12, width: 170, height: 80, fill: "#FFFFFF", stroke: "#9CA3AF", strokeWidth: 1, cornerRadius: 8 }, [
    txt("card title", "Card title", { fontSize: 14, fontWeight: "600" }),
    txt("card body", "Body text", { fill: "#6B7280" }),
    node("ellipse", { name: "absolute badge", layoutPosition: "absolute", x: 150, y: -10, width: 24, height: 24, fill: "#EF4444" }),
  ])]);

  add("3-level nesting: card > header row > avatar + text column", [node("frame", { name: "card L1", x: 0, y: 34, layout: "vertical", gap: 8, padding: 12, width: 200, fill: "#FFFFFF", stroke: "#9CA3AF", strokeWidth: 1, cornerRadius: 8 }, [
    node("frame", { name: "header row L2", layout: "horizontal", gap: 10, alignItems: "center", width: "fill_container" }, [
      node("ellipse", { name: "avatar", width: 36, height: 36, fill: "#2563EB" }),
      node("frame", { name: "text column L3", layout: "vertical", gap: 2 }, [
        txt("name", "Nguyen Huy", { fontSize: 13, fontWeight: "600" }),
        txt("role", "Designer", { fontSize: 11, fill: "#6B7280" }),
      ]),
    ]),
    txt("card body", "Card body text", { fill: "#374151" }),
  ])]);
  return out;
}
