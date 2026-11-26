#!/usr/bin/env node
/**
 * The before/after derived-sheet harness (ADR-0010, M0). Read-only, local files only.
 *
 * 1. Digest a directory of stored sheets (`*.json`, each one Firestore document
 *    `{path, data}` or a list of them: the parent and its `combat/state` child):
 *
 *      node --import ./scripts/alias-loader.mjs scripts/derived-digest.ts \
 *        digest tests/fixtures/derived-sheets [--out <file>]
 *
 * 2. Check out the other commit, digest the same directory again, then compare:
 *
 *      node --import ./scripts/alias-loader.mjs scripts/derived-digest.ts \
 *        compare <before.json> <after.json> [--counts]
 *
 *    It names every sheet whose derived sections moved, and exits 1 when anything
 *    differs. `--counts` prints counts only (sheets changed per section): no sheet
 *    path, no hash, no reason, no value. Use it for live sheets.
 *
 * Live sheets: the digest of a real character is private (a short section hash can be
 * guessed back). Write it with `--out` to an absolute path outside the repository and
 * outside synced folders (the file is created owner-only), never commit it, and
 * compare it with `--counts`. Both digests must be taken with the same pack
 * composition (`content-pack` linked on both commits, or on neither).
 */
/// <reference types="node" />
import { register } from "node:module";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import process, { argv } from "node:process";

// Vite gives app modules an `import.meta.env`; plain Node needs the neutral one
// before the engine loads (the derived-sheet probe does the same).
register(new URL("./lib/vite-env-hooks.mjs", import.meta.url));
const harness = await import("./lib/derived-digest.ts");
const { contentPackEnabled } = await import("./content-pack-mode.ts");

const USAGE =
  "usage: derived-digest.ts digest <dir> [--out <file>] | compare <before.json> <after.json> [--counts]";

async function main(args: readonly string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command === "digest") {
    const dir = rest[0];
    const outIndex = rest.indexOf("--out");
    const out = outIndex >= 0 ? rest[outIndex + 1] : undefined;
    if (!dir || (outIndex >= 0 && !out)) throw new Error(USAGE);
    const documents = await harness.readStoredDocuments(resolve(dir));
    const text = harness.stableText(
      await harness.digestDocuments(documents, contentPackEnabled())
    );
    if (out) {
      await writeFile(out, text, { mode: 0o600 });
      await chmod(out, 0o600);
    } else process.stdout.write(text);
    return 0;
  }
  if (command === "compare") {
    const [beforeFile, afterFile] = rest;
    if (!beforeFile || !afterFile) throw new Error(USAGE);
    const read = async (file: string) =>
      harness.parseDigest(JSON.parse(await readFile(file, "utf8")));
    const comparison = harness.compareDigests(
      await read(beforeFile),
      await read(afterFile)
    );
    process.stdout.write(
      rest.includes("--counts")
        ? harness.stableText(harness.countsReport(comparison))
        : harness.namedReport(comparison)
    );
    return harness.hasChanges(comparison) ? 1 : 0;
  }
  throw new Error(USAGE);
}

main(argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
);
