/**
 * §7 GUARD — no SRD display strings in `src/data/**` (R6+R3 SLICE 7d).
 *
 * After THE STRIP the catalogues (`src/i18n/{en,it}/srd/<kind>.json`) are the
 * single source of SRD text; `src/data/**` is ids + mechanics ONLY. This guard
 * fails if any translatable string literal reappears in the data layer:
 *   - a `BiText` leaf — an object literal with BOTH `en` and `it` string
 *     properties (the exact shape the strip removed), OR
 *   - an `en:` / `it:` property whose value is a natural-language string
 *     (multi-word, or containing a space + a letter) — the codemod's signature.
 *
 * Whitelisted files keep inline strings by design (documented bypasses):
 *   - `srd-names.ts` — a lightweight name index the eager persistence layer reads
 *     without pulling the SRD catalogues.
 *   - `types.ts` — the `BiText` interface declaration itself (no string VALUES).
 *   - `cover.ts` — a self-contained Cover quick-reference table that is NOT an
 *     id-keyed SRD entity rendered through the catalogue seam (no per-character
 *     mechanic; only a static reference). Documented bypass.
 *
 * NOTE: `background-equipment.ts` was REMOVED from this whitelist (2026-06-13)
 * when its `flavour(en,it)` inline-BiText escape hatch was deleted — every former
 * "flavour" pack item is now a real SRD catalogue id, so the file carries ids
 * ONLY and this guard now enforces no-BiText there too (the hatch cannot return).
 *
 * AST-driven (TS compiler API), so it can't be spelled around by formatting.
 */
import { describe, it, expect } from "vitest";
import { resolve, relative } from "node:path";
import ts from "typescript";
import { SRC_ROOT, srcFiles, readSrc } from "./__helpers__/src-files";

const DATA_DIR = resolve(SRC_ROOT, "data");

// Files allowed to keep inline strings (documented bypasses).
const WHITELIST = new Set(["srd-names.ts", "types.ts", "cover.ts"]);

/** A natural-language string: multi-word (a space between word chars), not a slug/id/enum. */
function isNaturalLanguage(s: string): boolean {
  return /\w\s+\w/.test(s);
}

function offenders(file: string): string[] {
  const text = readSrc(file);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];

  function lineOf(node: ts.Node): number {
    return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  }

  const visit = (node: ts.Node): void => {
    // (1) A BiText leaf — object literal with BOTH `en` and `it` string props.
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map<string, ts.Expression>();
      for (const p of node.properties) {
        if (
          ts.isPropertyAssignment(p) &&
          (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
        )
          props.set(p.name.text, p.initializer);
      }
      const en = props.get("en");
      const it = props.get("it");
      const isStr = (e?: ts.Expression): boolean =>
        e != null && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e));
      if (isStr(en) && isStr(it)) {
        found.push(`L${lineOf(node)}: BiText leaf { en, it }`);
      }
    }
    // (2) An `en:`/`it:` property assigned a natural-language string literal.
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      (node.name.text === "en" || node.name.text === "it") &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
      isNaturalLanguage(node.initializer.text)
    ) {
      found.push(
        `L${lineOf(node)}: ${node.name.text}: "${node.initializer.text.slice(0, 40)}…"`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("§7 guard — no SRD display strings in src/data/**", () => {
  // Explicit timeout: whole src/data AST walk (TypeScript compiler API). The
  // data corpus grew ~+1,000 lines (feats.ts etc.) in a data sweep; measured
  // at risk of the 5 s default under V8 coverage + parallel load. 30 s gives
  // 4–5× headroom and grows with the SRD corpus.
  it("every data file (outside the documented bypasses) is free of BiText / NL strings", () => {
    const violations: Record<string, string[]> = {};
    for (const file of srcFiles({ under: DATA_DIR, exts: [".ts"] })) {
      const base = relative(DATA_DIR, file);
      if (WHITELIST.has(base)) continue;
      const found = offenders(file);
      if (found.length) violations[base] = found;
    }
    expect(violations).toEqual({});
  }, 30_000);
});
