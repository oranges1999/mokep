import { KNOWN_TYPES, PenDocument, PenNode, SUPPORTED_VERSION } from "./schema";

export interface ParseResult { doc: PenDocument; warnings: string[]; }

export function parsePen(text: string): ParseResult {
  const warnings: string[] = [];
  let raw: any;
  try { raw = JSON.parse(text); } catch (e) { throw new Error("Not valid JSON: " + (e as Error).message); }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.children)) throw new Error("Missing top-level children array");
  const version = String(raw.version ?? "");
  if (version !== SUPPORTED_VERSION) warnings.push(`version ${version || "(none)"} differs from ${SUPPORTED_VERSION}`);

  const seen = new Set<string>();
  const walk = (n: PenNode, path: string) => {
    if (!n || typeof n !== "object") { warnings.push(`${path}: node is not an object`); return; }
    if (typeof n.id !== "string" || !n.id) warnings.push(`${path}: missing id`);
    else {
      if (n.id.includes("/")) warnings.push(`${path}: id "${n.id}" contains "/"`);
      if (seen.has(n.id)) warnings.push(`${path}: duplicate id "${n.id}"`);
      seen.add(n.id);
    }
    if (!KNOWN_TYPES.has(n.type)) warnings.push(`${path}: unknown type "${n.type}"`);
    if (n.children !== undefined && !Array.isArray(n.children)) { warnings.push(`${path}: children is not an array`); n.children = []; }
    (n.children ?? []).forEach((c, i) => walk(c, `${path}/${c?.name ?? c?.id ?? i}`));
  };
  raw.children.forEach((c: PenNode, i: number) => walk(c, c?.name ?? c?.id ?? String(i)));

  const refs: PenNode[] = [];
  const collect = (n: PenNode) => { if (n?.type === "ref") refs.push(n); n?.children?.forEach(collect); };
  raw.children.forEach(collect);
  for (const r of refs) if (!seen.has(r.ref)) warnings.push(`ref ${r.id}: target "${r.ref}" not found`);

  return { doc: { ...raw, version, children: raw.children }, warnings };
}
