export function parseColor(s: string): { color: number; alpha: number } {
  let h = String(s).replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  const color = parseInt(h.slice(0, 6), 16);
  const alpha = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { color: Number.isNaN(color) ? 0 : color, alpha };
}
