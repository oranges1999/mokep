import { PenDocument, PenNode } from "./schema";

export interface ExpandResult { doc: PenDocument; warnings: string[]; }

/**
 * Replaces every `ref` node with a copy of its component, applying `descendants` overrides.
 * Expanded node ids are paths: "<refId>/<componentChildId>", nested instances give "<refId>/<innerRefId>/<leafId>".
 * The input document is not modified.
 */
export function expandRefs(input: PenDocument): ExpandResult {
  const doc = structuredClone(input);
  const warnings: string[] = [];
  const comps = new Map<string, PenNode>();
  const collect = (n: PenNode) => { if (n.reusable) comps.set(n.id, n); n.children?.forEach(collect); };
  doc.children.forEach(collect);

  const emptyFrame = (ref: PenNode): PenNode => ({ id: ref.id, type: "frame", name: ref.name, x: ref.x, y: ref.y, width: ref.width ?? 0, height: ref.height ?? 0 });

  const findRel = (root: PenNode, key: string): { node: PenNode; parent: PenNode; index: number } | null => {
    const hits: { node: PenNode; parent: PenNode; index: number }[] = [];
    const byId: typeof hits = [];
    const walk = (p: PenNode) => p.children?.forEach((c, i) => {
      if (c.id === key) byId.push({ node: c, parent: p, index: i });
      if (c.name === key) hits.push({ node: c, parent: p, index: i });
      walk(c);
    });
    walk(root);
    if (byId.length) return byId[0];
    return hits.length === 1 ? hits[0] : null;
  };

  const prefixIds = (n: PenNode, p: string) => { n.id = `${p}/${n.id}`; n.children?.forEach((c) => prefixIds(c, p)); };

  const expand = (n: PenNode, stack: string[]): PenNode => {
    if (n.type === "ref") return resolve(n, stack);
    if (n.children) n.children = n.children.map((c) => expand(c, stack));
    return n;
  };

  const resolve = (ref: PenNode, stack: string[]): PenNode => {
    const comp = comps.get(ref.ref);
    if (!comp) { warnings.push(`ref ${ref.id}: component "${ref.ref}" not found`); return emptyFrame(ref); }
    if (stack.includes(ref.ref)) { warnings.push(`ref ${ref.id}: cyclic component "${ref.ref}"`); return emptyFrame(ref); }
    const tree = expand(structuredClone(comp), [...stack, ref.ref]);
    delete tree.reusable;
    const { type: _t, ref: _r, descendants, id: _i, ...own } = ref;
    Object.assign(tree, own);
    for (const [key, val] of Object.entries((descendants ?? {}) as Record<string, any>)) {
      const hit = findRel(tree, key);
      if (!hit) { warnings.push(`ref ${ref.id}: descendant "${key}" not found`); continue; }
      if (val && typeof val === "object" && "type" in val) {
        const repl = expand(structuredClone(val) as PenNode, stack);
        repl.id = repl.id ?? hit.node.id;
        hit.parent.children![hit.index] = repl;
      } else {
        const { id: _ignored, type: _ignored2, ...props } = val ?? {};
        Object.assign(hit.node, props);
      }
    }
    tree.children?.forEach((c) => prefixIds(c, ref.id));
    tree.id = ref.id;
    return tree;
  };

  doc.children = doc.children.map((c) => expand(c, []));
  return { doc, warnings };
}
