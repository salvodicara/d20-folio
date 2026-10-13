/**
 * Enlarge/Reduce (SRD 5.2.1, level 2 Transmutation, Concentration up to 1 minute)
 * as a standing state on the caster or a picked target, with the Enlarge/Reduce
 * choice:
 *  - Enlarge: size +1 category, Advantage on Strength checks and Strength saving
 *    throws, attacks with enlarged weapons or Unarmed Strikes deal an extra 1d4.
 *  - Reduce: size -1 category, Disadvantage on Strength checks and Strength
 *    saving throws, those attacks deal 1d4 less damage (never below 1).
 * The app never rolls, so Reduce's -1d4 rides as a note.
 */
import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import { evaluateGrants, type Grant } from "@/lib/grants";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";
import type { LocText } from "@/lib/loc-text";
import EN_SPELLS from "@/i18n/en/srd/spells.json";
import IT_SPELLS from "@/i18n/it/srd/spells.json";

const EN = EN_SPELLS as Record<string, Record<string, string>>;
const IT = IT_SPELLS as Record<string, Record<string, string>>;

const KEY = "spell-enlarge-reduce";
const sources = resolveGrantSourcesForSpells([
  { srdId: "enlarge-reduce", prepared: true },
]);
const lit = (choice?: "enlarge" | "reduce") =>
  evaluateGrants(sources, new Set([KEY]), choice ? new Map([[KEY, choice]]) : new Map());

describe("Enlarge/Reduce standing state", () => {
  it("is a concentration while-active state on a picked target (self included)", () => {
    const spell = getSpellById("enlarge-reduce");
    expect(spell?.concentration).toBe(true);
    const wa = spell?.grants?.find(
      (g): g is Extract<Grant, { type: "while-active" }> => g.type === "while-active"
    );
    expect(wa?.activeKey).toBe(KEY);
    expect(wa?.recipient).toBe("selected");
    expect(wa?.duration).toMatchObject({ kind: "timed", minutes: 1 });
    expect(spell?.targeting).toEqual({ affinity: "ally", maxTargets: 1 });
  });

  it("offers the Enlarge/Reduce choice only while the spell is lit", () => {
    expect(evaluateGrants(sources).grantBundles).toEqual([]);
    const bundle = lit().grantBundles.find((b) => b.bundleKey === KEY);
    expect(bundle?.options.map((o) => o.id)).toEqual(["enlarge", "reduce"]);
    expect(bundle?.selected).toBeNull();
    expect(lit().advantages).toEqual([]);
  });

  it("Enlarge: Advantage on Strength checks and saves, +1d4 weapon damage, size note", () => {
    const on = lit("enlarge");
    expect(on.advantages.map((a) => [a.rollType, a.vs]).sort()).toEqual([
      ["check", "str"],
      ["save", "str"],
    ]);
    expect(on.disadvantages).toEqual([]);
    expect(on.damageRiders).toEqual([
      expect.objectContaining({
        dice: "1d4",
        damageType: "same-as-weapon",
        appliesTo: "weapon-or-unarmed",
        whileActiveKey: KEY,
      }),
    ]);
    expect(on.defenseNotes).toHaveLength(1);
  });

  it("Reduce: Disadvantage on Strength checks and saves, -1d4 as a note, no rider", () => {
    const on = lit("reduce");
    expect(on.disadvantages.map((a) => [a.rollType, a.vs]).sort()).toEqual([
      ["check", "str"],
      ["save", "str"],
    ]);
    expect(on.advantages).toEqual([]);
    expect(on.damageRiders).toEqual([]);
    expect(on.defenseNotes).toHaveLength(1);
  });

  it("labels and notes resolve in English and Italian, without em dashes", () => {
    const texts: LocText[] = [];
    const bundle = lit().grantBundles.find((b) => b.bundleKey === KEY);
    if (bundle) texts.push(bundle.label, ...bundle.options.map((o) => o.label));
    for (const choice of ["enlarge", "reduce"] as const) {
      const on = lit(choice);
      texts.push(
        ...on.defenseNotes.map((n) => n.description),
        ...on.advantages.map((a) => a.description),
        ...on.disadvantages.map((a) => a.description)
      );
    }
    expect(texts).toHaveLength(3 + 3 + 3);
    for (const text of texts) {
      expect("srd" in text).toBe(true);
      if (!("srd" in text)) continue;
      for (const catalogue of [EN, IT]) {
        const value = catalogue[text.srd.key]?.[text.srd.field];
        expect(value, `${text.srd.key}.${text.srd.field}`).toBeTruthy();
        expect(value).not.toContain("\u2014");
      }
    }
  });
});
