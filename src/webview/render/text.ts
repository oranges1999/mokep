import { CanvasTextMetrics, Container, Graphics, Text, TextStyle } from "pixi.js";
import { PenNode } from "../../core/schema";
import { DEFAULT_FONT } from "../fonts";

type R = <T>(v: T) => T;

export interface TextSpec {
  content: string; family: string; size: number; weight: string; italic: boolean;
  letterSpacing: number; lineHeight?: number; underline: boolean; strike: boolean;
  align: "left" | "center" | "right" | "justify"; valign: "top" | "middle" | "bottom";
  growth: "auto" | "fixed-width" | "fixed-width-height"; fill?: string;
}

export function specOf(n: PenNode, R: R): TextSpec {
  const fill = (() => {
    const f: any = Array.isArray(n.fill) ? n.fill[0] : n.fill;
    const v: any = R(f);
    if (typeof v === "string") return v;
    if (v?.type === "color") return R(v.color) as string;
    if (v?.type === "gradient") return R(v.colors?.[0]?.color) as string;
    return undefined;
  })();
  const size = Number(R(n.fontSize ?? 14));
  return {
    content: String(R(n.content ?? "")),
    family: String(R(n.fontFamily ?? DEFAULT_FONT)),
    size,
    weight: String(R(n.fontWeight ?? "normal")),
    italic: R(n.fontStyle) === "italic",
    letterSpacing: Number(R(n.letterSpacing ?? 0)),
    lineHeight: n.lineHeight === undefined ? undefined : Number(R(n.lineHeight)) * size,
    underline: !!R(n.underline ?? false),
    strike: !!R(n.strikethrough ?? false),
    align: (R(n.textAlign ?? "left") as TextSpec["align"]),
    valign: (R(n.textAlignVertical ?? "top") as TextSpec["valign"]),
    growth: (R(n.textGrowth ?? "auto") as TextSpec["growth"]),
    fill,
  };
}

export function styleOf(s: TextSpec, wrapWidth?: number): TextStyle {
  return new TextStyle({
    fontFamily: `"${s.family}", "${DEFAULT_FONT}", sans-serif`,
    fontSize: s.size,
    fontWeight: s.weight as any,
    fontStyle: s.italic ? "italic" : "normal",
    letterSpacing: s.letterSpacing,
    ...(s.lineHeight !== undefined ? { lineHeight: s.lineHeight } : {}),
    align: s.align,
    wordWrap: wrapWidth !== undefined,
    wordWrapWidth: wrapWidth ?? 0,
    breakWords: false,
    fill: s.fill ?? "#000000",
  });
}

export function measureSpec(s: TextSpec, maxWidth?: number): { w: number; h: number } {
  const m = CanvasTextMetrics.measureText(s.content || " ", styleOf(s, maxWidth));
  return { w: m.width, h: m.height };
}

export interface TextRegistry { texts: Text[]; }

export function drawText(c: Container, s: TextSpec, box: { w: number; h: number }, reg: TextRegistry, resolution: number) {
  if (!s.fill) return;
  const wrap = s.growth === "auto" ? undefined : box.w;
  const style = styleOf(s, wrap);
  const t = new Text({ text: s.content, style, resolution });
  const m = CanvasTextMetrics.measureText(s.content || " ", style);
  const fixedW = s.growth !== "auto";
  const blockW = fixedW ? Math.min(m.width, box.w) : m.width;
  let x = 0;
  if (fixedW) x = s.align === "center" ? (box.w - blockW) / 2 : s.align === "right" ? box.w - blockW : 0;
  let y = 0;
  if (s.growth === "fixed-width-height") y = s.valign === "middle" ? (box.h - m.height) / 2 : s.valign === "bottom" ? box.h - m.height : 0;
  t.position.set(x, y);
  c.addChild(t);
  reg.texts.push(t);

  if (s.underline || s.strike) {
    const g = new Graphics();
    const lh = m.lineHeight;
    const ascent = m.fontProperties.ascent, descent = m.fontProperties.descent;
    const th = Math.max(1, s.size / 14);
    m.lines.forEach((_, i) => {
      const lw = m.lineWidths[i];
      const lx = x + (s.align === "center" ? (blockW - lw) / 2 : s.align === "right" ? blockW - lw : 0);
      const base = y + i * lh + (lh - (ascent + descent)) / 2 + ascent;
      if (s.underline) g.rect(lx, base + s.size * 0.1, lw, th).fill(s.fill!);
      if (s.strike) g.rect(lx, base - s.size * 0.3, lw, th).fill(s.fill!);
    });
    c.addChild(g);
  }
}
