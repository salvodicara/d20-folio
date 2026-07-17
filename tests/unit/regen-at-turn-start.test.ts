/**
 * `regen-at-turn-start` engine primitive — start-of-turn HP regain with a
 * min-HP / bloodied guard.
 *
 * Two layers under test:
 *  1. The GRANT aggregates — `evaluateGrants` collects every
 *     `regen-at-turn-start` grant into `AggregatedGrants.startOfTurnRegen`,
 *     defaulting `requiresMinHp` to `true`.
 *  2. The CONSUMER applies it — `resolveStartOfTurnRegen` resolves the amount
 *     formula (`"5+CON"` → 5 + CON modifier, via the temp-HP grammar) and
 *     reports whether the guard is met against the CURRENT session HP. The
 *     `isBloodied` helper is pinned directly.
 *
 * Override-first: the engine NEVER mutates `session.hp` — it only computes the
 * number and reports the guard, surfacing an entry the player applies.
 *
 * Source of truth (dnd2024.wikidot.com/fighter:champion): Fighter Champion "Survivor" (L18) → Heroic Rally: "At the
 * start of each of your turns, you regain Hit Points equal to 5 plus your
 * Constitution modifier if you are Bloodied and have at least 1 Hit Point."
 */
import { describe, it, expect } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import {
  emptyAggregate,
  evaluateGrants,
  type Grant,
  type GrantSource,
} from "@/lib/grants";
import { isBloodied, resolveStartOfTurnRegen } from "@/lib/smart-tracker";
import { concentrationValue } from "@/lib/concentration";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

const src = (id: string, grants: Grant[]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

// ─── Layer 1: the grant aggregates ──────────────────────────────────────────

describe("evaluateGrants — regen-at-turn-start aggregation", () => {
  it("collects a regen grant into startOfTurnRegen with its formula + guard", () => {
    const agg = evaluateGrants([
      src("fighter-champion-survivor", [
        {
          type: "regen-at-turn-start",
          amount: "5+CON",
          condition: "bloodied",
          requiresMinHp: true,
        },
      ]),
    ]);
    expect(agg.startOfTurnRegen).toHaveLength(1);
    expect(agg.startOfTurnRegen[0]).toEqual({
      sourceId: "fighter-champion-survivor",
      amount: "5+CON",
      condition: "bloodied",
      requiresMinHp: true,
      asTempHp: false,
    });
  });

  it("defaults requiresMinHp to true when the grant omits it", () => {
    const agg = evaluateGrants([
      src("regen-src", [
        { type: "regen-at-turn-start", amount: "level", condition: "always" },
      ]),
    ]);
    expect(agg.startOfTurnRegen[0]?.requiresMinHp).toBe(true);
  });

  it("honors requiresMinHp: false when explicitly set", () => {
    const agg = evaluateGrants([
      src("regen-src", [
        {
          type: "regen-at-turn-start",
          amount: "3",
          condition: "always",
          requiresMinHp: false,
        },
      ]),
    ]);
    expect(agg.startOfTurnRegen[0]?.requiresMinHp).toBe(false);
  });

  it("collects EVERY regen grant (each source heals independently)", () => {
    const agg = evaluateGrants([
      src("a", [{ type: "regen-at-turn-start", amount: "5+CON", condition: "bloodied" }]),
      src("b", [{ type: "regen-at-turn-start", amount: "level", condition: "always" }]),
    ]);
    expect(agg.startOfTurnRegen).toHaveLength(2);
    expect(agg.startOfTurnRegen.map((r) => r.sourceId)).toEqual(["a", "b"]);
  });

  it("the empty aggregate has no regen entries", () => {
    expect(emptyAggregate().startOfTurnRegen).toEqual([]);
    expect(evaluateGrants([]).startOfTurnRegen).toEqual([]);
  });
});

// ─── isBloodied — pure HP-band helper ───────────────────────────────────────

describe("isBloodied — current HP ≤ half max (2024 RAW)", () => {
  it("is true at exactly half max HP", () => {
    expect(isBloodied(makeChar({ hp: { max: 40 } }, { current: 20 }))).toBe(true);
  });

  it("is true below half max HP", () => {
    expect(isBloodied(makeChar({ hp: { max: 40 } }, { current: 19 }))).toBe(true);
  });

  it("is false above half max HP", () => {
    expect(isBloodied(makeChar({ hp: { max: 40 } }, { current: 21 }))).toBe(false);
  });

  it("uses the floor of half max (odd max)", () => {
    // max 9 → ⌊9/2⌋ = 4; 4 is Bloodied, 5 is not.
    expect(isBloodied(makeChar({ hp: { max: 9 } }, { current: 4 }))).toBe(true);
    expect(isBloodied(makeChar({ hp: { max: 9 } }, { current: 5 }))).toBe(false);
  });

  it("is never Bloodied with a degenerate max of 0", () => {
    expect(isBloodied(makeChar({ hp: { max: 0 } }, { current: 0 }))).toBe(false);
  });

  it("S5 — is NOT Bloodied at 0 HP (dying/unconscious, not Bloodied) even with positive max", () => {
    // RAW: a downed creature is dying, not Bloodied — the `current > 0` guard. The
    // dying surface owns the ≤ 0 band, so the Bloodied mark never co-fires with it.
    expect(isBloodied(makeChar({ hp: { max: 40 } }, { current: 0 }))).toBe(false);
    // 1 HP is the LOWEST Bloodied value (just above the dying band).
    expect(isBloodied(makeChar({ hp: { max: 40 } }, { current: 1 }))).toBe(true);
  });

  it("ignores temporary HP (RAW looks at HP, not temp HP)", () => {
    // current 10 of max 40 (Bloodied) — a big temp pool does NOT lift the band.
    expect(isBloodied(makeChar({ hp: { max: 40 } }, { current: 10, temp: 50 }))).toBe(
      true
    );
  });
});

// ─── Layer 2: the consumer applies it (resolveStartOfTurnRegen) ─────────────

describe("resolveStartOfTurnRegen — Heroic Rally (real Champion SRD data)", () => {
  it("emits no entry for a character without the feature", () => {
    const char = makeChar({ class: "fighter", subclass: "champion", level: 18 });
    expect(resolveStartOfTurnRegen(char)).toEqual([]);
  });

  it("resolves Heroic Rally amount = 5 + CON modifier and fires while Bloodied", () => {
    // CON 16 → +3 ⇒ 5 + 3 = 8. Bloodied (current 20 ≤ ⌊40/2⌋ = 20), HP ≥ 1.
    const char = makeSurvivor({ con: 16, max: 40, current: 20 });
    const out = resolveStartOfTurnRegen(char);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sourceId: "fighter-champion-survivor",
      amount: 8,
      condition: "bloodied",
      active: true,
    });
  });

  it("is DORMANT (active: false) when above the Bloodied band", () => {
    // current 21 of max 40 → not Bloodied; the feature exists but doesn't fire.
    const char = makeSurvivor({ con: 16, max: 40, current: 21 });
    const out = resolveStartOfTurnRegen(char);
    expect(out).toHaveLength(1);
    expect(out[0]?.active).toBe(false);
    // The amount still resolves (so the UI can preview it) — only the guard is off.
    expect(out[0]?.amount).toBe(8);
  });

  it("is DORMANT at 0 HP (requiresMinHp — never heals from unconscious)", () => {
    // current 0: Bloodied band is satisfied, but the ≥ 1 HP guard blocks it.
    const char = makeSurvivor({ con: 16, max: 40, current: 0 });
    expect(resolveStartOfTurnRegen(char)[0]?.active).toBe(false);
  });

  it("applies the min-1 floor to a negative amount (low CON)", () => {
    // CON 6 → −2 ⇒ 5 + (−2) = 3 (positive, no floor needed) — sanity that the
    // signed CON term is summed, not floored per-term.
    const char = makeSurvivor({ con: 6, max: 40, current: 10 });
    expect(resolveStartOfTurnRegen(char)[0]?.amount).toBe(3);
  });

  it("OVERRIDE-FIRST: never mutates session HP", () => {
    const char = makeSurvivor({ con: 16, max: 40, current: 20 });
    const before = char.session.hp.current;
    resolveStartOfTurnRegen(char);
    expect(char.session.hp.current).toBe(before);
    expect(char.session.hp.current).toBe(20);
  });

  it("is deterministic — no RNG", () => {
    const char = makeSurvivor({ con: 14, max: 30, current: 10 });
    const a = resolveStartOfTurnRegen(char)[0]?.amount;
    const b = resolveStartOfTurnRegen(char)[0]?.amount;
    expect(a).toBe(b);
    expect(a).toBe(7); // 5 + CON 14 (+2)
  });
});

// ─── Heroism — recurring per-turn TEMPORARY HP (asTempHp) ───────────────────

describe("resolveStartOfTurnRegen — Heroism per-turn temp HP (real spell data)", () => {
  // A CHA-20 (+5) Bard (MOCK) with Heroism prepared. `active` lights the
  // `spell-heroism` while-active toggle (as the cast auto-lights it via S1).
  function heroismCaster(activeKeys: string[], current = 40): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        spells: [{ srdId: "heroism", prepared: true }],
      },
      session: {
        ...MOCK_CHARACTER.session,
        hp: { ...MOCK_CHARACTER.session.hp, current },
        concentration: concentrationValue("heroism"),
        activeFeatures: activeKeys,
      },
    };
  }

  it("LIT: emits a temp-HP entry = CHA modifier, active regardless of HP band", () => {
    const out = resolveStartOfTurnRegen(heroismCaster(["spell-heroism"]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sourceId: "heroism",
      amount: 5, // CHA 20 → +5
      condition: "always",
      active: true,
      asTempHp: true,
    });
  });

  it("fires even at 0 HP (temp HP is unguarded — no requiresMinHp gate)", () => {
    // A heal never fires at 0 HP; Heroism's temp HP does (it doesn't revive you).
    const out = resolveStartOfTurnRegen(heroismCaster(["spell-heroism"], 0));
    expect(out[0]?.active).toBe(true);
    expect(out[0]?.asTempHp).toBe(true);
  });

  it("FAIL-BEFORE: with the toggle OFF, Heroism contributes no entry", () => {
    expect(resolveStartOfTurnRegen(heroismCaster([]))).toEqual([]);
  });
});

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * A Champion fighter at L18 carrying the real Survivor feature, with a chosen
 * CON, HP max, and current HP. Exercises the live SRD data → grant → consumer
 * path (no synthetic grant injection).
 */
function makeSurvivor(args: { con: number; max: number; current: number }): CharacterDoc {
  return makeChar(
    {
      classes: [{ classId: "fighter", subclassId: "champion", level: 18 }],
      hp: { max: args.max },
      abilityScores: { STR: 16, DEX: 12, CON: args.con, INT: 10, WIS: 12, CHA: 10 },
      features: [{ srdId: "fighter-champion-survivor" }],
    },
    { current: args.current }
  );
}

function makeChar(
  overrides: Partial<CharacterDoc["character"]> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  } = {},
  sessionHp: Partial<CharacterDoc["session"]["hp"]> = {}
): CharacterDoc {
  const max = overrides.hp?.max ?? 40;
  return {
    id: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("Tester"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "fighter", subclassId: "champion", level: 18 }],
      background: "soldier",
      alignment: asAlignmentId("neutral"),
      playerName: "P",
      speed: "30 ft",
      ac: 16,
      armorNote: "",
      hp: { max },
      hitDieType: 10,
      languageIds: ["common"],
      customLanguages: [],
      toolProficiencyIds: [],
      customToolProficiencies: [],
      abilityBudget: 27,
      proficiencyBonusOverride: null,
      levelUpChecklist: null,
      backgroundAsi: {},
      humanOriginFeat: "",
      bgFeat: "",
      lore: {
        traits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        backstory: "",
        age: "",
        height: "",
        weight: "",
        eyes: "",
        hair: "",
        skin: "",
      },
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 10 },
      savingThrows: ["STR", "CON"],
      skills: {},
      spellcasting: null,
      spellSlots: [],
      spells: [],
      weapons: [],
      equipment: [],
      features: [],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
      ...foldLegacyClass(overrides, "fighter", "champion"),
    },
    session: {
      hp: { current: max, temp: 0, ...sessionHp },
      hitDice: { used: 0 },
      trackers: {},
      spellSlots: {},
      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      concentration: "",
      initiative: "",
      conditions: [],
      deathSucc: 0,
      deathFail: 0,
      inspiration: false,
      exhaustion: 0,
      pinnedActions: [],
      unpinnedActions: [],
      notes: "",
      logEntries: [],
    },
  };
}
