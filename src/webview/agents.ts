import { h, reduceMotion } from "./ui-kit";

const ACTION: Record<string, string> = {
  read: "Reading", edit: "Editing", lint: "Checking", open: "Opening the file", state: "Looking around",
  focus: "Focusing a node", screenshot: "Taking a screenshot", comments: "Reading comments", comment: "Commenting", status: "Working",
};
/** "claude-code" becomes "Claude Code". */
const pretty = (name: string) => name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const QUIET_MS = 5000;

type View = { el: HTMLElement; halo: HTMLElement; act: HTMLElement; phase: "in" | "loop" | "out"; timer?: ReturnType<typeof setTimeout> };

/** Who is working on the file, top right. An agent breathes in when it connects, breathes while its calls keep
 *  coming, and breathes out after a few quiet seconds (or when told to end). */
export class AgentPresence {
  readonly el = h("div", "mk-agents");
  private views = new Map<string, View>();

  /** Call on every agent action. The first call breathes in; later calls only refresh the label and the quiet timer. */
  set(name: string, tool: string) {
    let v = this.views.get(name);
    if (v?.phase === "out") { v.el.remove(); this.views.delete(name); v = undefined; }
    if (!v) {
      const halo = h("i", "mk-halo"), act = h("span", "mk-aact");
      const el = h("div", "mk mk-card mk-agent", h("span", "mk-pulse", halo, h("i", "mk-core")), h("span", "mk-aname", pretty(name)), act);
      el.setAttribute("role", "status");
      const view: View = { el, halo, act, phase: reduceMotion() ? "loop" : "in" };
      el.dataset.phase = view.phase;
      el.addEventListener("animationend", (e) => {
        if (e.animationName === "mk-breath-in") { view.phase = "loop"; el.dataset.phase = "loop"; }
        else if (e.animationName === "mk-agent-out") { el.remove(); if (this.views.get(name) === view) this.views.delete(name); }
      });
      this.el.append(el);
      this.views.set(name, view);
      v = view;
    }
    v.act.textContent = ACTION[tool] ?? "Working";
    clearTimeout(v.timer);
    v.timer = setTimeout(() => this.end(name), QUIET_MS);
  }

  endAll() { for (const name of [...this.views.keys()]) this.end(name); }

  private end(name: string) {
    const v = this.views.get(name);
    if (!v || v.phase === "out") return;
    clearTimeout(v.timer);
    if (reduceMotion()) { v.el.remove(); this.views.delete(name); return; }
    // Start breathing out from wherever the loop currently is, so there is no jump.
    const cs = getComputedStyle(v.halo);
    v.halo.style.setProperty("--o0", cs.opacity);
    v.halo.style.setProperty("--s0", String(new DOMMatrix(cs.transform).a));
    v.phase = "out";
    v.el.dataset.phase = "out";
    setTimeout(() => { if (this.views.get(name) === v) { v.el.remove(); this.views.delete(name); } }, 1500);
  }
}
