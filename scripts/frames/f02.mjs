import { node, cell, grid } from "../lib.mjs";

const cs = [{ color: "#EF4444", position: 0 }, { color: "#FACC15", position: 0.5 }, { color: "#3B82F6", position: 1 }];
const R = { type: "rectangle", width: 140, height: 100 };
const grad = (o) => ({ type: "gradient", enabled: true, ...o });
const blend = (bm, color) => [`fill blendMode ${bm} over orange`, { type: "ellipse", width: 100, height: 100, x: 30, y: 40, fill: { type: "color", color, enabled: true, blendMode: bm } }, "#F59E0B"];

const items = [
  ["solid hex #EF4444", { ...R, fill: "#EF4444" }],
  ["color with alpha #EF444480 over dark", { ...R, fill: "#EF444480" }, "#111827"],
  ["fill bound to $color.primary", { ...R, fill: "$color.primary" }],
  ["linear gradient rotation 45, 3 stops", { ...R, fill: grad({ gradientType: "linear", rotation: 45, size: { height: 1 }, colors: cs }) }],
  ["radial gradient, 3 stops", { ...R, fill: grad({ gradientType: "radial", rotation: 0, size: { width: 1, height: 1 }, colors: cs }) }],
  ["angular gradient, 3 stops", { ...R, fill: grad({ gradientType: "angular", rotation: 0, size: { width: 1, height: 1 }, colors: [...cs, { color: "#EF4444", position: 1 }].map((c, i, a) => ({ ...c, position: i / (a.length - 1) })) }) }],
  ["mesh_gradient 3x3", { ...R, fill: { type: "mesh_gradient", enabled: true, columns: 3, rows: 3, colors: ["#EF4444", "#FACC15", "#22C55E", "#3B82F6", "#FFFFFF", "#A855F7", "#14B8A6", "#F97316", "#111827"], points: [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]] } }],
  ["3 stacked fills (solid+gradient a+radial a)", { ...R, fill: ["#10B981", grad({ gradientType: "linear", rotation: 90, size: { height: 1 }, colors: [{ color: "#FFFFFF99", position: 0 }, { color: "#1D4ED899", position: 1 }] }), grad({ gradientType: "radial", rotation: 0, size: { width: 1, height: 1 }, colors: [{ color: "#FACC15CC", position: 0 }, { color: "#FACC1500", position: 1 }] })] }],
  blend("multiply", "#3B82F6"),
  blend("screen", "#3B82F6"),
  blend("overlay", "#1E3A8A"),
  ["fill enabled:false (red hidden, blue visible)", { ...R, fill: ["#2563EB", { type: "color", color: "#EF4444", enabled: false }], stroke: "#9CA3AF", strokeWidth: 1 }],
];

export function frame02() {
  return items.map(([l, n, backing], i) => {
    const [x, y, w, h] = grid(i, 6, 170, 170, 190, 200);
    const { type, x: nx, y: ny, ...rest } = n;
    const content = [];
    if (backing) content.push(node("rectangle", { name: "backing", x: 0, y: 40, width: 140, height: 100, fill: backing }));
    content.push(node(type, { name: l, x: nx ?? 0, y: ny ?? 40, ...rest }));
    return cell(l, x, y, w, h, content);
  });
}
