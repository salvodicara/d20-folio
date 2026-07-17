/**
 * §7 GUARD — no BiText `[locale]` indexing / `.en`·`.it` reads outside the
 * presenter layer (R6+R3 SLICE 7d).
 *
 * The engine (`src/lib` outside `lib/views`, `src/stores`, `src/data`,
 * `src/types`) and the UI (`src/features`, `src/components`, `src/hooks`,
 * `src/app`) must NOT localize SRD text by hand: no `<expr>[locale]` BiText
 * indexing and no `.en` / `.it` member reads. Localization happens ONLY in
 * `src/lib/views/**` (the presenter edge, via `localizeText`/`localizeSrd`) and
 * `src/i18n/**` (the resolver). This is what the strip makes enforceable — SRD
 * entity BiText no longer exists in the data, so a `.en`/`[locale]` read can only
 * be the engine reaching past the catalogue seam.
 *
 * WHITELIST — files that legitimately read INLINE BiText (the documented
 * language/tool/skill ROSTERS that stay inline, the generic SRD-token resolver,
 * the synthetic-grant `nameEn` fact, and a couple of local bilingual-literal
 * maps). New reads outside this set fail the guard.
 *
 * AST-driven (TS compiler API) so it can't be spelled around.
 */
import { describe, it, expect } from "vitest";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

// Directories whose `.en`/`.it`/`[locale]` reads are the SANCTIONED presenter /
// resolver edge — skipped wholesale.
const ALLOWED_DIRS = [join("lib", "views"), join("i18n")];

// Files that legitimately read inline-roster / local-literal BiText.
const WHITELIST = new Set(
  [
    // language / tool / skill rosters (kept inline by design — 7b).
    "lib/lore-utils.ts",
    "lib/feat-language-choices.ts",
    "components/shared/SrdTagPicker.tsx",
    "components/sheet/ToolChoicePicker.tsx",
    "components/sheet/LanguageChoicePicker.tsx",
    "components/sheet/SkillOrToolPicker.tsx",
    // synthetic-grant `nameEn` fact (engine literal, not catalogue) — `g.name.en`.
    "lib/grants.ts",
    // engine-authored bilingual trigger-PHRASE tables (`p.en`/`p.it`) folded into
    // an engine `litText` — local literals, NOT SRD-catalogue BiText.
    "lib/smart-tracker.ts",
    // a local bilingual-literal label map (`labels[cat][locale]`), not SRD data.
    "features/character/center/tabs/FeaturesTab.tsx",
  ].map((p) => p.split("/").join(sep))
);

function offenders(file: string): string[] {
  const text = readSrc(file);
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const found: string[] = [];
  const lineOf = (n: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const visit = (node: ts.Node): void => {
    // `.en` / `.it` property access.
    if (
      ts.isPropertyAccessExpression(node) &&
      (node.name.text === "en" || node.name.text === "it")
    ) {
      found.push(`L${lineOf(node)}: .${node.name.text}`);
    }
    // `<expr>[locale]` / `<expr>[lang]` element access by a locale-ish key.
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.argumentExpression) &&
      /^(locale|lang|language)$/.test(node.argumentExpression.text)
    ) {
      found.push(`L${lineOf(node)}: [${node.argumentExpression.text}]`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("§7 guard — no BiText indexing outside the presenter edge", () => {
  // Explicit timeout: whole-src AST walk (TypeScript compiler API) over every
  // .ts/.tsx under src/. Measured ~6.4 s under V8 coverage + parallel load;
  // grows with the SRD corpus. 30 s gives 4–5× headroom for CI contention.
  it("no engine/UI file localizes SRD BiText by hand (only lib/views + i18n + rosters)", () => {
    const violations: Record<string, string[]> = {};
    for (const file of srcFiles({ exts: [".ts", ".tsx"] })) {
      const rel = relative(SRC, file);
      if (ALLOWED_DIRS.some((d) => rel.startsWith(d + sep) || rel === d)) continue;
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      // Only the engine + UI layers are gated (data/types declare BiText literals
      // covered by the sibling `no-srd-strings-in-data` guard).
      if (rel.startsWith("data" + sep) || rel.startsWith("types" + sep)) continue;
      if (WHITELIST.has(rel)) continue;
      const found = offenders(file);
      if (found.length) violations[rel] = found;
    }
    expect(violations).toEqual({});
  }, 30_000);
});
