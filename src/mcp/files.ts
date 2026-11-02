import { execFileSync } from "node:child_process";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { PenDocument } from "../core/schema";
import { parsePen } from "../core/parse";

/** The tools only work on design files, so a mistyped path cannot read or rewrite some other JSON file. */
export function assertPen(file: string) {
  if (!/\.pen(\.json)?$/i.test(file)) throw new Error(`"${file}" is not a .pen file. These tools only work on .pen designs.`);
}

export function readDoc(file: string): PenDocument {
  assertPen(file);
  return parsePen(readFileSync(resolve(file), "utf8")).doc;
}

/** Writes through a temp file and renames, so a crash never leaves a half-written .pen. */
export function writeAtomic(file: string, text: string) {
  const target = resolve(file);
  const tmp = resolve(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
  const fd = openSync(tmp, "w");
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  try { renameSync(tmp, target); } catch (e) { try { unlinkSync(tmp); } catch { /* ignore */ } throw e; }
}

/** true when the file is tracked by git and has uncommitted changes; undefined when not in a repo. */
export function gitDirty(file: string): boolean | undefined {
  const target = resolve(file);
  try {
    const out = execFileSync("git", ["-C", dirname(target), "status", "--porcelain", "--", basename(target)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.trim().length > 0;
  } catch { return undefined; }
}
