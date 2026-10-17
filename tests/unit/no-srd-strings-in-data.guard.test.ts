/**
 * GUARD: no display text in shipped rules data (`src/data/**`, plus the name
 * tables and engine modules listed in `ALSO_COVERED`).
 *
 * Rules data stores ids and mechanics; its words live in the catalogues
 * (`src/i18n/<locale>/srd/<kind>.json`), keyed by those ids, so a new language
 * is a new catalogue folder and never a data edit. This guard fails if inline
 * text reappears in the data layer:
 *   - a `LocaleText` leaf: an object literal with string values under two or
 *     more registered locale codes (`{ en: "…", it: "…" }`), OR
 *   - a locale-code property (`en:`, `it:`, any registered code) whose value is
 *     a natural-language string (multi-word).
 * The locale codes come from the registry (`@/lib/locale`), so a third language
 * is caught without touching this file.
 *
 * Bypass: `types.ts` declares the `LocaleText` type (no string values).
 *
 * AST-driven (TS compiler API), so it can't be spelled around by formatting.
 */
import { describe, it, expect } from "vitest";
import { resolve, relative } from "node:path";
import ts from "typescript";
import { LOCALES } from "@/lib/locale";
import { SRC_ROOT, srcFiles, readSrc } from "./__helpers__/src-files";

const DATA_DIR = resolve(SRC_ROOT, "data");

const BYPASS = new Set(["types.ts"]);

/**
 * Files outside `src/data` that store ids only, too: name tables that hold
 * official names, and engine modules whose words live in the catalogues.
 */
const ALSO_COVERED = [
  "components/shared/combat-glossary.ts",
  "lib/smart-tracker.ts",
  "lib/condition-effects.ts",
  "lib/base-action-states.ts",
  "lib/surprise-state.ts",
  "lib/wish-state.ts",
  "lib/light-states.ts",
].map((f) => resolve(SRC_ROOT, f));

const LOCALE_CODES: ReadonlySet<string> = new Set(LOCALES);

/** A natural-language string: multi-word (a space between word chars), not a slug/id/enum. */
function isNaturalLanguage(s: string): boolean {
  return /\w\s+\w/.test(s);
}

/** A string or template literal (`${n} temporary HP` is text with a hole). */
function isTextLiteral(
  e: ts.Expression
): e is ts.StringLiteralLike | ts.TemplateExpression {
  return (
    ts.isStringLiteral(e) ||
    ts.isNoSubstitutionTemplateLiteral(e) ||
    ts.isTemplateExpression(e)
  );
}

/** A text literal's words, a template's holes read as one placeholder word. */
function literalText(e: ts.StringLiteralLike | ts.TemplateExpression): string {
  if (!ts.isTemplateExpression(e)) return e.text;
  return [e.head.text, ...e.templateSpans.map((span) => `x${span.literal.text}`)].join(
    ""
  );
}

function propName(p: ts.ObjectLiteralElementLike): string | undefined {
  if (!ts.isPropertyAssignment(p)) return undefined;
  return ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
}

function offenders(file: string): string[] {
  const text = readSrc(file);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];

  function lineOf(node: ts.Node): number {
    return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  }

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const localized = node.properties.filter((p) => {
        const name = propName(p);
        return (
          name !== undefined &&
          LOCALE_CODES.has(name) &&
          ts.isPropertyAssignment(p) &&
          isTextLiteral(p.initializer)
        );
      });
      if (localized.length >= 2) {
        found.push(
          `L${lineOf(node)}: inline text { ${localized.map(propName).join(", ")} }`
        );
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propName(node);
      if (
        name !== undefined &&
        LOCALE_CODES.has(name) &&
        isTextLiteral(node.initializer) &&
        isNaturalLanguage(literalText(node.initializer))
      ) {
        const text = literalText(node.initializer);
        found.push(`L${lineOf(node)}: ${name}: "${text.slice(0, 40)}…"`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("guard: no display text in shipped rules data (src/data/**) or name tables", () => {
  // Explicit timeout: whole src/data AST walk (TypeScript compiler API), at risk
  // of the 5 s default under V8 coverage + parallel load.
  it("every data file and name table stores ids, never inline text", () => {
    const violations: Record<string, string[]> = {};
    for (const file of [
      ...srcFiles({ under: DATA_DIR, exts: [".ts"] }),
      ...ALSO_COVERED,
    ]) {
      const base = relative(SRC_ROOT, file);
      if (BYPASS.has(relative(DATA_DIR, file))) continue;
      const found = offenders(file);
      if (found.length) violations[base] = found;
    }
    expect(violations).toEqual({});
  }, 30_000);
});
