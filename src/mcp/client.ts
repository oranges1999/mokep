import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import WebSocket from "ws";
import { bridgeDir, bridgeFile, BridgeInfo, BridgeResponse } from "../bridge/protocol";

type Payload = { type: string; [k: string]: unknown };

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };
const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();

/** Live bridges, most recently focused window first. Files of dead windows are deleted. */
export function listBridges(): BridgeInfo[] {
  const files = process.env.MOKEP_BRIDGE_FILE
    ? [bridgeFile()]
    : existsSync(bridgeDir()) ? readdirSync(bridgeDir()).filter((f) => f.endsWith(".json")).map((f) => join(bridgeDir(), f)) : [];
  const out: BridgeInfo[] = [];
  for (const f of files) {
    try {
      const info = JSON.parse(readFileSync(f, "utf8")) as BridgeInfo;
      if (alive(info.pid)) out.push({ ...info, focusedAt: info.focusedAt ?? 0 });
      else if (!process.env.MOKEP_BRIDGE_FILE) rmSync(f, { force: true });
    } catch { /* unreadable or half-written: skip it */ }
  }
  return out.sort((a, b) => b.focusedAt - a.focusedAt);
}

/** One short-lived connection to one window. */
function talk(info: BridgeInfo, payload: Payload, timeoutMs: number): Promise<BridgeResponse> {
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

/** Sends the request to the window that has `payload.file` open, else to the most recently focused window.
 *  Fails with a plain message when no window is running Mokep. */
export async function callBridge(payload: Payload, timeoutMs = 20000): Promise<BridgeResponse> {
  const windows = listBridges();
  if (!windows.length) throw new Error("Mokep is not running. Open VS Code with the Mokep extension (the viewer must be open for screenshots).");
  let target = windows[0];
  if (typeof payload.file === "string" && windows.length > 1) {
    const wanted = norm(payload.file);
    for (const w of windows) {
      try {
        const st = await talk(w, { type: "state" }, 3000);
        if ((st.open as string[] | undefined)?.some((f) => norm(f) === wanted)) { target = w; break; }
      } catch { /* that window is not answering, try the next one */ }
    }
  }
  return talk(target, payload, timeoutMs);
}
