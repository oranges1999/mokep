import { node, cell, grid } from "../lib.mjs";

const R = { type: "rectangle", width: 100, height: 80, fill: "#DBEAFE" };
const S = { stroke: "#1D4ED8", strokeWidth: 8 };
const L = { type: "path", width: 100, height: 90, viewBox: [0, 0, 100, 90], geometry: "M15 75 L50 15 L85 75", stroke: "#DC2626", strokeWidth: 14 };
const sh = { type: "shadow", shadowType: "outer", offset: { x: 4, y: 6 }, blur: 12, color: "#00000066" };
const rainbow = { type: "gradient", gradientType: "linear", rotation: 90, colors: [{ color: "#EF4444", position: 0 }, { color: "#FACC15", position: 0.33 }, { color: "#22C55E", position: 0.66 }, { color: "#3B82F6", position: 1 }] };

const items = [
  ["strokeAlignment inner, 8px", { ...R, ...S, strokeAlignment: "inner" }],
  ["strokeAlignment center, 8px", { ...R, ...S, strokeAlignment: "center" }],
  ["strokeAlignment outer, 8px", { ...R, ...S, strokeAlignment: "outer" }],
  ["strokeWidth per side t1 r4 b8 l0", { ...R, ...S, strokeWidth: { top: 1, right: 4, bottom: 8, left: 0 } }],
  ["stroke gradient fill, 8px", { ...R, stroke: { type: "gradient", gradientType: "linear", rotation: 45, colors: [{ color: "#EF4444", position: 0 }, { color: "#FACC15", position: 0.5 }, { color: "#3B82F6", position: 1 }] }, strokeWidth: 8 }],
  ["path strokeLinecap round", { ...L, strokeLinecap: "round" }],
  ["path strokeLinecap square", { ...L, strokeLinecap: "square" }],
  ["path strokeLinejoin bevel (butt cap)", { ...L, strokeLinejoin: "bevel" }],
  ["path strokeLinejoin round (butt cap)", { ...L, strokeLinejoin: "round" }],
  ["effect shadow outer", { ...R, effect: sh }],
  ["effect shadow inner", { ...R, stroke: "#9CA3AF", strokeWidth: 1, effect: { ...sh, shadowType: "inner" } }],
  ["effect multiple shadows", { ...R, effect: [sh, { type: "shadow", shadowType: "outer", offset: { x: -6, y: -6 }, blur: 8, color: "#2563EB99" }, { type: "shadow", shadowType: "inner", offset: { x: 0, y: 4 }, blur: 6, color: "#EF444499" }] }],
  ["effect blur (layer) radius 4", { type: "ellipse", width: 90, height: 90, fill: "#2563EB", effect: { type: "blur", radius: 4 } }],
  ["effect background_blur radius 10 over colors", null],
];

export function frame03() {
  return items.map(([l, n], i) => {
    const [x, y, w, h] = grid(i, 6, 170, 170, 190, 200);
    if (!n) {
      return cell(l, x, y, w, h, [
        node("rectangle", { name: "color stripes", x: 0, y: 40, width: 140, height: 100, fill: rainbow }),
        node("ellipse", { name: "circle behind", x: 20, y: 60, width: 60, height: 60, fill: "#111827" }),
        node("rectangle", { name: l, x: 70, y: 40, width: 70, height: 100, fill: "#FFFFFF33", effect: { type: "background_blur", radius: 10 } }),
      ]);
    }
    const { type, ...rest } = n;
    return cell(l, x, y, w, h, [node(type, { name: l, x: 10, y: 44, ...rest })]);
  });
}
