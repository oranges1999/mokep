import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Copies the bundled MCP server to a path without the extension version in it, so an MCP entry registered
 *  with Claude Code keeps working after the extension updates. Returns the path to register; falls back
 *  to the original path when the copy is not possible. */
export function stableServer(src: string, destDir: string): string {
  const dest = join(destDir, "mcp-server.js");
  try {
    mkdirSync(destDir, { recursive: true });
    if (!existsSync(dest) || !readFileSync(src).equals(readFileSync(dest))) copyFileSync(src, dest);
    return dest;
  } catch { return src; }
}
