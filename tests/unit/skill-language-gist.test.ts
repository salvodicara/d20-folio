/**
 * Every skill and every language carries a one-line `gist` in English and Italian,
 * for the pick cards: what the skill covers (SRD 5.2.1 Skills table) and who
 * speaks the language. Skills live under the `rule` kind as `skill.<id>`. The
 * English ones are lazy prose (`en/srd-prose`), never in the bundled `en/srd/`.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureEnProse } from "@/i18n";
import { srd } from "../_harness/loc";
import enSkills from "@/i18n/en/ui/skills.json";
import enLanguages from "@/i18n/en/srd/languages.json";

const GIST_MAX = 90;
// Thieves' Tools sits in the skill list but is a tool: its gist is the equipment's.
const SKILLS = Object.keys(enSkills.skills).filter((id) => id !== "thieves-tools");
const LANGUAGES = Object.keys(enLanguages);

function bundled(file: string): string[] {
  const path = new URL(`../../src/i18n/en/srd/${file}.json`, import.meta.url);
  const entries = JSON.parse(readFileSync(path, "utf-8")) as Record<string, object>;
  return Object.keys(entries).filter((id) => "gist" in (entries[id] ?? {}));
}

describe("skill and language gists", () => {
  beforeAll(() => ensureEnProse());

  it("covers the 18 skills and every language", () => {
    expect(SKILLS).toHaveLength(18);
    expect(LANGUAGES.length).toBeGreaterThan(20);
  });

  for (const locale of ["en", "it"] as const) {
    it(`every skill and language has a ${locale} gist of one short line`, () => {
      const rows = [
        ...SKILLS.map((id) => ["rule", `skill.${id}`] as const),
        ...LANGUAGES.map((id) => ["language", id] as const),
      ];
      const bad = rows.flatMap(([kind, key]) => {
        const gist = srd(kind, key, "gist", locale);
        if (gist === "") return [`${key}: missing`];
        if (gist.length > GIST_MAX) return [`${key}: ${gist.length} chars`];
        if (gist.endsWith(".") || gist.includes("\n")) return [`${key}: not one line`];
        return [];
      });
      expect(bad).toEqual([]);
    });
  }

  it("keeps the English gists out of the bundled catalogues", () => {
    expect(bundled("rules")).toEqual([]);
    expect(bundled("languages")).toEqual([]);
  });
});
