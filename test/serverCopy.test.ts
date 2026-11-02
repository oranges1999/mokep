import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableServer } from "../src/serverCopy";

const dir = mkdtempSync(join(tmpdir(), "pen-server-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("stable MCP server path", () => {
  it("copies the server and returns the copy", () => {
    const src = join(dir, "v1.js"); writeFileSync(src, "console.log(1)");
    const out = stableServer(src, join(dir, "home"));
    expect(out).toBe(join(dir, "home", "mcp-server.js"));
    expect(readFileSync(out, "utf8")).toBe("console.log(1)");
  });
  it("replaces the copy when the extension ships a newer server, keeping the same path", () => {
    const src = join(dir, "v2.js"); writeFileSync(src, "console.log(2)");
    const out = stableServer(src, join(dir, "home"));
    expect(out).toBe(join(dir, "home", "mcp-server.js"));
    expect(readFileSync(out, "utf8")).toBe("console.log(2)");
  });
  it("falls back to the original path when it cannot copy", () => {
    const blocker = join(dir, "file-not-dir"); writeFileSync(blocker, "x");
    const src = join(dir, "v3.js"); writeFileSync(src, "console.log(3)");
    expect(stableServer(src, join(blocker, "sub"))).toBe(src);
  });
});
