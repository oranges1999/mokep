// Renders each fixture frame in Chrome and compares it with the pen.dev export in fixtures/reference.
// Text and blur never match pixel for pixel, so the limit is a percentage of differing pixels per frame.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium, type Browser } from "playwright-core";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const root = process.cwd();
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

/** Max % of pixels allowed to differ (pixelmatch threshold 0.1). Tighten as the renderer improves. */
const LIMITS: Record<string, number> = {
  "01-shapes": 0.5, "02-fills": 1, "03-stroke-effects": 1, "04-text": 4, "05-layout": 1,
  "06-transform": 3, "07-components": 2, "08-variables-themes": 3, "09-misc": 15,
};

let server: Server, browser: Browser, port = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url!, "http://x").pathname));
    try { const b = readFileSync(join(root, p)); res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }); res.end(b); }
    catch { res.writeHead(404); res.end(); }
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  port = (server.address() as any).port;
  browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
}, 60000);
afterAll(async () => { await browser?.close(); server?.close(); });

describe.skipIf(!CHROME)("visual diff against pen.dev", () => {
  for (const [frame, limit] of Object.entries(LIMITS)) {
    it(`${frame} differs < ${limit}%`, async () => {
      const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${port}/harness/index.html?frame=${frame}&exact=1`);
      await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 30000 });
      await page.waitForTimeout(300);
      const shot = PNG.sync.read(await page.screenshot());
      await page.close();
      const ref = PNG.sync.read(readFileSync(join(root, "fixtures/reference", `${frame}.png`)));
      expect([shot.width, shot.height]).toEqual([ref.width, ref.height]);
      const diff = new PNG({ width: ref.width, height: ref.height });
      const bad = pixelmatch(shot.data, ref.data, diff.data, ref.width, ref.height, { threshold: 0.1 });
      const pct = (bad / (ref.width * ref.height)) * 100;
      mkdirSync(join(root, "fixtures/diff"), { recursive: true });
      writeFileSync(join(root, "fixtures/diff", `${frame}.png`), PNG.sync.write(diff));
      writeFileSync(join(root, "fixtures/diff", `${frame}.actual.png`), PNG.sync.write(shot));
      console.log(`${frame}: ${pct.toFixed(2)}% differ`);
      expect(pct).toBeLessThan(limit);
    }, 60000);
  }
});
