/// <reference types="node" />
/**
 * Guard: a reveal box (a grid item that opens 0fr → 1fr with `overflow: clip` and
 * `display: flow-root`) must also declare `min-width: 0`.
 *
 * Unlike `overflow: hidden`, a clip box keeps a grid item's min-content width. On
 * 2026-11-11 a session's one-line preview (nowrap) widened the whole Journal card to
 * the length of its text, so the session notes ran out of the card and over the next
 * column.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ");

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
  ([, selector = "", body = ""]) => ({
    selector: selector.trim(),
    body,
  })
);

describe("reveal boxes keep to their column", () => {
  const reveals = rules.filter(
    ({ body }) => /overflow: clip;/.test(body) && /display: flow-root;/.test(body)
  );

  it("finds the reveal boxes", () => {
    expect(reveals.map(({ selector }) => selector)).toEqual(
      expect.arrayContaining([".section-detail", ".sess-body", ".uc-detail"])
    );
  });

  it.each(reveals.map(({ selector, body }) => [selector, body]))(
    "%s declares min-width: 0",
    (_selector, body) => {
      expect(body).toMatch(/min-width: 0;/);
    }
  );
});
