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
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".mk-popup")!).display === "none");
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

  it("reduced motion: no breathing, popup opens without animation", async () => {
    const page = await open({ reducedMotion: "reduce" });
    await page.evaluate(() => (window as any).__ui.setAgent("claude-code", "read"));
    expect(await page.evaluate(() => { const a = document.querySelector(".mk-agent")!; return { phase: a.getAttribute("data-phase"), halo: a.querySelector(".mk-halo")!.getAnimations().length }; })).toEqual({ phase: "loop", halo: 0 });
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
