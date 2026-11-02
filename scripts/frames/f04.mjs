import { node, cell } from "../lib.mjs";

const T = { fill: "#111827", fontFamily: "Inter", fontSize: 22 };
const V = "Thiết kế giao diện đẹp và rõ ràng";
const para = "The quick brown fox jumps over the lazy dog and keeps running far away from here.";
const P2 = { ...T, fontSize: 12, lineHeight: 1.3, textGrowth: "fixed-width", width: 250, content: para };
const box = (w, h) => ({ w, h });
const FA = { ...T, textGrowth: "fixed-width-height", width: 250, height: 80, fontSize: 14 };
const fam = (f) => [`fontFamily ${f}`, { ...T, content: "Aa Thiết kế 123", fontFamily: f }];

const items = [
  fam("Inter"), fam("Roboto"), fam("Be Vietnam Pro"), fam("Playfair Display"), fam("JetBrains Mono"),
  ...["300", "400", "600", "800"].map((w) => [`fontWeight ${w}`, { ...T, content: `Weight ${w}`, fontWeight: w }]),
  ["fontStyle italic", { ...T, content: "Italic text", fontStyle: "italic" }],
  ["underline true", { ...T, content: "Underlined text", underline: true }],
  ["strikethrough true", { ...T, content: "Strikethrough text", strikethrough: true }],
  ["letterSpacing -1", { ...T, content: "Letter spacing -1", letterSpacing: -1 }],
  ["letterSpacing 4", { ...T, content: "Letter spacing 4", letterSpacing: 4 }],
  ["lineHeight 1 (2 lines)", { ...P2, lineHeight: 1 }, box(250, 40)],
  ["lineHeight 2 (2 lines)", { ...P2, lineHeight: 2 }, box(250, 60)],
  ...["left", "center", "right", "justify"].map((a) => [`textAlign ${a}`, { ...P2, textAlign: a }, box(250, 56)]),
  ...["top", "middle", "bottom"].map((a) => [`textAlignVertical ${a} (fixed-width-height)`, { ...FA, content: `Vertical ${a}`, textAlignVertical: a }, box(250, 80)]),
  ["textGrowth auto (single line, no wrap)", { ...T, fontSize: 14, textGrowth: "auto", content: "Auto growth: this stays on one single line" }],
  ["textGrowth fixed-width (wraps)", { ...T, fontSize: 14, textGrowth: "fixed-width", width: 250, content: para + " " + para }],
  ["textGrowth fixed-width-height (overflows)", { ...T, fontSize: 14, textGrowth: "fixed-width-height", width: 250, height: 30, content: para + " " + para }, box(250, 30)],
  ["Vietnamese diacritics", { ...T, fontSize: 18, textGrowth: "fixed-width", width: 250, content: V }],
  ["href link", { ...T, fontSize: 16, content: "Open pen.dev", href: "https://pen.dev", fill: "#2563EB", underline: true }],
];

export function frame04() {
  return items.map(([l, n, b], i) => {
    const content = [];
    if (b) content.push(node("rectangle", { name: "text box bounds", x: 0, y: 34, width: b.w, height: b.h, fill: "#F3F4F6" }));
    content.push(node("text", { name: l, x: 0, y: 34, ...n }));
    return cell(l, 40 + (i % 4) * 285, 40 + Math.floor(i / 4) * 135, 270, 125, content);
  });
}
