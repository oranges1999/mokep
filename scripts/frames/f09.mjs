import { node, cell } from "../lib.mjs";

const icons = [
  ["lucide check 24 blue", { library: "lucide", icon: "check", width: 24, height: 24, fill: "#2563EB" }],
  ["lucide home (house) 32 red", { library: "lucide", icon: "house", width: 32, height: 32, fill: "#EF4444" }],
  ["lucide settings 48 green", { library: "lucide", icon: "settings", width: 48, height: 48, fill: "#10B981" }],
  ["Material Symbols Outlined search 32", { library: "Material Symbols Outlined", icon: "search", width: 32, height: 32, fill: "#111827" }],
  ["Material Symbols Rounded favorite 40 weight 700", { library: "Material Symbols Rounded", icon: "favorite", width: 40, height: 40, weight: 700, fill: "#EC4899" }],
  ["phosphor heart 40 orange", { library: "phosphor", icon: "heart", width: 40, height: 40, fill: "#F59E0B" }],
];
const images = [
  ["image fill mode cover", { mode: "cover" }],
  ["image fill mode contain", { mode: "contain" }],
  ["image fill mode stretch", { mode: "stretch" }],
  ["image fill cropped (transform right half)", { mode: "cover", transform: [2, 0, 0, 1, -1, 0] }],
];
const sty = { fontFamily: "Inter", fontSize: 14, width: 260, height: 110 };

export function frame09() {
  const out = [];
  icons.forEach(([l, n], i) => out.push(cell(l, 40 + i * 190, 40, 170, 100, [node("icon", { name: l, x: 0, y: 44, ...n })])));
  images.forEach(([l, m], i) => out.push(cell(l, 40 + i * 285, 190, 270, 160, [node("rectangle", { name: l, x: 0, y: 34, width: 240, height: 110, fill: { type: "image", url: "./test-image.jpg", ...m }, stroke: "#9CA3AF", strokeWidth: 1 })])));
  out.push(cell("note node", 40, 400, 270, 160, [node("note", { name: "sample note", x: 0, y: 34, content: "Sample note: remember to review the renderer output.", ...sty })]));
  out.push(cell("prompt node", 325, 400, 270, 160, [node("prompt", { name: "sample prompt", x: 0, y: 34, content: "Generate a hero section with a bold headline.", ...sty })]));
  out.push(cell("context node", 610, 400, 270, 160, [node("context", { name: "sample context", x: 0, y: 34, content: "Context: brand colors are blue and white, tone is friendly.", ...sty })]));
  return out;
}
