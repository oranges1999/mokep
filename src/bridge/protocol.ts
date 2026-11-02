import { homedir } from "node:os";
import { join } from "node:path";

/** Every VS Code window writes its own file here on activation (named after its extension host pid).
 *  The MCP server reads them all and talks to the right window. MOKEP_BRIDGE_DIR and MOKEP_BRIDGE_FILE exist for tests. */
export const bridgeDir = () => process.env.MOKEP_BRIDGE_DIR ?? join(homedir(), ".mokep", "bridges");
export const bridgeFile = (id: number = process.pid) => process.env.MOKEP_BRIDGE_FILE ?? join(bridgeDir(), `${id}.json`);
export interface BridgeInfo { port: number; token: string; pid: number; focusedAt: number; }

export type BridgeRequest =
  | { id: number; type: "hello"; token: string }
  | { id: number; type: "state" }
  | { id: number; type: "open"; file: string }
  | { id: number; type: "screenshot"; file?: string; nodeId?: string; scale?: number }
  | { id: number; type: "focus"; file?: string; nodeId: string }
  | { id: number; type: "status"; text: string; state?: string }
  | { id: number; type: "activity"; agent: string; tool: string; file?: string };

export interface BridgeResponse { id: number; ok: boolean; error?: string; [key: string]: unknown; }
