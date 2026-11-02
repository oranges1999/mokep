import { PenDocument, PenNode } from "../core/schema";

interface FontEntry { family: string; weight: string; style: string; subset: string; file: string; unicodeRange?: string; }

export const DEFAULT_FONT = "Inter";

/** Font families a document needs (literal or variable-bound), always including the default. */
export function usedFamilies(doc: PenDocument): Set<string> {
  const out = new Set<string>([DEFAULT_FONT]);
  const fromVars = new Set<string>();
  const walk = (n: PenNode) => {
    const f = n.fontFamily;
    if (typeof f === "string") { if (f.startsWith("$")) fromVars.add(f.slice(1)); else out.add(f); }
    n.children?.forEach(walk);
  };
  doc.children.forEach(walk);
  for (const name of fromVars) {
    const v = doc.variables?.[name];
    if (!v || v.type !== "string") continue;
    const vals = Array.isArray(v.value) ? v.value.map((e: any) => e.value) : [v.value];
    vals.forEach((s) => typeof s === "string" && out.add(s));
  }
  return out;
}

let manifestPromise: Promise<FontEntry[]> | null = null;
const loaded = new Set<string>();

/** Loads bundled fonts for the given families, then waits for document.fonts.ready. Unknown families fall back silently. */
export async function loadFonts(baseUrl: string, families: Set<string>): Promise<string[]> {
  manifestPromise ??= fetch(baseUrl + "fonts.manifest.json").then((r) => r.json()).then((j) => j.fonts as FontEntry[]).catch(() => []);
  const entries = await manifestPromise;
  const missing = [...families].filter((f) => !entries.some((e) => e.family === f));
  const jobs: Promise<unknown>[] = [];
  for (const e of entries) {
    if (!families.has(e.family)) continue;
    const key = e.family + e.file;
    if (loaded.has(key)) continue;
    loaded.add(key);
    const face = new FontFace(e.family, `url(${baseUrl}${e.file}) format("woff2")`, { weight: e.weight, style: e.style, unicodeRange: e.unicodeRange });
    document.fonts.add(face);
    jobs.push(face.load().catch(() => undefined));
  }
  await Promise.all(jobs);
  await document.fonts.ready;
  return missing;
}
