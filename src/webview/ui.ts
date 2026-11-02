import type { Comment } from "../core/comments";
import { resolveVariable, defaultTheme } from "../core/variables";
import { Viewer } from "./viewer";

type Send = (m: Record<string, unknown>) => void;
type Rect = { x: number; y: number; w: number; h: number };

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, style: string, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag);
  e.setAttribute("style", style);
  for (const k of kids) e.append(k);
  return e;
};

/** Plain-DOM overlays: selection, hover, Alt measuring, comment pins, side panel, agent status bubble. */
export class Ui {
  selected: string | null = null;
  hovered: string | null = null;
  comments: Comment[] = [];
  private alt = false;
  private panel = h("div", "position:fixed;top:0;right:0;bottom:0;width:300px;overflow:auto;background:#fffffff2;border-left:1px solid #d1d5db;font:12px/1.4 system-ui,sans-serif;color:#111827;padding:10px;box-sizing:border-box");
  private overlay = h("div", "position:fixed;left:0;top:0;right:300px;bottom:0;pointer-events:none;overflow:hidden");
  private selBox = h("div", "position:absolute;border:2px solid #2563eb;display:none;box-sizing:border-box");
  private hovBox = h("div", "position:absolute;border:1px dashed #2563eb;display:none;box-sizing:border-box");
  private bubble = h("div", "position:fixed;top:10px;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:#111827;color:#fff;font:12px system-ui,sans-serif;display:none;pointer-events:none");
  private measure = h("div", "position:absolute;inset:0");
  private pins = h("div", "position:absolute;inset:0");
  private flashLayer = h("div", "position:absolute;inset:0");
  private flashes: { id: string; t0: number }[] = [];
  private bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  private findBox = h("div", "position:fixed;top:48px;left:calc((100% - 300px) / 2);transform:translateX(-50%);width:360px;background:#fff;border:1px solid #9ca3af;border-radius:8px;box-shadow:0 8px 24px #0003;padding:8px;font:13px system-ui,sans-serif;display:none;z-index:10");
  private findInput = h("input", "width:100%;box-sizing:border-box;padding:6px 8px;font:13px system-ui") as HTMLInputElement;
  private findList = h("div", "margin-top:6px;max-height:300px;overflow:auto");
  private findHits: string[] = [];
  private findIdx = 0;
  private search = h("input", "width:100%;box-sizing:border-box;padding:4px 6px;margin-bottom:6px") as HTMLInputElement;

  constructor(private v: Viewer, host: HTMLElement, private send: Send) {
    this.search.placeholder = "Search frames…";
    this.search.addEventListener("input", () => this.render());
    this.findInput.placeholder = "Find frame (name or id)…";
    this.findBox.append(this.findInput, this.findList);
    document.body.append(this.findBox);
    this.findInput.addEventListener("input", () => { this.findIdx = 0; this.runFind(); });
    this.findInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { this.findIdx = Math.min(this.findIdx + 1, this.findHits.length - 1); this.runFind(true); e.preventDefault(); }
      else if (e.key === "ArrowUp") { this.findIdx = Math.max(this.findIdx - 1, 0); this.runFind(true); e.preventDefault(); }
      else if (e.key === "Enter") { this.goTo(this.findHits[this.findIdx]); e.preventDefault(); }
      else if (e.key === "Escape") { this.closeFind(); e.stopPropagation(); }
    });
    this.overlay.append(this.flashLayer, this.hovBox, this.selBox, this.measure, this.pins);
    document.body.append(this.overlay, this.panel, this.bubble);
    host.style.right = "300px";
    host.style.width = "calc(100% - 300px)";
    const el = v.app.canvas;
    let down: { x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener("pointerup", (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) this.select(this.pick(e.clientX, e.clientY));
      down = null;
    });
    el.addEventListener("pointermove", (e) => { this.hovered = this.pick(e.clientX, e.clientY); });
    el.addEventListener("pointerleave", () => { this.hovered = null; });
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); this.openFind(); return; }
      if (e.key === "Alt") { this.alt = true; e.preventDefault(); }
      if (e.key === "Escape") { if (this.findBox.style.display !== "none") this.closeFind(); else this.select(null); }
    });
    window.addEventListener("keyup", (e) => { if (e.key === "Alt") this.alt = false; });
    window.addEventListener("blur", () => { this.alt = false; });
    v.app.ticker.add(() => this.frame());
    v.onLoaded = () => { if (this.selected && !v.scene?.nodes.has(this.selected)) this.selected = null; this.render(); };
    this.render();
  }

  // ---- picking ------------------------------------------------------------
  private pick(cx: number, cy: number): string | null {
    const sc = this.v.scene;
    if (!sc) return null;
    const r = this.v.app.canvas.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    let best: { id: string; depth: number; area: number } | null = null;
    for (const [id, c] of sc.nodes) {
      const b = c.getBounds();
      if (b.width <= 0 || b.height <= 0 || px < b.x || py < b.y || px > b.x + b.width || py > b.y + b.height) continue;
      let depth = 0;
      for (let p = c.parent; p; p = p.parent) if (sc.ids.has(p)) depth++;
      const area = b.width * b.height;
      if (!best || depth > best.depth || (depth === best.depth && area < best.area)) best = { id, depth, area };
    }
    return best?.id ?? null;
  }

  select(id: string | null) { this.selected = id; this.render(); }

  // ---- find frame (Ctrl+F) ------------------------------------------------
  openFind() {
    this.findBox.style.display = "block";
    this.findInput.value = "";
    this.findIdx = 0;
    this.runFind();
    this.findInput.focus();
  }
  closeFind() { this.findBox.style.display = "none"; this.findInput.blur(); }

  private runFind(keepScroll = false) {
    const sc = this.v.scene;
    const q = this.findInput.value.trim().toLowerCase();
    const tops = new Set(sc?.frames.keys() ?? []);
    const hits = [...(sc?.data.entries() ?? [])]
      .filter(([, n]) => n.type === "frame" && (!q || (n.name ?? "").toLowerCase().includes(q) || n.id.toLowerCase().includes(q)))
      .sort((a, b) => Number(tops.has(b[0])) - Number(tops.has(a[0])) || (a[1].name ?? "").localeCompare(b[1].name ?? ""))
      .slice(0, 12);
    this.findHits = hits.map(([id]) => id);
    this.findList.replaceChildren(...hits.map(([id, n], i) => {
      const b = this.v.boundsOf(id);
      const row = h("div", `padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;justify-content:space-between;gap:8px;${i === this.findIdx ? "background:#dbeafe" : ""}`,
        h("span", "overflow:hidden;text-overflow:ellipsis;white-space:nowrap", n.name ?? id),
        h("span", "color:#6b7280;flex:none", `${tops.has(id) ? "page · " : ""}${b ? Math.round(b.w) + "×" + Math.round(b.h) : ""}`));
      row.addEventListener("mousedown", (e) => { e.preventDefault(); this.goTo(id); });
      return row;
    }));
    if (!hits.length) this.findList.append(h("div", "padding:4px 6px;color:#6b7280", "No frame matches"));
    if (keepScroll) this.findList.children[this.findIdx]?.scrollIntoView({ block: "nearest" });
  }

  private goTo(id: string | undefined) {
    if (!id) return;
    this.v.focusNode(id);
    this.select(id);
    this.closeFind();
  }

  // ---- geometry -----------------------------------------------------------
  private rectOf(id: string): Rect | null { const b = this.v.boundsOf(id); return b; }
  private toScreen(r: Rect): Rect {
    const s = this.v.world.scale.x;
    return { x: r.x * s + this.v.world.x, y: r.y * s + this.v.world.y, w: r.w * s, h: r.h * s };
  }
  private place(box: HTMLElement, id: string | null) {
    const r = id && this.rectOf(id);
    if (!r) { box.style.display = "none"; return; }
    const s = this.toScreen(r);
    Object.assign(box.style, { display: "block", left: s.x + "px", top: s.y + "px", width: s.w + "px", height: s.h + "px" });
  }

  private frame() {
    this.place(this.selBox, this.selected);
    this.place(this.hovBox, this.hovered && this.hovered !== this.selected ? this.hovered : null);
    this.drawMeasure();
    this.drawPins();
    this.drawFlashes();
  }

  private drawMeasure() {
    this.measure.replaceChildren();
    if (!this.alt || !this.selected || !this.hovered || this.selected === this.hovered) return;
    const a = this.rectOf(this.selected), b = this.rectOf(this.hovered);
    if (!a || !b) return;
    const segs: { x1: number; y1: number; x2: number; y2: number; v: number }[] = [];
    const inside = (o: Rect, i: Rect) => i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h;
    const [o, i] = inside(a, b) ? [a, b] : inside(b, a) ? [b, a] : [null, null];
    if (o && i) {
      const cx = i.x + i.w / 2, cy = i.y + i.h / 2;
      segs.push({ x1: o.x, y1: cy, x2: i.x, y2: cy, v: i.x - o.x }, { x1: i.x + i.w, y1: cy, x2: o.x + o.w, y2: cy, v: o.x + o.w - i.x - i.w },
        { x1: cx, y1: o.y, x2: cx, y2: i.y, v: i.y - o.y }, { x1: cx, y1: i.y + i.h, x2: cx, y2: o.y + o.h, v: o.y + o.h - i.y - i.h });
    } else {
      const oy = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2, ox = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
      const hasY = Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y), hasX = Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x);
      const yy = hasY ? oy : (a.y + a.h / 2);
      const xx = hasX ? ox : (a.x + a.w / 2);
      if (b.x >= a.x + a.w) segs.push({ x1: a.x + a.w, y1: yy, x2: b.x, y2: yy, v: b.x - a.x - a.w });
      else if (a.x >= b.x + b.w) segs.push({ x1: b.x + b.w, y1: yy, x2: a.x, y2: yy, v: a.x - b.x - b.w });
      if (b.y >= a.y + a.h) segs.push({ x1: xx, y1: a.y + a.h, x2: xx, y2: b.y, v: b.y - a.y - a.h });
      else if (a.y >= b.y + b.h) segs.push({ x1: xx, y1: b.y + b.h, x2: xx, y2: a.y, v: a.y - b.y - b.h });
    }
    for (const sg of segs) {
      if (sg.v <= 0) continue;
      const p = this.toScreen({ x: Math.min(sg.x1, sg.x2), y: Math.min(sg.y1, sg.y2), w: Math.abs(sg.x2 - sg.x1), h: Math.abs(sg.y2 - sg.y1) });
      const horizontal = sg.y1 === sg.y2;
      this.measure.append(
        h("div", `position:absolute;background:#f43f5e;left:${p.x}px;top:${p.y}px;width:${horizontal ? p.w : 1}px;height:${horizontal ? 1 : p.h}px`),
        h("div", `position:absolute;background:#f43f5e;color:#fff;font:10px system-ui;padding:1px 4px;border-radius:3px;left:${p.x + (horizontal ? p.w / 2 : 4)}px;top:${p.y + (horizontal ? 4 : p.h / 2)}px`, String(Math.round(sg.v * 10) / 10)),
      );
    }
  }

  /** Briefly outline nodes an agent just changed or added. */
  flash(ids: string[]) { const t0 = performance.now(); this.flashes.push(...ids.map((id) => ({ id, t0 }))); }

  private drawFlashes() {
    const now = performance.now();
    this.flashes = this.flashes.filter((f) => now - f.t0 < 1600);
    this.flashLayer.replaceChildren(...this.flashes.flatMap((f) => {
      const r = this.rectOf(f.id);
      if (!r) return [];
      const s = this.toScreen(r);
      const o = Math.max(0, 1 - (now - f.t0) / 1600);
      return [h("div", `position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;border:2px solid #f59e0b;background:#f59e0b26;box-sizing:border-box;opacity:${o}`)];
    }));
  }

  private drawPins() {
    this.pins.replaceChildren();
    const open = this.comments.filter((c) => !c.resolved);
    const count = new Map<string, number>();
    open.forEach((c, idx) => {
      const r = this.rectOf(c.nodeId);
      if (!r) return;
      const s = this.toScreen(r);
      const n = count.get(c.nodeId) ?? 0;
      count.set(c.nodeId, n + 1);
      this.pins.append(h("div", `position:absolute;left:${s.x + s.w - 9 + n * 20}px;top:${s.y - 9}px;width:18px;height:18px;border-radius:50%;background:${c.author === "agent" ? "#7c3aed" : "#f59e0b"};color:#fff;font:10px/18px system-ui;text-align:center`, String(idx + 1)));
    });
  }

  // ---- side panel ---------------------------------------------------------
  setComments(list: Comment[]) { this.comments = list; this.render(); }

  setStatus(text: string, state: "working" | "idle" | string) {
    clearTimeout(this.bubbleTimer);
    if (!text) { this.bubble.style.display = "none"; return; }
    this.bubble.textContent = (state === "working" ? "● " : "") + text;
    this.bubble.style.background = state === "working" ? "#2563eb" : "#111827";
    this.bubble.style.display = "block";
    if (state !== "working") this.bubbleTimer = setTimeout(() => { this.bubble.style.display = "none"; }, 6000);
  }

  private section(title: string, ...kids: (Node | string)[]) {
    return h("div", "margin:0 0 14px", h("div", "font-weight:600;margin-bottom:4px;color:#374151", title), ...kids);
  }

  render() {
    const sc = this.v.scene;
    const p = this.panel;
    const keep = this.search.value;
    p.replaceChildren();
    if (!sc) return;
    p.append(this.section("Frames", this.search, ...this.frameList(keep)));
    p.append(this.selectionSection());
    p.append(this.commentSection());
    p.append(this.tokenSection());
    p.append(h("div", "color:#6b7280", `${this.v.warnings.length} warning(s)`, ...this.v.warnings.slice(0, 6).map((w) => h("div", "margin-top:2px", "· " + w))));
    this.search.value = keep;
  }

  private frameList(filter: string) {
    const q = filter.trim().toLowerCase();
    return [...(this.v.scene?.frames.entries() ?? [])]
      .filter(([, f]) => !q || (f.node.name ?? "").toLowerCase().includes(q))
      .map(([id, f]) => {
        const row = h("div", "padding:2px 4px;cursor:pointer;border-radius:4px", f.node.name ?? id);
        row.addEventListener("click", () => { this.v.focusNode(id); this.select(id); });
        row.addEventListener("mouseenter", () => { row.style.background = "#e5e7eb"; });
        row.addEventListener("mouseleave", () => { row.style.background = ""; });
        return row;
      });
  }

  private selectionSection() {
    const n = this.selected ? this.v.scene?.data.get(this.selected) : null;
    if (!n) return this.section("Selection", h("div", "color:#6b7280", "Click a node. Hold Alt over another node to measure."));
    const b = this.rectOf(n.id);
    const { children, ...props } = n as Record<string, any>;
    const json = JSON.stringify(props, null, 1);
    const add = h("button", "margin-top:6px", "Add comment on this node");
    add.addEventListener("click", () => this.send({ type: "addComment", nodeId: n.id, nodeName: n.name ?? n.id }));
    return this.section("Selection",
      h("div", "", `${n.type} · ${n.name ?? ""}`), h("div", "color:#6b7280", `id ${n.id}`),
      h("div", "", b ? `x ${Math.round(b.x)}  y ${Math.round(b.y)}  w ${Math.round(b.w)}  h ${Math.round(b.h)}` : ""),
      h("pre", "margin:6px 0 0;white-space:pre-wrap;word-break:break-word;font:11px ui-monospace,monospace;max-height:220px;overflow:auto;background:#f3f4f6;padding:6px;border-radius:4px", json.length > 2000 ? json.slice(0, 2000) + "\n…" : json),
      this.animationNote(n),
      children ? h("div", "color:#6b7280;margin-top:4px", `${(children as unknown[]).length} child node(s)`) : "",
      add);
  }

  /** Element animation is not part of the format; agents describe it in metadata ({ type: "animation", description }). */
  private animationNote(n: Record<string, any>) {
    const m = n.metadata;
    if (!m || m.type !== "animation" || typeof m.description !== "string") return "";
    return h("div", "margin-top:6px;padding:6px;background:#ede9fe;border-radius:4px", h("div", "font-weight:600", "Animation (described)"), m.description);
  }

  private commentSection() {
    const rows = this.comments.map((c, i) => {
      const done = h("button", "margin-left:6px", c.resolved ? "Reopen" : "Resolve");
      done.addEventListener("click", () => this.send({ type: "resolveComment", id: c.id, resolved: !c.resolved }));
      const go = h("span", "cursor:pointer;color:#2563eb", `#${i + 1}`);
      go.addEventListener("click", () => { this.v.focusNode(c.nodeId); this.select(c.nodeId); });
      return h("div", `margin:4px 0;${c.resolved ? "opacity:.5;text-decoration:line-through" : ""}`, go, ` ${c.author}: ${c.text}`, done);
    });
    return this.section(`Comments (${this.comments.filter((c) => !c.resolved).length} open)`, ...(rows.length ? rows : [h("div", "color:#6b7280", "None")]));
  }

  private tokenSection() {
    const doc = this.v.doc;
    if (!doc) return h("div", "");
    const theme = { ...defaultTheme(doc), ...this.v.theme };
    const kids: (Node | string)[] = [];
    for (const [axis, values] of Object.entries(doc.themes ?? {})) {
      const sel = document.createElement("select");
      for (const val of values) { const o = document.createElement("option"); o.value = val; o.textContent = val; o.selected = theme[axis] === val; sel.append(o); }
      sel.addEventListener("change", () => void this.v.setTheme(axis, sel.value));
      kids.push(h("div", "margin:2px 0", `${axis}: `, sel));
    }
    for (const name of Object.keys(doc.variables ?? {}).filter((k) => !k.startsWith("--"))) {
      const val = resolveVariable(doc, name, theme);
      const isColor = doc.variables![name].type === "color" && typeof val === "string";
      kids.push(h("div", "display:flex;align-items:center;gap:6px;margin:2px 0",
        h("span", `display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid #d1d5db;background:${isColor ? String(val).replace(/[^#\w(),.% ]/g, "") : "transparent"}`),
        h("span", "font:11px ui-monospace,monospace", `${name} = ${String(val)}`)));
    }
    return this.section("Design tokens", ...(kids.length ? kids : [h("div", "color:#6b7280", "No variables")]));
  }
}
