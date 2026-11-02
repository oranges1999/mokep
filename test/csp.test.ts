// The extension's webview CSP has no 'unsafe-eval' (only 'wasm-unsafe-eval' for Yoga). This renders the
// real harness under the same policy and fails on any violation. Needs `npm run build` first.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import type { Server } from "node:http";
import { webviewCsp } from "../src/csp";
import { CHROME, launch, startServer } from "./helpers";

const CSP = webviewCsp("'self'", "'self'"); // the same policy the extension sends, with the harness origin
let server: Server, browser: Browser, port = 0;

beforeAll(async () => { ({ server, port } = await startServer(CSP)); browser = await launch(); }, 60000);
afterAll(async () => { await browser?.close(); server?.close(); });

describe.skipIf(!CHROME)("webview content security policy", () => {
  // Control: the policy is sent, has no 'unsafe-eval', and the browser enforces it (an inline script is refused).
  // eval itself cannot be probed from Playwright, because evaluated code bypasses the page's CSP.
  it("sends and enforces the policy (control)", async () => {
    const page = await browser.newPage();
    const res = await page.goto(`http://127.0.0.1:${port}/harness/index.html?frame=01-shapes`);
    const header = res!.headers()["content-security-policy"];
    expect(header).toBe(CSP);
    expect(header).not.toContain("'unsafe-eval'");
    const violated = await page.evaluate(() => new Promise<string>((resolve) => {
      document.addEventListener("securitypolicyviolation", (e) => resolve(e.violatedDirective));
      const s = document.createElement("script"); s.textContent = "window.__probe = 1"; document.head.append(s);
      setTimeout(() => resolve("not blocked"), 1000);
    }));
    expect(violated).toMatch(/^script-src/);
    await page.close();
  });
  it("renders the design and runs the UI without any violation", async () => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const problems: string[] = [];
    page.on("console", (m) => { if (/content security policy|refused to|unsafe-eval/i.test(m.text())) problems.push(m.text()); });
    page.on("pageerror", (e) => problems.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/harness/index.html?ui=1&frame=01-shapes`);
    await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__viewer.scene.frames.size)).toBe(9);
    expect(problems).toEqual([]);
    await page.close();
  }, 60000);
});
