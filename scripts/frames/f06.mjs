import { node, cell } from "../lib.mjs";

const R = { type: "rectangle", width: 70, height: 40, fill: "#2563EB" };
const T = { type: "text", content: "Rotate me", fontFamily: "Inter", fontSize: 16, fill: "#111827" };
const pos = { 15: [40, 80], 45: [40, 110], 90: [60, 130] };
const arrow = { type: "path", width: 100, height: 60, viewBox: [0, 0, 100, 60], geometry: "M5 8 H55 V0 L95 40 L55 58 V28 H5 Z", fill: "#EF4444" };
const grp = () => [
  node("rectangle", { name: "g rect", x: 0, y: 0, width: 50, height: 40, fill: "#2563EB" }),
  node("ellipse", { name: "g ellipse", x: 30, y: 20, width: 40, height: 40, fill: "#EF4444" }),
  node("polygon", { name: "g triangle", x: 60, y: 0, width: 36, height: 36, polygonCount: 3, fill: "#10B981" }),
];

export function frame06() {
  const out = [];
  let i = 0;
  const add = (l, content) => { const k = i++; out.push(cell(l, 40 + (k % 5) * 230, 40 + Math.floor(k / 5) * 185, 215, 175, content)); };
  for (const r of [15, 45, 90]) add(`rectangle rotation ${r}`, [node("rectangle", { ...R, name: `rect rot ${r}`, rotation: r, x: pos[r][0], y: pos[r][1] })]);
  for (const r of [15, 45, 90]) add(`text rotation ${r}`, [node("text", { ...T, name: `text rot ${r}`, rotation: r, x: pos[r][0], y: pos[r][1] })]);
  for (const [l, f] of [["no flip", {}], ["flipX true", { flipX: true }], ["flipY true", { flipY: true }], ["flipX + flipY", { flipX: true, flipY: true }]])
    add(`arrow path ${l}`, [node("path", { ...arrow, ...f, name: `arrow ${l}`, x: 20, y: 50 })]);
  for (const o of [1, 0.5, 0.2]) add(`opacity ${o}`, [
    node("rectangle", { name: "backing stripe", x: 0, y: 70, width: 130, height: 20, fill: "#111827" }),
    node("rectangle", { ...R, width: 100, height: 70, opacity: o, name: `rect opacity ${o}`, x: 10, y: 45 }),
  ]);
  add("enabled:false (red hidden, gray visible)", [
    node("rectangle", { ...R, name: "visible gray", fill: "#9CA3AF", x: 0, y: 50 }),
    node("rectangle", { ...R, name: "disabled red", fill: "#EF4444", enabled: false, x: 90, y: 50 }),
  ]);
  add("group with 3 shapes", [node("group", { name: "group", x: 20, y: 50 }, grp())]);
  add("group nested in group", [node("group", { name: "outer group", x: 20, y: 50 }, [
    node("rectangle", { name: "outer rect", x: 0, y: 0, width: 120, height: 70, fill: "#E5E7EB" }),
    node("group", { name: "inner group", x: 10, y: 10 }, grp()),
  ])]);
  add("group with outer shadow effect", [node("group", { name: "group shadow", x: 20, y: 50, effect: { type: "shadow", shadowType: "outer", offset: { x: 4, y: 6 }, blur: 10, color: "#00000066" } }, grp())]);
  return out;
}
