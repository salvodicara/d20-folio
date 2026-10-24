/**
 * Ten SRD class features that were reference text gain their mechanics. Every
 * case comes from the feature's catalogue text (src/i18n/en/srd/class-features.json):
 *
 *  - Brutal Strike: "the target takes an extra 1d10 damage" (once on your turn,
 *    a Strength-based attack), and Greater Brutal Strike "increases to 2d10";
 *  - Relentless Hunter: "Taking damage can't break your Concentration on
 *    Hunter's Mark";
 *  - Smite of Protection: "Whenever you cast Divine Smite, you and your allies
 *    have Half Cover while in your Aura of Protection … until the start of your
 *    next turn" (the aura reaches 30 feet with Aura Expansion);
 *  - Elusive: "No attack roll has Advantage against you while you aren't
 *    Incapacitated";
 *  - free rows: Self-Restoration ("At the end of each of your turns"), Open Hand
 *    Technique (Addle; Push, a Strength save; Topple, a Dexterity save),
 *    Superior Hunter's Prey and Arcane Apotheosis (once per turn), Sculpt Spells,
 *    Tactical Shift.
 */
import { describe, expect, it } from "vitest";
import enFeatures from "@/i18n/en/srd/class-features.json";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { damageQueuesConcentrationSave } from "@/lib/character-d20-tests";
import { evaluateGrants } from "@/lib/grants";
import {
  resolveActions,
  resolveActiveBoundaryEffects,
  resolveAttackDamageRiders,
} from "@/lib/smart-tracker";
import { auraVMs, incomingAttackAdvantageVMs } from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";
import { loc } from "../_harness/loc";
import { makeCharacterDoc } from "./_helpers";

const text = (key: string) =>
  (enFeatures as Record<string, { description?: string }>)[key]?.description ?? "";

function withFeatures(
  classId: string,
  level: number,
  srdIds: string[],
  extra: Parameters<typeof makeCharacterDoc>[0] = {},
  session: Parameters<typeof makeCharacterDoc>[1] = {}
): CharacterDoc {
  return makeCharacterDoc(
    { classId, level, features: srdIds.map((srdId) => ({ srdId })), ...extra },
    session
  );
}

describe("the catalogue text each case encodes", () => {
  it.each([
    ["barbarian-brutal-strike", "the target takes an extra 1d10 damage"],
    ["barbarian-greater-brutal-strike", "Your Brutal Strike damage increases to 2d10"],
    [
      "ranger-relentless-hunter",
      "Taking damage can't break your Concentration on Hunter's Mark",
    ],
    [
      "paladin-devotion-smite-of-protection",
      "you and your allies have Half Cover while in your Aura of Protection",
    ],
    ["paladin-aura-expansion", "now extend to 30 feet"],
    ["rogue-elusive", "No attack roll has Advantage against you"],
    ["monk-self-restoration", "At the end of each of your turns"],
    ["monk-open-hand-technique", "must succeed on a Strength save"],
    ["monk-open-hand-technique", "must succeed on a Dexterity save"],
    ["ranger-hunter-superior-hunters-prey", "Once per turn"],
    ["sorcerer-arcane-apotheosis", "on each of your turns"],
    ["wizard-evoker-sculpt-spells", "When you cast an Evocation spell"],
    ["fighter-tactical-shift", "Whenever you use your Second Wind"],
  ])("%s: %s", (id, phrase) => {
    expect(text(id)).toContain(phrase);
  });
});

describe("Brutal Strike — an extra die on one Strength attack per turn", () => {
  const riders = (level: number) => {
    const doc = withFeatures("barbarian", level, ["barbarian-brutal-strike"]);
    const scores = { STR: 18, DEX: 12, CON: 14, INT: 8, WIS: 10, CHA: 10 };
    const aggregate = aggregateCharacterGrants(doc.character, doc.session);
    return {
      melee: resolveAttackDamageRiders(
        aggregate.damageRiders,
        { kind: "weapon", isRanged: false, damageType: "slashing" },
        doc,
        scores
      ),
      unarmed: resolveAttackDamageRiders(
        aggregate.damageRiders,
        { kind: "unarmed", damageType: "bludgeoning" },
        doc,
        scores
      ),
      ranged: resolveAttackDamageRiders(
        aggregate.damageRiders,
        { kind: "weapon", isRanged: true, damageType: "piercing" },
        doc,
        scores
      ),
    };
  };

  it.each([
    [9, "1d10"],
    [16, "1d10"],
    [17, "2d10"],
  ])("Barbarian %i: %s of the weapon's type, once per turn", (level, dice) => {
    const { melee, unarmed, ranged } = riders(level);
    expect(melee).toEqual([
      expect.objectContaining({ dice, damageType: "slashing", oncePerTurn: true }),
    ]);
    expect(unarmed).toEqual([
      expect.objectContaining({ dice, damageType: "bludgeoning", oncePerTurn: true }),
    ]);
    // A ranged weapon attack is Dexterity-based: no Brutal Strike.
    expect(ranged).toEqual([]);
  });
});

describe("Relentless Hunter — damage can't break Concentration on Hunter's Mark", () => {
  const ranger = (features: string[], concentration: string) =>
    withFeatures("ranger", 13, features, {}, { concentration } as never);

  it.each([
    [
      "Hunter's Mark held, with the feature",
      ["ranger-relentless-hunter"],
      "hunters-mark",
      false,
    ],
    ["another spell held, with the feature", ["ranger-relentless-hunter"], "bless", true],
    ["Hunter's Mark held, without the feature", [], "hunters-mark", true],
    ["nothing held", ["ranger-relentless-hunter"], "", false],
  ])("%s → damage queues a save: %s", (_case, features, held, queues) => {
    expect(damageQueuesConcentrationSave(ranger(features, held))).toBe(queues);
  });

  it("homebrew: any spell can be made damage-proof", () => {
    const aggregate = evaluateGrants([
      {
        id: "homebrew-steady-mind",
        grants: [{ type: "concentration-damage-proof", spellId: "bless" }],
      },
    ]);
    expect(aggregate.concentrationDamageProof).toEqual([
      { sourceId: "homebrew-steady-mind", spellId: "bless" },
    ]);
  });
});

describe("Smite of Protection — Half Cover in the aura until your next turn", () => {
  const KEY = "paladin-devotion-smite-of-protection";
  const paladin = (level: number, active: boolean) =>
    withFeatures(
      "paladin",
      level,
      [KEY],
      { subclassId: "oath-of-devotion" },
      {
        activeFeatures: active ? [KEY] : [],
      }
    );

  it("is a state that ends at the start of your next turn", () => {
    expect(resolveActiveBoundaryEffects(paladin(15, true))).toEqual([
      { activeKey: KEY, sourceId: KEY, phase: "turn-start", turns: 1 },
    ]);
    const doc = paladin(15, false);
    const group = aggregateCharacterGrants(
      doc.character,
      doc.session
    ).activatableGroups.find((g) => g.key === KEY);
    expect(loc(group?.label, "en")).toBe("Smite of Protection");
    expect(loc(group?.label, "it")).toBe("Punizione Protettiva");
  });

  it("unlit: no aura", () => {
    const doc = paladin(15, false);
    expect(aggregateCharacterGrants(doc.character, doc.session).auras).toEqual([]);
  });

  it.each([
    [15, "10 ft"],
    [18, "30 ft"],
  ])("lit at Paladin %i: you and allies have Half Cover within %s", (level, reach) => {
    const doc = paladin(level, true);
    const auras = aggregateCharacterGrants(doc.character, doc.session).auras;
    const [vm] = auraVMs(auras, level, "en");
    expect(vm).toMatchObject({
      auraId: "smite-of-protection",
      affects: "allies-and-self",
      effect: { kind: "half-cover" },
      radiusLabel: reach,
    });
  });
});

describe("Elusive — a defense line on the sheet", () => {
  it("names the rule in both languages", () => {
    const doc = withFeatures("rogue", 18, ["rogue-elusive"]);
    const notes = aggregateCharacterGrants(doc.character, doc.session).defenseNotes;
    expect(incomingAttackAdvantageVMs(notes, "en")).toEqual([
      {
        sourceId: "rogue-elusive",
        description:
          "No attack roll has Advantage against you while you aren't Incapacitated",
      },
    ]);
    expect(incomingAttackAdvantageVMs(notes, "it")[0]?.description).toBe(
      "Nessun tiro per colpire ha Vantaggio contro di te mentre non sei Incapacitato"
    );
  });
});

describe("free rows from the catalogue text", () => {
  const row = (doc: CharacterDoc, id: string) =>
    resolveActions(doc).find((a) => a.id === id);

  it.each([
    [
      "monk",
      10,
      "monk-self-restoration",
      "self-restoration",
      1,
      "Self-Restoration",
      "Autorigenerazione",
    ],
    [
      "ranger",
      11,
      "ranger-hunter-superior-hunters-prey",
      "superior-hunters-prey",
      1,
      "Superior Hunter's Prey",
      "Preda del Cacciatore Superiore",
    ],
    [
      "sorcerer",
      20,
      "sorcerer-arcane-apotheosis",
      "arcane-apotheosis",
      1,
      "Arcane Apotheosis",
      "Apoteosi Arcana",
    ],
    [
      "wizard",
      6,
      "wizard-evoker-sculpt-spells",
      "sculpt-spells",
      undefined,
      "Sculpt Spells",
      "Plasmare Incantesimi",
    ],
    [
      "fighter",
      5,
      "fighter-tactical-shift",
      "tactical-shift",
      undefined,
      "Tactical Shift",
      "Spostamento Tattico",
    ],
  ])("%s %i — %s: a free row", (classId, level, feature, actionId, cap, en, it) => {
    const r = row(
      withFeatures(classId, level, [feature]),
      `granted-action:${feature}:${actionId}`
    );
    expect(r).toMatchObject({ type: "free", source: "feature", costsSlot: false });
    expect(r?.maxUsesPerTurn).toBe(cap);
    expect(loc(r?.name, "en")).toBe(en);
    expect(loc(r?.name, "it")).toBe(it);
    expect(r?.summary.trigger).toBeDefined();
  });

  it("Self-Restoration triggers at the end of your turn", () => {
    const r = row(
      withFeatures("monk", 10, ["monk-self-restoration"]),
      "granted-action:monk-self-restoration:self-restoration"
    );
    expect(loc(r?.summary.trigger, "en")).toBe("At the end of each of your turns.");
  });

  it("Open Hand Technique: Addle, then Push and Topple against the Monk's DC", () => {
    // WIS 16 (+3), Monk 3 (PB +2) → DC 13.
    const doc = withFeatures("monk", 3, ["monk-open-hand-technique"], {
      subclassId: "open-hand",
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 16, CHA: 8 },
    });
    const id = (option: string) => `granted-action:monk-open-hand-technique:${option}`;
    expect(row(doc, id("addle"))?.summary.saveAbility).toBeUndefined();
    expect(row(doc, id("push"))?.summary).toMatchObject({
      saveAbility: "STR",
      saveDC: 13,
    });
    expect(row(doc, id("topple"))?.summary).toMatchObject({
      saveAbility: "DEX",
      saveDC: 13,
    });
    expect(loc(row(doc, id("topple"))?.name, "it")).toBe("Rovesciamento");
  });
});
