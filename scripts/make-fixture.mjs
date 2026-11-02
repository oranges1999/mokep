// Rebuilds fixtures/test.pen.json: the same 9 test frames that were authored in pen.dev.
import { writeFileSync, mkdirSync } from "node:fs";
import { frames } from "./fixture-frames.mjs";

const variables = {
  "color.bg": { type: "color", value: [{ value: "#FFFFFF", theme: { mode: "light" } }, { value: "#111827", theme: { mode: "dark" } }] },
  "color.text": { type: "color", value: [{ value: "#111827", theme: { mode: "light" } }, { value: "#F9FAFB", theme: { mode: "dark" } }] },
  "color.primary": { type: "color", value: [{ value: "#2563EB", theme: { mode: "light" } }, { value: "#60A5FA", theme: { mode: "dark" } }] },
  "spacing.md": { type: "number", value: 16 },
  "radius.md": { type: "number", value: 12 },
  "app.title": { type: "string", value: "Test App" },
  "show.badge": { type: "boolean", value: true },
};

const doc = { version: "2.21", themes: { mode: ["light", "dark"] }, variables, children: frames() };
mkdirSync("fixtures", { recursive: true });
writeFileSync("fixtures/test.pen.json", JSON.stringify(doc, null, 1));
console.log("wrote fixtures/test.pen.json with", doc.children.length, "frames");
