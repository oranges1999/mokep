// End to end: spawns the built MCP server over stdio. Needs `npm run build` first.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { BridgeServer } from "../src/bridge/server";
import { bridgeFile } from "../src/bridge/protocol";

process.env.MOKEP_BRIDGE_FILE = join(tmpdir(), `pen-bridge-test-${process.pid}.json`);
const SERVER = join(process.cwd(), "dist/mcp-server.js");
let dir: string, client: Client, file: string;

const call = async (name: string, args: Record<string, unknown>) => {
  const r: any = await client.callTool({ name, arguments: args });
  return { error: !!r.isError, text: r.content?.[0]?.type === "text" ? r.content[0].text as string : "", content: r.content };
};

describe.skipIf(!existsSync(SERVER))("MCP server", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "pen-mcp-"));
    file = join(dir, "t.pen");
    writeFileSync(file, JSON.stringify({ version: "2.21", children: [{ id: "f", type: "frame", name: "F", width: 100, height: 100, children: [{ id: "r", type: "rectangle", width: 10, height: 10, fill: "#f00" }] }] }));
    client = new Client({ name: "test", version: "0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: process.env as Record<string, string> }));
  }, 30000);
  afterAll(async () => { await client?.close(); rmSync(dir, { recursive: true, force: true }); });

  it("lists the tools", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["mokep_comment", "mokep_comments", "mokep_edit", "mokep_focus", "mokep_lint", "mokep_open", "mokep_read", "mokep_screenshot", "mokep_state", "mokep_status"]);
  });
  it("reads with depth elision", async () => {
    const top = await call("mokep_read", { file, depth: 0 });
    expect(JSON.parse(top.text).children[0].children).toBe("...");
    const node = await call("mokep_read", { file, id: "r" });
    expect(JSON.parse(node.text).fill).toBe("#f00");
  });
  it("edits atomically, rejects bad edits without touching the file", async () => {
    const good = await call("mokep_edit", { file, ops: [{ op: "update", id: "r", props: { width: 50 } }, { op: "insert", parent: "f", node: { type: "ellipse", width: 5, height: 5 } }] });
    expect(good.error).toBe(false);
    expect(good.text).toMatch(/Created ids: \w{5}/);
    const after = readFileSync(file, "utf8");
    const bad = await call("mokep_edit", { file, ops: [{ op: "insert", parent: "f", node: { id: "r", type: "rectangle" } }] });
    expect(bad.error).toBe(true);
    expect(bad.text).toMatch(/duplicate id "r"/);
    expect(readFileSync(file, "utf8")).toBe(after);
    expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });
  it("adds, lists and resolves comments", async () => {
    expect((await call("mokep_comment", { file, action: "add", nodeId: "ghost", text: "x" })).error).toBe(true);
    expect((await call("mokep_comment", { file, action: "add", nodeId: "r", text: "Check contrast" })).error).toBe(false);
    const open = JSON.parse((await call("mokep_comments", { file })).text);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ nodeId: "r", author: "agent", text: "Check contrast" });
    await call("mokep_comment", { file, action: "resolve", id: open[0].id });
    expect((await call("mokep_comments", { file })).text).toBe("No open comments.");
  });
  it("lints", async () => {
    const r = await call("mokep_lint", { file });
    expect(r.error).toBe(false);
  });
  it("explains when the viewer is not running", async () => {
    if (existsSync(bridgeFile())) return;
    const r = await call("mokep_state", {});
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/not running/);
  });
});

describe("bridge", () => {
  it("serves authenticated requests only", async () => {
    const bridge = new BridgeServer(async (req) => (req.type === "state" ? { ok: true, active: "x.pen" } : { ok: false, error: "nope" }));
    const port = await bridge.start();
    const talk = (token: string) => new Promise<any[]>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const got: any[] = [];
      ws.on("open", () => { ws.send(JSON.stringify({ id: 1, type: "hello", token })); ws.send(JSON.stringify({ id: 2, type: "state" })); });
      ws.on("message", (d) => got.push(JSON.parse(d.toString())));
      ws.on("close", () => resolve(got));
      setTimeout(() => ws.close(), 500);
    });
    const good = await talk(bridge.token);
    expect(good.find((m) => m.id === 2)).toMatchObject({ ok: true, active: "x.pen" });
    const bad = await talk("wrong");
    expect(bad.find((m) => m.id === 1)).toMatchObject({ ok: false });
    expect(bad.find((m) => m.id === 2)?.active).toBeUndefined();
    bridge.stop();
  });
});
