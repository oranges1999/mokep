import "pixi.js/unsafe-eval"; // shader and uniform code without eval, so the webview CSP can drop 'unsafe-eval'
import { Application, Container, Point, Rectangle } from "pixi.js";
import { easeInOut, fitView, flight, flightMs, fromCamera, Insets, MAX_SCALE, MIN_SCALE, unionRect, View } from "../core/camera";
import type { FrameBox, Rect } from "../core/select";
import { parsePen } from "../core/parse";
import { expandRefs } from "../core/instances";
import { computeLayout, initLayout } from "../core/layout";
import { buildScene, Scene } from "./render/scene";
import { loadFonts, usedFamilies } from "./fonts";
import { loadIconSets, loadImages, usedAssets } from "./assets";
import { measureSpec, specOf } from "./render/text";
import { rv } from "../core/variables";
import type { PenDocument } from "../core/schema";

export class Viewer {
  app = new Application();
  world = new Container();
  scene: Scene | null = null;
  warnings: string[] = [];
  theme: Record<string, string> = {};
  doc: PenDocument | null = null;
  private lastText = "";
  onLoaded: (() => void) | null = null;
  /** Ids of nodes that were added or changed by the last animated reload (an agent edit). */
  onChanged: ((ids: string[]) => void) | null = null;
  private tweens: { c: Container; prop: "x" | "y" | "alpha"; from: number; to: number; elapsed: number; dur: number }[] = [];
  fontBase = "/assets/fonts/";
  iconBase = "/assets/icons/";
  docBase = "/fixtures/";
  private resTimer: ReturnType<typeof setTimeout> | undefined;

  async init(host: HTMLElement) {
    await this.app.init({ resizeTo: host, background: "#1e1e1e", antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1, preserveDrawingBuffer: true, useBackBuffer: true });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.bindCamera(this.app.canvas);
    await initLayout();
    this.app.ticker.add((t) => { this.stepTweens(t.deltaMS); this.stepFlight(t.deltaMS); });
  }

  private stepTweens(ms: number) {
    this.tweens = this.tweens.filter((w) => {
      if (w.c.destroyed) return false;
      w.elapsed += ms;
      const k = Math.min(1, w.elapsed / w.dur);
      const e = 1 - Math.pow(1 - k, 3);
      const val = w.from + (w.to - w.from) * e;
      if (w.prop === "alpha") w.c.alpha = val; else w.c[w.prop] = val;
      return k < 1;
    });
  }

  private snapshot() {
    if (!this.scene) return null;
    const m = new Map<string, { j: string; x: number; y: number }>();
    for (const [id, c] of this.scene.nodes) {
      const { children: _c, ...rest } = this.scene.data.get(id)! as Record<string, unknown>;
      m.set(id, { j: JSON.stringify(rest), x: c.position.x, y: c.position.y });
    }
    return m;
  }

  /** Compare with the previous scene by node id: moved nodes slide, new nodes fade in, and changes are reported for highlighting. */
  private animateChanges(prev: Map<string, { j: string; x: number; y: number }>) {
    const sc = this.scene!;
    const added = new Set<string>(), changed = new Set<string>();
    for (const [id, c] of sc.nodes) {
      const o = prev.get(id);
      const { children: _c, ...rest } = sc.data.get(id)! as Record<string, unknown>;
      if (!o) added.add(id);
      else if (JSON.stringify(rest) !== o.j || Math.abs(c.position.x - o.x) > 0.01 || Math.abs(c.position.y - o.y) > 0.01) changed.add(id);
    }
    const topmost = (set: Set<string>) => [...set].filter((id) => {
      for (let p = sc.nodes.get(id)!.parent; p; p = p.parent) { const pid = sc.ids.get(p as Container); if (pid && set.has(pid)) return false; }
      return true;
    });
    const newTop = topmost(added);
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      for (const id of changed) {
        const o = prev.get(id)!, c = sc.nodes.get(id)!;
        const to = { x: c.position.x, y: c.position.y };
        if (Math.abs(to.x - o.x) > 0.01) { this.tweens.push({ c, prop: "x", from: o.x, to: to.x, elapsed: 0, dur: 350 }); c.position.x = o.x; }
        if (Math.abs(to.y - o.y) > 0.01) { this.tweens.push({ c, prop: "y", from: o.y, to: to.y, elapsed: 0, dur: 350 }); c.position.y = o.y; }
      }
      for (const id of newTop) { const c = sc.nodes.get(id)!; const to = c.alpha; c.alpha = 0; this.tweens.push({ c, prop: "alpha", from: 0, to, elapsed: 0, dur: 300 }); }
    }
    this.onChanged?.([...newTop, ...changed].slice(0, 40));
  }

  async setTheme(axis: string, value: string | null) {
    if (value === null) delete this.theme[axis]; else this.theme[axis] = value;
    await this.load(this.lastText);
  }

  async load(text: string, animate = false) {
    this.lastText = text;
    const prevSnap = animate ? this.snapshot() : null;
    const parsed = parsePen(text);
    const { doc, warnings: refWarnings } = expandRefs(parsed.doc);
    const warnings = [...parsed.warnings, ...refWarnings];
    const missing = await loadFonts(this.fontBase, usedFamilies(doc));
    const used = usedAssets(doc);
    const [icons, images] = await Promise.all([loadIconSets(this.iconBase, used.iconLibs), loadImages(this.docBase, used.imageUrls)]);
    const layout = computeLayout(doc, (n, maxW, theme) => measureSpec(specOf(n, (v) => rv(doc, v, theme)), maxW), this.theme);
    if (this.scene) { this.world.removeChild(this.scene.root); this.scene.root.destroy({ children: true }); }
    this.scene = buildScene(doc, layout, { icons, images }, this.textResolution(), this.theme);
    this.warnings = [...warnings, ...this.scene.warnings, ...missing.map((f) => `font "${f}" is not bundled, using fallback`)];
    this.world.addChild(this.scene.root);
    this.scene.rescale(this.world.scale.x);
    this.doc = parsed.doc;
    if (prevSnap) this.animateChanges(prevSnap);
    this.onLoaded?.();
  }

  private textResolution() {
    return Math.min(8, Math.max(1, (window.devicePixelRatio || 1) * this.world.scale.x));
  }

  /** Redraw text textures at the current zoom, debounced. */
  private scheduleTextRes() {
    clearTimeout(this.resTimer);
    this.resTimer = setTimeout(() => {
      this.scene?.rescale(this.world.scale.x);
      const r = this.textResolution();
      for (const t of this.scene?.texts ?? []) if (Math.abs(t.resolution - r) / r > 0.25) t.resolution = r;
    }, 150);
  }

  /** Re-render text textures for the current zoom right now (used by tests). */
  refreshText() {
    const r = this.textResolution();
    for (const t of this.scene?.texts ?? []) t.resolution = r;
  }

  /** Node bounds in world coordinates (independent of the current camera). */
  boundsOf(id: string) { return this.worldBounds(id); }

  private worldBounds(id: string) {
    const c = this.scene?.nodes.get(id);
    if (!c) return null;
    const b = c.getBounds();
    const s = this.world.scale.x;
    return { x: (b.x - this.world.x) / s, y: (b.y - this.world.y) / s, w: b.width / s, h: b.height / s };
  }

  /** PNG data URL of a node (or everything when id is omitted), rendered at `scale` regardless of the camera. */
  async screenshot(id: string | undefined, scale?: number, view = false): Promise<string> {
    if (!this.scene) throw new Error("nothing loaded");
    this.finishFlight(); // the camera is saved and restored below, so it must not be moving
    const saved ={ s: this.world.scale.x, x: this.world.x, y: this.world.y };
    try {
      const b = view ? this.viewRect() : id ? this.worldBounds(id) : (() => { const l = this.world.getLocalBounds(); return { x: l.x, y: l.y, w: l.width, h: l.height }; })();
      if (!b) throw new Error(`node "${id}" not found`);
      // Without an explicit scale the longest side is capped at 1568 px: agents downscale larger pictures anyway, and a big PNG is slow to render and to send.
      scale ??= Math.min(view ? saved.s : 1, 1568 / Math.max(b.w, b.h, 1));
      this.world.scale.set(1); this.world.position.set(0, 0);
      this.scene.rescale(scale);
      for (const t of this.scene.texts) t.resolution = Math.max(1, scale * (window.devicePixelRatio || 1));
      const canvas = this.app.renderer.extract.canvas({ target: this.app.stage, frame: new Rectangle(b.x, b.y, Math.max(1, Math.ceil(b.w - 0.01)), Math.max(1, Math.ceil(b.h - 0.01))), resolution: scale, clearColor: view ? "#1e1e1e" : "#ffffff" }) as HTMLCanvasElement;
      return canvas.toDataURL("image/png");
    } finally {
      this.world.scale.set(saved.s); this.world.position.set(saved.x, saved.y);
      this.scene.rescale(saved.s);
      this.refreshText();
    }
  }

  /** The part of the design the user sees, in design coordinates. */
  viewRect() {
    const s = this.world.scale.x;
    return { x: -this.world.x / s, y: -this.world.y / s, w: this.app.screen.width / s, h: this.app.screen.height / s };
  }

  /** What is on screen: zoom, the visible area, and each frame that shows (with the share of it that is visible). */
  view() {
    const r = this.viewRect(), visible: { id: string; name: string; visiblePct: number }[] = [];
    for (const [id, f] of this.scene?.frames.entries() ?? []) {
      const w = Math.min(r.x + r.w, f.box.x + f.box.w) - Math.max(r.x, f.box.x), h = Math.min(r.y + r.h, f.box.y + f.box.h) - Math.max(r.y, f.box.y);
      if (w > 0 && h > 0) visible.push({ id, name: f.node.name ?? id, visiblePct: Math.round((100 * w * h) / Math.max(1, f.box.w * f.box.h)) });
    }
    const round = (n: number) => Math.round(n * 10) / 10;
    return { zoom: Math.round(this.world.scale.x * 1000) / 1000, area: { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }, visible };
  }

  info() {
    return {
      frames: [...(this.scene?.frames.entries() ?? [])].map(([id, f]) => ({ id, name: f.node.name ?? id, x: f.box.x, y: f.box.y, w: f.box.w, h: f.box.h })),
      warnings: this.warnings,
    };
  }

  fitAll() {
    const b = this.world.getLocalBounds();
    // An empty design has no bounds; show a default-sized area instead of zooming in to infinity.
    if (b.width < 1 || b.height < 1) return this.fitRect(0, 0, 1200, 800);
    this.fitRect(b.x, b.y, b.width, b.height);
  }

  fitFrame(id: string) {
    const f = this.scene?.frames.get(id);
    if (f) this.fitRect(f.box.x, f.box.y, f.box.w, f.box.h);
  }

  fitRect(x: number, y: number, w: number, h: number, pad = 40) {
    const sw = this.app.screen.width, sh = this.app.screen.height;
    const s = Math.min((sw - pad * 2) / Math.max(w, 1), (sh - pad * 2) / Math.max(h, 1));
    this.world.scale.set(s);
    this.world.position.set((sw - w * s) / 2 - x * s, (sh - h * s) / 2 - y * s);
    this.scheduleTextRes();
  }

  private bindCamera(el: HTMLCanvasElement) {
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.cancelFlight(); // the user took over the camera
      // Plain wheel scrolls, Shift scrolls sideways, Ctrl (or a trackpad pinch, which sets ctrlKey) zooms.
      if (!e.ctrlKey && !e.metaKey) {
        // shortcut: assumes pixel deltas, a line-based wheel (deltaMode 1) scrolls too little, upgrade if reported.
        if (e.shiftKey) this.world.x -= e.deltaX || e.deltaY;
        else { this.world.x -= e.deltaX; this.world.y -= e.deltaY; }
        return;
      }
      const k = Math.exp(-e.deltaY * 0.0015);
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const s = Math.min(Math.max(this.world.scale.x * k, 0.02), 64);
      const wx = (px - this.world.x) / this.world.scale.x, wy = (py - this.world.y) / this.world.scale.y;
      this.world.scale.set(s);
      this.world.position.set(px - wx * s, py - wy * s);
      this.scheduleTextRes();
    }, { passive: false });
    // The middle button pans the screen. The left button is for selecting (see ui.ts).
    let drag: { x: number; y: number } | null = null;
    el.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); }); // no autoscroll cursor on the middle button
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 1) return;
      this.cancelFlight();
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      this.world.x += e.clientX - drag.x; this.world.y += e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointerup", (e) => { if (e.button === 1) drag = null; });
  }

  // ---- camera flights -------------------------------------------------------
  /** Floating UI the camera must keep clear of. The UI sets this; it is read at the start of every flight. */
  insets: () => Insets = () => ({ left: 0, top: 0, right: 0, bottom: 0 });
  private flying: { fl: ReturnType<typeof flight>; to: View; ms: number; t: number; done: () => void } | null = null;
  get isFlying() { return this.flying !== null; }

  /** Flies the camera so that all the nodes are completely on screen: it pans, and zooms in or out as much as needed.
   *  Resolves when the camera arrives (at once with reduced motion) or when something else takes the camera over.
   *  Nothing moves if any id is unknown. */
  focusNodes(ids: string[]): Promise<{ ok: boolean; missing: string[] }> {
    const rects = ids.map((id) => ({ id, r: this.worldBounds(id) }));
    const missing = rects.filter((x) => !x.r).map((x) => x.id);
    if (missing.length || !rects.length) return Promise.resolve({ ok: false, missing: missing.length ? missing : ids });
    const sw = this.app.screen.width, sh = this.app.screen.height;
    const to = fitView(unionRect(rects.map((x) => x.r!))!, sw, sh, this.insets());
    this.cancelFlight();
    const fl = flight(fromCamera(this.world.scale.x, this.world.x, this.world.y, sw, sh), to);
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || fl.S < 0.02) { this.applyView(to); return Promise.resolve({ ok: true, missing: [] }); }
    return new Promise((resolve) => { this.flying = { fl, to, ms: flightMs(fl.S), t: 0, done: () => resolve({ ok: true, missing: [] }) }; });
  }

  private applyView(v: View) {
    const sw = this.app.screen.width, sh = this.app.screen.height;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, sw / v.w)); // a very long trip would zoom out past the limit
    this.world.scale.set(scale);
    this.world.position.set(sw / 2 - v.cx * scale, sh / 2 - v.cy * scale);
    this.scheduleTextRes();
  }

  private stepFlight(ms: number) {
    const f = this.flying;
    if (!f) return;
    f.t += ms;
    const k = Math.min(1, f.t / f.ms);
    this.applyView(k >= 1 ? f.to : f.fl.at(f.fl.S * easeInOut(k)));
    if (k >= 1) { this.flying = null; f.done(); }
  }

  /** Stops where the camera is (the user took over, or a new flight starts). */
  cancelFlight() { const f = this.flying; if (f) { this.flying = null; f.done(); } }

  /** Jumps to the end of the flight (a screenshot needs a settled camera). */
  private finishFlight() { const f = this.flying; if (f) { this.flying = null; this.applyView(f.to); f.done(); } }

  /** The node's own rectangle in world coordinates, without children that stick out of it. */
  ownBounds(id: string): Rect | null {
    const c = this.scene?.nodes.get(id), b = this.scene?.boxes.get(id);
    if (!c || !b) return null;
    const pts = [[0, 0], [b.w, 0], [0, b.h], [b.w, b.h]].map(([x, y]) => this.world.toLocal(c.toGlobal(new Point(x, y))));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  /** Every frame with its own box and the frames above it, for the marquee. */
  frameBoxes(): FrameBox[] {
    const sc = this.scene;
    if (!sc) return [];
    const out: FrameBox[] = [];
    for (const [id, n] of sc.data) {
      if (n.type !== "frame") continue;
      const r = this.ownBounds(id);
      if (!r) continue;
      const ancestors: string[] = [];
      for (let p = sc.nodes.get(id)!.parent; p; p = p.parent) { const pid = sc.ids.get(p as Container); if (pid && sc.data.get(pid)?.type === "frame") ancestors.push(pid); }
      out.push({ id, ...r, ancestors });
    }
    return out;
  }
}
