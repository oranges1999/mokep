import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { bridgeFile, BridgeRequest, BridgeResponse } from "./protocol";

export type Handler = (req: BridgeRequest) => Promise<Omit<BridgeResponse, "id">>;

/** Local WebSocket bridge: 127.0.0.1 only, first message must carry the token from bridge.json. */
export class BridgeServer {
  private wss: WebSocketServer | null = null;
  readonly token = randomBytes(24).toString("hex");

  constructor(private handle: Handler) {}

  async start(): Promise<number> {
    this.wss = new WebSocketServer({ host: "127.0.0.1", port: 0, maxPayload: 32 * 1024 * 1024 });
    await new Promise<void>((r) => this.wss!.once("listening", () => r()));
    const port = (this.wss.address() as { port: number }).port;
    this.wss.on("connection", (ws, req) => {
      const addr = req.socket.remoteAddress;
      if (addr !== "127.0.0.1" && addr !== "::ffff:127.0.0.1") return ws.close();
      let authed = false;
      const timer = setTimeout(() => { if (!authed) ws.close(); }, 3000);
      ws.on("close", () => clearTimeout(timer));
      ws.on("message", (data) => void this.onMessage(ws, data.toString(), () => authed, () => { authed = true; }));
    });
    mkdirSync(dirname(bridgeFile()), { recursive: true });
    writeFileSync(bridgeFile(), JSON.stringify({ port, token: this.token, pid: process.pid }), { mode: 0o600 });
    return port;
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

  stop() {
    this.wss?.close();
    try { rmSync(bridgeFile()); } catch { /* already gone */ }
  }
}
