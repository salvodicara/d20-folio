/**
 * Under the "Active" heading a toggle names the state, never claims it: a label like
 * "Bless active" read as ON even while the toggle was off (owner sweep 2026-10-09).
 * Cases: every while-active grant label in the catalogue, both languages.
 */
import { describe, expect, it } from "vitest";
import en from "@/i18n/en/srd/spells.json";
import it_ from "@/i18n/it/srd/spells.json";
import enRaces from "@/i18n/en/srd/races.json";
import itRaces from "@/i18n/it/srd/races.json";

const labels = (json: Record<string, unknown>): Array<[string, string]> =>
  Object.entries(json).flatMap(([key, value]) =>
    /\.grants\.\d+$/.test(key) && value && typeof value === "object" && "label" in value
      ? [[key, String(value.label)] as [string, string]]
      : []
  );

describe("while-active labels", () => {
  it.each([
    ["en", [...labels(en), ...labels(enRaces)], /\bactive$/i],
    ["it", [...labels(it_), ...labels(itRaces)], /\battiv[oa]$/i],
  ] as const)("no %s label ends by claiming the state is on", (_locale, rows, claim) => {
    expect(rows.length).toBeGreaterThan(20);
    for (const [key, label] of rows) expect(label, key).not.toMatch(claim);
  });
});
