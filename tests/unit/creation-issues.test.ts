/// <reference types="node" />
/**
 * Creation issue catalogue guard (research 2026-09-09 §8.5).
 *
 * Every diagnostic code the guided flow can raise resolves to a player-facing
 * message under `creationV2.fix.<code>` in EN and IT that names the FIELD and the
 * FIX, second person, present tense, verb first, with no path or code leak. The
 * codes are read from the engine sources at test time, so a new emission site
 * demands its message in both locales before it can ship.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { creationIssueKey, creationIssueMessage } from "@/lib/views/creation-issues";
import { mergedUi, type Json } from "./__helpers__/ui-merged";

const ROOT = resolve(__dirname, "../..");
const ENGINE_FILES = [
  "src/lib/character-creation/compose.ts",
  "src/lib/character-creation/abilities.ts",
  "src/lib/homebrew/origin-build.ts",
  "src/lib/homebrew/origins.ts",
];
const SEVERITIES = new Set(["invalid", "unsupported", "unresolved"]);

/**
 * Codes literally emitted by one source: `code: "x"`, a `code = "x"` default and
 * the last plain literal handed to an `add(...)`, `rule(...)`, `check(...)` or
 * `missing(...)` call (paths carry `/`, `.` or `:` and severities are skipped).
 */
function emittedCodes(source: string): string[] {
  const codes = new Set<string>();
  for (const m of source.matchAll(/\bcode(?::|\s*=)\s*"([a-z][a-z-]*)"/g))
    if (m[1]) codes.add(m[1]);
  for (const m of source.matchAll(/(?<![.\w])(?:add|rule|check|missing)\(/g)) {
    let depth = 1,
      i = m.index + m[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    const literals = [...source.slice(start, i - 1).matchAll(/"([^"\n]*)"/g)]
      .map((l) => l[1] ?? "")
      .filter((l) => /^[a-z][a-z-]*$/.test(l) && !SEVERITIES.has(l));
    const last = literals.at(-1);
    if (last) codes.add(last);
  }
  return [...codes].sort();
}
const fixes = (locale: "en" | "it") => {
  const shard = mergedUi(locale).creationV2 as Json;
  return shard.fix as Record<string, string>;
};
const en = fixes("en");
const it_ = fixes("it");
const codes = [
  ...new Set(
    ENGINE_FILES.flatMap((file) =>
      emittedCodes(readFileSync(resolve(ROOT, file), "utf8"))
    )
  ),
].sort();

describe("creation issue catalogue", () => {
  it("reads the emitted codes from the engine sources", () => {
    expect(codes).toContain("choice-answer");
    expect(codes).toContain("prerequisite-level");
    expect(codes).toContain("creation-name-required");
    expect(codes).toContain("standard-array");
    expect(codes).toContain("missing-initial-item");
    expect(codes).not.toContain("hp-per-level");
    expect(codes).not.toContain("abilities");
  });
  it.each(codes)("names the field and the fix for %s in EN and IT", (code) => {
    expect(typeof en[code], "en").toBe("string");
    expect(typeof it_[code], "it").toBe("string");
  });
  it("carries a default fix in both locales", () => {
    expect(typeof en.default).toBe("string");
    expect(typeof it_.default).toBe("string");
  });
  for (const [locale, catalogue] of [
    ["en", en],
    ["it", it_],
  ] as const) {
    describe(locale + " messages", () => {
      const entries = Object.entries(catalogue);
      it.each(entries)("%s leaks no path, code or declaration jargon", (_code, text) => {
        expect(text).not.toMatch(/\//);
        expect(text).not.toContain("·");
        expect(text).not.toMatch(/declaration|dichiarazion/i);
        expect(text).not.toMatch(/\{\{(?!field\}\}|count\}\})/);
      });
      it.each(entries)(
        "%s speaks to the player and starts with a capital",
        (_code, text) => {
          expect(text).not.toMatch(/must be|deve essere|devono essere/i);
          // A leading field label is capitalized by the caller (a control name).
          expect(text).toMatch(/^(\{\{field\}\}|\p{Lu})/u);
          expect(text).not.toContain("—");
        }
      );
    });
  }
});

describe("creation issue presenter", () => {
  const exists = (key: string) => key === "creationV2.fix.choice-answer";
  it("resolves a known code and falls back to the default key", () => {
    expect(creationIssueKey("choice-answer", exists)).toBe(
      "creationV2.fix.choice-answer"
    );
    expect(creationIssueKey("no-such-code", exists)).toBe("creationV2.fix.default");
  });
  it("carries the field and count for interpolation", () => {
    const message = creationIssueMessage(
      { path: "root/starting/skills", code: "choice-answer", severity: "unresolved" },
      "Class skills",
      2,
      exists
    );
    expect(message).toEqual({
      path: "root/starting/skills",
      code: "choice-answer",
      severity: "unresolved",
      key: "creationV2.fix.choice-answer",
      params: { field: "Class skills", count: 2 },
    });
    const unknown = creationIssueMessage(
      { path: "root", code: "no-such-code", severity: "invalid", selectionId: "class" },
      "Subclass",
      undefined,
      exists
    );
    expect(unknown.key).toBe("creationV2.fix.default");
    expect(unknown.params).toEqual({ field: "Subclass" });
  });
  it("interpolates every message with only field and count", () => {
    const params = { field: "Subclass", count: 2 };
    const render = (text: string) =>
      text.replace(/\{\{(field|count)\}\}/g, (_m, name: keyof typeof params) =>
        String(params[name])
      );
    for (const catalogue of [en, it_])
      for (const text of Object.values(catalogue))
        expect(render(text)).not.toMatch(/[{}]/);
  });
});
