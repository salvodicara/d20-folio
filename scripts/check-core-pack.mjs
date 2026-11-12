/**
 * check-core-pack — prove @d20-folio/core packs as a real package, without publishing
 * it (publishing is the owner's call): `pnpm pack --dry-run` in packages/folio-core,
 * then the tarball's contents against the manifest.
 *
 *   node scripts/check-core-pack.mjs        (run by `pnpm core:build`, after the build)
 *
 * - The version is a real semver, never 0.0.0.
 * - `exports["."]` is the only entry, and its `import` and `types` (and `main` /
 *   `types`) are files the tarball carries.
 * - The tarball carries the build, the README, the CHANGELOG, the NOTICE and the LICENSE, and nothing
 *   else: no sources, fixtures or smoke files.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const pkgDir = path.resolve(import.meta.dirname, "../packages/folio-core");
const packed = JSON.parse(
  execFileSync("pnpm", ["pack", "--dry-run", "--json"], { cwd: pkgDir, encoding: "utf8" })
);
const manifest = JSON.parse(
  execFileSync("node", ["-p", "JSON.stringify(require('./package.json'))"], {
    cwd: pkgDir,
    encoding: "utf8",
  })
);

const files = new Set(packed.files.map((file) => file.path));
const problems = [];

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(packed.version) || packed.version === "0.0.0")
  problems.push(`version "${packed.version}" is not a real semver`);

const entries = Object.keys(manifest.exports ?? {});
if (entries.length !== 1 || entries[0] !== ".")
  problems.push(
    `exports must have the "." entry alone, found ${JSON.stringify(entries)}`
  );

const target = (relative) => relative?.replace(/^\.\//, "");
for (const [label, file] of [
  ['exports["."].import', manifest.exports?.["."]?.import],
  ['exports["."].types', manifest.exports?.["."]?.types],
  ["main", manifest.main],
  ["types", manifest.types],
]) {
  if (!file) problems.push(`${label} is missing`);
  else if (!files.has(target(file)))
    problems.push(`${label} (${file}) is not in the tarball`);
}

const META = ["package.json", "README.md", "CHANGELOG.md", "NOTICE", "LICENSE"];
for (const required of [...META, "dist/index.js"]) {
  if (!files.has(required)) problems.push(`${required} is not in the tarball`);
}
const stray = [...files].filter(
  (file) => !file.startsWith("dist/") && !META.includes(file)
);
if (stray.length > 0) problems.push(`unexpected files: ${stray.join(", ")}`);

if (problems.length > 0) {
  console.error(
    `core-pack: @d20-folio/core does not pack cleanly:\n  ${problems.join("\n  ")}`
  );
  process.exit(1);
}
console.log(
  `core-pack: ${packed.filename} packs ${files.size} files, version ${packed.version}, one entry (".")`
);
