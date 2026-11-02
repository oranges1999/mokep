import { Texture } from "pixi.js";
import { PenDocument, PenNode } from "../core/schema";
import { defaultTheme, rv } from "../core/variables";

export interface IconSet { license: string; viewBox: string; rootAttrs: string; icons: Record<string, string>; }

const ICON_FILES: Record<string, string> = {
  lucide: "lucide", feather: "lucide", phosphor: "phosphor",
  "Material Symbols Outlined": "material-outlined", "Material Symbols Rounded": "material-rounded", "Material Symbols Sharp": "material-sharp",
};
export const iconSetKey = (library: string) => ICON_FILES[library];

export interface UsedAssets { iconLibs: Set<string>; imageUrls: Set<string>; }

export function usedAssets(doc: PenDocument): UsedAssets {
  const iconLibs = new Set<string>(), imageUrls = new Set<string>();
  const theme = defaultTheme(doc);
  const fills = (v: any) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
  const walk = (n: PenNode) => {
    if (n.type === "icon") iconLibs.add(String(rv(doc, n.library ?? "lucide", theme)));
    for (const f of [...fills(n.fill), ...fills(n.stroke)]) if (f?.type === "image" && typeof f.url === "string") imageUrls.add(f.url);
    n.children?.forEach(walk);
  };
  doc.children.forEach(walk);
  return { iconLibs, imageUrls };
}

const iconCache = new Map<string, Promise<IconSet | null>>();
export async function loadIconSets(base: string, libs: Set<string>): Promise<Map<string, IconSet>> {
  const out = new Map<string, IconSet>();
  await Promise.all([...libs].map(async (lib) => {
    const key = iconSetKey(lib);
    if (!key) return;
    if (!iconCache.has(key)) iconCache.set(key, fetch(`${base}${key}.json`).then((r) => r.json()).catch(() => null));
    const set = await iconCache.get(key)!;
    if (set) out.set(lib, set);
  }));
  return out;
}

export function iconSvg(set: IconSet, name: string, color: string): { svg: string; vb: number[] } | null {
  const body = set.icons[name];
  if (!body) return null;
  const hex = color.length === 9 ? color.slice(0, 7) : color;
  const attrs = (set.rootAttrs || 'fill="currentColor"').replace(/currentColor/g, hex);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${set.viewBox}"><g ${attrs}>${body.replace(/currentColor/g, hex)}</g></svg>`;
  return { svg, vb: set.viewBox.split(/\s+/).map(Number) };
}

export async function loadImages(base: string, urls: Set<string>): Promise<Map<string, Texture | null>> {
  const out = new Map<string, Texture | null>();
  await Promise.all([...urls].map((u) => new Promise<void>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { out.set(u, Texture.from(img)); resolve(); };
    img.onerror = () => { out.set(u, null); resolve(); };
    img.src = /^(https?:|data:|blob:|vscode-)/.test(u) ? u : new URL(u, new URL(base, location.href)).toString();
  })));
  return out;
}
