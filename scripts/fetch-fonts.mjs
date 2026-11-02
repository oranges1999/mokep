// Downloads bundled fonts from Fontsource packages, keeps latin/latin-ext/vietnamese subsets,
// checks licenses, writes assets/fonts/fonts.manifest.json and licenses.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const cfg = JSON.parse(readFileSync("fonts.config.json", "utf8"));
const tmp = ".fonts-tmp";
const out = "assets/fonts";
mkdirSync(tmp, { recursive: true });
if (!existsSync(join(tmp, "package.json"))) writeFileSync(join(tmp, "package.json"), '{"name":"fonts-tmp","private":true}');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "licenses"), { recursive: true });

const slug = (f) => f.toLowerCase().replace(/ /g, "-");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const tryInstall = (pkg) => {
  try { execFileSync(npm, ["install", "--no-save", "--no-audit", "--no-fund", "--prefix", tmp, pkg], { stdio: "pipe", shell: process.platform === "win32" }); return true; } catch { return false; }
};

const manifest = [];
const skipped = [];
for (const family of cfg.families) {
  const s = slug(family);
  let pkg = `@fontsource-variable/${s}`, variable = true;
  if (!tryInstall(pkg)) { pkg = `@fontsource/${s}`; variable = false; if (!tryInstall(pkg)) { skipped.push(`${family}: no fontsource package`); continue; } }
  const dir = join(tmp, "node_modules", pkg);
  const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const license = meta.license;
  if (!cfg.allowedLicenses.includes(license)) { skipped.push(`${family}: license ${license} not allowed`); continue; }
  const cssFiles = variable
    ? readdirSync(dir).filter((f) => /^(wght|index|wght-italic)\.css$/.test(f) && f !== "index.css" || f === "index.css" && false)
    : [...cfg.staticWeights.map((w) => `${w}.css`), "400-italic.css"].filter((f) => existsSync(join(dir, f)));
  for (const cssName of cssFiles) {
    const css = readFileSync(join(dir, cssName), "utf8");
    for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
      const url = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
      if (!url) continue;
      const subset = [...cfg.subsets].sort((a, b) => b.length - a.length).find((x) => url.includes(`-${x}-`));
      if (!subset) continue;
      const weight = /font-weight:\s*([^;]+);/.exec(block)?.[1].trim() ?? "400";
      const style = /font-style:\s*([^;]+);/.exec(block)?.[1].trim() ?? "normal";
      const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1].trim();
      mkdirSync(join(out, s), { recursive: true });
      cpSync(join(dir, "files", url), join(out, s, url));
      manifest.push({ family, weight, style, subset, file: `${s}/${url}`, unicodeRange: range, license, package: `${pkg}@${meta.version}` });
    }
  }
  for (const lic of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) if (existsSync(join(dir, lic))) { cpSync(join(dir, lic), join(out, "licenses", `${s}.txt`)); break; }
}
writeFileSync(join(out, "fonts.manifest.json"), JSON.stringify({ generated: new Date().toISOString(), skipped, fonts: manifest }, null, 1));
console.log(`fonts: ${manifest.length} files, ${new Set(manifest.map((m) => m.family)).size} families, skipped: ${skipped.length}`);
skipped.forEach((x) => console.log(" skipped", x));
