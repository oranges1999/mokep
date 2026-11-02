import { Application, Container, Rectangle } from "pixi.js";
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
    await this.app.init({ resizeTo: host, background: "#e5e7eb", antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1, preserveDrawingBuffer: true, useBackBuffer: true });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.bindCamera(this.app.canvas);
    await initLayout();
    this.app.ticker.add((t) => this.stepTweens(t.deltaMS));
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
        if (Math.abs(c.position.x - o.x) > 0.01) this.tweens.push({ c, prop: "x", from: o.x, to: c.position.x, elapsed: 0, dur: 350 });
        if (Math.abs(c.position.y - o.y) > 0.01) this.tweens.push({ c, prop: "y", from: o.y, to: c.position.y, elapsed: 0, dur: 350 });
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

  focusNode(id: string): boolean {
    const b = this.worldBounds(id);
    if (!b) return false;
    this.fitRect(b.x, b.y, b.w, b.h, 80);
    return true;
  }

  /** PNG data URL of a node (or everything when id is omitted), rendered at `scale` regardless of the camera. */
  async screenshot(id: string | undefined, scale = 1): Promise<string> {
    if (!this.scene) throw new Error("nothing loaded");
    const saved = { s: this.world.scale.x, x: this.world.x, y: this.world.y };
    try {
      const b = id ? this.worldBounds(id) : (() => { const l = this.world.getLocalBounds(); return { x: l.x, y: l.y, w: l.width, h: l.height }; })();
      if (!b) throw new Error(`node "${id}" not found`);
      this.world.scale.set(1); this.world.position.set(0, 0);
      this.scene.rescale(scale);
      for (const t of this.scene.texts) t.resolution = Math.max(1, scale * (window.devicePixelRatio || 1));
      const canvas = this.app.renderer.extract.canvas({ target: this.app.stage, frame: new Rectangle(b.x, b.y, Math.max(1, Math.ceil(b.w - 0.01)), Math.max(1, Math.ceil(b.h - 0.01))), resolution: scale, clearColor: "#ffffff" }) as HTMLCanvasElement;
      return canvas.toDataURL("image/png");
    } finally {
      this.world.scale.set(saved.s); this.world.position.set(saved.x, saved.y);
      this.scene.rescale(saved.s);
      this.refreshText();
    }
  }

  info() {
    return {
      frames: [...(this.scene?.frames.entries() ?? [])].map(([id, f]) => ({ id, name: f.node.name ?? id, x: f.box.x, y: f.box.y, w: f.box.w, h: f.box.h })),
      warnings: this.warnings,
    };
  }

  fitAll() {
    const b = this.world.getLocalBounds();
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
      const k = Math.exp(-e.deltaY * 0.0015);
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const s = Math.min(Math.max(this.world.scale.x * k, 0.02), 64);
      const wx = (px - this.world.x) / this.world.scale.x, wy = (py - this.world.y) / this.world.scale.y;
      this.world.scale.set(s);
      this.world.position.set(px - wx * s, py - wy * s);
      this.scheduleTextRes();
    }, { passive: false });
    let drag: { x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      this.world.x += e.clientX - drag.x; this.world.y += e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointerup", () => { drag = null; });
  }
}
