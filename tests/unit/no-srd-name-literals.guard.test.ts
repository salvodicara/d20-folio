/// <reference types="node" />
/**
 * Guard (golden rule 7): the code speaks ONLY ids — a hardcoded SRD DISPLAY-NAME
 * string literal must NEVER live in TypeScript outside the i18n JSON. A localized name
 * written in code (a fixture seed, a stored field, a name-match) is a language LEAK and
 * a crash risk; this fails the build on any NEW one, so leaks are caught at build time,
 * not discovered at runtime (the `concentrationValue(id, "Hypnotic Pattern")` class).
 *
 * Scope: the RUNTIME path — `src/**` EXCEPT `src/i18n/**` (the strings live there), the
 * SRD data-authoring layer `src/data/**` (incl. the sync-guarded `srd-names.ts` BiText
 * source), and `*.test.*`. Only MULTI-WORD names are flagged: single common words that
 * are also SRD names ("Fly", "Aid", "Light", "Shield", "Bless") have too many legitimate
 * uses to flag without false positives — the multi-word constraint keeps it precise.
 *
 * RATCHET: `ALLOWLIST` holds the pre-existing violations. The campaign is COMPLETE —
 * every tracked site has been refactored to speak ids, so the allowlist is now EMPTY.
 * The guard fails on a NEW literal AND on a STALE allowlist entry (a fixed site MUST be
 * removed), so the debt can only shrink, never grow, and no new leak can be introduced.
 */
import ts from "typescript";
import { describe, it, expect } from "vitest";
import { srcFileMap, SRC_ROOT } from "./__helpers__/src-files";

/** Pre-existing SRD-name literals in the runtime path — tracked debt that must only
 *  shrink. The leak-eradication campaign is COMPLETE: every site now speaks stable ids
 *  and resolves its display from i18n, so this allowlist is EMPTY. A NEW literal fails
 *  the guard (it cannot be added here without a deliberate refactor entry). */
const ALLOWLIST: ReadonlySet<string> = new Set([]);

/** Every MULTI-WORD EN SRD display name, lowercased → its `kind:id` (for the message). */
function srdMultiWordNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const [path, content] of srcFileMap()) {
    if (!path.includes(`${SRC_ROOT}/i18n/en/srd/`) || !path.endsWith(".json")) continue;
    const kind = path.slice(path.lastIndexOf("/") + 1).replace(".json", "");
    const store = JSON.parse(content) as Record<string, unknown>;
    for (const [id, v] of Object.entries(store)) {
      if (typeof v !== "object" || v === null) continue;
      const name = (v as { name?: unknown }).name;
      if (typeof name === "string" && name.trim() && /\s/.test(name.trim())) {
        names.set(name.trim().toLowerCase(), `${kind}:${id}`);
      }
    }
  }
  return names;
}

/**
 * Scan the runtime path for whole string literals that EXACTLY equal a multi-word SRD
 * name. Walks the TypeScript AST (NOT a regex) so it sees through apostrophes
 * ("Hunter's Mark"), escapes, comments, and JSX by construction — no name is invisible.
 * Only plain string + no-substitution-template literals are checked; an interpolated
 * template's static parts never equal a full name (documented residual — the branded
 * id types are the backstop for runtime-constructed names, golden rule 7).
 */
function findViolations(): { key: string; id: string; loc: string }[] {
  const names = srdMultiWordNames();
  const out: { key: string; id: string; loc: string }[] = [];
  for (const [path, content] of srcFileMap()) {
    if (!/\.tsx?$/.test(path)) continue;
    if (
      path.includes(`${SRC_ROOT}/i18n/`) ||
      path.includes(`${SRC_ROOT}/data/`) ||
      /\.test\./.test(path)
    ) {
      continue;
    }
    const rel = path.slice(SRC_ROOT.length + 1);
    const sf = ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const lit = node.text.trim();
        const id = names.get(lit.toLowerCase());
        if (id) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          out.push({ key: `${rel}::${lit}`, id, loc: `${rel}:${line}` });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

describe("guard: no hardcoded SRD display-name literals in the runtime path (GR7)", () => {
  const violations = findViolations();

  it("introduces NO new SRD-name literal (every hit is a tracked allowlist entry)", () => {
    const fresh = violations.filter((v) => !ALLOWLIST.has(v.key));
    expect(
      fresh,
      `New hardcoded SRD display name(s) in code — store an id and localize from i18n ` +
        `(golden rule 7):\n${fresh.map((v) => `  ${v.loc}  "${v.key.split("::")[1]}" → ${v.id}`).join("\n")}`
    ).toEqual([]);
  });

  it("has no STALE allowlist entries (a fixed site must be removed so the debt only shrinks)", () => {
    const present = new Set(violations.map((v) => v.key));
    const stale = [...ALLOWLIST].filter((k) => !present.has(k));
    expect(
      stale,
      `Allowlisted sites no longer present — delete these entries:\n  ${stale.join("\n  ")}`
    ).toEqual([]);
  });

  it("sees through apostrophes (AST, not regex) — the old regex hole stays closed", () => {
    // Regression: an inner-quote-excluding regex made every apostrophe SRD name
    // ("Hunter's Mark", "Arcane Hand", …) invisible. The AST extracts the FULL literal.
    const sf = ts.createSourceFile(
      "t.ts",
      `const x = "War God's Blessing";`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const lits: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isStringLiteral(n)) lits.push(n.text);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(lits).toContain("War God's Blessing");
    // And the SRD name set DOES carry apostrophe names, so such a literal would be flagged.
    expect([...srdMultiWordNames().keys()].some((n) => n.includes("'"))).toBe(true);
  });
});
