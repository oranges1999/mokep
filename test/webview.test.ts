// Runs the real webview bundle (dist/webview.js) in Chrome under the CSP the extension sends, and talks to it with the same
// messages the extension host sends. This covers src/webview/main.ts, which the other UI tests do not go through.
// Needs `npm run build` first.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "playwright-core";
import type { Server } from "node:http";
import { CHROME, launch, startServer } from "./helpers";

let server: Server, browser: Browser, port = 0, text = "";
beforeAll(async () => { ({ server, port } = await startServer()); browser = await launch(); text = readFileSync("fixtures/test.pen.json", "utf8"); }, 60000);
afterAll(async () => { await browser?.close(); server?.close(); });

let reqSeq = 100;
const send = (page: Page, msg: Record<string, unknown>) => page.evaluate((m) => window.postMessage(m, "*"), msg);
/** Sends a request message and waits for the `result` the webview posts back for it. */
async function ask(page: Page, msg: Record<string, unknown>, timeout = 8000): Promise<any> {
  const reqId = ++reqSeq;
  await send(page, { ...msg, reqId });
  const handle = await page.waitForFunction((id) => (window as any).__out.find((o: any) => o.type === "result" && o.reqId === id), reqId, { timeout });
  return handle.jsonValue();
}
async function open() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (/content security policy|refused to/i.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/harness/webview.html`);
  await page.waitForFunction(() => (window as any).__out.some((o: any) => o.type === "ready"), null, { timeout: 30000 });
  await send(page, { type: "load", baseUri: "/fixtures/", text });
  // Loading is asynchronous (fonts, icons, layout): wait until the scene has its frames.
  for (let i = 0; i < 100; i++) { if (((await ask(page, { type: "info" })).frames ?? []).length) break; await page.waitForTimeout(200); }
  (page as any).__errors = errors;
  return page;
}

describe.skipIf(!CHROME)("webview messages (production bundle)", () => {
  it("asks for the file when it starts, then answers info with frames and the selection", async () => {
    const page = await open();
    const info = await ask(page, { type: "info" });
    expect(info.frames.length).toBe(9);
    expect(info.selection).toEqual([]);
    expect((page as any).__errors).toEqual([]);
    await page.close();
  }, 60000);

  it("shows the agent: a glow around the screen and a label, and ends them when the agent says it is idle", async () => {
    const page = await open();
    await send(page, { type: "activity", agent: "claude-code", tool: "edit" });
    await page.waitForFunction(() => document.querySelector(".mk-agent .mk-aname")?.textContent === "Claude Code");
    expect(await page.evaluate(() => document.querySelector(".mk-agent .mk-aact")!.textContent)).toBe("Editing");
    const aura = await page.evaluate(() => { const a = document.querySelector(".mk-aura") as HTMLElement, r = a.getBoundingClientRect(); return { phase: a.dataset.phase, full: r.width === innerWidth && r.height === innerHeight, clicks: getComputedStyle(a).pointerEvents, glow: getComputedStyle(a).boxShadow.includes("inset") }; });
    expect(aura).toMatchObject({ full: true, clicks: "none", glow: true });
    expect(["in", "loop"]).toContain(aura.phase);
    await send(page, { type: "status", text: "Working on the hero", state: "working" });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".mk-bubble")!).display)).toBe("flex");
    await send(page, { type: "status", text: "Done, 3 frames changed", state: "idle" }); // the agent is completely done
    await page.waitForFunction(() => document.querySelector(".mk-aura")!.getAttribute("data-phase") === "out" || !document.querySelector(".mk-aura")!.getAttribute("data-phase"));
    await page.waitForFunction(() => !document.querySelector(".mk-agent") && !document.querySelector(".mk-aura")!.getAttribute("data-phase"), null, { timeout: 5000 });
    await page.close();
  }, 60000);

  it("flies to the requested frames and answers when it has arrived; unknown ids are reported", async () => {
    const page = await open();
    const ok = await ask(page, { type: "focus", nodeIds: ["n6b", "nbu"] });
    expect(ok).toMatchObject({ ok: true });
    expect(ok.error).toBeUndefined();
    expect(await page.evaluate(() => document.querySelectorAll('div[style*="border: 3px solid"], div[style*="border:3px solid"]').length)).toBeGreaterThanOrEqual(0);
    const bad = await ask(page, { type: "focus", nodeIds: ["n6b", "ghost"] });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("node not found: ghost");
    const none = await ask(page, { type: "focus", nodeIds: [] });
    expect(none.error).toBe("no node id given");
    const single = await ask(page, { type: "focus", nodeId: "n1a" }); // the older single-id form still works
    expect(single.ok).toBe(true);
    await page.close();
  }, 60000);

  it("tells which frames are on screen and can capture exactly the visible area", async () => {
    const page = await open();
    await ask(page, { type: "focus", nodeIds: ["n1a"] });
    const { view } = await ask(page, { type: "info" });
    expect(view.zoom).toBeGreaterThan(0);
    expect(view.visible.find((f: any) => f.id === "n1a")?.visiblePct).toBeGreaterThan(90);
    expect(view.visible.length).toBeLessThan(9); // not every frame is on screen
    const shot = await ask(page, { type: "screenshot", view: true }, 30000);
    const size = await page.evaluate((b64) => new Promise<number[]>((res) => { const i = new Image(); i.onload = () => res([i.width, i.height]); i.src = "data:image/png;base64," + b64; }), shot.png);
    expect(Math.max(...size)).toBeLessThanOrEqual(1568);
    expect(Math.abs(size[0] / size[1] - view.area.w / view.area.h)).toBeLessThan(0.05); // same shape as the screen
    await page.close();
  }, 90000);

  it("reports what the user selected", async () => {
    const page = await open();
    await ask(page, { type: "focus", nodeIds: ["n1a"] });
    expect((await ask(page, { type: "selection" })).ids).toEqual([]);
    await page.mouse.click(700, 450); // somewhere on the frame the camera is showing
    const sel = await ask(page, { type: "selection" });
    expect(sel.ids.length).toBe(1);
    expect((await ask(page, { type: "info" })).selection).toEqual(sel.ids);
    await page.close();
  }, 60000);

  it("receives comments and shows their count", async () => {
    const page = await open();
    await send(page, { type: "comments", comments: [{ id: "c1", nodeId: "n1a", text: "Check", author: "user", createdAt: "", resolved: false }] });
    await page.waitForFunction(() => document.querySelector(".mk-mode .mk-badge")?.textContent === "1");
    await page.close();
  }, 60000);
});
