/**
 * `spell-damage-type-override` grant primitive — an ALTERNATE damage type a
 * damaging spell may deal at the player's choice (the type-SWAP counterpart of
 * `spell-damage-bonus`, which adds a number).
 *
 * Wired to Great Old One Warlock Psychic Spells (L3): "When you cast a Warlock
 * spell that deals damage, you can change its damage type to Psychic." Verified
 * against http://dnd2024.wikidot.com/warlock:great-old-one and the in-repo
 * feature `warlock-goo-psychic-spells`. The smart-tracker folds the in-scope
 * alternate types into the spell's damage-type CHOICE chip (reusing the existing
 * multi/choice rendering) so the player picks the original type or the override
 * per cast — the engine never auto-swaps and rolls no dice.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { resolveSpellDamageTypeOverrides } from "@/lib/compute";
import { resolveActions } from "@/lib/smart-tracker";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

const psychicWarlock: GrantSource = {
  id: "x-goo",
  name: { en: "Psychic Spells", it: "Incantesimi Psichici" },
  grants: [{ type: "spell-damage-type-override", toType: "psychic", scope: "warlock" }],
};

const radiantAll: GrantSource = {
  id: "x-all",
  name: { en: "All", it: "All" },
  grants: [{ type: "spell-damage-type-override", toType: "radiant" }],
};

// ── 1. Aggregation through the evaluator ─────────────────────────────────────

describe("evaluateGrants — spell-damage-type-override aggregation", () => {
  it("records the scoped Psychic Spells entry", () => {
    expect(evaluateGrants([psychicWarlock]).spellDamageTypeOverrides).toEqual([
      { toType: "psychic", scope: "warlock" },
    ]);
  });

  it("defaults scope to 'all' when omitted", () => {
    expect(evaluateGrants([radiantAll]).spellDamageTypeOverrides).toEqual([
      { toType: "radiant", scope: "all" },
    ]);
  });

  it("is empty by default", () => {
    expect(evaluateGrants([]).spellDamageTypeOverrides).toEqual([]);
  });

  it("collects multiple entries", () => {
    expect(
      evaluateGrants([psychicWarlock, radiantAll]).spellDamageTypeOverrides
    ).toHaveLength(2);
  });

  it("merges through a while-active wrapper only when toggled on", () => {
    const toggled: GrantSource = {
      id: "z",
      name: { en: "Z", it: "Z" },
      grants: [
        {
          type: "while-active",
          activeKey: "z",
          label: { en: "Z", it: "Z" },
          grants: psychicWarlock.grants ?? [],
        },
      ],
    };
    expect(evaluateGrants([toggled]).spellDamageTypeOverrides).toEqual([]);
    expect(
      evaluateGrants([toggled], new Set(["z"])).spellDamageTypeOverrides
    ).toHaveLength(1);
  });
});

// ── 2. resolveSpellDamageTypeOverrides — scope + dedup ───────────────────────

describe("resolveSpellDamageTypeOverrides — scope matching + dedup", () => {
  const entries = evaluateGrants([psychicWarlock]).spellDamageTypeOverrides;

  it("returns the alternate type for an in-scope (warlock) spell", () => {
    expect(resolveSpellDamageTypeOverrides(entries, "warlock")).toEqual(["psychic"]);
  });

  it("returns nothing for an out-of-scope (wizard) spell", () => {
    expect(resolveSpellDamageTypeOverrides(entries, "wizard")).toEqual([]);
  });

  it("ignores the scope check when the cast class is unknown (null/omitted)", () => {
    expect(resolveSpellDamageTypeOverrides(entries, null)).toEqual(["psychic"]);
    expect(resolveSpellDamageTypeOverrides(entries, undefined)).toEqual(["psychic"]);
  });

  it("an 'all'-scope override applies to any class", () => {
    const all = evaluateGrants([radiantAll]).spellDamageTypeOverrides;
    expect(resolveSpellDamageTypeOverrides(all, "druid")).toEqual(["radiant"]);
  });

  it("dedupes repeated alternate types, preserving order", () => {
    const dup = evaluateGrants([psychicWarlock, psychicWarlock]).spellDamageTypeOverrides;
    expect(resolveSpellDamageTypeOverrides(dup, "warlock")).toEqual(["psychic"]);
  });

  it("returns nothing with no entries", () => {
    expect(resolveSpellDamageTypeOverrides([], "warlock")).toEqual([]);
  });
});

// ── 3. Data wiring — the two wired features (GoO Psychic Spells, Undead Grave
//    Touched) are PACK subclass content; their data pins + the positive
//    end-to-end choice-chip fold live in
//    content-pack/tests/unit/spell-damage-type-override.pack.test.ts.

// ── 4. End-to-end consumer — resolveActions folds Psychic into the choice chip ─

describe("resolveActions — spell damage-type chip gains the Psychic option", () => {
  /** Warlock 6 with the GoO Psychic Spells feature, carrying Eldritch Blast. */
  function gooWarlock(features: { srdId: string }[]): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        classes: [{ classId: "warlock", level: 6 }],
        features,
        spells: [{ srdId: "eldritch-blast" }],
        spellcasting: { ...MOCK_CHARACTER.character.spellcasting, ability: "CHA" },
      } as CharacterDoc["character"],
      session: { ...MOCK_CHARACTER.session },
    };
  }

  // (The positive fold — the feature turning Force into a Force/Psychic choice —
  //  requires the PACK feature data; see the pack companion file.)

  it("without the feature, Eldritch Blast stays a single Force chip (no Psychic option)", () => {
    const eb = resolveActions(gooWarlock([])).find((a) => a.spellId === "eldritch-blast");
    expect(eb?.summary.damageType).toBe("force");
    expect(eb?.summary.damageTypes).toBeUndefined();
    expect(eb?.summary.multiDamageTypeFlavor).toBeUndefined();
  });
});
