import "pixi.js/advanced-blend-modes";
import { ColorMatrixFilter, Container, FillGradient, Graphics, GraphicsPath, Rectangle, Sprite, Texture, type Filter } from "pixi.js";
import { iconSvg, type IconSet } from "../assets";
import { PenDocument, PenNode, Theme } from "../../core/schema";
import { defaultTheme, rv } from "../../core/variables";
import { Box, LayoutResult } from "../../core/layout";
import { drawText, specOf, TextRegistry } from "./text";
import { parseColor } from "./color";
import { angularMesh, backdropBlurFilter, gaussian, meshGradientMesh, setBackdropRadius } from "./shaders";

export { parseColor };

interface Ctx {
  doc: PenDocument; theme: Theme; warn: (m: string) => void; boxes: Map<string, Box>; reg: TextRegistry; res: number;
  scalers: Array<(zoom: number) => void>; noEffects?: boolean;
  icons: Map<string, IconSet>; images: Map<string, Texture | null>; nodes: Map<string, Container>;
  data: Map<string, PenNode>; ids: Map<Container, string>;
}

export interface Scene {
  root: Container; frames: Map<string, { node: PenNode; box: Box }>; warnings: string[]; texts: TextRegistry["texts"];
  /** Called with the current zoom so screen-space filters (blur) keep a constant size relative to the design. */
  rescale(zoom: number): void;
  nodes: Map<string, Container>;
  data: Map<string, PenNode>;
  ids: Map<Container, string>;
}

const boxOf = (n: PenNode, ctx: Ctx): Box => ctx.boxes.get(n.id) ?? { x: Number(n.x) || 0, y: Number(n.y) || 0, w: typeof n.width === "number" ? n.width : 0, h: typeof n.height === "number" ? n.height : 0 };

export interface SceneAssets { icons: Map<string, IconSet>; images: Map<string, Texture | null>; }

export function buildScene(doc: PenDocument, layout: LayoutResult, assets: SceneAssets, resolution = 2, theme: Theme = {}): Scene {
  const root = new Container();
  const warnings: string[] = [...layout.warnings];
  const warned = new Set<string>();
  const warn = (m: string) => { if (!warned.has(m)) { warned.add(m); warnings.push(m); } };
  const reg: TextRegistry = { texts: [] };
  const scalers: Ctx["scalers"] = [];
  const ctx: Ctx = { doc, theme: { ...defaultTheme(doc), ...theme }, warn, boxes: layout.boxes, reg, res: resolution, scalers, icons: assets.icons, images: assets.images, nodes: new Map(), data: new Map(), ids: new Map() };
  const frames = new Map<string, { node: PenNode; box: Box }>();
  for (const n of doc.children) {
    const c = addNode(root, n, ctx);
    if (c) frames.set(n.id, { node: n, box: boxOf(n, ctx) });
  }
  return { root, frames, warnings, texts: reg.texts, rescale: (z) => scalers.forEach((f) => f(z)), nodes: ctx.nodes, data: ctx.data, ids: ctx.ids };
}

const asList = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const BLEND: Record<string, string> = { linearBurn: "linear-burn", colorBurn: "color-burn", light: "lighten", linearDodge: "linear-dodge", colorDodge: "color-dodge", softLight: "soft-light", hardLight: "hard-light" };
const blendName = (bm?: string) => (!bm || bm === "normal" ? "normal" : BLEND[bm] ?? bm);

function addNode(parent: Container, n: PenNode, ctx0: Ctx): Container | null {
  const enabled = rv(ctx0.doc, n.enabled ?? true, ctx0.theme);
  if (enabled === false) return null;
  const ctx: Ctx = n.theme ? { ...ctx0, theme: { ...ctx0.theme, ...n.theme } } : ctx0;
  const R = <T,>(v: T) => rv(ctx.doc, v, ctx.theme);
  const box = boxOf(n, ctx);
  const c = new Container();
  c.label = n.name ?? n.id;
  if (!ctx.noEffects) { ctx.nodes.set(n.id, c); ctx.data.set(n.id, n); ctx.ids.set(c, n.id); }
  c.position.set(box.x, box.y);
  const rot = R(n.rotation ?? 0) as number;
  if (rot) c.rotation = (-rot * Math.PI) / 180;
  const op = R(n.opacity ?? 1) as number;
  if (op !== 1) c.alpha = op;
  const flipX = R(n.flipX ?? false), flipY = R(n.flipY ?? false);
  if (flipX) { c.scale.x = -1; c.position.x += box.w; }
  if (flipY) { c.scale.y = -1; c.position.y += box.h; }
  parent.addChild(c);

  const def = shapeDef(n, box, ctx);
  switch (n.type) {
    case "frame":
    case "rectangle":
    case "ellipse":
    case "polygon":
    case "path":
      drawShape(c, n, box, ctx, def);
      if (!ctx.noEffects) innerShadows(c, n, box, ctx, def);
      if (n.type === "frame") {
        if (R(n.clip ?? false)) {
          const m = new Graphics();
          rectPath(m, box, cornerRadii(n, ctx));
          m.fill(0xffffff);
          c.addChild(m);
          c.mask = m;
        }
        for (const ch of n.children ?? []) addNode(c, ch, ctx);
      }
      break;
    case "group":
      for (const ch of n.children ?? []) addNode(c, ch, ctx);
      break;
    case "text":
      drawText(c, specOf(n, R), box, ctx.reg, ctx.res);
      break;
    case "note":
    case "prompt":
    case "context": {
      const bg = { note: 0xfef3c7, prompt: 0xdbeafe, context: 0xf3f4f6 }[n.type]!;
      const g = new Graphics();
      g.roundRect(0, 0, box.w, box.h, 6).fill(bg).stroke({ width: 1, color: 0x9ca3af });
      c.addChild(g);
      const s = specOf({ ...n, fill: "#374151", fontFamily: n.fontFamily ?? "JetBrains Mono", fontSize: n.fontSize ?? 12, textGrowth: "fixed-width-height" }, R);
      const inner = new Container();
      inner.position.set(10, 26);
      c.addChild(inner);
      drawText(inner, s, { w: box.w - 20, h: box.h - 36 }, ctx.reg, ctx.res);
      const head = new Container();
      head.position.set(10, 6);
      c.addChild(head);
      drawText(head, specOf({ type: "text", id: "h", content: n.type, fill: "#6B7280", fontFamily: "JetBrains Mono", fontSize: 11 }, R), { w: 100, h: 14 }, ctx.reg, ctx.res);
      break;
    }
    case "icon":
      drawIcon(c, n, box, ctx);
      break;
    case "script":
    case "browser":
      placeholder(c, box);
      break;
    default:
      if (n.type !== "ref") ctx.warn(`unknown node type ${n.type}`);
  }
  if (!ctx.noEffects) outerEffects(c, n, box, ctx, def);
  return c;
}

function placeholder(c: Container, box: Box) {
  const g = new Graphics();
  g.rect(0, 0, box.w || 100, box.h || 60).fill({ color: 0xe5e7eb }).stroke({ width: 1, color: 0x9ca3af });
  c.addChild(g);
}

type Radii = [number, number, number, number];
function cornerRadii(n: PenNode, ctx: Ctx): Radii {
  const r = rv(ctx.doc, n.cornerRadius ?? 0, ctx.theme);
  if (Array.isArray(r)) return r.map((v) => rv(ctx.doc, v, ctx.theme) as number) as Radii;
  return [r, r, r, r] as Radii;
}

function rectPath(g: Graphics, b: Box, r: Radii) {
  const [tl, tr, br, bl] = r.map((v) => Math.min(v, b.w / 2, b.h / 2));
  if (!tl && !tr && !br && !bl) { g.rect(0, 0, b.w, b.h); return; }
  g.moveTo(tl, 0).lineTo(b.w - tr, 0);
  if (tr) g.arcTo(b.w, 0, b.w, tr, tr);
  g.lineTo(b.w, b.h - br);
  if (br) g.arcTo(b.w, b.h, b.w - br, b.h, br);
  g.lineTo(bl, b.h);
  if (bl) g.arcTo(0, b.h, 0, b.h - bl, bl);
  g.lineTo(0, tl);
  if (tl) g.arcTo(0, 0, tl, 0, tl);
  g.closePath();
}

function ellipsePoints(b: Box, startDeg: number, sweepDeg: number, inner: number): number[] {
  const cx = b.w / 2, cy = b.h / 2;
  const steps = Math.max(8, Math.ceil(Math.abs(sweepDeg) / 3));
  const pts: number[] = [];
  const at = (deg: number, k: number) => {
    const a = (deg * Math.PI) / 180;
    return [cx + Math.cos(a) * cx * k, cy - Math.sin(a) * cy * k];
  };
  for (let i = 0; i <= steps; i++) pts.push(...at(startDeg + (sweepDeg * i) / steps, 1));
  if (inner > 0) for (let i = steps; i >= 0; i--) pts.push(...at(startDeg + (sweepDeg * i) / steps, inner));
  else pts.push(cx, cy);
  return pts;
}

function polygonPoints(b: Box, count: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
    pts.push(b.w / 2 + (b.w / 2) * Math.cos(a), b.h / 2 + (b.h / 2) * Math.sin(a));
  }
  return pts;
}

function roundedPoly(g: Graphics, p: number[], r: number) {
  const n = p.length / 2;
  const mid = (i: number, j: number): [number, number] => [(p[i * 2] + p[j * 2]) / 2, (p[i * 2 + 1] + p[j * 2 + 1]) / 2];
  const [sx, sy] = mid(n - 1, 0);
  g.moveTo(sx, sy);
  for (let i = 0; i < n; i++) {
    const [mx, my] = mid(i, (i + 1) % n);
    g.arcTo(p[i * 2], p[i * 2 + 1], mx, my, r);
  }
  g.closePath();
}

interface ShapeDef { path: (g: Graphics) => void; hole?: (g: Graphics) => void; }

function shapeDef(n: PenNode, box: Box, ctx: Ctx): ShapeDef | null {
  const R = <T,>(v: T) => rv(ctx.doc, v, ctx.theme);
  switch (n.type) {
    case "frame":
    case "rectangle": { const r = cornerRadii(n, ctx); return { path: (g) => rectPath(g, box, r) }; }
    case "ellipse": {
      const inner = R(n.innerRadius ?? 0) as number;
      const start = R(n.startAngle ?? 0) as number;
      const sweep = R(n.sweepAngle ?? 360) as number;
      if (Math.abs(sweep) >= 359.99) {
        return {
          path: (g) => g.ellipse(box.w / 2, box.h / 2, box.w / 2, box.h / 2),
          hole: inner > 0 ? (g) => g.ellipse(box.w / 2, box.h / 2, (box.w / 2) * inner, (box.h / 2) * inner) : undefined,
        };
      }
      return { path: (g) => g.poly(ellipsePoints(box, start, sweep, inner)) };
    }
    case "polygon": {
      const count = Math.max(3, Math.round(R(n.polygonCount ?? 3) as number));
      const cr = R(n.cornerRadius ?? 0) as number;
      const pts = polygonPoints(box, count);
      if (cr > 0) return { path: (g) => roundedPoly(g, pts, cr) };
      return { path: (g) => g.poly(pts) };
    }
    case "path": {
      const geo = n.geometry as string | undefined;
      if (!geo) return null;
      const parts = geo.split(/(?=[Mm])/).filter((s) => s.trim());
      const evenodd = n.fillRule === "evenodd" && parts.length > 1;
      const [outer, ...rest] = evenodd ? parts : [geo];
      return {
        path: (g) => g.path(new GraphicsPath(outer)),
        hole: evenodd ? (g) => rest.forEach((p) => g.path(new GraphicsPath(p))) : undefined,
      };
    }
  }
  return null;
}

/** SVG paths are drawn in viewBox space; map them onto the node box. */
function placeGraphic(g: Graphics, n: PenNode, box: Box) {
  if (n.type !== "path") return g;
  const vb = (n.viewBox as number[] | undefined) ?? [0, 0, box.w, box.h];
  const sx = box.w / vb[2], sy = box.h / vb[3];
  g.scale.set(sx, sy);
  g.position.set(-vb[0] * sx, -vb[1] * sy);
  return g;
}

function solidShape(def: ShapeDef, n: PenNode, box: Box, color = 0xffffff): Graphics {
  const g = new Graphics();
  def.path(g);
  g.fill(color);
  if (def.hole) { def.hole(g); g.cut(); }
  return placeGraphic(g, n, box);
}

interface PaintStyle { color?: number; alpha?: number; fill?: FillGradient; blend: string; special?: () => Container; }

function toPaint(f: any, b: Box, ctx: Ctx): PaintStyle | null {
  const R = <T,>(v: T) => rv(ctx.doc, v, ctx.theme);
  if (typeof f === "string") f = R(f);
  if (typeof f === "string") return { ...parseColor(f), blend: "normal" };
  if (!f || R(f.enabled ?? true) === false) return null;
  const blend = blendName(R(f.blendMode));
  const op = R(f.opacity ?? 1) as number;
  switch (f.type) {
    case "color": return { ...parseColor(R(f.color)), blend };
    case "gradient": {
      const stops = (f.colors ?? []).map((s: any) => ({ offset: R(s.position) as number, color: R(s.color) as string }));
      const cx = f.center?.x ?? 0.5, cy = f.center?.y ?? 0.5;
      if (f.gradientType === "radial") {
        const rad = (f.size?.width ?? 1) / 2;
        return { fill: new FillGradient({ type: "radial", center: { x: cx, y: cy }, innerRadius: 0, outerCenter: { x: cx, y: cy }, outerRadius: rad, colorStops: stops, textureSpace: "local" }), alpha: op, blend };
      }
      if (f.gradientType === "angular") {
        return { blend, special: () => angularMesh(b.w, b.h, stops.map((s: any) => ({ color: s.color, position: s.offset })), { x: cx, y: cy }, R(f.rotation ?? 0) as number, op) };
      }
      const len = f.size?.height ?? 1;
      const a = ((R(f.rotation ?? 0) as number) * Math.PI) / 180;
      const dx = -Math.sin(a), dy = -Math.cos(a);
      return {
        fill: new FillGradient({
          type: "linear",
          start: { x: (cx - (dx * len) / 2) * b.w, y: (cy - (dy * len) / 2) * b.h },
          end: { x: (cx + (dx * len) / 2) * b.w, y: (cy + (dy * len) / 2) * b.h },
          colorStops: stops,
          textureSpace: "global",
        }),
        alpha: op, blend,
      };
    }
    case "image": {
      const url = f.url as string | undefined;
      return { blend, special: () => imageLayer(url ? ctx.images.get(url) ?? null : null, b, R(f.mode ?? "cover") as string, f.transform, op) };
    }
    case "mesh_gradient":
      return { blend, special: () => meshGradientMesh(b.w, b.h, f.columns ?? 2, f.rows ?? 2, (f.colors ?? []).map((c: string) => R(c)), op) };
    default:
      ctx.warn(`fill type ${f.type} not supported yet`);
      return null;
  }
}

const styleOf = (s: PaintStyle) => (s.fill ? { fill: s.fill, alpha: s.alpha ?? 1 } : { color: s.color, alpha: s.alpha ?? 1 });

function drawShape(c: Container, n: PenNode, box: Box, ctx: Ctx, def: ShapeDef | null) {
  if (!def) return;
  const R = <T,>(v: T) => rv(ctx.doc, v, ctx.theme);
  for (const f of asList(n.fill)) {
    const s = toPaint(f, box, ctx);
    if (!s) continue;
    if (s.special) {
      const layer = new Container();
      const mesh = s.special();
      mesh.blendMode = s.blend as any;
      const mask = solidShape(def, n, box);
      layer.addChild(mesh, mask);
      layer.mask = mask;
      c.addChild(layer);
      continue;
    }
    const g = new Graphics();
    def.path(g);
    g.fill(styleOf(s));
    if (def.hole) { def.hole(g); g.cut(); }
    g.blendMode = s.blend as any;
    c.addChild(placeGraphic(g, n, box));
  }
  const sw = R(n.strokeWidth ?? (n.stroke ? 1 : 0)) as any;
  const align = R(n.strokeAlignment ?? "center") as string;
  const alignment = align === "inner" ? 1 : align === "outer" ? 0 : 0.5;
  const cap = R(n.strokeLinecap ?? "butt"), join = R(n.strokeLinejoin ?? "miter");
  for (const f of asList(n.stroke)) {
    const s = toPaint(f, box, ctx);
    if (!s || s.special) continue;
    const g = new Graphics();
    const base = styleOf(s);
    if (sw && typeof sw === "object") {
      const t = R(sw.top ?? 0), r = R(sw.right ?? 0), b = R(sw.bottom ?? 0), l = R(sw.left ?? 0);
      if (t) g.rect(0, 0, box.w, t).fill(base);
      if (b) g.rect(0, box.h - b, box.w, b).fill(base);
      if (l) g.rect(0, 0, l, box.h).fill(base);
      if (r) g.rect(box.w - r, 0, r, box.h).fill(base);
    } else if (sw > 0) {
      def.path(g);
      g.stroke({ ...base, width: sw, alignment, cap: cap as any, join: join as any });
    }
    g.blendMode = s.blend as any;
    c.addChild(placeGraphic(g, n, box));
  }
}

// ---- effects -------------------------------------------------------------

const effectsOf = (n: PenNode, ctx: Ctx) =>
  asList<any>(n.effect).filter((e) => e && rv(ctx.doc, e.enabled ?? true, ctx.theme) !== false);

function innerShadows(c: Container, n: PenNode, box: Box, ctx: Ctx, def: ShapeDef | null) {
  if (!def) return;
  const R = <T,>(v: T) => rv(ctx.doc, v, ctx.theme);
  for (const e of effectsOf(n, ctx)) {
    if (e.type !== "shadow" || R(e.shadowType ?? "outer") !== "inner") continue;
    const blur = R(e.blur ?? 0) as number, off = { x: R(e.offset?.x ?? 0) as number, y: R(e.offset?.y ?? 0) as number };
    const { color, alpha } = parseColor(R(e.color ?? "#00000040"));
    const pad = blur * 2 + Math.abs(off.x) + Math.abs(off.y) + 10;
    const layer = new Container();
    const fx = new Container();
    const f = gaussian(blur / 2);
    fx.filters = [f];
    const big = new Graphics().rect(-pad, -pad, box.w + pad * 2, box.h + pad * 2).fill({ color, alpha });
    const eraser = solidShape(def, n, box);
    eraser.blendMode = "erase";
    eraser.position.x += off.x; eraser.position.y += off.y;
    fx.addChild(big, eraser);
    const mask = solidShape(def, n, box);
    layer.addChild(fx, mask);
    layer.mask = mask;
    c.addChild(layer);
    ctx.scalers.push((z) => { f.strength = (blur / 2) * z; });
  }
}

function outerEffects(c: Container, n: PenNode, box: Box, ctx: Ctx, def: ShapeDef | null) {
  const R = <T,>(v: T) => rv(ctx.doc, v, ctx.theme);
  for (const e of effectsOf(n, ctx)) {
    if (e.type === "shadow" && R(e.shadowType ?? "outer") !== "inner") {
      const blur = R(e.blur ?? 0) as number;
      const { color, alpha } = parseColor(R(e.color ?? "#00000040"));
      const layer = new Container();
      layer.position.set(R(e.offset?.x ?? 0) as number, R(e.offset?.y ?? 0) as number);
      const sil = new Container();
      if (def) sil.addChild(solidShape(def, n, box));
      for (const ch of n.children ?? []) addNode(sil, ch, { ...ctx, noEffects: true });
      const cm = new ColorMatrixFilter();
      cm.matrix = [0, 0, 0, 0, ((color >> 16) & 255) / 255, 0, 0, 0, 0, ((color >> 8) & 255) / 255, 0, 0, 0, 0, (color & 255) / 255, 0, 0, 0, alpha, 0];
      const filters: Filter[] = [cm];
      if (blur > 0) { const g = gaussian(blur / 2); filters.push(g); ctx.scalers.push((z) => { g.strength = (blur / 2) * z; }); }
      sil.filters = filters;
      layer.addChild(sil);
      c.addChildAt(layer, 0);
    } else if (e.type === "blur") {
      const r = R(e.radius ?? 0) as number;
      const g = gaussian(r / 2);
      c.filters = [...((c.filters as Filter[] | null) ?? []), g];
      ctx.scalers.push((z) => { g.strength = (r / 2) * z; });
    } else if (e.type === "background_blur" && def) {
      const r = R(e.radius ?? 0) as number;
      const f = backdropBlurFilter(r);
      const layer = solidShape(def, n, box);
      layer.filters = [f];
      c.addChildAt(layer, 0);
      ctx.scalers.push((z) => setBackdropRadius(f, (r / 2) * z * (window.devicePixelRatio || 1)));
    } else if (e.type === "shader") {
      ctx.warn("shader effects are not run (security rule)");
    }
  }
}

// ---- icons and images -----------------------------------------------------

function drawIcon(c: Container, n: PenNode, box: Box, ctx: Ctx) {
  const R = <T,>(v: T) => rv(ctx.doc, v, ctx.theme);
  const lib = String(R(n.library ?? "lucide"));
  const name = String(R(n.icon ?? ""));
  const set = ctx.icons.get(lib);
  if (!set) { ctx.warn(`icon library "${lib}" not available`); return; }
  const f: any = R(Array.isArray(n.fill) ? n.fill[0] : n.fill);
  const color = typeof f === "string" ? f : f?.type === "color" ? String(R(f.color)) : "#000000";
  const res = iconSvg(set, name, color);
  if (!res) { ctx.warn(`icon "${name}" not found in ${lib}`); return; }
  if (n.weight !== undefined && lib.startsWith("Material")) ctx.warn("icon weight is not supported, using weight 400");
  const g = new Graphics().svg(res.svg);
  const [vx, vy, vw, vh] = res.vb;
  const sx = box.w / vw, sy = box.h / vh;
  g.scale.set(sx, sy);
  g.position.set(-vx * sx, -vy * sy);
  c.addChild(g);
}

function imageLayer(tex: Texture | null, b: Box, mode: string, transform: number[] | undefined, opacity: number): Container {
  const layer = new Container();
  layer.alpha = opacity;
  if (!tex) {
    const g = new Graphics();
    const s = 8;
    for (let y = 0; y * s < b.h; y++) for (let x = 0; x * s < b.w; x++) g.rect(x * s, y * s, s, s).fill((x + y) % 2 ? 0xf3f4f6 : 0xd1d5db);
    layer.addChild(g);
    return layer;
  }
  let frame = new Rectangle(0, 0, tex.width, tex.height);
  if (transform && transform.length === 6 && transform[0] && transform[3]) {
    const [a, , , d, tx, ty] = transform;
    const u0 = -tx / a, u1 = (1 - tx) / a, v0 = -ty / d, v1 = (1 - ty) / d;
    const cl = (v: number) => Math.min(1, Math.max(0, v));
    frame = new Rectangle(cl(u0) * tex.width, cl(v0) * tex.height, Math.max(1, (cl(u1) - cl(u0)) * tex.width), Math.max(1, (cl(v1) - cl(v0)) * tex.height));
  }
  const sprite = new Sprite(new Texture({ source: tex.source, frame }));
  const fw = frame.width, fh = frame.height;
  const sx = mode === "stretch" ? b.w / fw : mode === "contain" ? Math.min(b.w / fw, b.h / fh) : Math.max(b.w / fw, b.h / fh);
  const sy = mode === "stretch" ? b.h / fh : sx;
  sprite.scale.set(sx, sy);
  sprite.position.set((b.w - fw * sx) / 2, (b.h - fh * sy) / 2);
  layer.addChild(sprite);
  return layer;
}
