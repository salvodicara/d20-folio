/**
 * Every SRD class and subclass feature with rules text carries a one-line `gist`
 * in English and Italian: the «In breve» line of the pick cards, the level-up
 * gains and the compendium detail. The entries come from the public English
 * catalogue: a top-level, named feature with a description.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ensureEnProse } from "@/i18n";
import { srd } from "../_harness/loc";
import enClassFeatures from "@/i18n/en/srd/class-features.json";

const GIST_MAX = 90;

const catalogue = enClassFeatures as Record<string, Record<string, unknown>>;
const ids = Object.entries(catalogue)
  .filter(([id, entry]) => !id.includes(".") && "name" in entry && entry.description)
  .map(([id]) => id);

describe("SRD class feature gists", () => {
  // English gists are lazy prose (`en/srd-prose`), loaded after first paint.
  beforeAll(() => ensureEnProse());

  it("finds the features", () => {
    expect(ids.length).toBeGreaterThan(200);
  });

  it("keeps the English gists out of the eager catalogue", () => {
    const file = new URL("../../src/i18n/en/srd/class-features.json", import.meta.url);
    const entries = JSON.parse(readFileSync(file, "utf-8")) as Record<string, object>;
    expect(Object.keys(entries).filter((id) => "gist" in (entries[id] ?? {}))).toEqual(
      []
    );
  });

  for (const locale of ["en", "it"] as const) {
    it(`every feature has a ${locale} gist of one short line`, () => {
      const bad = ids.flatMap((id) => {
        const gist = srd("class-feature", id, "gist", locale);
        if (gist === "") return [`${id}: missing`];
        if (gist.length > GIST_MAX) return [`${id}: ${gist.length} chars`];
        if (gist.endsWith(".") || gist.includes("\n")) return [`${id}: not one line`];
        return [];
      });
      expect(bad).toEqual([]);
    });
  }
});
