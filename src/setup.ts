import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { buildSetupSteps } from "./setupSteps";

const run = (cmd: string, args: string[]) => new Promise<{ ok: boolean; out: string }>((resolve) => {
  execFile(cmd, args, { shell: process.platform === "win32", timeout: 30000 }, (err, stdout, stderr) => resolve({ ok: !err, out: (stdout + stderr).trim() }));
});

export interface SetupResult { ok: boolean; message: string; }

/** Runs the registration. Only call after the user confirmed. */
export async function registerMcp(serverJs: string): Promise<SetupResult> {
  const steps = buildSetupSteps(serverJs);
  if (!steps) return { ok: false, message: "The extension path has unusual characters, so it was not passed to a shell. Use \"Mokep: Copy MCP setup command\" instead." };
  if (!(await run("node", ["--version"])).ok) return { ok: false, message: "Node.js was not found on PATH. Install Node.js 18 or newer, then run \"Mokep: Set up MCP for Claude Code\" again." };
  if (!(await run("claude", ["--version"])).ok) return { ok: false, message: "The Claude Code CLI (claude) was not found on PATH. Install it, or use \"Mokep: Copy MCP setup command\"." };
  for (const s of steps) {
    const r = await run(s.cmd, s.args);
    if (!r.ok && !s.ignoreFailure) return { ok: false, message: `Claude Code refused the registration: ${r.out || "unknown error"}` };
  }
  return { ok: true, message: "Mokep is registered with Claude Code. Start a new Claude Code session to use the mokep_ tools." };
}

type Choice = "Install" | "Later" | "Don't ask again";

/** First run (and after an update): ask once, never act without a click. */
export async function offerSetup(ctx: vscode.ExtensionContext, force = false) {
  const version = String(ctx.extension.packageJSON.version);
  const state = ctx.globalState.get<{ status?: string; version?: string }>("mokep.setup") ?? {};
  if (!force) {
    if (state.status === "never") return;
    if (state.status === "done" && state.version === version) return;
  }
  const update = state.status === "done";
  const pick = await vscode.window.showInformationMessage(
    update
      ? "Mokep was updated. Re-register its MCP server with Claude Code so the agent uses the new version?"
      : "Mokep can register its MCP server with Claude Code so the agent can edit designs and see the result. Install now?",
    { modal: false }, "Install", "Later", "Don't ask again",
  ) as Choice | undefined;
  if (pick === "Don't ask again") return void ctx.globalState.update("mokep.setup", { status: "never" });
  if (pick !== "Install") return;
  const server = vscode.Uri.joinPath(ctx.extensionUri, "dist", "mcp-server.js").fsPath;
  const res = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Mokep: registering MCP server…" }, () => registerMcp(server));
  if (res.ok) {
    await ctx.globalState.update("mokep.setup", { status: "done", version });
    void vscode.window.showInformationMessage(res.message);
  } else {
    const copy = await vscode.window.showWarningMessage(res.message, "Copy setup command");
    if (copy) void vscode.commands.executeCommand("mokep.copyMcpCommand");
  }
}
