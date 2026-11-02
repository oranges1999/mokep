import type { Comment } from "../core/comments";
import { defaultTheme } from "../core/variables";
import { AgentPresence } from "./agents";
import { abs, cap, CSS, h, icon, ICONS, reduceMotion } from "./ui-kit";
import { Viewer } from "./viewer";

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
    this.overlay.append(this.flashLayer, this.hovBox, this.selBox, this.measure, this.pins);
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
    document.body.append(this.overlay, this.popup, this.findBox, this.bubble, this.agents.el, this.modesBox, this.cLauncher, this.cPanel, this.composer, this.emptyEl);
    host.style.right = "0";
    const el = v.app.canvas;
    let down: { x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener("pointerup", (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) {
        const id = this.pick(e.clientX, e.clientY);
        if (this.mode === "comment") { if (id) this.openComposer(id, e.clientX, e.clientY); else this.closeComposer(); }
        else this.select(id);
      }
      down = null;
    });
    el.addEventListener("pointermove", (e) => { this.hovered = this.pick(e.clientX, e.clientY); });
    el.addEventListener("pointerleave", () => { this.hovered = null; });
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); this.openFind(); return; }
      if (e.key === "Alt") { this.alt = true; e.preventDefault(); }
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement as HTMLElement | null)?.tagName ?? "");
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v") this.setMode("view");
        else if (e.key === "c") this.setMode("comment");
      }
      if (e.key === "Escape" && !typing) { if (this.composing) this.closeComposer(); else if (this.mode === "comment") this.setMode("view"); else this.select(null); }
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

  // ---- modes and the comment composer -------------------------------------
  setMode(m: "view" | "comment") {
    if (m === this.mode) return;
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
      const label = abs(`position:absolute;background:#f43f5e;color:#fff;font:11px/1.3 "Segoe UI",system-ui,sans-serif;padding:1px 5px;border-radius:5px;left:${p.x + (horizontal ? p.w / 2 : 4)}px;top:${p.y + (horizontal ? 4 : p.h / 2)}px`);
      label.textContent = String(Math.round(sg.v * 10) / 10);
      this.measure.append(abs(`position:absolute;background:#f43f5e;left:${p.x}px;top:${p.y}px;width:${horizontal ? p.w : 1}px;height:${horizontal ? 1 : p.h}px`), label);
    }
  }

  /** Briefly outline nodes the agent just changed or added (violet = the agent). */
  flash(ids: string[]) { const t0 = performance.now(); this.flashes.push(...ids.map((id) => ({ id, t0 }))); }

  private drawFlashes() {
    const now = performance.now();
    this.flashes = this.flashes.filter((f) => now - f.t0 < 1600);
    this.flashLayer.replaceChildren(...this.flashes.flatMap((f) => {
      const r = this.rectOf(f.id);
      if (!r) return [];
      const s = this.toScreen(r);
      const o = Math.max(0, 1 - (now - f.t0) / 1600);
      return [abs(`position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;border:2px solid #a78bfa;background:#a78bfa26;box-sizing:border-box;opacity:${o}`)];
    }));
  }

  private drawPins() {
    this.pins.replaceChildren();
    if (this.mode !== "comment") return;
    const open = this.comments.filter((c) => !c.resolved);
    const count = new Map<string, number>();
    open.forEach((c, idx) => {
      const r = this.rectOf(c.nodeId);
      if (!r) return;
      const s = this.toScreen(r);
      const n = count.get(c.nodeId) ?? 0;
      count.set(c.nodeId, n + 1);
      const pin = abs(`position:absolute;left:${s.x + s.w - 10 + n * 22}px;top:${s.y - 10}px;width:20px;height:20px;border-radius:50%;background:${c.author === "agent" ? "#a78bfa" : "#f5b942"};color:#17181c;box-shadow:0 0 0 2px #17181c;font:600 11px/20px 'Segoe UI',system-ui,sans-serif;text-align:center`);
      pin.textContent = String(idx + 1);
      this.pins.append(pin);
    });
  }

  // ---- status bubble (bottom centre) --------------------------------------
  setComments(list: Comment[]) { this.comments = list; this.render(); }

  /** An agent did something. The indicator top right breathes in, stays while calls keep coming, then breathes out. */
  setAgent(name: string, tool: string) { this.agents.set(name, tool); }

  setStatus(text: string, state: "working" | "idle" | string) {
    clearTimeout(this.bubbleTimer);
    if (!text) { this.agents.endAll(); this.bubble.style.display = "none"; return; }
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
    const n = this.mode === "view" && this.selected ? this.v.scene?.data.get(this.selected) : null;
    const p = this.popup;
    if (!n) {
      if (!this.shownFor) return;
      this.shownFor = null;
      if (reduceMotion()) { p.style.display = "none"; return; }
      p.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-16px) scale(.97)" }], { duration: 140, easing: "ease-in" }).onfinish = () => { if (!this.shownFor) p.style.display = "none"; };
      return;
    }
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
      this.animationNote(n),
      h("div", "mk-hint", "Hold Alt over another node to measure the distance."),
    );
    // Already open: the content was swapped above and that is all. Only a fresh open slides in.
    const wasOpen = this.shownFor !== null;
    this.shownFor = n.id;
    p.style.display = "block";
    if (wasOpen || reduceMotion()) return;
    p.animate([{ opacity: 0, transform: "translateX(-16px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  /** Element animation is not part of the format; agents describe it in metadata ({ type: "animation", description }). */
  private animationNote(n: Record<string, any>) {
    const m = n.metadata;
    if (!m || m.type !== "animation" || typeof m.description !== "string") return "";
    return h("div", "mk-note", h("b", "", "Animation (described)"), m.description);
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
      if (node) where.addEventListener("click", () => { this.v.focusNode(c.nodeId); this.flash([c.nodeId]); });
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
