import { node, cell } from "../lib.mjs";

export function frame07() {
  const lbl = node("text", { name: "label", content: "Button", fontFamily: "Inter", fontSize: 14, fontWeight: "600", fill: "#FFFFFF" });
  const btn = node("frame", { name: "button", reusable: true, layout: "horizontal", padding: [10, 20], cornerRadius: 8, fill: "#2563EB", alignItems: "center", justifyContent: "center", x: 0, y: 40 }, [lbl]);
  const inst = (name, extra = {}) => node("ref", { ref: btn.id, name, x: 0, y: 40, ...extra });

  const out = [];
  out.push(cell("component: button (reusable)", 40, 40, 215, 100, [btn]));
  out.push(cell("instance: default", 270, 40, 215, 100, [inst("button default")]));
  out.push(cell("instance: override fill #10B981", 500, 40, 215, 100, [inst("button fill override", { fill: "#10B981" })]));
  out.push(cell("instance: override label content + color", 730, 40, 215, 100, [inst("button label override", { descendants: { [lbl.id]: { content: "Custom label", fill: "#FACC15" } } })]));
  out.push(cell("instance: label replaced by icon node", 960, 40, 200, 100, [inst("button icon replace", { descendants: { [lbl.id]: { type: "icon", id: "icon-check", name: "check icon", library: "lucide", icon: "check", width: 18, height: 18, fill: "#FFFFFF" } } })]));

  const cta = node("ref", { ref: btn.id, name: "cta button" });
  const card = node("frame", { name: "card", reusable: true, layout: "vertical", gap: 12, padding: 16, width: 240, cornerRadius: 12, fill: "#F9FAFB", stroke: "#D1D5DB", strokeWidth: 1, x: 0, y: 34 }, [
    node("text", { name: "card title", content: "Card title", fontFamily: "Inter", fontSize: 16, fontWeight: "700", fill: "#111827" }),
    node("text", { name: "card body", content: "Card body text goes here.", fontFamily: "Inter", fontSize: 13, fill: "#6B7280" }),
    cta,
  ]);
  out.push(cell("component: card (contains button instance)", 40, 200, 260, 230, [card]));
  out.push(cell("instance: card default", 330, 200, 260, 230, [node("ref", { ref: card.id, name: "card default", x: 0, y: 34 })]));
  out.push(cell("instance: card, nested label via path cta-id/label-id", 620, 200, 260, 230, [node("ref", { ref: card.id, name: "card nested override", x: 0, y: 34, descendants: { [`${cta.id}/${lbl.id}`]: { content: "Buy now", fill: "#FACC15" } } })]));

  const slot = node("frame", { name: "content slot", slot: [btn.id], layout: "vertical", gap: 8, padding: 8, width: "fill_container", height: 60, fill: "#FFFFFF", stroke: "#9CA3AF", strokeWidth: 1, cornerRadius: 6 }, []);
  const panel = node("frame", { name: "panel", reusable: true, layout: "vertical", gap: 12, padding: 16, width: 300, cornerRadius: 12, fill: "#F3F4F6", stroke: "#D1D5DB", strokeWidth: 1, x: 0, y: 34 }, [
    node("text", { name: "panel title", content: "Panel", fontFamily: "Inter", fontSize: 16, fontWeight: "700", fill: "#111827" }),
    slot,
  ]);
  out.push(cell("component: panel with slot frame", 40, 470, 320, 260, [panel]));
  const filled = node("frame", { name: "filled slot", layout: "vertical", gap: 8, padding: 8, width: "fill_container", fill: "#FFFFFF", stroke: "#9CA3AF", strokeWidth: 1, cornerRadius: 6 },
    [["Save", "#2563EB"], ["Cancel", "#6B7280"], ["Delete", "#EF4444"]].map(([t, c]) => node("ref", { ref: btn.id, name: "slot button " + t, fill: c, descendants: { [lbl.id]: { content: t } } })));
  out.push(cell("instance: panel, slot filled with button instances", 400, 470, 320, 260, [node("ref", { ref: panel.id, name: "panel instance", x: 0, y: 34, descendants: { [slot.id]: filled } })]));
  return out;
}
