import { PenDocument, Theme, VarValue } from "./schema";

export function defaultTheme(doc: PenDocument): Theme {
  const t: Theme = {};
  for (const [axis, values] of Object.entries(doc.themes ?? {})) if (values.length) t[axis] = values[0];
  return t;
}

const matches = (entry: Theme | undefined, active: Theme) =>
  !!entry && Object.entries(entry).every(([k, v]) => active[k] === v);

export function resolveVariable(doc: PenDocument, name: string, active: Theme, depth = 0): unknown {
  const def = doc.variables?.[name];
  if (!def || depth > 8) return undefined;
  const v = def.value;
  let out: unknown = v;
  if (Array.isArray(v)) {
    const entries = v as VarValue[];
    const hit = entries.find((e) => e.theme && Object.keys(e.theme).length && matches(e.theme, active))
      ?? entries.find((e) => !e.theme || !Object.keys(e.theme).length)
      ?? entries[0];
    out = hit?.value;
  }
  if (typeof out === "string" && out.startsWith("$")) return resolveVariable(doc, out.slice(1), active, depth + 1);
  return out;
}

/** Resolve a property value: "$name" -> variable value, anything else unchanged. */
export function rv<T = any>(doc: PenDocument, value: T, active: Theme): T {
  if (typeof value === "string" && value.startsWith("$")) {
    const r = resolveVariable(doc, value.slice(1), active);
    return (r === undefined ? value : r) as T;
  }
  return value;
}
