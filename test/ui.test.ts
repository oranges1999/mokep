// Drives the real UI in Chrome with real mouse and keyboard: modes, info popup, comment composer and panel,
// agent indicator, reduced motion, empty design, wheel. Needs `npm run build` first.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import type { Server } from "node:http";
import { CHROME, launch, startServer } from "./helpers";

let server: Server, browser: Browser, port = 0;
beforeAll(async () => { ({ server, port } = await startServer()); browser = await launch(); }, 60000);
afterAll(async () => { await browser?.close(); server?.close(); });

const w = (page: Page) => page;
async function open(opts: { reducedMotion?: "reduce" } = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, ...opts });
  await page.goto(`http://127.0.0.1:${port}/harness/index.html?ui=1&frame=01-shapes`);
  await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 30000 });
  await page.evaluate(() => { (window as any).__sent = []; (window as any).__ui.send = (m: unknown) => (window as any).__sent.push(m); });
  return page;
}
/** Screen centre of a node, for real mouse clicks. */
const centre = (page: Page, id: string) => page.evaluate((nid) => { const v = (window as any).__viewer, b = v.boundsOf(nid), s = v.world.scale.x; return { x: (b.x + b.w / 2) * s + v.world.x, y: (b.y + b.h / 2) * s + v.world.y }; }, id);
const click = async (page: Page, id: string) => { const p = await centre(page, id); await page.mouse.click(p.x, p.y); };
const rclick = async (page: Page, id: string) => { const p = await centre(page, id); await page.mouse.click(p.x, p.y, { button: "right" }); };
const sent = (page: Page) => page.evaluate(() => (window as any).__sent as any[]);
const display = (page: Page, sel: string) => page.evaluate((s) => getComputedStyle(document.querySelector(s)!).display, sel);

describe.skipIf(!CHROME)("viewer UI", () => {
  it("view mode shows only the clicked node, and switching nodes does not replay the animation", async () => {
    const page = await open();
    await click(page, "n6");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mk-popup")!).display === "block");
    const first = await page.evaluate(() => document.querySelector(".mk-popup .mk-title")!.textContent);
    await page.waitForFunction(() => document.querySelector(".mk-popup")!.getAnimations().length === 0); // the opening slide has finished
    await click(page, "n9");
    const after = await page.evaluate(() => { const p = document.querySelector(".mk-popup")!; return { title: p.querySelector(".mk-title")!.textContent, animations: p.getAnimations().length, opacity: +getComputedStyle(p).opacity, text: p.textContent }; });
    expect(after.title).not.toBe(first);
    expect(after.animations).toBe(0);
    expect(after.opacity).toBe(1);
    expect(after.text).not.toMatch(/comment/i); // comments live in their own area
    expect(await display(page, ".mk-menu")).toBe("none"); // a left click only selects
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mk-popup")!).display === "none");
    await page.close();
  }, 60000);

  it("right click opens a menu with Comment and Copy id; Comment opens the composer on that node", async () => {
    const page = await open();
    await click(page, "n9");
    expect(await display(page, ".mk-menu")).toBe("none"); // left click: select only
    await rclick(page, "n9");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mk-menu")!).display === "block");
    expect(await display(page, ".mk-popup")).toBe("block"); // right click selects the node too
    const menu = await page.evaluate(() => ({ head: document.querySelector(".mk-menuhead")!.textContent, items: [...document.querySelectorAll(".mk-menuitem")].map((b) => b.textContent), focused: document.activeElement?.textContent }));
    expect(menu.items).toEqual(["Comment", "Copy id"]);
    expect(menu.head).toBeTruthy();
    expect(menu.focused).toBe("Comment");
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Copy id");
    await page.keyboard.press("ArrowUp");
    await page.getByRole("menuitem", { name: "Comment" }).click();
    expect(await display(page, ".mk-menu")).toBe("none");
    expect(await page.evaluate(() => document.querySelector(".mk-mode[aria-pressed=true]")!.getAttribute("data-kind"))).toBe("comment");
    await page.waitForSelector(".mk-composer textarea");
    expect(await page.evaluate(() => document.querySelector(".mk-composer .mk-title")!.textContent)).toContain(menu.head!);
    await page.close();
  }, 60000);

  it("the menu closes on Escape, on a left press elsewhere, on wheel and on mode change; right click on empty canvas opens nothing", async () => {
    const page = await open();
    const isOpen = () => display(page, ".mk-menu").then((d) => d === "block");
    await rclick(page, "n6"); expect(await isOpen()).toBe(true);
    await page.keyboard.press("Escape"); expect(await isOpen()).toBe(false);
    expect(await display(page, ".mk-popup")).toBe("block"); // the node stays selected
    await rclick(page, "n6"); expect(await isOpen()).toBe(true);
    await page.mouse.click(5, 450); expect(await isOpen()).toBe(false);
    await rclick(page, "n6"); await page.mouse.wheel(0, 40); expect(await isOpen()).toBe(false);
    await rclick(page, "n6"); await page.keyboard.press("c");
    expect(await isOpen()).toBe(false);
    await page.mouse.click(5, 450, { button: "right" }); expect(await isOpen()).toBe(false); // nothing under the pointer
    await rclick(page, "n6"); expect(await isOpen()).toBe(true); // comment mode: the right button still opens the menu
    await page.keyboard.press("Escape");
    await click(page, "n9"); // comment mode, left click: straight to the composer, no menu
    expect(await isOpen()).toBe(false);
    await page.waitForSelector(".mk-composer textarea");
    await page.close();
  }, 60000);

  it("Copy id shows Copied and closes the menu", async () => {
    const page = await open();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await rclick(page, "n9");
    await page.getByRole("menuitem", { name: "Copy id" }).click();
    await page.waitForFunction(() => document.querySelector(".mk-menuitem:last-child")?.textContent === "Copied"); // the clipboard write is asynchronous
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mk-menu")!).display === "none");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\S/);
    await page.close();
  }, 60000);

  it("comment pins step aside for the agent indicator and the panels, and a line shows where they belong", async () => {
    const page = await open();
    await page.evaluate(() => {
      const ui = (window as any).__ui;
      ui.setComments([
        { id: "c1", nodeId: "n1a", text: "Check", author: "user", createdAt: "", resolved: false },
        { id: "c2", nodeId: "n1a", text: "Again", author: "agent", createdAt: "", resolved: false },
      ]);
      ui.setAgent("claude-code", "read");
    });
    await page.keyboard.press("c");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mk-cpanel")!).display === "block");
    // Put the frame's top right corner right under the agent indicator, then under the comments panel.
    const probe = (x: number, y: number) => page.evaluate(async ({ x, y }) => {
      const v = (window as any).__viewer, ui = (window as any).__ui, b = v.boundsOf("n1a"), s = v.world.scale.x;
      v.world.position.set(x - (b.x + b.w) * s, y - b.y * s);
      // Wait for two frames of the renderer: software GL is slow, so a fixed delay would not be enough.
      const tick = () => new Promise<void>((r) => v.app.ticker.addOnce(() => r()));
      await tick(); await tick();
      const boxes: DOMRect[] = ui.chromeRects();
      const pins = [...ui.pins.children].filter((e: Element) => e.tagName === "DIV") as HTMLElement[];
      const rects = pins.map((p) => p.getBoundingClientRect());
      const hidden = rects.some((r) => boxes.some((c) => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top));
      const stacked = rects.some((a, i) => rects.some((b, j) => i < j && Math.hypot(a.x - b.x, a.y - b.y) < 20));
      return { pins: pins.length, hidden, stacked, lines: ui.pins.querySelectorAll("line").length };
    }, { x, y });
    const underIndicator = await probe(1400 - 90, 30);
    expect(underIndicator).toMatchObject({ pins: 2, hidden: false, stacked: false });
    expect(underIndicator.lines).toBeGreaterThan(0);
    const underPanel = await probe(1400 - 150, 250);
    expect(underPanel).toMatchObject({ pins: 2, hidden: false, stacked: false });
    expect(underPanel.lines).toBeGreaterThan(0);
    const free = await probe(700, 450); // nothing in the way: pins stay on their node, no lines
    expect(free).toMatchObject({ pins: 2, hidden: false, stacked: false, lines: 0 });
    await page.close();
  }, 60000);

  it("comment mode: click a node, type, post, and the host receives the text", async () => {
    const page = await open();
    await page.keyboard.press("c");
    expect(await page.evaluate(() => [...document.querySelectorAll(".mk-mode")].map((b) => b.getAttribute("aria-pressed")))).toEqual(["false", "true"]);
    expect(await display(page, ".mk-popup")).toBe("none");
    await click(page, "n9");
    await page.waitForSelector(".mk-composer textarea");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
    expect(await page.evaluate(() => (document.querySelector(".mk-composer .mk-btn") as HTMLButtonElement).disabled)).toBe(true);
    await page.keyboard.type("v c Round this corner"); // typing must not switch modes
    expect(await page.evaluate(() => document.querySelector(".mk-mode[aria-pressed=true]")!.getAttribute("data-kind"))).toBe("comment");
    await page.keyboard.press("Control+Enter");
    const msgs = await sent(page);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ type: "addComment", text: "v c Round this corner" });
    expect(typeof msgs[0].nodeId).toBe("string");
    expect(await display(page, ".mk-composer")).toBe("none");
    await page.close();
  }, 60000);

  it("Escape cancels the composer first, then leaves comment mode; Ctrl+C never switches", async () => {
    const page = await open();
    await page.keyboard.press("c");
    await click(page, "n9");
    await page.waitForSelector(".mk-composer textarea");
    await page.keyboard.type("draft");
    await page.keyboard.press("Escape");
    expect(await display(page, ".mk-composer")).toBe("none");
    expect(await sent(page)).toEqual([]);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.querySelector(".mk-mode[aria-pressed=true]")!.getAttribute("data-kind"))).toBe("view");
    await page.keyboard.press("Control+c");
    expect(await page.evaluate(() => document.querySelector(".mk-mode[aria-pressed=true]")!.getAttribute("data-kind"))).toBe("view");
    await page.close();
  }, 60000);

  it("comments panel: shared numbers with the pins, resolve, and a two-step delete", async () => {
    const page = await open();
    await page.evaluate(() => (window as any).__ui.setComments([
      { id: "c1", nodeId: "n1a", text: "Check spacing", author: "user", createdAt: "", resolved: false },
      { id: "c2", nodeId: "n2f", text: "Low contrast", author: "agent", createdAt: "", resolved: false },
      { id: "c3", nodeId: "n3o", text: "Shadow fixed", author: "agent", createdAt: "", resolved: true },
    ]));
    expect(await display(page, ".mk-cbtn")).toBe("none"); // comment tools only exist in comment mode
    expect(await page.evaluate(() => document.querySelector(".mk-mode .mk-badge")!.textContent)).toBe("2"); // but the count is always visible
    await page.keyboard.press("c");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mk-cpanel")!).display === "block");
    expect(await page.evaluate(() => [...document.querySelectorAll(".mk-cpanel .mk-avatar")].map((e) => e.textContent))).toEqual(["1", "2"]);
    await page.getByText("Show resolved (1)").click();
    expect(await page.evaluate(() => document.querySelectorAll(".mk-citem").length)).toBe(3);
    await page.getByText("Resolve", { exact: true }).first().click();
    expect((await sent(page)).at(-1)).toEqual({ type: "resolveComment", id: "c1", resolved: true });
    const del = page.getByText("Delete", { exact: true }).first();
    await del.click();
    expect((await sent(page)).some((m) => m.type === "deleteComment")).toBe(false); // first click only arms it
    await page.getByText("Click again to delete").click();
    expect((await sent(page)).at(-1)).toEqual({ type: "deleteComment", id: "c1" });
    await page.close();
  }, 60000);

  it("agent indicator breathes in, breathes, then breathes out; two agents get two indicators", async () => {
    const page = await open();
    await page.evaluate(() => (window as any).__ui.setAgent("claude-code", "read"));
    expect(await page.evaluate(() => document.querySelector(".mk-agent")!.getAttribute("data-phase"))).toBe("in");
    expect(await page.evaluate(() => document.querySelector(".mk-agent .mk-aname")!.textContent)).toBe("Claude Code");
    await page.waitForFunction(() => document.querySelector(".mk-agent")?.getAttribute("data-phase") === "loop", null, { timeout: 5000 });
    await page.evaluate(() => (window as any).__ui.setAgent("other-agent", "edit"));
    expect(await page.evaluate(() => document.querySelectorAll(".mk-agent").length)).toBe(2);
    await page.evaluate(() => (window as any).__ui.setAgent("claude-code", "edit"));
    expect(await page.evaluate(() => document.querySelectorAll(".mk-agent").length)).toBe(2); // same agent: relabel, no duplicate
    await page.evaluate(() => (window as any).__ui.setStatus("", "idle")); // an explicit end
    expect(await page.evaluate(() => document.querySelector(".mk-agent")!.getAttribute("data-phase"))).toBe("out");
    await page.waitForFunction(() => document.querySelectorAll(".mk-agent").length === 0, null, { timeout: 5000 });
    await page.close();
  }, 60000);

  it("the glow around the screen stays on for the whole run, ends when the agent says it is done, and cannot stay on for ever", async () => {
    const page = await open();
    const aura = () => page.evaluate(() => { const a = (window as any).__ui.agents; return { phase: a.aura.dataset.phase ?? "", pills: document.querySelectorAll(".mk-agent").length }; });
    await page.evaluate(() => { (window as any).__ui.agents.holdMs = 4000; }); // shorten the fallback timer for the test
    await page.evaluate(() => (window as any).__ui.setAgent("claude-code", "read"));
    expect((await aura()).phase).toBe("in");
    await page.waitForFunction(() => (window as any).__ui.agents.aura.dataset.phase === "loop", null, { timeout: 3500 });
    for (let i = 0; i < 5; i++) { // the agent keeps working for longer than the fallback timer, with gaps in between
      await page.waitForTimeout(900);
      await page.evaluate(() => (window as any).__ui.setAgent("claude-code", "edit"));
    }
    expect(await aura()).toEqual({ phase: "loop", pills: 1 });
    // The agent is completely done.
    await page.evaluate(() => (window as any).__ui.setStatus("Finished 3 edits", "idle"));
    expect((await aura()).phase).toBe("out");
    await page.waitForFunction(() => !(window as any).__ui.agents.aura.dataset.phase && !document.querySelector(".mk-agent"), null, { timeout: 5000 });
    // An agent that never says it is done still ends, after the fallback timer (it may still be breathing in by then on a slow machine).
    await page.evaluate(() => (window as any).__ui.setAgent("claude-code", "read"));
    await page.waitForFunction(() => !(window as any).__ui.agents.aura.dataset.phase && !document.querySelector(".mk-agent"), null, { timeout: 12000 });
    await page.close();
  }, 60000);

  it("the glow covers the screen without blocking it, and breathes", async () => {
    const page = await open();
    await page.evaluate(() => (window as any).__ui.setAgent("claude-code", "read"));
    await page.waitForFunction(() => (window as any).__ui.agents.aura.dataset.phase === "loop", null, { timeout: 4000 });
    const r = await page.evaluate(async () => {
      const a = (window as any).__ui.agents.aura as HTMLElement, box = a.getBoundingClientRect(), cs = getComputedStyle(a);
      const seen: number[] = [];
      for (let i = 0; i < 40; i++) { seen.push(+getComputedStyle(a).opacity); await new Promise((r) => setTimeout(r, 90)); }
      return { full: box.x === 0 && box.y === 0 && box.width === innerWidth && box.height === innerHeight, clicks: cs.pointerEvents, shadow: cs.boxShadow, min: Math.min(...seen), max: Math.max(...seen) };
    });
    expect(r.full).toBe(true);
    expect(r.clicks).toBe("none");
    expect(r.shadow).toContain("inset");
    expect(r.max).toBeGreaterThan(0.9);
    expect(r.min).toBeLessThan(0.7); // it dims and comes back
    await page.close();
  }, 60000);

  it("outlines breathe around the frames the camera flew to, for a few beats, and then go away", async () => {
    const page = await open();
    const r = await page.evaluate(async () => {
      const ui = (window as any).__ui;
      ui.locateBeats = 2; ui.locatePeriodMs = 300; // shortened for the test: two beats of 300 ms
      const layer = ui.locateLayer as HTMLElement;
      const before = layer.children.length;
      const res = await ui.flyTo(["n6b", "nbu"]);
      await new Promise<void>((r) => (window as any).__viewer.app.ticker.addOnce(() => r())); // the outlines are drawn on the next frame
      const after = layer.children.length;
      const seen: number[] = [];
      let border = "";
      for (let i = 0; i < 12; i++) { const c = layer.children[0] as HTMLElement | undefined; if (c) { seen.push(+c.style.opacity); border = c.style.borderTopWidth; } await new Promise((r) => setTimeout(r, 50)); }
      await new Promise((r) => setTimeout(r, 1200)); // beats plus the fade
      const bad = await ui.flyTo(["n6b", "ghost"]);
      return { before, res, after, min: Math.min(...seen), max: Math.max(...seen), gone: layer.children.length, bad, border };
    });
    expect(r.before).toBe(0); // nothing while the camera is still flying
    expect(r.res.ok).toBe(true);
    expect(r.after).toBe(2); // one outline for each requested frame
    expect(r.border).toBe("3px");
    expect(r.max).toBeGreaterThan(0.7);
    expect(r.min).toBeLessThan(0.35); // it dims and comes back
    expect(r.gone).toBe(0);
    expect(r.bad.ok).toBe(false);
    await page.close();
  }, 60000);

  it("searching for a frame also marks where it is", async () => {
    const page = await open();
    await page.evaluate(() => { const ui = (window as any).__ui; ui.locateBeats = 3; });
    await page.keyboard.press("Control+f");
    await page.keyboard.type("05-layout");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => ((window as any).__ui.locateLayer as HTMLElement).children.length === 1, null, { timeout: 6000 });
    await page.close();
  }, 60000);

  it("reduced motion: no breathing, popup opens without animation", async () => {
    const page = await open({ reducedMotion: "reduce" });
    await page.evaluate(() => (window as any).__ui.setAgent("claude-code", "read"));
    expect(await page.evaluate(() => { const a = document.querySelector(".mk-agent")!; return { phase: a.getAttribute("data-phase"), halo: a.querySelector(".mk-halo")!.getAnimations().length }; })).toEqual({ phase: "loop", halo: 0 });
    expect(await page.evaluate(() => { const a = (window as any).__ui.agents.aura as HTMLElement; return { phase: a.dataset.phase, animations: a.getAnimations().length }; })).toEqual({ phase: "loop", animations: 0 }); // a steady glow
    await click(page, "n6");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mk-popup")!).display === "block");
    expect(await page.evaluate(() => document.querySelector(".mk-popup")!.getAnimations().length)).toBe(0);
    await page.close();
  }, 60000);

  it("an empty design shows a message and a sane camera, and the first frame that arrives is in view", async () => {
    const page = await open();
    const r = await page.evaluate(async () => {
      const v = (window as any).__viewer;
      await v.load(JSON.stringify({ version: "2.21", children: [] }), false); v.fitAll();
      const empty = { scale: v.world.scale.x, message: getComputedStyle(document.querySelector(".mk-emptystate")!).display };
      await v.load(JSON.stringify({ version: "2.21", children: [{ id: "f1", type: "frame", name: "F", x: 0, y: 0, width: 800, height: 600, fill: "#FFFFFF", children: [] }] }), false); v.fitAll();
      const b = v.boundsOf("f1"), s = v.world.scale.x;
      return { empty, shown: getComputedStyle(document.querySelector(".mk-emptystate")!).display, inView: b.x * s + v.world.x >= 0 && (b.x + b.w) * s + v.world.x <= innerWidth };
    });
    expect(r.empty.message).toBe("block");
    expect(r.empty.scale).toBeGreaterThan(0.2);
    expect(r.empty.scale).toBeLessThan(5);
    expect(r.shown).toBe("none");
    expect(r.inView).toBe(true);
    await page.close();
  }, 60000);

  it("the mode switch sits bottom centre with the status bubble just above it, and nothing overlaps", async () => {
    const page = await open();
    await page.evaluate(() => (window as any).__ui.setStatus("Agent is editing", "working"));
    const r = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const m = box(".mk-modes"), b = box(".mk-bubble"), W = innerWidth, H = innerHeight;
      return { modesCentred: Math.abs(m.left + m.width / 2 - W / 2) < 2, modesBottomGap: Math.round(H - m.bottom), bubbleCentred: Math.abs(b.left + b.width / 2 - W / 2) < 2, bubbleAbove: b.bottom <= m.top, overlap: b.bottom > m.top && b.top < m.bottom };
    });
    expect(r.modesCentred).toBe(true);
    expect(r.modesBottomGap).toBeLessThan(40);
    expect(r.bubbleCentred).toBe(true);
    expect(r.bubbleAbove).toBe(true);
    expect(r.overlap).toBe(false);
    await page.close();
  }, 60000);

  // ---- selection area, panning and camera flights -----------------------------
  /** A node's own rectangle on screen. */
  const screenRect = (page: Page, id: string) => page.evaluate((nid) => { const v = (window as any).__viewer, b = v.ownBounds(nid), s = v.world.scale.x; return { x: b.x * s + v.world.x, y: b.y * s + v.world.y, w: b.w * s, h: b.h * s }; }, id);
  const dragMouse = async (page: Page, a: { x: number; y: number }, b: { x: number; y: number }) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); };
  const selection = (page: Page) => page.evaluate(() => ((window as any).__ui.selection() as string[]).slice().sort());
  const camera = (page: Page) => page.evaluate(() => { const w = (window as any).__viewer.world; return { x: w.x, y: w.y, s: w.scale.x }; });
  /** World point to screen point, with the camera as it is now. */
  const toScreen = (page: Page, x: number, y: number) => page.evaluate(([wx, wy]) => { const v = (window as any).__viewer, s = v.world.scale.x; return { x: wx * s + v.world.x, y: wy * s + v.world.y }; }, [x, y]);

  it("the node's own rectangle matches its layout box", async () => {
    const page = await open();
    const r = await page.evaluate(() => { const v = (window as any).__viewer, f = v.scene.frames.get("n1a").box, o = v.ownBounds("n1a"); return { f, o }; });
    expect(r.o.x).toBeCloseTo(r.f.x, 1); expect(r.o.y).toBeCloseTo(r.f.y, 1); expect(r.o.w).toBeCloseTo(r.f.w, 1); expect(r.o.h).toBeCloseTo(r.f.h, 1);
    await page.close();
  }, 60000);

  it("dragging with the left button selects the outermost frames that fit completely inside", async () => {
    const page = await open();
    await page.evaluate(() => (window as any).__viewer.fitAll());
    const a = await screenRect(page, "n1a"), b = await screenRect(page, "n2f");
    // Around the first two pages and nothing else: both are selected, their cards are not (the pages stand for them).
    await dragMouse(page, { x: a.x - 14, y: a.y - 14 }, { x: b.x + b.w + 14, y: b.y + b.h + 14 });
    expect(await selection(page)).toEqual(["n1a", "n2f"]);
    expect(await page.evaluate(() => document.querySelector(".mk-popup .mk-title")!.textContent)).toBe("2 frames selected");
    expect(await page.evaluate(() => document.querySelectorAll(".mk-multilist .mk-row").length)).toBe(2);
    await page.waitForFunction(() => (window as any).__ui.multiLayer.children.length === 2); // a blue box on each
    expect(await display(page, ".mk-menu")).toBe("none");
    await page.close();
  }, 60000);

  it("a drag selects the cards inside a page when the page itself does not fit, and cuts at the edge of the area", async () => {
    const page = await open();
    await page.evaluate(() => (window as any).__viewer.focusNodes(["n1a"]));
    await page.waitForFunction(() => !(window as any).__viewer.isFlying);
    const from = await toScreen(page, 1230, 30), all = await toScreen(page, 1800, 220), cut = await toScreen(page, 1700, 220);
    await dragMouse(page, from, all); // the first three cells of the first row are completely inside, 01-shapes is not
    expect((await selection(page)).length).toBe(3);
    await dragMouse(page, from, cut); // the third cell is cut by the edge of the area
    expect((await selection(page)).length).toBe(2);
    await dragMouse(page, { x: 5, y: 200 }, { x: 25, y: 220 }); // an area with nothing completely inside clears the selection
    expect(await selection(page)).toEqual([]);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mk-popup")!).display === "none"); // after its closing animation
    await page.close();
  }, 60000);

  it("the left button no longer pans; the middle button does", async () => {
    const page = await open();
    const before = await camera(page);
    await dragMouse(page, { x: 700, y: 450 }, { x: 760, y: 500 });
    expect(await camera(page)).toEqual(before);
    await page.mouse.move(700, 450);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(800, 520, { steps: 6 });
    await page.mouse.up({ button: "middle" });
    const after = await camera(page);
    expect(after.x - before.x).toBeCloseTo(100, 0);
    expect(after.y - before.y).toBeCloseTo(70, 0);
    expect(after.s).toBe(before.s);
    await page.close();
  }, 60000);

  it("the selection area does nothing in comment mode and can be cancelled with Escape", async () => {
    const page = await open();
    await page.evaluate(() => (window as any).__viewer.fitAll());
    const a = await screenRect(page, "n1a");
    await page.keyboard.press("c");
    await dragMouse(page, { x: a.x - 14, y: a.y - 14 }, { x: a.x + a.w + 14, y: a.y + a.h + 14 });
    expect(await selection(page)).toEqual([]);
    await page.keyboard.press("Escape"); // back to View
    await page.mouse.move(a.x - 14, a.y - 14);
    await page.mouse.down();
    await page.mouse.move(a.x + a.w + 14, a.y + a.h + 14, { steps: 6 });
    expect(await page.evaluate(() => getComputedStyle((window as any).__ui.marqueeEl).display)).toBe("block"); // the area is being drawn
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await selection(page)).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle((window as any).__ui.marqueeEl).display)).toBe("none");
    await page.close();
  }, 60000);

  it("the camera flies to the requested frames, zooming out on a long trip, and ends with them completely on screen", async () => {
    const page = await open();
    const r = await page.evaluate(async () => {
      const v = (window as any).__viewer, ui = (window as any).__ui;
      await v.focusNodes(["n6b"]);
      const start = v.world.scale.x, samples: number[] = [];
      const sample = () => samples.push(v.world.scale.x);
      v.app.ticker.add(sample);
      const t0 = performance.now();
      const res = await v.focusNodes(["nbu"]); // a page of the same size, far to the right
      const ms = performance.now() - t0;
      v.app.ticker.remove(sample);
      const end = v.world.scale.x;
      const ins = ui.insets(), sw = v.app.screen.width, sh = v.app.screen.height, b = v.boundsOf("nbu"), s = v.world.scale.x;
      const rect = { x1: b.x * s + v.world.x, y1: b.y * s + v.world.y, x2: (b.x + b.w) * s + v.world.x, y2: (b.y + b.h) * s + v.world.y };
      return { res, start, end, min: Math.min(...samples), n: samples.length, ms, flying: v.isFlying, inside: rect.x1 >= ins.left && rect.y1 >= ins.top && rect.x2 <= sw - ins.right && rect.y2 <= sh - ins.bottom };
    });
    expect(r.res).toEqual({ ok: true, missing: [] });
    expect(r.flying).toBe(false);
    expect(r.inside).toBe(true);
    expect(r.ms).toBeGreaterThan(300); // it travels, it does not jump
    expect(r.n).toBeGreaterThan(2);
    expect(r.min).toBeLessThan(Math.min(r.start, r.end) * 0.85); // it pulled back on the way
    await page.close();
  }, 60000);

  it("several requested frames all end up completely on screen, and unknown ids move nothing", async () => {
    const page = await open();
    const r = await page.evaluate(async () => {
      const v = (window as any).__viewer, ui = (window as any).__ui;
      const res = await v.focusNodes(["n1a", "nev", "ndr"]); // opposite corners of the design plus one in between
      const ins = ui.insets(), sw = v.app.screen.width, sh = v.app.screen.height, s = v.world.scale.x;
      const inside = ["n1a", "nev", "ndr"].every((id) => { const b = v.boundsOf(id); return b.x * s + v.world.x >= ins.left && b.y * s + v.world.y >= ins.top && (b.x + b.w) * s + v.world.x <= sw - ins.right && (b.y + b.h) * s + v.world.y <= sh - ins.bottom; });
      const before = { x: v.world.x, y: v.world.y, s: v.world.scale.x };
      const bad = await v.focusNodes(["n1a", "does-not-exist"]);
      return { res, inside, bad, unmoved: before.x === v.world.x && before.y === v.world.y && before.s === v.world.scale.x };
    });
    expect(r.res.ok).toBe(true);
    expect(r.inside).toBe(true);
    expect(r.bad).toEqual({ ok: false, missing: ["does-not-exist"] });
    expect(r.unmoved).toBe(true);
    await page.close();
  }, 60000);

  it("taking the camera over (wheel) stops a flight, and reduced motion jumps straight there", async () => {
    const page = await open();
    const r = await page.evaluate(async () => {
      const v = (window as any).__viewer;
      await v.focusNodes(["n6b"]);
      const p = v.focusNodes(["nbu"]);
      await new Promise((r) => setTimeout(r, 120));
      const during = v.isFlying;
      v.app.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, bubbles: true, cancelable: true }));
      const res = await p;
      return { during, after: v.isFlying, res };
    });
    expect(r.during).toBe(true);
    expect(r.after).toBe(false);
    expect(r.res.ok).toBe(true);
    await page.close();

    const calm = await open({ reducedMotion: "reduce" });
    const q = await calm.evaluate(async () => {
      const v = (window as any).__viewer;
      const p = v.focusNodes(["nbu"]);
      return { flyingAtOnce: v.isFlying, res: await p };
    });
    expect(q.flyingAtOnce).toBe(false);
    expect(q.res.ok).toBe(true);
    await calm.close();
  }, 60000);

  it("searching for a frame flies there and keeps it clear of the info popup", async () => {
    const page = await open();
    await page.keyboard.press("Control+f");
    await page.keyboard.type("05-layout");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (window as any).__ui.selection()[0] === "n9z");
    await page.waitForFunction(() => !(window as any).__viewer.isFlying, null, { timeout: 5000 });
    const r = await page.evaluate(() => {
      const ui = (window as any).__ui, v = (window as any).__viewer, pop = document.querySelector(".mk-popup") as HTMLElement, s = v.world.scale.x, b = v.boundsOf("n9z");
      return { left: b.x * s + v.world.x, right: (b.x + b.w) * s + v.world.x, popupRight: pop.offsetLeft + pop.offsetWidth, W: innerWidth, popup: getComputedStyle(pop).display };
    });
    expect(r.popup).toBe("block");
    expect(r.left).toBeGreaterThanOrEqual(r.popupRight - 1);
    expect(r.right).toBeLessThanOrEqual(r.W);
    await page.close();
  }, 60000);

  it("the design theme select is labelled with its axis", async () => {
    const page = await open();
    const fields = await page.evaluate(() => [...document.querySelectorAll(".mk-field")].map((f) => ({ label: f.querySelector("span")!.textContent, options: f.querySelectorAll("option").length })));
    expect(fields.length).toBeGreaterThan(0);
    expect(fields[0].label).toBeTruthy();
    expect(fields[0].options).toBeGreaterThan(1);
    await page.close();
  }, 60000);

  it("wheel: plain scrolls, Shift scrolls sideways, Ctrl zooms", async () => {
    const page = await open();
    await page.mouse.move(700, 450);
    const cam = () => page.evaluate(() => { const w = (window as any).__viewer.world; return { x: w.x, y: w.y, s: w.scale.x }; });
    const a = await cam();
    await page.mouse.wheel(0, 120);
    const b = await cam();
    expect(b.y).toBeLessThan(a.y); expect(b.x).toBe(a.x); expect(b.s).toBe(a.s);
    await page.keyboard.down("Shift"); await page.mouse.wheel(0, 120); await page.keyboard.up("Shift");
    const c = await cam();
    expect(c.x).toBeLessThan(b.x); expect(c.y).toBe(b.y); expect(c.s).toBe(b.s);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, -120); await page.keyboard.up("Control");
    expect((await cam()).s).toBeGreaterThan(c.s);
    await page.close();
  }, 60000);
});
