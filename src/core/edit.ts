import { KNOWN_TYPES, PenDocument, PenNode, VarDef } from "./schema";

export type Op =
  | { op: "insert"; parent: string; node: PenNode; index?: number }
  | { op: "update"; id: string; props: Record<string, any> }
  | { op: "replace"; id: string; node: PenNode }
  | { op: "delete"; id: string }
  | { op: "move"; id: string; parent: string; index?: number }
  | { op: "setVariables"; variables: Record<string, VarDef>; replace?: boolean };

export interface EditResult { doc: PenDocument; errors: string[]; warnings: string[]; created: string[]; }

const CONTAINERS = new Set(["frame", "group"]);
const IMMUTABLE = new Set(["id", "type", "ref"]);

function randomId(taken: Set<string>): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (;;) {
    let s = "";
    for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!taken.has(s)) { taken.add(s); return s; }
  }
}

interface Hit { node: PenNode; list: PenNode[]; index: number; parent: PenNode | null; }

function locate(doc: PenDocument, id: string): Hit | null {
  const walk = (list: PenNode[], parent: PenNode | null): Hit | null => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { node: list[i], list, index: i, parent };
      const sub = list[i].children ? walk(list[i].children!, list[i]) : null;
      if (sub) return sub;
    }
    return null;
  };
  return walk(doc.children, null);
}

function allIds(doc: PenDocument): Set<string> {
  const ids = new Set<string>();
  const walk = (n: PenNode) => { ids.add(n.id); n.children?.forEach(walk); };
  doc.children.forEach(walk);
  return ids;
}

export function validate(doc: PenDocument): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const seen = new Set<string>();
  const refs: PenNode[] = [];
  const walk = (n: PenNode, parent: PenNode | null) => {
    if (typeof n.id !== "string" || !n.id) errors.push("node without id");
    else if (n.id.includes("/")) errors.push(`id "${n.id}" must not contain "/"`);
    else if (seen.has(n.id)) errors.push(`duplicate id "${n.id}"`);
    else seen.add(n.id);
    if (typeof n.type !== "string") errors.push(`node ${n.id}: missing type`);
    else if (!KNOWN_TYPES.has(n.type)) warnings.push(`node ${n.id}: unknown type "${n.type}"`);
    if (n.children && !CONTAINERS.has(n.type)) errors.push(`node ${n.id}: only frame and group can have children`);
    if (!parent && ["text", "icon", "note", "prompt", "context"].includes(n.type)) warnings.push(`node ${n.id}: ${n.type} placed directly in the document root`);
    if (n.type === "ref") refs.push(n);
    n.children?.forEach((c) => walk(c, n));
  };
  doc.children.forEach((c) => walk(c, null));
  for (const r of refs) if (!seen.has(r.ref)) errors.push(`ref ${r.id}: target "${r.ref}" not found`);
  return { errors, warnings };
}

/** Applies ops to a copy of the document. The caller must not write the file when `errors` is not empty. */
export function applyOps(input: PenDocument, ops: Op[]): EditResult {
  const doc = structuredClone(input);
  const errors: string[] = [], created: string[] = [];
  const taken = allIds(doc);

  const assignIds = (n: PenNode) => {
    if (!n.id) { n.id = randomId(taken); created.push(n.id); }
    else taken.add(n.id);
    n.children?.forEach(assignIds);
  };
  const dropIds = (n: PenNode) => { taken.delete(n.id); n.children?.forEach(dropIds); };

  ops.forEach((op, i) => {
    const at = `op[${i}] ${op.op}`;
    try {
      switch (op.op) {
        case "insert": {
          const list = op.parent === "document" ? doc.children : locate(doc, op.parent)?.node;
          if (!list) return errors.push(`${at}: parent "${op.parent}" not found`);
          const target = Array.isArray(list) ? list : (CONTAINERS.has(list.type) ? (list.children ??= []) : null);
          if (!target) return errors.push(`${at}: parent "${op.parent}" cannot have children`);
          const node = structuredClone(op.node);
          assignIds(node);
          target.splice(op.index ?? target.length, 0, node);
          break;
        }
        case "update": {
          if (op.id.includes("/")) {
            const [inst, ...rest] = op.id.split("/");
            const hit = locate(doc, inst);
            if (!hit || hit.node.type !== "ref") return errors.push(`${at}: "${inst}" is not an instance`);
            const key = rest.join("/");
            hit.node.descendants = { ...(hit.node.descendants ?? {}), [key]: { ...((hit.node.descendants ?? {})[key] ?? {}), ...op.props } };
            break;
          }
          const hit = locate(doc, op.id);
          if (!hit) return errors.push(`${at}: node "${op.id}" not found`);
          for (const [k, v] of Object.entries(op.props)) {
            if (IMMUTABLE.has(k)) { errors.push(`${at}: "${k}" cannot be changed`); continue; }
            if (k === "children") { errors.push(`${at}: use insert/replace/delete for children`); continue; }
            if (v === null) delete hit.node[k]; else hit.node[k] = v;
          }
          break;
        }
        case "replace": {
          if (op.id.includes("/")) {
            const [inst, ...rest] = op.id.split("/");
            const hit = locate(doc, inst);
            if (!hit || hit.node.type !== "ref") return errors.push(`${at}: "${inst}" is not an instance`);
            hit.node.descendants = { ...(hit.node.descendants ?? {}), [rest.join("/")]: structuredClone(op.node) };
            break;
          }
          const hit = locate(doc, op.id);
          if (!hit) return errors.push(`${at}: node "${op.id}" not found`);
          dropIds(hit.node);
          const node = structuredClone(op.node);
          assignIds(node);
          hit.list[hit.index] = node;
          break;
        }
        case "delete": {
          const hit = locate(doc, op.id);
          if (!hit) return errors.push(`${at}: node "${op.id}" not found`);
          dropIds(hit.node);
          hit.list.splice(hit.index, 1);
          break;
        }
        case "move": {
          const hit = locate(doc, op.id);
          if (!hit) return errors.push(`${at}: node "${op.id}" not found`);
          const dest = op.parent === "document" ? doc.children : locate(doc, op.parent)?.node;
          if (!dest) return errors.push(`${at}: parent "${op.parent}" not found`);
          const target = Array.isArray(dest) ? dest : (CONTAINERS.has(dest.type) ? (dest.children ??= []) : null);
          if (!target) return errors.push(`${at}: parent "${op.parent}" cannot have children`);
          if (!Array.isArray(dest) && locate({ version: doc.version, children: [hit.node] }, dest.id)) return errors.push(`${at}: cannot move a node into itself`);
          hit.list.splice(hit.index, 1);
          target.splice(op.index ?? target.length, 0, hit.node);
          break;
        }
        case "setVariables": {
          doc.variables = op.replace ? { ...op.variables } : { ...(doc.variables ?? {}), ...op.variables };
          for (const v of Object.values(op.variables)) {
            for (const e of Array.isArray(v.value) ? (v.value as any[]) : []) {
              for (const [axis, val] of Object.entries(e.theme ?? {})) {
                const themes = (doc.themes ??= {});
                if (!themes[axis]) themes[axis] = [];
                if (!themes[axis].includes(val as string)) themes[axis].push(val as string);
              }
            }
          }
          break;
        }
        default:
          errors.push(`${at}: unknown operation`);
      }
    } catch (e) {
      errors.push(`${at}: ${(e as Error).message}`);
    }
  });

  const v = validate(doc);
  return { doc, errors: [...errors, ...v.errors], warnings: v.warnings, created };
}
