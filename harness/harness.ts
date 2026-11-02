import { Viewer } from "../src/webview/viewer";
import { Ui } from "../src/webview/ui";

declare global { interface Window { __shot?: (id?: string, scale?: number) => Promise<string>; __ready?: boolean; __warnings?: string[]; __viewer?: Viewer; } }

(async () => {
  const q = new URLSearchParams(location.search);
  const file = q.get("file") ?? "/fixtures/test.pen.json";
  const frame = q.get("frame");
  const viewer = new Viewer();
  await viewer.init(document.getElementById("host")!);
  await viewer.load(await (await fetch(file)).text());
  if (q.get("exact") && frame) {
    const id = [...viewer.scene!.frames.entries()].find(([k, v]) => k === frame || v.node.name === frame)?.[0];
    const f = id ? viewer.scene!.frames.get(id) : undefined;
    if (f) { viewer.world.scale.set(1); viewer.world.position.set(-f.box.x, -f.box.y); viewer.scene!.rescale(1); viewer.refreshText(); }
  } else if (frame) {
    const id = [...viewer.scene!.frames.entries()].find(([k, v]) => k === frame || v.node.name === frame)?.[0];
    if (id) viewer.fitFrame(id); else viewer.fitAll();
  } else viewer.fitAll();
  if (q.get("ui")) { const ui = new Ui(viewer, document.getElementById("host")!, (m) => console.log("ui message", JSON.stringify(m))); (window as any).__ui = ui; ui.setComments([{ id: "c1", nodeId: viewer.scene!.frames.keys().next().value!, text: "Check spacing", author: "user", createdAt: "", resolved: false }]); ui.setStatus("Agent is editing 05-layout", "working"); }
  window.__viewer = viewer;
  window.__shot = (id, scale) => viewer.screenshot(id, scale);
  window.__warnings = viewer.warnings;
  window.__ready = true;
})();
