export const MAX_RECENT = 20;

const same = (a: string, b: string, ci: boolean) => (ci ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Newest first, no duplicates, capped. `ci` compares paths case-insensitively (Windows). */
export function pushRecent(list: string[], file: string, ci = false): string[] {
  return [file, ...list.filter((f) => !same(f, file, ci))].slice(0, MAX_RECENT);
}

export function dropRecent(list: string[], file: string, ci = false): string[] {
  return list.filter((f) => !same(f, file, ci));
}
