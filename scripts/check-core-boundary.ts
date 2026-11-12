/**
 * check-core-boundary — prove the built @d20-folio/core carries none of the private
 * content pack (skill `srd-boundary`). After `pnpm core:build`:
 *
 *   node --import ./scripts/alias-loader.mjs scripts/check-core-boundary.ts [--require-pack]
 *
 * 1. No module of the bundle imports the pack (`@pack…`, `content-pack/…`): the build
 *    points every `@pack` alias at the empty stub.
 * 2. With the pack composed (`content-pack/` linked), none of its long text or art is
 *    in the bundle: the pack is emitted to a temporary folder and the deploy's own leak
 *    check (`scripts/pack/check-public-bundle.ts`) reads the bundle against it. Without
 *    the pack there is nothing private to compare: the check says so, and fails with
 *    `--require-pack` (CI's composed job, so the comparison can never silently skip).
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { contentPackEnabled } from "./content-pack-mode.ts";
import { findLeaks } from "./pack/check-public-bundle.ts";
import { emitPack } from "./pack/emit-pack.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "packages/folio-core/dist");
const requirePack = process.argv.includes("--require-pack");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

/** Module specifiers that reach the private pack, file by file. */
export function packImports(distDir: string): string[] {
  const specifier = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  const found: string[] = [];
  for (const file of files(distDir).filter((name) => /\.(js|d\.ts)$/.test(name))) {
    for (const match of readFileSync(file, "utf8").matchAll(specifier)) {
      const target = match[1] ?? "";
      if (target.startsWith("@pack") || target.includes("content-pack"))
        found.push(`${path.relative(distDir, file)}: imports "${target}"`);
    }
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(path.join(DIST, "index.js"))) {
    console.error(
      "core-boundary: no build in packages/folio-core/dist (run pnpm core:build)"
    );
    process.exit(1);
  }
  const imports = packImports(DIST);
  if (imports.length > 0) {
    console.error(
      `core-boundary: the core imports the private pack:\n  ${imports.join("\n  ")}`
    );
    process.exit(1);
  }
  if (!contentPackEnabled()) {
    const message = "core-boundary: no content-pack/ here, so no private text to compare";
    if (requirePack) {
      console.error(`${message} (--require-pack)`);
      process.exit(1);
    }
    console.log(`${message}; the bundle imports no pack. ✓`);
    process.exit(0);
  }
  const out = mkdtempSync(path.join(tmpdir(), "core-boundary-"));
  try {
    await emitPack(out, "core-boundary-check");
    // File names only: CI logs are public, and the leaked text is private.
    const leaked = [
      ...new Set(
        findLeaks(DIST, out, path.join(ROOT, "src")).map((leak) => leak.split(":")[0])
      ),
    ];
    if (leaked.length > 0) {
      console.error(
        `core-boundary: private pack content in the core, in:\n  ${leaked.join("\n  ")}`
      );
      process.exit(1);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  console.log(
    "core-boundary: no pack import and none of the pack's text or art in the core. ✓"
  );
}
