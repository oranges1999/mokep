// Builds assets/icons/<library>.json from lucide-static (ISC), @phosphor-icons/core (MIT) and
// @material-symbols/svg-400 (Apache-2.0). Only the SVG body and viewBox are kept.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = ".icons-tmp", out = "assets/icons";
mkdirSync(tmp, { recursive: true });
if (!existsSync(join(tmp, "package.json"))) writeFileSync(join(tmp, "package.json"), '{"name":"icons-tmp","private":true}');
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
execFileSync(npm, ["install", "--no-save", "--no-audit", "--no-fund", "--prefix", tmp, "lucide-static", "@phosphor-icons/core", "@material-symbols/svg-400"], { stdio: "inherit", shell: process.platform === "win32" });
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "licenses"), { recursive: true });

const pkg = (n) => join(tmp, "node_modules", n);
const meta = (n) => JSON.parse(readFileSync(join(pkg(n), "package.json"), "utf8"));
const allowed = new Set(["ISC", "MIT", "Apache-2.0"]);

function read(dir, fileFilter = () => true) {
  const icons = {};
  let viewBox = "0 0 24 24", rootAttrs = "";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".svg") && fileFilter(x))) {
    const svg = readFileSync(join(dir, f), "utf8");
    const m = /<svg([^>]*)>([\s\S]*)<\/svg>/.exec(svg);
    if (!m) continue;
    viewBox = /viewBox="([^"]+)"/.exec(m[1])?.[1] ?? viewBox;
    rootAttrs = m[1].replace(/\s(xmlns|width|height|viewBox|class)="[^"]*"/g, "").trim();
    icons[f.slice(0, -4)] = m[2].replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
  }
  return { viewBox, rootAttrs, icons };
}

const jobs = [
  ["lucide", "lucide-static", join(pkg("lucide-static"), "icons")],
  ["phosphor", "@phosphor-icons/core", join(pkg("@phosphor-icons/core"), "assets", "regular")],
  ["material-outlined", "@material-symbols/svg-400", join(pkg("@material-symbols/svg-400"), "outlined")],
  ["material-rounded", "@material-symbols/svg-400", join(pkg("@material-symbols/svg-400"), "rounded")],
  ["material-sharp", "@material-symbols/svg-400", join(pkg("@material-symbols/svg-400"), "sharp")],
];
for (const [name, pkgName, dir] of jobs) {
  const m = meta(pkgName);
  if (!allowed.has(m.license)) throw new Error(`${pkgName}: license ${m.license} not allowed`);
  const data = read(dir);
  writeFileSync(join(out, `${name}.json`), JSON.stringify({ license: m.license, package: `${pkgName}@${m.version}`, ...data }));
  console.log(name, Object.keys(data.icons).length, "icons", data.viewBox, data.rootAttrs);
  for (const lic of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) if (existsSync(join(pkg(pkgName), lic))) { cpSync(join(pkg(pkgName), lic), join(out, "licenses", `${name}.txt`)); break; }
}
