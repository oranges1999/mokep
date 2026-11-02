import { loadYoga, type Yoga, type Node as YNode } from "yoga-layout/load";
import { PenDocument, PenNode, Theme } from "./schema";
import { defaultTheme, rv } from "./variables";

export interface Box { x: number; y: number; w: number; h: number; }
export type MeasureText = (node: PenNode, maxWidth: number | undefined, theme: Theme) => { w: number; h: number };
export interface LayoutResult { boxes: Map<string, Box>; warnings: string[]; }

let yoga: Yoga | null = null;
let config: ReturnType<Yoga["Config"]["create"]> | null = null;
export async function initLayout() {
  if (yoga) return;
  yoga = await loadYoga();
  config = yoga.Config.create();
  config.setPointScaleFactor(0);
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

interface Size { kind: "px" | "fit" | "fill"; v: number; fallback?: number; }
function parseSize(v: unknown): Size {
  if (typeof v === "number") return { kind: "px", v };
  if (typeof v === "string") {
    const m = /^(fit_content|fill_container)(?:\((\d+(?:\.\d+)?)\))?$/.exec(v);
    if (m) return { kind: m[1] === "fit_content" ? "fit" : "fill", v: 0, fallback: m[2] ? Number(m[2]) : undefined };
  }
  return { kind: "fit", v: 0 };
}

export function computeLayout(doc: PenDocument, measure: MeasureText, themeOverride: Theme = {}): LayoutResult {
  if (!yoga) throw new Error("initLayout() must be awaited first");
  const Y = yoga;
  const boxes = new Map<string, Box>();
  const warnings: string[] = [];
  const base = { ...defaultTheme(doc), ...themeOverride };

  interface Built { node: PenNode; y: YNode; kids: Built[]; theme: Theme; }

  const build = (n: PenNode, parent: Built | null, parentTheme: Theme): Built | null => {
    const theme = n.theme ? { ...parentTheme, ...n.theme } : parentTheme;
    const R = <T,>(v: T) => rv(doc, v, theme);
    if (R(n.enabled ?? true) === false) return null;
    const yn = Y.Node.create(config!);
    const b: Built = { node: n, y: yn, kids: [], theme };
    const isContainer = n.type === "frame" || n.type === "group";
    const layout = n.type === "frame" ? (R(n.layout) ?? "horizontal") : "none";
    const flex = isContainer && layout !== "none";
    const parentLayout = parent ? (parent.node.type === "frame" ? (rv(doc, parent.node.layout, parent.theme) ?? "horizontal") : "none") : "none";
    const inFlex = !!parent && parentLayout !== "none" && n.layoutPosition !== "absolute";
    const parentRow = parentLayout === "horizontal";

    yn.setFlexDirection(layout === "vertical" ? Y.FLEX_DIRECTION_COLUMN : Y.FLEX_DIRECTION_ROW);
    yn.setAlignItems(Y.ALIGN_FLEX_START);
    yn.setFlexShrink(0);
    if (flex) {
      const gap = num(R(n.gap));
      if (gap) yn.setGap(Y.GUTTER_ALL, gap);
      const pad = R(n.padding);
      const p = (e: number, v: unknown) => yn.setPadding(e, num(R(v)));
      if (Array.isArray(pad)) {
        const [t, r, bt, l] = pad.length === 2 ? [pad[0], pad[1], pad[0], pad[1]] : pad;
        p(Y.EDGE_TOP, t); p(Y.EDGE_RIGHT, r); p(Y.EDGE_BOTTOM, bt); p(Y.EDGE_LEFT, l);
      } else if (pad !== undefined) yn.setPadding(Y.EDGE_ALL, num(pad));
      const jc = R(n.justifyContent) ?? "start";
      yn.setJustifyContent({ start: Y.JUSTIFY_FLEX_START, center: Y.JUSTIFY_CENTER, end: Y.JUSTIFY_FLEX_END, space_between: Y.JUSTIFY_SPACE_BETWEEN, space_around: Y.JUSTIFY_SPACE_AROUND }[jc as string] ?? Y.JUSTIFY_FLEX_START);
      const ai = R(n.alignItems) ?? "start";
      yn.setAlignItems({ start: Y.ALIGN_FLEX_START, center: Y.ALIGN_CENTER, end: Y.ALIGN_FLEX_END }[ai as string] ?? Y.ALIGN_FLEX_START);
    }

    const placeAbs = !!parent && !inFlex;
    if (placeAbs) {
      yn.setPositionType(Y.POSITION_TYPE_ABSOLUTE);
      yn.setPosition(Y.EDGE_LEFT, num(n.x));
      yn.setPosition(Y.EDGE_TOP, num(n.y));
    }

    const isText = n.type === "text";
    const growth = isText ? ((R(n.textGrowth) as string) ?? "auto") : "";
    const sw = parseSize(R(n.width)), sh = parseSize(R(n.height));
    const setDim = (axis: "w" | "h", s: Size) => {
      const setPx = axis === "w" ? (v: number) => yn.setWidth(v) : (v: number) => yn.setHeight(v);
      const setAuto = axis === "w" ? () => yn.setWidthAuto() : () => yn.setHeightAuto();
      const setPct = axis === "w" ? (v: number) => yn.setWidthPercent(v) : (v: number) => yn.setHeightPercent(v);
      if (s.kind === "px") return setPx(s.v);
      if (s.kind === "fit") return setAuto();
      if (!parent) return setPx(s.fallback ?? 0);
      if (placeAbs) return setPct(100);
      const isMain = (axis === "w") === parentRow;
      setAuto();
      if (isMain) { yn.setFlexGrow(1); yn.setFlexBasis(0); yn.setFlexShrink(1); }
      else yn.setAlignSelf(Y.ALIGN_STRETCH);
    };

    if (isText) {
      if (growth === "auto") { setDim("w", { kind: "fit", v: 0 }); setDim("h", { kind: "fit", v: 0 }); }
      else if (growth === "fixed-width") { setDim("w", sw); setDim("h", { kind: "fit", v: 0 }); }
      else { setDim("w", sw); setDim("h", sh); }
      if (growth !== "fixed-width-height") {
        yn.setMeasureFunc((w, wm) => {
          const maxW = growth === "auto" || wm === Y.MEASURE_MODE_UNDEFINED ? undefined : w;
          const m = measure(n, maxW, theme);
          return { width: Math.ceil(m.w), height: Math.ceil(m.h) };
        });
      }
    } else {
      setDim("w", sw); setDim("h", sh);
      if (sw.kind === "fit" && sw.fallback !== undefined && !(isContainer && (n.children?.length ?? 0))) yn.setWidth(sw.fallback);
      if (sh.kind === "fit" && sh.fallback !== undefined && !(isContainer && (n.children?.length ?? 0))) yn.setHeight(sh.fallback);
    }

    if (isContainer) {
      for (const c of n.children ?? []) {
        const cb = build(c, b, theme);
        if (cb) { yn.insertChild(cb.y, b.kids.length); b.kids.push(cb); }
      }
    }
    return b;
  };

  const collect = (b: Built, isRoot: boolean) => {
    const l = b.y.getComputedLayout();
    const n = b.node;
    boxes.set(n.id, { x: isRoot ? num(n.x) : l.left, y: isRoot ? num(n.y) : l.top, w: l.width, h: l.height });
    b.kids.forEach((k) => collect(k, false));
    if (n.type === "group") {
      let w = 0, h = 0;
      for (const k of b.kids) { const kb = boxes.get(k.node.id)!; w = Math.max(w, kb.x + kb.w); h = Math.max(h, kb.y + kb.h); }
      const gb = boxes.get(n.id)!; gb.w = w; gb.h = h;
    }
  };

  for (const top of doc.children) {
    const b = build(top, null, base);
    if (!b) continue;
    b.y.calculateLayout(undefined, undefined, Y.DIRECTION_LTR);
    collect(b, true);
    const free = (x: Built) => { x.kids.forEach(free); x.y.free(); };
    free(b);
  }
  return { boxes, warnings };
}
