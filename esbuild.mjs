import { build, context } from "esbuild";
const watch = process.argv.includes("--watch");
const prod = process.argv.includes("--production"); // used by `npm run package`: smaller files, no source maps
const common = { bundle: true, sourcemap: !prod, minify: prod, logLevel: "info" };
const jobs = [
  { ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", platform: "node", format: "cjs", external: ["vscode", "bufferutil", "utf-8-validate"] },
  { ...common, entryPoints: ["src/mcp/server.ts"], outfile: "dist/mcp-server.js", platform: "node", format: "cjs", banner: { js: "#!/usr/bin/env node" } },
  { ...common, entryPoints: ["src/webview/main.ts"], outfile: "dist/webview.js", platform: "browser", format: "iife", target: "es2022" },
  { ...common, entryPoints: ["harness/harness.ts"], outfile: "dist/harness.js", platform: "browser", format: "iife", target: "es2022" },
];
if (watch) for (const j of jobs) await (await context(j)).watch();
else for (const j of jobs) await build(j);
