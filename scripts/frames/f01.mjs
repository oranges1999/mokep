import { node, cell, grid } from "../lib.mjs";

const B = "#2563EB";
const items = [
  ["rectangle no radius", { type: "rectangle", width: 120, height: 100 }],
  ["rectangle cornerRadius 16", { type: "rectangle", width: 120, height: 100, cornerRadius: 16 }],
  ["rectangle cornerRadius [0,24,48,8]", { type: "rectangle", width: 120, height: 100, cornerRadius: [0, 24, 48, 8] }],
  ["ellipse full circle", { type: "ellipse", width: 100, height: 100 }],
  ["ellipse oval 140x80", { type: "ellipse", width: 140, height: 80 }],
  ["ellipse innerRadius 0.5", { type: "ellipse", width: 100, height: 100, innerRadius: 0.5 }],
  ["ellipse startAngle 0 sweepAngle 270", { type: "ellipse", width: 100, height: 100, startAngle: 0, sweepAngle: 270 }],
  ["ellipse sweepAngle -90", { type: "ellipse", width: 100, height: 100, startAngle: 0, sweepAngle: -90 }],
  ["polygon polygonCount 3", { type: "polygon", width: 100, height: 100, polygonCount: 3 }],
  ["polygon polygonCount 5", { type: "polygon", width: 100, height: 100, polygonCount: 5 }],
  ["polygon polygonCount 8", { type: "polygon", width: 100, height: 100, polygonCount: 8 }],
  ["polygon 5 cornerRadius 12", { type: "polygon", width: 100, height: 100, polygonCount: 5, cornerRadius: 12 }],
  ["path star (svg)", { type: "path", width: 100, height: 100, viewBox: [0, 0, 100, 100], geometry: "M50 5 L61 38 L96 38 L68 59 L79 93 L50 72 L21 93 L32 59 L4 38 L39 38 Z" }],
  ["path heart (svg)", { type: "path", width: 100, height: 100, viewBox: [0, 0, 100, 100], geometry: "M50 88 C10 55 0 30 22 15 C36 6 48 14 50 24 C52 14 64 6 78 15 C100 30 90 55 50 88 Z" }],
  ["path fillRule evenodd (hole)", { type: "path", width: 100, height: 100, viewBox: [0, 0, 100, 100], fillRule: "evenodd", geometry: "M10 10 H90 V90 H10 Z M35 35 H65 V65 H35 Z" }],
];

export function frame01() {
  return items.map(([l, n], i) => {
    const [x, y, w, h] = grid(i, 6, 170, 170, 190, 200);
    const { type, ...rest } = n;
    return cell(l, x, y, w, h, [node(type, { name: l, fill: B, x: 0, y: 40, ...rest })]);
  });
}
