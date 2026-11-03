import type { Comment } from "../core/comments";
import { defaultTheme } from "../core/variables";
import { AgentPresence } from "./agents";
import { abs, cap, CSS, h, icon, ICONS, reduceMotion } from "./ui-kit";
import type { Insets } from "../core/camera";
import { outermostEnclosed, rectBetween } from "../core/select";
import { Viewer } from "./viewer";

const SVG_NS = "http://www.w3.org/2000/svg";
type Send = (m: Record<string, unknown>) => void;
type Rect = { x: number; y: number; w: number; h: number };

/** Plain-DOM overlays: selection, hover, Alt measuring, comment pins, info popup, search bar, agent status bubble. */
export class Ui {
  selected: string | null = null;
  hovered: string | null = null;
  comments: Comment[] = [];
  private alt = false;
  private shownFor: string | null = null;
  private popup = h("div", "mk mk-card mk-popup mk-scroll");
  private overlay = abs("position:fixed;inset:0;pointer-events:none;overflow:hidden");
  private selBox = abs("position:absolute;border:2px solid #6ea8ff;display:none;box-sizing:border-box");
  private hovBox = abs("position:absolute;border:1px dashed #6ea8ff99;display:none;box-sizing:border-box");
  private bubbleText = h("span", "");
  private bubble = h("div", "mk mk-card mk-bubble", h("span", "mk-dot"), this.bubbleText);
  private measure = abs("position:absolute;inset:0");
  private pins = abs("position:absolute;inset:0");
  private flashLayer = abs("position:absolute;inset:0");
  private flashes: { id: string; t0: number }[] = [];
  private ghosts: { r: Rect; t0: number }[] = [];
  private bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  private findInput = h("input", "mk-input") as HTMLInputElement;
  private themeSlot = h("span", "");
  private findList = h("div", "mk-list mk-scroll");
  private findBox = h("div", "mk mk-card mk-search");
  private findHits: string[] = [];
  private findIdx = 0;
  private agents = new AgentPresence();
  private commentsOpen = false;
  private showResolved = false;
  private cBadge = h("span", "mk-badge");
  private cLauncher = h("button", "mk mk-card mk-cbtn", icon("comment", 16), "Comments", this.cBadge);
  private cPanel = h("div", "mk mk-card mk-cpanel mk-scroll");
  /** View = inspect nodes (the default). Comment = click a node to leave a comment, with the list and pins. */
  private mode: "view" | "comment" = "view";
  private modeBadge = h("span", "mk-badge");
  private modeView = h("button", "mk-mode", icon("cursor", 16), "View");
  private modeComment = h("button", "mk-mode", icon("comment", 16), "Comment", this.modeBadge);
  private modesBox = h("div", "mk mk-card mk-modes", this.modeView, this.modeComment);
  private composer = h("div", "mk mk-card mk-composer");
  private composing: string | null = null;
  private menu = h("div", "mk mk-card mk-menu");
  private menuFor: string | null = null;
  /** A marquee selection of two or more frames. One selected node lives in `selected`. */
  private multi: string[] = [];
  private drag: { x: number; y: number } | null = null;
  private marqueeOn = false;
  private marqueeEl = abs("position:absolute;display:none;border:1px solid #6ea8ff;background:#6ea8ff1f;box-sizing:border-box");
  private multiLayer = abs("position:absolute;inset:0");
  /** Outlines that breathe around the frames the camera has just flown to. */
  private locateLayer = abs("position:absolute;inset:0");
  private locating: { ids: string[]; t0: number } | null = null;
  /** How many breaths the outline takes and how long one breath is. Public so tests can shorten them. */
  locateBeats = 5;
  locatePeriodMs = 1200;
  private emptyEl = h("div", "mk mk-emptystate", h("b", "", "This design is empty"), "Ask your agent to add a frame, and it appears here.");

  constructor(private v: Viewer, host: HTMLElement, private send: Send) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    this.themeSlot.style.cssText = "display:flex;gap:6px;align-items:center;flex:none";
    this.findInput.placeholder = "Search frames";
    this.findBox.append(h("div", "mk-srow", icon("search"), this.findInput, h("span", "mk-kbd", "Ctrl F"), this.themeSlot), this.findList);
    this.findInput.addEventListener("focus", () => this.openFind(false));
    this.findInput.addEventListener("blur", () => { this.findList.style.display = "none"; });
    this.findInput.addEventListener("input", () => { this.findIdx = 0; this.runFind(); });
    this.findInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { this.findIdx = Math.min(this.findIdx + 1, this.findHits.length - 1); this.runFind(true); e.preventDefault(); }
      else if (e.key === "ArrowUp") { this.findIdx = Math.max(this.findIdx - 1, 0); this.runFind(true); e.preventDefault(); }
      else if (e.key === "Enter") { this.goTo(this.findHits[this.findIdx]); e.preventDefault(); }
      else if (e.key === "Escape") { this.closeFind(); e.stopPropagation(); }
    });
    this.overlay.append(this.flashLayer, this.multiLayer, this.locateLayer, this.hovBox, this.selBox, this.marqueeEl, this.measure, this.pins);
    this.cLauncher.setAttribute("aria-expanded", "false");
    this.cLauncher.addEventListener("click", () => this.toggleComments());
    this.modeView.dataset.kind = "view";
    this.modeComment.dataset.kind = "comment";
    this.modeView.title = "View: inspect nodes (V)";
    this.modeComment.title = "Comment: click a node to leave a comment (C)";
    this.modeView.setAttribute("aria-pressed", "true");
    this.modeComment.setAttribute("aria-pressed", "false");
    this.modeView.addEventListener("click", () => this.setMode("view"));
    this.modeComment.addEventListener("click", () => this.setMode("comment"));
    document.body.append(this.overlay, this.agents.aura, this.popup, this.findBox, this.bubble, this.agents.el, this.modesBox, this.cLauncher, this.cPanel, this.composer, this.menu, this.emptyEl);
    host.style.right = "0";
    const el = v.app.canvas;
    v.insets = () => this.insets();
    // Left button: a click selects (View) or starts a comment (Comment); a drag in View mode draws a selection area.
    // The middle button pans (viewer.ts) and the right button opens the menu.
    el.addEventListener("pointerdown", (e) => {
      this.closeMenu();
      this.drag = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      if (this.drag) try { el.setPointerCapture(e.pointerId); } catch { /* synthetic events have no active pointer */ }
    });
    el.addEventListener("wheel", () => this.closeMenu(), { passive: true }); // the menu would be left behind by the scroll
    // Left click selects (View) or starts a comment (Comment). The menu belongs to the right button only.
    el.addEventListener("pointerup", (e) => {
      const from = this.drag;
      this.drag = null;
      if (e.button !== 0 || !from) return;
      if (this.marqueeOn) return this.endMarquee(from, e);
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < 4) {
        const id = this.pick(e.clientX, e.clientY);
        if (this.mode === "comment") { if (id) this.openComposer(id, e.clientX, e.clientY); else this.closeComposer(); }
        else this.select(id);
      }
    });
    el.addEventListener("pointercancel", () => { this.cancelMarquee(); this.drag = null; });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault(); // no browser or VS Code menu on the canvas
      const id = this.pick(e.clientX, e.clientY);
      if (!id) return this.closeMenu();
      if (this.mode === "view" && !this.multi.includes(id)) this.select(id); // a right click inside a selection keeps it
      this.openMenu(id, e.clientX, e.clientY);
    });
    el.addEventListener("pointermove", (e) => {
      this.hovered = this.marqueeOn ? null : this.pick(e.clientX, e.clientY);
      if (this.drag && this.mode === "view" && (this.marqueeOn || Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) >= 4)) this.dragMarquee(this.drag, e);
    });
    el.addEventListener("pointerleave", () => { this.hovered = null; });
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); this.openFind(); return; }
      if (e.key === "Alt") { this.alt = true; e.preventDefault(); }
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement as HTMLElement | null)?.tagName ?? "");
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v") this.setMode("view");
        else if (e.key === "c") this.setMode("comment");
      }
      if (e.key === "Escape" && !typing) { if (this.marqueeOn) { this.cancelMarquee(); this.drag = null; } else if (this.menuFor) this.closeMenu(); else if (this.composing) this.closeComposer(); else if (this.mode === "comment") this.setMode("view"); else this.select(null); }
    });
    window.addEventListener("keyup", (e) => { if (e.key === "Alt") this.alt = false; });
    window.addEventListener("blur", () => { this.alt = false; });
    v.app.ticker.add(() => this.frame());
    v.onLoaded = () => {
      const alive = (id: string) => !!v.scene?.nodes.has(id);
      if (this.selected && !alive(this.selected)) this.selected = null;
      if (this.multi.length) { this.multi = this.multi.filter(alive); if (this.multi.length < 2) { this.selected = this.multi[0] ?? null; this.multi = []; } }
      this.render();
    };
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

  select(id: string | null) { this.selected = id; this.multi = []; this.render(); }

  /** The marquee result: nothing clears the selection, one frame is an ordinary selection, several are a multi-selection. */
  selectMany(ids: string[]) {
    if (ids.length < 2) return this.select(ids[0] ?? null);
    this.selected = null;
    this.multi = ids;
    this.render();
  }

  /** Ids of what is selected right now: none, one, or the frames of the marquee. */
  selection(): string[] { return this.multi.length ? [...this.multi] : this.selected ? [this.selected] : []; }

  // ---- selection area (drag with the left button in View mode) --------------
  private dragMarquee(from: { x: number; y: number }, e: PointerEvent) {
    this.marqueeOn = true;
    const r = rectBetween(from, { x: e.clientX, y: e.clientY });
    Object.assign(this.marqueeEl.style, { display: "block", left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
  }

  private endMarquee(from: { x: number; y: number }, e: PointerEvent) {
    const cr = this.v.app.canvas.getBoundingClientRect(), w = this.v.world, s = w.scale.x;
    const r = rectBetween({ x: from.x - cr.left, y: from.y - cr.top }, { x: e.clientX - cr.left, y: e.clientY - cr.top });
    this.cancelMarquee();
    this.selectMany(outermostEnclosed(this.v.frameBoxes(), { x: (r.x - w.x) / s, y: (r.y - w.y) / s, w: r.w / s, h: r.h / s }));
  }

  private cancelMarquee() { this.marqueeOn = false; this.marqueeEl.style.display = "none"; }

  private drawMulti() {
    this.multiLayer.replaceChildren(...(this.mode === "view" ? this.multi : []).flatMap((id) => {
      const r = this.rectOf(id);
      if (!r) return [];
      const b = this.toScreen(r);
      return [abs(`position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;border:2px solid #6ea8ff;box-sizing:border-box`)];
    }));
  }

  /** The part of the screen the floating panels cover, so a camera flight keeps its target clear of them. */
  private insets(): Insets {
    const shown = (e: HTMLElement) => e.getClientRects().length > 0;
    const W = window.innerWidth, H = window.innerHeight;
    const bottomEdge = Math.min(this.modesBox.offsetTop, shown(this.bubble) ? this.bubble.offsetTop : H);
    return {
      left: shown(this.popup) ? this.popup.offsetLeft + this.popup.offsetWidth + 12 : 0,
      right: shown(this.cPanel) ? W - this.cPanel.offsetLeft + 12 : 0,
      top: this.findBox.offsetTop + this.findBox.offsetHeight + 12,
      bottom: H - bottomEdge + 12,
    };
  }

  // ---- modes and the comment composer -------------------------------------
  // ---- right-click menu: what you can do with the node under the pointer ----
  private openMenu(id: string, x: number, y: number) {
    const n = this.v.scene?.data.get(id);
    if (!n) return;
    this.menuFor = id;
    const item = (ic: string, label: string, run: () => void) => {
      const b = h("button", "mk-menuitem", icon(ic, 14), label);
      b.setAttribute("role", "menuitem");
      b.addEventListener("click", run);
      return b;
    };
    const comment = item("comment", "Comment", () => { this.closeMenu(); this.setMode("comment"); this.openComposer(id, x, y); });
    const copy = item("copy", "Copy id", () => {
      void navigator.clipboard?.writeText(id).then(() => { copy.lastChild!.textContent = "Copied"; setTimeout(() => this.closeMenu(), 600); }, () => this.closeMenu());
    });
    this.menu.setAttribute("role", "menu");
    this.menu.replaceChildren(h("div", "mk-menuhead", n.name ?? n.id), comment, copy);
    this.menu.onkeydown = (e) => {
      const items = [...this.menu.querySelectorAll<HTMLElement>(".mk-menuitem")];
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") { items[(at + 1) % items.length].focus(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { items[(at - 1 + items.length) % items.length].focus(); e.preventDefault(); }
    };
    this.menu.style.left = Math.max(8, Math.min(x + 8, window.innerWidth - 200)) + "px";
    this.menu.style.top = Math.max(8, Math.min(y + 8, window.innerHeight - 130)) + "px";
    this.menu.style.display = "block";
    if (!reduceMotion()) this.menu.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 120, easing: "cubic-bezier(.2,.8,.2,1)" });
    comment.focus();
  }

  private closeMenu() {
    if (!this.menuFor) return;
    this.menuFor = null;
    if (this.menu.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.menu.style.display = "none";
  }

  setMode(m: "view" | "comment") {
    if (m === this.mode) return;
    this.closeMenu();
    this.mode = m;
    this.modeView.setAttribute("aria-pressed", String(m === "view"));
    this.modeComment.setAttribute("aria-pressed", String(m === "comment"));
    this.v.app.canvas.style.cursor = m === "comment" ? "crosshair" : "";
    this.closeComposer(false);
    this.select(null); // hides the info popup
    this.toggleComments(m === "comment"); // the list follows the mode
    this.renderComments();
  }

  private openComposer(id: string, x: number, y: number) {
    const n = this.v.scene?.data.get(id);
    if (!n) return;
    this.composing = id;
    this.select(id); // the blue box marks the target
    const area = h("textarea", "mk-textarea") as HTMLTextAreaElement;
    area.placeholder = "What should change? The agent reads this.";
    const post = h("button", "mk-btn", "Post");
    post.disabled = true;
    const cancel = h("button", "mk-btn2", "Cancel");
    const submit = () => {
      const text = area.value.trim();
      if (!text) return;
      this.send({ type: "addComment", nodeId: id, text });
      this.closeComposer();
    };
    area.addEventListener("input", () => { post.disabled = !area.value.trim(); });
    area.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { this.closeComposer(); e.stopPropagation(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    });
    post.addEventListener("click", submit);
    cancel.addEventListener("click", () => this.closeComposer());
    this.composer.replaceChildren(
      h("div", "mk-head", h("span", "mk-glyph", icon(n.type in ICONS ? n.type : "dot", 16)),
        h("div", "mk-headtext", h("div", "mk-title", `Comment on ${n.name ?? n.id}`), h("div", "mk-sub", cap(n.type)))),
      area,
      h("div", "mk-actions", h("span", "mk-kbd", "Ctrl Enter"), cancel, post),
    );
    this.composer.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - 328)) + "px";
    this.composer.style.top = Math.max(8, Math.min(y + 14, window.innerHeight - 230)) + "px";
    this.composer.style.display = "block";
    if (!reduceMotion()) this.composer.animate([{ opacity: 0, transform: "translateY(6px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" });
    area.focus();
  }

  private closeComposer(clearSelection = true) {
    if (!this.composing) return;
    this.composing = null;
    // A hidden textarea can keep focus for a moment, which would make the next Escape look like typing.
    if (this.composer.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.composer.style.display = "none";
    if (clearSelection && this.mode === "comment") this.select(null);
  }

  // ---- search bar (always visible, Ctrl+F focuses it) ---------------------
  openFind(focus = true) {
    this.findList.style.display = "block";
    if (focus) { this.findInput.focus(); this.findInput.select(); }
    this.findIdx = 0;
    this.runFind();
  }
  closeFind() { this.findInput.value = ""; this.findList.style.display = "none"; this.findInput.blur(); }

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
      const row = h("div", "mk-row", icon("frame", 14), h("span", "mk-name", n.name ?? id), h("span", "mk-meta", `${tops.has(id) ? "Page " : ""}${b ? Math.round(b.w) + " × " + Math.round(b.h) : ""}`));
      if (i === this.findIdx) row.dataset.on = "";
      row.addEventListener("mousedown", (e) => { e.preventDefault(); this.goTo(id); });
      return row;
    }));
    if (!hits.length) this.findList.append(h("div", "mk-empty", "No frame matches. Try part of a name or an id."));
    if (keepScroll) this.findList.children[this.findIdx]?.scrollIntoView({ block: "nearest" });
  }

  private goTo(id: string | undefined) {
    if (!id) return;
    this.closeFind(); // first, so the camera sees the screen as it will be
    this.select(id);
    void this.flyTo([id]);
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
    this.drawMulti();
    this.drawLocate();
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
      const label = abs(`position:absolute;background:#f43f5e;color:#fff;font:11px/1.3 "Segoe UI",system-ui,sans-serif;padding:1px 5px;border-radius:5px;left:${p.x + (horizontal ? p.w / 2 : 4)}px;top:${p.y + (horizontal ? 4 : p.h / 2)}px`);
      label.textContent = String(Math.round(sg.v * 10) / 10);
      this.measure.append(abs(`position:absolute;background:#f43f5e;left:${p.x}px;top:${p.y}px;width:${horizontal ? p.w : 1}px;height:${horizontal ? 1 : p.h}px`), label);
    }
  }

  /** Briefly outline nodes the agent just changed or added (violet = the agent). */
  flash(ids: string[]) { const t0 = performance.now(); this.flashes.push(...ids.map((id) => ({ id, t0 }))); }

  /** Where an agent just deleted nodes: a red dashed box that fades out, so a deletion is visible too. */
  ghost(boxes: Rect[]) { const t0 = performance.now(); this.ghosts.push(...boxes.map((r) => ({ r, t0 }))); }

  private drawFlashes() {
    const now = performance.now();
    this.ghosts = this.ghosts.filter((g) => now - g.t0 < 1600);
    this.flashes = this.flashes.filter((f) => now - f.t0 < 1600);
    const gh = this.ghosts.map((g) => {
      const s = this.toScreen(g.r);
      const o = Math.max(0, 1 - (now - g.t0) / 1600);
      return abs(`position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;border:2px dashed #f43f5e;background:#f43f5e26;box-sizing:border-box;opacity:${o}`);
    });
    this.flashLayer.replaceChildren(...gh, ...this.flashes.flatMap((f) => {
      const r = this.rectOf(f.id);
      if (!r) return [];
      const s = this.toScreen(r);
      const o = Math.max(0, 1 - (now - f.t0) / 1600);
      return [abs(`position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;border:2px solid #a78bfa;background:#a78bfa26;box-sizing:border-box;opacity:${o}`)];
    }));
  }

  /** Flies the camera to the nodes, and once it has arrived their outlines breathe for a few beats so you can see where they are. */
  async flyTo(ids: string[]) {
    const r = await this.v.focusNodes(ids);
    if (r.ok) this.locating = { ids, t0: performance.now() };
    return r;
  }

  private drawLocate() {
    const L = this.locating;
    if (!L) return;
    const t = performance.now() - L.t0, total = this.locateBeats * this.locatePeriodMs, fade = 500;
    if (t > total + fade) { this.locating = null; this.locateLayer.replaceChildren(); return; }
    // Starts bright, dims to a tenth and comes back, once per beat; reduced motion keeps it steady. The last beat fades out.
    const breath = reduceMotion() ? 1 : 0.55 + 0.45 * Math.cos((2 * Math.PI * t) / this.locatePeriodMs);
    const o = Math.max(0, Math.min(1, breath)) * (t > total ? Math.max(0, 1 - (t - total) / fade) : 1);
    this.locateLayer.replaceChildren(...L.ids.flatMap((id) => {
      const r = this.v.ownBounds(id) ?? this.rectOf(id);
      if (!r) return [];
      const b = this.toScreen(r);
      return [abs(`position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;box-sizing:border-box;border:3px solid #6ea8ff;border-radius:2px;box-shadow:0 0 0 1px #6ea8ff66,0 0 28px 4px #6ea8ff88;opacity:${o}`)];
    }));
  }

  /** Boxes of the floating UI (panels, toolbar, indicator…). Pins are kept out of them so nothing hides a marker. */
  private chromeRects(): DOMRect[] {
    return [this.modesBox, this.findBox, this.agents.el, this.cLauncher, this.cPanel, this.popup, this.bubble, this.composer, this.menu]
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
  }

  /** The free spot nearest to `p`: a point that clears every box and stays inside the window. Candidates come from a grid
   *  of the boxes' own edges, so a pin leaving one box never lands in the box next to it. */
  private clearOf(p: { x: number; y: number }, boxes: DOMRect[], taken: { x: number; y: number }[] = []) {
    const pad = 16, gap = 26, W = window.innerWidth, H = window.innerHeight;
    const blocked = (x: number, y: number) => boxes.some((b) => x > b.left - pad && x < b.right + pad && y > b.top - pad && y < b.bottom + pad);
    if (!blocked(p.x, p.y)) return p;
    const inside = (x: number, y: number) => x >= pad / 2 && x <= W - pad / 2 && y >= pad / 2 && y <= H - pad / 2;
    // Pins that were already moved out of the way must not be stacked on the same spot.
    const free = (x: number, y: number) => inside(x, y) && !blocked(x, y) && taken.every((t) => Math.hypot(t.x - x, t.y - y) >= gap);
    const xs = [p.x, ...boxes.flatMap((b) => [b.left - pad, b.right + pad])];
    const ys = [p.y, ...boxes.flatMap((b) => [b.top - pad, b.bottom + pad])];
    const spots = xs.flatMap((x) => ys.map((y) => ({ x, y }))).filter((s) => inside(s.x, s.y) && !blocked(s.x, s.y))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (const s of spots) {
      if (free(s.x, s.y)) return s;
      for (let k = 1; k <= 3; k++) for (const [dx, dy] of [[0, gap], [gap, 0], [-gap, 0], [0, -gap]]) if (free(s.x + dx * k, s.y + dy * k)) return { x: s.x + dx * k, y: s.y + dy * k };
    }
    return spots[0] ?? p;
  }

  private drawPins() {
    this.pins.replaceChildren();
    if (this.mode !== "comment") return;
    const open = this.comments.filter((c) => !c.resolved);
    if (!open.length) return;
    const boxes = this.chromeRects();
    const lines = document.createElementNS(SVG_NS, "svg");
    lines.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;overflow:visible");
    const marks: HTMLElement[] = [];
    const placed: { x: number; y: number }[] = [];
    const count = new Map<string, number>();
    open.forEach((c, idx) => {
      const r = this.rectOf(c.nodeId);
      if (!r) return;
      const s = this.toScreen(r);
      const n = count.get(c.nodeId) ?? 0;
      count.set(c.nodeId, n + 1);
      const anchor = { x: s.x + s.w + n * 22, y: s.y }; // the node's top right corner
      if (anchor.x < -20 || anchor.y < -20 || anchor.x > window.innerWidth + 20 || anchor.y > window.innerHeight + 20) return; // off screen
      const at = this.clearOf(anchor, boxes, placed);
      placed.push(at);
      const color = c.author === "agent" ? "#a78bfa" : "#f5b942";
      if (at.x !== anchor.x || at.y !== anchor.y) {
        // The pin had to leave its node, so a line and a dot show where it belongs.
        const ln = document.createElementNS(SVG_NS, "line");
        for (const [k, v] of Object.entries({ x1: anchor.x, y1: anchor.y, x2: at.x, y2: at.y, stroke: color, "stroke-width": 1.5, "stroke-opacity": 0.7 })) ln.setAttribute(k, String(v));
        const dot = document.createElementNS(SVG_NS, "circle");
        for (const [k, v] of Object.entries({ cx: anchor.x, cy: anchor.y, r: 3, fill: color })) dot.setAttribute(k, String(v));
        lines.append(ln, dot);
      }
      const pin = abs(`position:absolute;left:${at.x - 10}px;top:${at.y - 10}px;width:20px;height:20px;border-radius:50%;background:${color};color:#17181c;box-shadow:0 0 0 2px #17181c;font:600 11px/20px 'Segoe UI',system-ui,sans-serif;text-align:center`);
      pin.textContent = String(idx + 1);
      marks.push(pin);
    });
    this.pins.append(lines, ...marks);
  }

  // ---- status bubble (bottom centre) --------------------------------------
  setComments(list: Comment[]) { this.comments = list; this.render(); }

  /** An agent did something. The indicator top right breathes in, stays while calls keep coming, then breathes out. */
  setAgent(name: string, tool: string) { this.agents.set(name, tool); }

  setStatus(text: string, state: "working" | "idle" | string) {
    clearTimeout(this.bubbleTimer);
    if (!text) { this.agents.endAll(); this.bubble.style.display = "none"; return; }
    if (state !== "working") this.agents.endAll(); // "idle" means the agent is completely done, so the glow around the screen breathes out
    const wasHidden = this.bubble.style.display === "none" || !this.bubble.style.display;
    this.bubbleText.textContent = text;
    this.bubble.dataset.state = state === "working" ? "working" : "idle";
    this.bubble.style.display = "flex";
    if (wasHidden && !reduceMotion()) this.bubble.animate([{ opacity: 0, transform: "translate(-50%, 10px)" }, { opacity: 1, transform: "translate(-50%, 0)" }], { duration: 180, easing: "ease-out" });
    if (state !== "working") this.bubbleTimer = setTimeout(() => { this.bubble.style.display = "none"; }, 6000);
  }

  // ---- info popup (only for the clicked node) -----------------------------
  render() {
    if (!this.v.scene) return;
    this.emptyEl.style.display = this.v.scene.frames.size ? "none" : "block";
    this.renderThemes();
    this.renderPopup();
    this.renderComments();
  }

  private renderThemes() {
    const doc = this.v.doc;
    const theme = doc ? { ...defaultTheme(doc), ...this.v.theme } : {};
    this.themeSlot.replaceChildren(...Object.entries(doc?.themes ?? {}).map(([axis, values]) => {
      const sel = h("select", "mk-select");
      for (const val of values) { const o = document.createElement("option"); o.value = val; o.textContent = val; o.selected = theme[axis] === val; sel.append(o); }
      sel.addEventListener("change", () => void this.v.setTheme(axis, sel.value));
      return h("label", "mk-field", h("span", "", axis), sel); // labelled, so it is clearly the design's theme and not the extension's
    }));
  }

  private row(k: string, v: string, swatch?: string) {
    const val = h("span", "mk-v");
    if (swatch) { const s = h("span", "mk-swatch"); s.style.background = swatch; val.append(s); }
    val.append(v);
    return [h("span", "mk-k", k), val];
  }

  private renderPopup() {
    const many = this.mode === "view" && this.multi.length > 1 ? this.multi : null;
    const n = many ? null : this.mode === "view" && this.selected ? this.v.scene?.data.get(this.selected) : null;
    const p = this.popup;
    if (!n && !many) {
      if (!this.shownFor) return;
      this.shownFor = null;
      if (reduceMotion()) { p.style.display = "none"; return; }
      p.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-16px) scale(.97)" }], { duration: 140, easing: "ease-in" }).onfinish = () => { if (!this.shownFor) p.style.display = "none"; };
      return;
    }
    if (many) {
      const closeAll = h("button", "mk-iconbtn", icon("close", 14));
      closeAll.title = "Clear selection";
      closeAll.setAttribute("aria-label", "Clear selection");
      closeAll.addEventListener("click", () => this.select(null));
      const rows = many.map((id) => {
        const f = this.v.scene?.data.get(id), box = this.v.ownBounds(id);
        const row = h("div", "mk-row", icon("frame", 14), h("span", "mk-name", f?.name ?? id), h("span", "mk-meta", box ? `${Math.round(box.w)} × ${Math.round(box.h)}` : ""));
        row.addEventListener("click", () => this.select(id));
        return row;
      });
      p.replaceChildren(
        h("div", "mk-head", h("span", "mk-glyph", icon("frame", 16)), h("div", "mk-headtext", h("div", "mk-title", `${many.length} frames selected`), h("div", "mk-sub", "Drag again to change the selection")), closeAll),
        h("div", "mk-multilist", ...rows),
        h("div", "mk-hint", "Your agent can read this selection."),
      );
      return this.reveal("\0multi");
    }
    if (!n) return;
    const b = this.rectOf(n.id);
    const { children, ...props } = n as Record<string, any>;
    const json = JSON.stringify(props, null, 1);

    const close = h("button", "mk-iconbtn", icon("close", 14));
    close.title = "Close";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => this.select(null));

    const idChip = h("button", "mk-chip", n.id);
    idChip.title = "Copy id";
    idChip.addEventListener("click", () => {
      void navigator.clipboard?.writeText(n.id).then(() => { idChip.textContent = "Copied"; setTimeout(() => { idChip.textContent = n.id; }, 1200); }, () => undefined);
    });

    const glyph = h("span", "mk-glyph", icon(n.type in ICONS ? n.type : "dot", 16));
    const geo = h("div", "mk-geo", ...(["x", "y", "w", "h"] as const).map((k) => h("div", "mk-cell", h("b", "", b ? String(Math.round(b[k])) : "-"), h("span", "", k.toUpperCase()))));

    const rows: HTMLElement[] = [];
    const color = (s: unknown) => (typeof s === "string" && /^(#|rgb|hsl)/i.test(s) ? s : undefined);
    if (typeof props.fill === "string") rows.push(...this.row("Fill", props.fill, color(props.fill)));
    if (props.layout) rows.push(...this.row("Layout", String(props.layout)));
    if (props.cornerRadius !== undefined) rows.push(...this.row("Radius", Array.isArray(props.cornerRadius) ? props.cornerRadius.join(", ") : String(props.cornerRadius)));
    if (props.opacity !== undefined) rows.push(...this.row("Opacity", String(props.opacity)));
    if (n.type === "text" && props.fontFamily) rows.push(...this.row("Font", `${props.fontFamily}${props.fontSize ? " " + props.fontSize : ""}`));
    if (children) rows.push(...this.row("Children", String((children as unknown[]).length)));

    p.replaceChildren(
      h("div", "mk-head", glyph, h("div", "mk-headtext", h("div", "mk-title", n.name ?? n.id), h("div", "mk-sub", cap(n.type), idChip)), close),
      geo,
      ...(rows.length ? [h("div", "mk-rows", ...rows)] : []),
      h("details", "mk-details", h("summary", "", "All properties"), h("pre", "mk-pre", json.length > 2000 ? json.slice(0, 2000) + "\n…" : json)),
      h("div", "mk-hint", "Hold Alt over another node to measure the distance."),
    );
    this.reveal(n.id);
  }

  /** Already open: the content was swapped and that is all. Only a fresh open slides in. */
  private reveal(key: string) {
    const p = this.popup, wasOpen = this.shownFor !== null;
    this.shownFor = key;
    p.style.display = "block";
    if (wasOpen || reduceMotion()) return;
    p.animate([{ opacity: 0, transform: "translateX(-16px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  // ---- comments area (bottom right launcher, floating panel on the right) ----
  private toggleComments(open = !this.commentsOpen) {
    if (open === this.commentsOpen) return;
    this.commentsOpen = open;
    this.cLauncher.setAttribute("aria-expanded", String(open));
    const p = this.cPanel;
    if (open) {
      this.renderComments();
      p.style.display = "block";
      if (!reduceMotion()) p.animate([{ opacity: 0, transform: "translateX(16px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
    } else if (reduceMotion()) p.style.display = "none";
    else p.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(16px) scale(.97)" }], { duration: 140, easing: "ease-in" }).onfinish = () => { if (!this.commentsOpen) p.style.display = "none"; };
  }

  private renderComments() {
    const open = this.comments.filter((c) => !c.resolved);
    this.cBadge.textContent = String(open.length);
    this.cBadge.style.display = open.length ? "" : "none";
    this.modeBadge.textContent = String(open.length);
    this.modeBadge.style.display = open.length ? "" : "none";
    this.cLauncher.style.display = this.mode === "comment" ? "flex" : "none";
    this.cLauncher.setAttribute("aria-label", `Comments, ${open.length} open`);
    if (!this.commentsOpen) return;
    const p = this.cPanel, top = p.scrollTop;
    const resolvedCount = this.comments.length - open.length;
    const shown = this.comments.filter((c) => this.showResolved || !c.resolved);

    const close = h("button", "mk-iconbtn", icon("close", 14));
    close.title = "Close";
    close.setAttribute("aria-label", "Close comments");
    close.addEventListener("click", () => this.toggleComments(false));

    const items = shown.map((c) => {
      const node = this.v.scene?.data.get(c.nodeId);
      // Same numbers as the pins on the canvas, which count open comments only.
      const badge = h("span", "mk-avatar", c.resolved ? "✓" : String(open.indexOf(c) + 1));
      if (c.author === "agent") badge.dataset.agent = "";
      badge.title = c.author === "agent" ? "Agent" : "You";
      const where = h("button", "mk-link", node ? (node.name ?? node.id) : "a deleted node");
      if (node) where.addEventListener("click", () => { void this.flyTo([c.nodeId]); });
      else where.disabled = true;
      const done = h("button", "mk-link", c.resolved ? "Reopen" : "Resolve");
      done.addEventListener("click", () => this.send({ type: "resolveComment", id: c.id, resolved: !c.resolved }));
      done.style.marginLeft = "8px";
      // Deleting cannot be undone, so the first click only arms the button for three seconds.
      const del = h("button", "mk-link", "Delete");
      del.style.marginLeft = "8px";
      let armed: ReturnType<typeof setTimeout> | undefined;
      del.addEventListener("click", () => {
        if (armed === undefined) { del.textContent = "Click again to delete"; armed = setTimeout(() => { armed = undefined; del.textContent = "Delete"; }, 3000); return; }
        clearTimeout(armed);
        this.send({ type: "deleteComment", id: c.id });
      });
      const item = h("div", "mk-citem", badge, h("div", "mk-ctext", h("div", "", c.text), h("div", "mk-cmeta", `${c.author === "agent" ? "Agent" : "You"} on `, where, done, del)));
      if (c.resolved) item.dataset.done = "";
      return item;
    });

    const toggle = resolvedCount ? h("button", "mk-link", `${this.showResolved ? "Hide" : "Show"} resolved (${resolvedCount})`) : "";
    if (toggle instanceof HTMLElement) { toggle.style.marginTop = "12px"; toggle.addEventListener("click", () => { this.showResolved = !this.showResolved; this.renderComments(); }); }

    p.replaceChildren(
      h("div", "mk-head", h("div", "mk-headtext", h("div", "mk-title", "Comments"), h("div", "mk-sub", `${open.length} open`)), close),
      ...(items.length ? items : [h("div", "mk-empty", "No comments yet. Click a node on the canvas to add one, and the agent will see it.")]),
      toggle,
      h("div", "mk-hint", "Click a node on the canvas to leave a comment."),
    );
    p.scrollTop = top;
  }
}
