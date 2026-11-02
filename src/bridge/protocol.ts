import { homedir } from "node:os";
import { join } from "node:path";

/** The extension writes this file on activation; the MCP server reads it to find the local bridge. */
export const bridgeFile = () => process.env.MOKEP_BRIDGE_FILE ?? join(homedir(), ".mokep", "bridge.json");
export interface BridgeInfo { port: number; token: string; pid: number; }

export type BridgeRequest =
  | { id: number; type: "hello"; token: string }
  | { id: number; type: "state" }
  | { id: number; type: "open"; file: string }
  | { id: number; type: "screenshot"; file?: string; nodeId?: string; scale?: number }
  | { id: number; type: "focus"; file?: string; nodeId: string }
  | { id: number; type: "status"; text: string; state?: string };

export interface BridgeResponse { id: number; ok: boolean; error?: string; [key: string]: unknown; }
