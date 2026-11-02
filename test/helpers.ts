// Shared by the browser tests: a tiny static server for the repo and a Chrome launcher.
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

export const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const root = process.cwd();
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

/** Serves the repo on a free local port. `csp` is sent as a header with every HTML page. */
export async function startServer(csp?: string): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url!, "http://x").pathname));
    try {
      const b = readFileSync(join(root, p));
      const headers: Record<string, string> = { "content-type": types[extname(p)] ?? "application/octet-stream" };
      if (csp && extname(p) === ".html") headers["content-security-policy"] = csp;
      res.writeHead(200, headers);
      res.end(b);
    } catch { res.writeHead(404); res.end(); }
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  return { server, port: (server.address() as any).port };
}

export const launch = () => chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
