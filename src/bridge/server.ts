import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { bridgeFile, BridgeInfo, BridgeRequest, BridgeResponse } from "./protocol";

export type Handler = (req: BridgeRequest) => Promise<Omit<BridgeResponse, "id">>;

/** Local WebSocket bridge: 127.0.0.1 only, first message must carry the token from this window's bridge file. */
export class BridgeServer {
  private wss: WebSocketServer | null = null;
  private port = 0;
  readonly token = randomBytes(24).toString("hex");

  /** `id` names the bridge file; it is the extension host pid unless a test passes another one. */
  constructor(private handle: Handler, private id: number = process.pid) {}

  async start(): Promise<number> {
    this.wss = new WebSocketServer({ host: "127.0.0.1", port: 0, maxPayload: 32 * 1024 * 1024 });
    await new Promise<void>((r) => this.wss!.once("listening", () => r()));
    this.port = (this.wss.address() as { port: number }).port;
    this.wss.on("connection", (ws, req) => {
      const addr = req.socket.remoteAddress;
      if (addr !== "127.0.0.1" && addr !== "::ffff:127.0.0.1") return ws.close();
      let authed = false;
      const timer = setTimeout(() => { if (!authed) ws.close(); }, 3000);
      ws.on("close", () => clearTimeout(timer));
      ws.on("message", (data) => void this.onMessage(ws, data.toString(), () => authed, () => { authed = true; }));
    });
    this.touch();
    return this.port;
  }

  /** Marks this window as the most recently used one. The MCP server prefers it when no file decides. */
  touch() {
    const file = bridgeFile(this.id);
    const info: BridgeInfo = { port: this.port, token: this.token, pid: this.id, focusedAt: Date.now() };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(info), { mode: 0o600 });
  }

  private async onMessage(ws: WebSocket, raw: string, isAuthed: () => boolean, auth: () => void) {
    let req: BridgeRequest;
    try { req = JSON.parse(raw); } catch { return ws.close(); }
    const reply = (r: Omit<BridgeResponse, "id">) => ws.send(JSON.stringify({ id: req.id, ...r }));
    if (req.type === "hello") {
      if (req.token !== this.token) { reply({ ok: false, error: "bad token" }); return ws.close(); }
      auth();
      return reply({ ok: true });
    }
    if (!isAuthed()) { reply({ ok: false, error: "not authenticated" }); return ws.close(); }
    try { reply(await this.handle(req)); } catch (e) { reply({ ok: false, error: (e as Error).message }); }
  }

  /** Removes only this window's file, so closing one window never hides the others. */
  stop() {
    this.wss?.close();
    try { rmSync(bridgeFile(this.id)); } catch { /* already gone */ }
  }
}
