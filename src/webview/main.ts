import { Viewer } from "./viewer";
import { Ui } from "./ui";

declare function acquireVsCodeApi(): { postMessage(m: unknown): void };

async function main() {
  const vscode = acquireVsCodeApi();
  const host = document.getElementById("host")!;
  const status = document.getElementById("status")!;
  const viewer = new Viewer();
  viewer.fontBase = host.dataset.fonts ?? viewer.fontBase;
  viewer.iconBase = host.dataset.icons ?? viewer.iconBase;
  await viewer.init(host);
  const ui = new Ui(viewer, host, (msg) => vscode.postMessage(msg));
  viewer.app.resize();
  viewer.onChanged = (ids) => ui.flash(ids);
  let first = true;
  window.addEventListener("message", async (e) => {
    const m = e.data;
    if (m?.type === "screenshot") {
      try { vscode.postMessage({ type: "result", reqId: m.reqId, png: (await viewer.screenshot(m.nodeId, m.scale, !!m.view)).split(",")[1] }); }
      catch (err) { vscode.postMessage({ type: "result", reqId: m.reqId, error: (err as Error).message }); }
      return;
    }
    if (m?.type === "focus") {
      const ids: string[] = Array.isArray(m.nodeIds) ? m.nodeIds.map(String) : m.nodeId ? [String(m.nodeId)] : [];
      const r = ids.length ? await ui.flyTo(ids) : { ok: false, missing: [] as string[] };
      vscode.postMessage({ type: "result", reqId: m.reqId, ok: r.ok, error: r.ok ? undefined : ids.length ? `node not found: ${r.missing.join(", ")}` : "no node id given" });
      return;
    }
    if (m?.type === "selection") { vscode.postMessage({ type: "result", reqId: m.reqId, ids: ui.selection() }); return; }
    if (m?.type === "comments") { ui.setComments(m.comments ?? []); return; }
    if (m?.type === "activity") { ui.setAgent(String(m.agent ?? "agent"), String(m.tool ?? "")); return; }
    if (m?.type === "status") { ui.setStatus(String(m.text ?? ""), String(m.state ?? "idle")); return; }
    if (m?.type === "info") { vscode.postMessage({ type: "result", reqId: m.reqId, ...viewer.info(), view: viewer.view(), selection: ui.selection() }); return; }
    if (m?.type !== "load") return;
    try {
      if (m.baseUri) viewer.docBase = m.baseUri;
      await viewer.load(m.text, !first);
      // Keep "first" until there is something to frame, so the first frame an agent adds to a new file is in view.
      if (first) { viewer.fitAll(); first = !(viewer.scene?.frames.size); }
      status.textContent = viewer.warnings.length ? `${viewer.warnings.length} warning(s): ${viewer.warnings[0]}` : "";
    } catch (err) {
      status.textContent = "Cannot render: " + (err as Error).message;
    }
  });
  vscode.postMessage({ type: "ready" });
}
main();
