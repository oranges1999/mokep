import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const root = process.cwd();
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".map": "application/json" };
const port = Number(process.argv[2] ?? 5173);
createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  try { const buf = await readFile(join(root, p)); res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }); res.end(buf); }
  catch { res.writeHead(404); res.end("not found"); }
}).listen(port, "127.0.0.1", () => console.log("serving", root, "on", port));
