import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { bridgeFile, BridgeInfo, BridgeResponse } from "../bridge/protocol";

type Payload = { type: string; [k: string]: unknown };

/** One short-lived connection per call. Fails with a plain message when the viewer is not running. */
export async function callBridge(payload: Payload, timeoutMs = 20000): Promise<BridgeResponse> {
  let info: BridgeInfo;
  try { info = JSON.parse(readFileSync(bridgeFile(), "utf8")); }
  catch { throw new Error("Mokep is not running. Open VS Code with the Mokep extension (the viewer must be open for screenshots)."); }
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
    const timer = setTimeout(() => { ws.close(); reject(new Error("Mokep did not answer in time")); }, timeoutMs);
    const done = (fn: () => void) => { clearTimeout(timer); ws.close(); fn(); };
    ws.on("error", () => done(() => reject(new Error("Cannot reach Mokep (stale bridge file?). Reload VS Code."))));
    ws.on("open", () => ws.send(JSON.stringify({ id: 1, type: "hello", token: info.token })));
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as BridgeResponse;
      if (msg.id === 1) {
        if (!msg.ok) return done(() => reject(new Error(msg.error ?? "bridge refused the connection")));
        return ws.send(JSON.stringify({ id: 2, ...payload }));
      }
      done(() => (msg.ok ? resolve(msg) : reject(new Error(msg.error ?? "viewer error"))));
    });
  });
}
