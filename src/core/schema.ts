export const SUPPORTED_VERSION = "2.21";

export type Theme = Record<string, string>;
export type VarValue = { value: unknown; theme?: Theme };
export interface VarDef { type: "boolean" | "color" | "number" | "string"; value: unknown | VarValue[]; }

export interface PenNode {
  id: string;
  type: string;
  name?: string;
  x?: number; y?: number;
  width?: number | string; height?: number | string;
  children?: PenNode[];
  [key: string]: any;
}

export interface PenDocument {
  version: string;
  themes?: Record<string, string[]>;
  variables?: Record<string, VarDef>;
  children: PenNode[];
}

export const KNOWN_TYPES = new Set([
  "frame", "group", "rectangle", "ellipse", "polygon", "path", "text",
  "note", "prompt", "context", "icon", "script", "browser", "ref",
]);
