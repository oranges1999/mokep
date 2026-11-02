// Two VS Code windows at once: each has its own bridge file and the MCP client picks the right one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeServer } from "../src/bridge/server";
import { bridgeFile } from "../src/bridge/protocol";
import { callBridge, listBridges } from "../src/mcp/client";

const dir = mkdtempSync(join(tmpdir(), "pen-windows-"));
process.env.MOKEP_BRIDGE_DIR = dir;
delete process.env.MOKEP_BRIDGE_FILE;

const seen: Record<string, any[]> = { A: [], B: [] };
const handler = (name: string, open: string[]) => async (req: any) => {
  seen[name].push(req);
  return req.type === "state" ? { ok: true, open } : { ok: true, from: name };
};
// Two live process ids that are not the test's own, so the two files do not collide.
const A = new BridgeServer(handler("A", ["C:\\work\\a.pen"]), process.pid);
const B = new BridgeServer(handler("B", ["C:\\work\\b.pen"]), process.ppid);
const DEAD = 4194000;

beforeAll(async () => { await A.start(); await B.start(); });
afterAll(() => { A.stop(); B.stop(); rmSync(dir, { recursive: true, force: true }); });

describe("several windows", () => {
  it("lists both and drops files of dead windows", () => {
    writeFileSync(bridgeFile(DEAD), JSON.stringify({ port: 1, token: "x", pid: DEAD, focusedAt: 1 }));
    expect(listBridges().map((b) => b.pid).sort()).toEqual([process.pid, process.ppid].sort());
    expect(existsSync(bridgeFile(DEAD))).toBe(false);
  });
  it("sends a request about a file to the window that has it open", async () => {
    expect(((await callBridge({ type: "focus", nodeId: "x", file: "c:/work/b.pen" })) as any).from).toBe("B");
    expect(((await callBridge({ type: "focus", nodeId: "x", file: "C:\\work\\a.pen" })) as any).from).toBe("A");
  });
  it("without a file, uses the most recently focused window", async () => {
    await new Promise((r) => setTimeout(r, 5));
    A.touch();
    expect(((await callBridge({ type: "status", text: "hi" })) as any).from).toBe("A");
    await new Promise((r) => setTimeout(r, 5));
    B.touch();
    expect(((await callBridge({ type: "status", text: "hi" })) as any).from).toBe("B");
  });
  it("closing one window leaves the other reachable", async () => {
    B.stop();
    expect(listBridges().map((b) => b.pid)).toEqual([process.pid]);
    expect(((await callBridge({ type: "status", text: "hi" })) as any).from).toBe("A");
  });
});
