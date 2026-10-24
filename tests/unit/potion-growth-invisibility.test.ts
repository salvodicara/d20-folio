/**
 * Potion of Growth and Potion of Invisibility as drunk potion states. The cases come
 * from the catalogue text (SRD 5.2.1, `src/i18n/en/srd/magic-items.json`):
 *  - Growth: "you gain the 'enlarge' effect of the Enlarge/Reduce spell for 1d4 hours
 *    (no Concentration required)".
 *  - Invisibility: "you have the Invisible condition for 1 hour. The effect ends early
 *    if you make an attack roll, deal damage, or cast a spell."
 */
import { describe, expect, it } from "vitest";

import { getMagicItem } from "@/data/magic-items";
import magicItemsEn from "@/i18n/en/srd/magic-items.json";
import magicItemsIt from "@/i18n/it/srd/magic-items.json";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { removeCondition } from "@/lib/play/conditions";
import { drinkPotion, endStatesOnAct, setActiveState } from "@/lib/play/states";
import { potionTimerKey } from "@/lib/potion-states";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

type Catalogue = Record<string, { description?: string; label?: string }>;
const EN = magicItemsEn as Catalogue;
const IT = magicItemsIt as Catalogue;
const text = (id: string): string => EN[id]?.description ?? "";

const GROWTH = "potion-of-growth";
const INVISIBILITY = "potion-of-invisibility";

function drinker(): CharacterDoc {
  return makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [
      { srdId: GROWTH, quantity: 1 },
      { srdId: INVISIBILITY, quantity: 1 },
    ],
  });
}

function drink(doc: CharacterDoc, itemId: string): CharacterDoc {
  const session = drinkPotion(doc, itemId, 0);
  if (!session) throw new Error(`${itemId} armed nothing`);
  return { ...doc, session };
}

const aggregate = (doc: CharacterDoc) =>
  aggregateCharacterGrants(doc.character, doc.session);

describe("Potion of Growth: the Enlarge effect for 1d4 hours, no Concentration", () => {
  it("the catalogue text says so", () => {
    expect(text(GROWTH)).toMatch(/'enlarge' effect of the Enlarge\/Reduce spell/);
    expect(text(GROWTH)).toMatch(/1d4 hours \(no Concentration required\)/);
  });

  it("drinking lights Advantage on Strength checks and saves and the +1d4 weapon rider", () => {
    expect(aggregate(drinker()).advantages).toEqual([]);
    const lit = drink(drinker(), GROWTH);
    expect(lit.session.activeFeatures).toContain(potionTimerKey(GROWTH));
    const on = aggregate(lit);
    expect(on.advantages.map((a) => [a.rollType, a.vs]).sort()).toEqual([
      ["check", "str"],
      ["save", "str"],
    ]);
    expect(on.damageRiders).toEqual([
      expect.objectContaining({
        dice: "1d4",
        damageType: "same-as-weapon",
        appliesTo: "weapon-or-unarmed",
      }),
    ]);
    expect(on.defenseNotes).toHaveLength(1);
    // No Concentration required.
    expect(lit.session.concentration).toBe("");
  });

  it("the countdown runs at most the 1d4's 4 hours; the state toggle ends it sooner", () => {
    const lit = drink(drinker(), GROWTH);
    expect(lit.session.effectTimers?.[potionTimerKey(GROWTH)]).toMatchObject({
      roundsLeft: 2400,
    });
    const ended = setActiveState(lit, potionTimerKey(GROWTH), false, 0);
    expect(ended?.activeFeatures ?? []).not.toContain(potionTimerKey(GROWTH));
  });

  it("the note and labels read in English and Italian", () => {
    for (const catalogue of [EN, IT]) {
      expect(catalogue[`${GROWTH}.grants.0`]?.label).toBeTruthy();
      expect(catalogue[`${GROWTH}.grants.0.grants.3`]?.description).toBeTruthy();
    }
  });
});

describe("Potion of Invisibility: Invisible for 1 hour, ending on an attack, damage or a spell", () => {
  it("the catalogue text says so", () => {
    expect(text(INVISIBILITY)).toMatch(/you have the Invisible condition for 1 hour/);
    expect(text(INVISIBILITY)).toMatch(
      /ends early if you make an attack roll, deal damage, or cast a spell/
    );
  });

  it("drinking gives the Invisible condition for the 1-hour countdown", () => {
    expect(effectiveSessionConditions(drinker().session)).not.toContain("invisible");
    const lit = drink(drinker(), INVISIBILITY);
    expect(effectiveSessionConditions(lit.session)).toContain("invisible");
    expect(lit.session.effectTimers?.[potionTimerKey(INVISIBILITY)]).toMatchObject({
      roundsLeft: 600,
    });
    // The potion owns the condition: the manual chip ledger is untouched.
    expect(lit.session.conditions).toEqual([]);
  });

  it("the condition goes when the potion state ends", () => {
    const lit = drink(drinker(), INVISIBILITY);
    const ended = setActiveState(lit, potionTimerKey(INVISIBILITY), false, 0);
    expect(ended && effectiveSessionConditions(ended)).not.toContain("invisible");
  });

  it.each(["attack-roll", "deal-damage", "cast-spell"] as const)("%s ends it", (act) => {
    const lit = drink(drinker(), INVISIBILITY);
    const after = endStatesOnAct(lit, act);
    expect(after).not.toBeNull();
    expect(after?.session.activeFeatures ?? []).not.toContain(
      potionTimerKey(INVISIBILITY)
    );
    expect(after?.ended).toEqual([potionTimerKey(INVISIBILITY)]);
    expect(after && effectiveSessionConditions(after.session)).not.toContain("invisible");
  });

  it("an act ends nothing when no lit state ends on it", () => {
    expect(endStatesOnAct(drinker(), "attack-roll")).toBeNull();
    // Growth does not end on an attack.
    expect(endStatesOnAct(drink(drinker(), GROWTH), "attack-roll")).toBeNull();
  });

  it("removing the Invisible chip ends the potion that gives it", () => {
    const lit = drink(drinker(), INVISIBILITY);
    const removed = removeCondition(lit, "invisible");
    expect(removed).not.toBeNull();
    expect(removed?.session.activeFeatures ?? []).not.toContain(
      potionTimerKey(INVISIBILITY)
    );
    expect(removed && effectiveSessionConditions(removed.session)).not.toContain(
      "invisible"
    );
  });

  it("declares its condition and end triggers as data", () => {
    const grant = getMagicItem(INVISIBILITY)?.grants?.[0];
    expect(grant).toMatchObject({
      type: "while-active",
      activeKey: potionTimerKey(INVISIBILITY),
      duration: {
        kind: "timed",
        minutes: 60,
        endsEarlyOn: ["attack-roll", "deal-damage", "cast-spell"],
      },
      grants: [{ type: "state-condition", condition: "invisible" }],
    });
  });
});
