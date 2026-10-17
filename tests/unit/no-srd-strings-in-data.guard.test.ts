/**
 * GUARD: no inline display text anywhere in `src/` outside the catalogues.
 *
 * Code stores ids and mechanics; its words live in the catalogues
 * (`src/i18n/<locale>/srd/<kind>.json` for rules text, `src/i18n/<locale>/ui/*.json`
 * for app chrome), keyed by those ids, so a new language is a new catalogue
 * folder and never a code edit. This guard fails if inline text reappears in any
 * source file:
 *   - a `LocaleText` leaf: an object literal with text under two or more
 *     registered locale codes (`{ en: "…", it: "…" }`, or per-locale template
 *     functions `{ en: (x) => "…", it: (x) => "…" }`), OR
 *   - a locale-code property (`en:`, `it:`, any registered code) whose value is
 *     a natural-language string (multi-word).
 * The locale codes come from the registry (`@/lib/locale`), so a third language
 * is caught without touching this file.
 *
 * Not scanned: `src/i18n/**`, the catalogues and their resolver, where the words
 * live. There is no allowlist: a file that needs words adds a catalogue key.
 *
 * AST-driven (TS compiler API), so it can't be spelled around by formatting.
 */
import { describe, it, expect } from "vitest";
import { resolve, relative } from "node:path";
import ts from "typescript";
import { LOCALES } from "@/lib/locale";
import { SRC_ROOT, srcFiles, readSrc } from "./__helpers__/src-files";

const I18N_DIR = resolve(SRC_ROOT, "i18n");

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

/** A per-locale template function, `(x) => "…"`, whose body is a text literal. */
function isTextFunction(e: ts.Expression): boolean {
  return (
    (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) &&
    ts.isExpression(e.body) &&
    isTextLiteral(e.body)
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
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
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
          (isTextLiteral(p.initializer) || isTextFunction(p.initializer))
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

describe("guard: no inline display text in src/ outside the catalogues", () => {
  // Explicit timeout: whole src AST walk (TypeScript compiler API), at risk
  // of the 5 s default under V8 coverage + parallel load.
  it("every source file stores ids, never inline text", () => {
    const violations: Record<string, string[]> = {};
    for (const file of srcFiles({ under: SRC_ROOT, exts: [".ts", ".tsx"] })) {
      const base = relative(SRC_ROOT, file);
      if (!relative(I18N_DIR, file).startsWith("..")) continue;
      const found = offenders(file);
      if (found.length) violations[base] = found;
    }
    expect(violations).toEqual({});
  }, 30_000);
});
