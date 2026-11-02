import { expandRefs } from "./instances";
import { parsePen } from "./parse";
import { PenNode } from "./schema";
import { validate } from "./edit";

export interface LintIssue { level: "error" | "warning"; node?: string; message: string; }

/** Static checks that need no rendering. Layout-dependent checks (overflow, clipping) live in the viewer. */
export function lint(text: string): LintIssue[] {
  const out: LintIssue[] = [];
  const { doc, warnings } = parsePen(text);
  warnings.forEach((m) => out.push({ level: "warning", message: m }));
  const v = validate(doc);
  v.errors.forEach((m) => out.push({ level: "error", message: m }));
  expandRefs(doc).warnings.forEach((m) => out.push({ level: "warning", message: m }));

  const walk = (n: PenNode, parent: PenNode | null) => {
    const parentFlex = parent?.type === "frame" && (parent.layout ?? "horizontal") !== "none";
    if (n.type === "text") {
      if (n.fill === undefined) out.push({ level: "warning", node: n.id, message: "text has no fill and is invisible" });
      if (n.textGrowth === "fixed-width" && typeof n.width !== "number" && n.width !== "fill_container") out.push({ level: "warning", node: n.id, message: "fixed-width text needs a width" });
      if (n.textGrowth === "fixed-width-height" && (typeof n.width !== "number" || typeof n.height !== "number")) out.push({ level: "warning", node: n.id, message: "fixed-width-height text needs width and height" });
    }
    if ((n.width === "fill_container" || n.height === "fill_container") && !parentFlex && parent) out.push({ level: "warning", node: n.id, message: "fill_container used outside an auto-layout parent" });
    if (parentFlex && (n.x !== undefined || n.y !== undefined) && n.layoutPosition !== "absolute") out.push({ level: "warning", node: n.id, message: "x/y are ignored inside an auto-layout parent" });
    if (n.type === "icon" && !n.icon) out.push({ level: "warning", node: n.id, message: "icon without a name" });
    if (n.type === "script" || n.type === "browser") out.push({ level: "warning", node: n.id, message: `${n.type} nodes are shown as placeholders and never run` });
    n.children?.forEach((c) => walk(c, n));
  };
  doc.children.forEach((c) => walk(c, null));
  return out;
}
