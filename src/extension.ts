import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { BridgeServer } from "./bridge/server";
import { lint } from "./core/lint";
import { offerSetup, serverPath } from "./setup";
import { addComment, commentsPath, CommentsFile, parseComments, removeComment, setResolved } from "./core/comments";
import { RecentFiles } from "./recent";
import { webviewCsp } from "./csp";

class PenDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri) {}
  dispose() {}
}

interface Open { uri: vscode.Uri; panel: vscode.WebviewPanel; lastActive: number; }
const open = new Map<vscode.WebviewPanel, Open>();
let reqSeq = 0;
const pending = new Map<number, { resolve: (m: any) => void; timer: ReturnType<typeof setTimeout> }>();

/** Ask a webview something and wait for its `result` message. */
function ask(target: Open, msg: Record<string, unknown>, timeoutMs = 30000): Promise<any> {
  const reqId = ++reqSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(reqId); reject(new Error("viewer did not answer")); }, timeoutMs);
    pending.set(reqId, { resolve: (m) => (m.error ? reject(new Error(m.error)) : resolve(m)), timer });
    void target.panel.webview.postMessage({ ...msg, reqId });
  });
}

function pick(file?: string): Open {
  const all = [...open.values()];
  if (!all.length) throw new Error("no .pen file is open in the viewer");
  if (file) {
    const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
    const hit = all.find((o) => norm(o.uri.fsPath) === norm(file));
    if (!hit) throw new Error(`${file} is not open in the viewer`);
    return hit;
  }
  return all.sort((a, b) => b.lastActive - a.lastActive)[0];
}

class PenEditorProvider implements vscode.CustomReadonlyEditorProvider<PenDocument> {
  constructor(private ctx: vscode.ExtensionContext, private recent: RecentFiles) {}

  openCustomDocument(uri: vscode.Uri) { return new PenDocument(uri); }

  async resolveCustomEditor(doc: PenDocument, panel: vscode.WebviewPanel) {
    const ext = this.ctx.extensionUri;
    const dist = vscode.Uri.joinPath(ext, "dist");
    const fonts = vscode.Uri.joinPath(ext, "assets", "fonts");
    const icons = vscode.Uri.joinPath(ext, "assets", "icons");
    const docDir = vscode.Uri.joinPath(doc.uri, "..");
    panel.webview.options = { enableScripts: true, localResourceRoots: [dist, fonts, icons, docDir] };
    const as = (u: vscode.Uri) => panel.webview.asWebviewUri(u).toString() + "/";
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, "webview.js"));
    const nonce = Math.random().toString(36).slice(2);
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${webviewCsp(panel.webview.cspSource, `'nonce-${nonce}'`)}">
<style>html,body,#host{margin:0;padding:0;height:100%;overflow:hidden;background:#1e1e1e}#status{position:fixed;left:8px;bottom:8px;font:12px sans-serif;color:#9ca3af}</style>
</head><body><div id="host" data-fonts="${as(fonts)}" data-icons="${as(icons)}"></div><div id="status"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;

    const entry: Open = { uri: doc.uri, panel, lastActive: Date.now() };
    open.set(panel, entry);
    void this.recent.add(doc.uri.fsPath); // every way of opening a file ends up here, so the sidebar list stays complete
    panel.onDidChangeViewState(() => { if (panel.active) entry.lastActive = Date.now(); });

    const send = async () => {
      const bytes = await vscode.workspace.fs.readFile(doc.uri);
      void panel.webview.postMessage({ type: "load", baseUri: as(docDir), text: Buffer.from(bytes).toString("utf8") });
    };
    const cfile = vscode.Uri.file(commentsPath(doc.uri.fsPath));
    const readComments = async (): Promise<CommentsFile> => {
      try { return parseComments(Buffer.from(await vscode.workspace.fs.readFile(cfile)).toString("utf8")); } catch { return parseComments(undefined); }
    };
    const writeComments = (f: CommentsFile) => vscode.workspace.fs.writeFile(cfile, Buffer.from(JSON.stringify(f, null, 1)));
    const sendComments = async () => { void panel.webview.postMessage({ type: "comments", comments: (await readComments()).comments }); };
    panel.webview.onDidReceiveMessage(async (m) => {
      if (m?.type === "ready") { void send(); void sendComments(); }
      if (m?.type === "addComment") {
        const text = String(m.text ?? "").trim(); // typed in the viewer's own comment composer
        if (text) { await writeComments(addComment(await readComments(), String(m.nodeId), text, "user")); void sendComments(); }
      }
      if (m?.type === "resolveComment") {
        const next = setResolved(await readComments(), String(m.id), !!m.resolved);
        if (next) { await writeComments(next); void sendComments(); }
      }
      if (m?.type === "deleteComment") {
        const next = removeComment(await readComments(), String(m.id));
        if (next) { await writeComments(next); void sendComments(); }
      }
      if (m?.type === "result") { const p = pending.get(m.reqId); if (p) { clearTimeout(p.timer); pending.delete(m.reqId); p.resolve(m); } }
    });
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(docDir, doc.uri.path.split("/").pop()!));
    watcher.onDidChange(() => void send());
    const cwatch = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(docDir, doc.uri.path.split("/").pop()! + ".comments.json"));
    cwatch.onDidChange(() => void sendComments());
    cwatch.onDidCreate(() => void sendComments());
    panel.onDidDispose(() => { watcher.dispose(); cwatch.dispose(); open.delete(panel); });
  }
}

const openPen = (uri: vscode.Uri) => vscode.commands.executeCommand("vscode.openWith", uri, "mokep.pen");

export async function activate(ctx: vscode.ExtensionContext) {
  const recent = new RecentFiles(ctx.globalState);
  ctx.subscriptions.push(
    vscode.window.registerCustomEditorProvider("mokep.pen", new PenEditorProvider(ctx, recent), { supportsMultipleEditorsPerDocument: true }),
    vscode.window.registerTreeDataProvider("mokep.files", recent),
    vscode.commands.registerCommand("mokep.openFile", async () => {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "Design files": ["pen"] }, openLabel: "Open" });
      if (picked?.[0]) await openPen(picked[0]);
    }),
    vscode.commands.registerCommand("mokep.newFile", async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
      const uri = await vscode.window.showSaveDialog({ filters: { "Design files": ["pen"] }, saveLabel: "Create", defaultUri: folder && vscode.Uri.joinPath(folder, "untitled.pen") });
      if (!uri) return; // the save dialog already asks before overwriting an existing file
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify({ version: "2.21", children: [] }, null, 1)));
      await openPen(uri);
    }),
    vscode.commands.registerCommand("mokep.openRecent", async (file: string) => {
      const uri = vscode.Uri.file(file);
      try { await vscode.workspace.fs.stat(uri); } catch {
        const pick = await vscode.window.showWarningMessage(`${file} no longer exists.`, "Remove from list");
        if (pick) await recent.remove(file);
        return;
      }
      await openPen(uri);
    }),
    vscode.commands.registerCommand("mokep.removeRecent", (file: string) => recent.remove(file)),
  );

  const bridge = new BridgeServer(async (req) => {
    switch (req.type) {
      case "state": {
        const files = [...open.values()].sort((a, b) => b.lastActive - a.lastActive);
        const active = files[0];
        const info = active ? await ask(active, { type: "info" }) : null;
        return { ok: true, open: files.map((f) => f.uri.fsPath), active: active?.uri.fsPath ?? null, frames: info?.frames ?? [], warnings: info?.warnings ?? [] };
      }
      case "open":
        await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(req.file), "mokep.pen");
        return { ok: true };
      case "screenshot": {
        const r = await ask(pick(req.file), { type: "screenshot", nodeId: req.nodeId, scale: req.scale ?? 1 });
        return { ok: true, png: r.png };
      }
      case "focus": {
        const target = pick(req.file);
        target.panel.reveal(undefined, true);
        await ask(target, { type: "focus", nodeId: req.nodeId });
        return { ok: true };
      }
      case "activity":
        // Without a file (state, screenshot of the active file) every open viewer shows the agent.
        for (const o of open.values()) if (!req.file || o.uri.fsPath.toLowerCase() === req.file.toLowerCase()) void o.panel.webview.postMessage({ type: "activity", agent: req.agent, tool: req.tool });
        return { ok: true };
      case "status":
        for (const o of open.values()) void o.panel.webview.postMessage({ type: "status", text: req.text, state: req.state ?? "idle" });
        return { ok: true };
      default:
        return { ok: false, error: "unknown request" };
    }
  });
  await bridge.start();
  // Older versions used one shared file for all windows; nothing reads it any more.
  try { rmSync(join(homedir(), ".mokep", "bridge.json"), { force: true }); } catch { /* ignore */ }
  ctx.subscriptions.push(
    { dispose: () => bridge.stop() },
    vscode.window.onDidChangeWindowState((s) => { if (s.focused) bridge.touch(); }), // the MCP server prefers the last focused window
  );

  serverPath(ctx); // refreshes ~/.mokep/mcp-server.js on every start, so an update reaches an already registered entry
  void offerSetup(ctx);
  const out = vscode.window.createOutputChannel("Mokep");
  ctx.subscriptions.push(
    out,
    vscode.commands.registerCommand("mokep.copyMcpCommand", async () => {
      await vscode.env.clipboard.writeText(`claude mcp add --scope user mokep -- node "${serverPath(ctx)}"`);
      void vscode.window.showInformationMessage("MCP setup command copied. Paste it in a terminal.");
    }),
    vscode.commands.registerCommand("mokep.setupMcp", () => offerSetup(ctx, true)),
    vscode.commands.registerCommand("mokep.goToFrame", async () => {
      const target = pick();
      const info = await ask(target, { type: "info" });
      const choice = await vscode.window.showQuickPick((info.frames as any[]).map((f) => ({ label: f.name, description: `${Math.round(f.w)}x${Math.round(f.h)}`, id: f.id })), { placeHolder: "Go to frame" });
      if (choice) await ask(target, { type: "focus", nodeId: (choice as any).id });
    }),
    vscode.commands.registerCommand("mokep.lint", async () => {
      const target = pick();
      const bytes = await vscode.workspace.fs.readFile(target.uri);
      const issues = lint(Buffer.from(bytes).toString("utf8"));
      out.clear();
      out.appendLine(issues.length ? issues.map((i) => `${i.level}${i.node ? ` [${i.node}]` : ""}: ${i.message}`).join("\n") : "No issues.");
      out.show(true);
    }),
  );
}
export function deactivate() {}
