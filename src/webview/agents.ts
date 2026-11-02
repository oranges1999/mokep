import { h, reduceMotion } from "./ui-kit";

const ACTION: Record<string, string> = {
  read: "Reading", edit: "Editing", lint: "Checking", open: "Opening the file", state: "Looking around",
  focus: "Flying to a node", selection: "Reading your selection", screenshot: "Taking a screenshot", comments: "Reading comments", comment: "Commenting", status: "Working",
};
/** "claude-code" becomes "Claude Code". */
const pretty = (name: string) => name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/** The agent ends its run itself (mokep_status idle or empty). This is only the fallback for an agent that never does,
 *  for example one that was interrupted, so the indicator cannot stay on for ever. */
const HOLD_MS = 10_000;

type View = { el: HTMLElement; halo: HTMLElement; act: HTMLElement; phase: "in" | "loop" | "out"; timer?: ReturnType<typeof setTimeout> };

/** Who is working on the file. While any agent is working a violet glow breathes around the whole screen and a small
 *  label (top right) names the agent and what it is doing. Both breathe in when the first agent arrives, keep breathing
 *  for the whole run, and breathe out when the run is over. */
export class AgentPresence {
  readonly el = h("div", "mk-agents");
  /** The glow around the screen. */
  readonly aura = h("div", "mk-aura");
  /** Milliseconds without any action after which a run counts as over. Public so tests can shorten it. */
  holdMs = HOLD_MS;
  private views = new Map<string, View>();
  private auraTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.aura.addEventListener("animationend", (e) => {
      // A late event of an animation that was already replaced must not undo the phase that replaced it.
      if (e.animationName === "mk-aura-in" && this.aura.dataset.phase === "in") this.aura.dataset.phase = "loop";
      else if (e.animationName === "mk-aura-out" && this.aura.dataset.phase === "out") this.aura.dataset.phase = "";
    });
  }

  /** Call on every agent action. The first call breathes in; later calls refresh the label and push the fallback timer back. */
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
        if (e.animationName === "mk-breath-in" && view.phase === "in") { view.phase = "loop"; el.dataset.phase = "loop"; }
        else if (e.animationName === "mk-agent-out") { el.remove(); if (this.views.get(name) === view) this.views.delete(name); }
      });
      this.el.append(el);
      this.views.set(name, view);
      v = view;
    }
    v.act.textContent = ACTION[tool] ?? "Working";
    clearTimeout(v.timer);
    v.timer = setTimeout(() => this.end(name), this.holdMs);
    this.auraOn();
  }

  /** The run is over for every agent. */
  endAll() { for (const name of [...this.views.keys()]) this.end(name); }

  private end(name: string) {
    const v = this.views.get(name);
    if (!v || v.phase === "out") return;
    clearTimeout(v.timer);
    if (reduceMotion()) { v.el.remove(); this.views.delete(name); this.auraOffIfIdle(); return; }
    // Start breathing out from wherever the loop currently is, so there is no jump.
    const cs = getComputedStyle(v.halo);
    v.halo.style.setProperty("--o0", cs.opacity);
    v.halo.style.setProperty("--s0", String(new DOMMatrix(cs.transform).a));
    v.phase = "out";
    v.el.dataset.phase = "out";
    setTimeout(() => { if (this.views.get(name) === v) { v.el.remove(); this.views.delete(name); } }, 1500);
    this.auraOffIfIdle();
  }

  private auraOn() {
    const a = this.aura;
    if (a.dataset.phase === "in" || a.dataset.phase === "loop") return; // already on
    if (reduceMotion()) { a.dataset.phase = "loop"; return; }
    a.dataset.phase = "";
    void a.offsetWidth; // restart the animation when it was breathing out
    a.dataset.phase = "in";
    this.settle("in", "loop");
  }

  /** animationend does not fire when the page is hidden or throttled; this makes sure a phase still moves on. */
  private settle(from: string, to: string) {
    clearTimeout(this.auraTimer);
    this.auraTimer = setTimeout(() => { if (this.aura.dataset.phase === from) this.aura.dataset.phase = to; }, 1500);
  }

  private auraOffIfIdle() {
    if ([...this.views.values()].some((x) => x.phase !== "out")) return; // another agent is still working
    const a = this.aura;
    if (!a.dataset.phase || a.dataset.phase === "out") return;
    if (reduceMotion()) { a.dataset.phase = ""; return; }
    a.style.setProperty("--o0", getComputedStyle(a).opacity); // breathe out from the current brightness
    a.dataset.phase = "out";
    this.settle("out", "");
  }
}
