/**
 * A homebrew monster carries the same structured stat block a catalogue monster
 * does (`CustomMonster.mechanics`), written as structured entries or as TEXT read
 * by the same print readers, and runs through the same encounter paths: its
 * Multiattack plan, its one-tap attacks with their hit conditions, its Recharge
 * and N/Day counters, its legendary pool, its spellcasting and Concentration, its
 * trait facts (Regeneration switched off by fire). The stored template survives the
 * library codec unchanged; an encounter creature reaches it through `homebrewId`,
 * which every encounter reader since this field accepts (reader first).
 */
import { describe, expect, it } from "vitest";

import type { HomebrewMonsterMechanics, MonsterTraitFact } from "@/data/types";
import {
  addMonster,
  advanceTurn,
  beginEncounterTurns,
  monsterLimitedUses,
  parseEncounterState,
  rollMonsterRecharge,
  spendMonsterUse,
  startEncounter,
} from "@/features/campaigns/encounter";
import {
  regenerationSuppressedBy,
  regenerationTurnStart,
} from "@/features/campaigns/encounter-trait-facts";
import { applyAdversaryDamageParts } from "@/features/campaigns/encounter-world-command";
import { translateMonsterEntry } from "@/lib/activities";
import {
  encounterMonsterBlockId,
  homebrewMonsterBlockId,
  homebrewMonsterEntryName,
  homebrewMonsterLookup,
  homebrewMonsterMechanics,
  homebrewMonsterStatBlock,
} from "@/lib/homebrew-monsters";
import { parseLibraryEntries } from "@/lib/library-codec";
import type { LibraryEntry } from "@/lib/library";
import { monsterActions } from "@/lib/play/monster-action";
import {
  monsterConcentrationSave,
  monsterConcentrationSpells,
  startMonsterConcentration,
} from "@/lib/play/monster-concentration";
import { multiattackPlan } from "@/lib/play/monster-multiattack";
import type { CustomMonster, EncounterMonster, EncounterState } from "@/types/campaign";

const CAMPAIGN_ID = "campaign-under-test";

function libraryEntry(id: string, item: CustomMonster): LibraryEntry {
  return { id, savedAt: 1, kind: "monster", item };
}

function block(id: string, item: CustomMonster) {
  const statBlock = homebrewMonsterStatBlock(id, item);
  if (!statBlock) throw new Error(`${item.name} declares no stat block`);
  return statBlock;
}

/** One homebrew creature in a fight, linked to its library entry (the field a
 *  later writer sets; written by hand here, as a stored doc would carry it). */
function fightWith(entryId: string, item: CustomMonster): EncounterState {
  let state = startEncounter({}, [], 1_000);
  state = addMonster(state, {
    name: item.name,
    ac: item.ac,
    maxHp: item.maxHp,
    count: 1,
    initiative: 14,
  });
  state = addMonster(state, {
    name: "Bandit",
    ac: 12,
    maxHp: 11,
    count: 1,
    initiative: 3,
  });
  state = {
    ...state,
    combatants: state.combatants.map((c) =>
      c.id === "monster-1" && c.kind === "monster" ? { ...c, homebrewId: entryId } : c
    ),
  };
  return beginEncounterTurns(parseEncounterState(state), ["monster-1", "monster-2"]);
}

function creature(state: EncounterState, id = "monster-1"): EncounterMonster {
  const found = state.combatants.find((c) => c.id === id);
  if (!found || found.kind !== "monster") throw new Error(`missing ${id}`);
  return found;
}

// ─── An ogre-like brute: Multiattack + a grappling hit, written as text ───────

const BRUTE: CustomMonster = {
  name: "Bog Brute",
  ac: 11,
  maxHp: 59,
  cr: "2",
  creatureType: "giant",
  mechanics: {
    sizes: ["Large"],
    alignment: "chaotic-evil",
    speeds: { walk: 40 },
    abilityScores: { STR: 19, DEX: 8, CON: 16, INT: 5, WIS: 7, CHA: 7 },
    actions: [
      { name: "Multiattack", text: "The brute makes two Slam attacks." },
      {
        name: "Slam",
        text: "Melee Attack Roll: +6, reach 5 ft. Hit: 13 (2d8 + 4) Bludgeoning damage. If the target is a Medium or smaller creature, it has the Grappled condition (escape DC 14).",
      },
      {
        name: "Hurl Rock (Recharge 5–6)",
        text: "Ranged Attack Roll: +6, range 60/240 ft. Hit: 15 (2d10 + 4) Bludgeoning damage.",
      },
    ],
  },
};

describe("a homebrew brute written as text", () => {
  const brute = block("brute-entry", BRUTE);

  it("reads its print into the catalogue's own entries", () => {
    expect(brute.id).toBe(homebrewMonsterBlockId("brute-entry"));
    expect(brute).toMatchObject({
      cr: 2,
      type: "giant",
      ac: 11,
      hp: { average: 59 },
      sizes: ["Large"],
      speeds: { walk: 40 },
    });
    expect(brute.actions).toEqual([
      {
        id: "multiattack",
        kind: "narrative",
        multiattack: { steps: [{ count: 2, use: ["slam"] }] },
        name: "Multiattack",
        text: "The brute makes two Slam attacks.",
      },
      expect.objectContaining({
        id: "slam",
        kind: "attack",
        attack: "melee",
        toHit: 6,
        reachFt: 5,
        damage: [{ dice: "2d8+4", damageType: "bludgeoning" }],
        conditions: ["grappled"],
        conditionsIf: true,
      }),
      expect.objectContaining({
        id: "hurl-rock",
        kind: "attack",
        attack: "ranged",
        recharge: 5,
        rangeFt: { near: 60, far: 240 },
      }),
    ]);
    // The escape DC stays in the entry's text, exactly as a catalogue print keeps it.
    const slam = brute.actions.find((entry) => entry.id === "slam");
    expect(slam && homebrewMonsterEntryName(slam)).toBe("Slam");
  });

  it("plans its Multiattack over its own Slam, one tap each", () => {
    const steps = multiattackPlan(brute)?.steps;
    expect(steps).toHaveLength(1);
    expect(steps?.[0]?.count).toBe(2);
    expect(steps?.[0]?.options.map((option) => option.entryId)).toEqual(["slam"]);
    expect(steps?.[0]?.options[0]?.action?.toHit).toBe(6);
  });

  it("its Slam lands the Grappled condition through the activity translator", () => {
    const slam = monsterActions(brute).find((action) => action.entryId === "slam");
    expect(slam?.activity.effects).toContainEqual(
      expect.objectContaining({
        kind: "condition",
        apply: { options: ["grappled"], on: "hit" },
        optIn: true,
      })
    );
    const entry = brute.actions.find((e) => e.id === "slam");
    if (!entry) throw new Error("no slam");
    expect(translateMonsterEntry(brute.id, "actions", entry).gaps).toEqual([]);
  });

  it("its Recharge is a counter the fight spends and the d6 gives back", () => {
    const [use] = monsterLimitedUses(brute);
    expect(use).toEqual({
      key: "actions:hurl-rock",
      max: 1,
      kind: "recharge",
      recharge: 5,
    });
    if (!use) return;
    const spent = spendMonsterUse(
      fightWith("brute-entry", BRUTE),
      "monster-1",
      use.key,
      1
    );
    expect(creature(spent).spent).toEqual({ "actions:hurl-rock": 1 });
    expect(creature(rollMonsterRecharge(spent, "monster-1", use, 4)).spent).toEqual({
      "actions:hurl-rock": 1,
    });
    expect(
      creature(rollMonsterRecharge(spent, "monster-1", use, 5)).spent
    ).toBeUndefined();
  });

  it("written as structured entries instead, it is the same stat block", () => {
    const structured: CustomMonster = {
      ...BRUTE,
      mechanics: {
        ...BRUTE.mechanics,
        actions: brute.actions,
      } as HomebrewMonsterMechanics,
    };
    expect(block("brute-entry", structured)).toEqual(brute);
  });
});

// ─── A homebrew caster: 1/Day spells, Legendary Resistance, Concentration ─────

const WITCH: CustomMonster = {
  name: "Mire Witch",
  ac: 13,
  maxHp: 82,
  cr: "5",
  creatureType: "fey",
  mechanics: {
    abilityScores: { STR: 9, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 15 },
    saveProficiencies: ["CON", "INT"],
    traits: [
      {
        name: "Legendary Resistance (3/Day)",
        text: "If the witch fails a saving throw, she can choose to succeed instead.",
      },
    ],
    actions: [
      {
        name: "Spellcasting",
        text: "The witch casts one of the following spells, using Intelligence as the spellcasting ability (spell save DC 15, +7 to hit with spell attacks): At Will: Fire Bolt, Mage Hand. 1/Day Each: Fly, Hold Person, Acid Arrow, Bog Lantern.",
      },
    ],
    legendary: { uses: 3 },
    legendaryActions: [
      {
        name: "Ember",
        text: "The witch uses Spellcasting to cast Fire Bolt.",
      },
    ],
  },
};

describe("a homebrew caster", () => {
  const witch = block("witch-entry", WITCH);
  const library = [libraryEntry("witch-entry", WITCH)];

  it("reads its spellcasting tiers as catalogue spell ids; an unknown spell is left out", () => {
    expect(witch.actions[0]).toMatchObject({
      kind: "spellcasting",
      ability: "INT",
      dc: 15,
      toHit: 7,
      atWill: ["fire-bolt", "mage-hand"],
      perDay: [{ count: 1, spellIds: ["fly", "hold-person", "melfs-acid-arrow"] }],
    });
  });

  it("counts Legendary Resistance, each 1/Day spell and the legendary pool", () => {
    expect(monsterLimitedUses(witch)).toEqual([
      { key: "traits:legendary-resistance", max: 3, kind: "uses" },
      { key: "actions:spellcasting:fly", max: 1, kind: "spell", spellId: "fly" },
      {
        key: "actions:spellcasting:hold-person",
        max: 1,
        kind: "spell",
        spellId: "hold-person",
      },
      {
        key: "actions:spellcasting:melfs-acid-arrow",
        max: 1,
        kind: "spell",
        spellId: "melfs-acid-arrow",
      },
      { key: "legendary", max: 3, kind: "legendary" },
    ]);
  });

  it("concentrates on Fly and asks its own Constitution save when hit", () => {
    expect(monsterConcentrationSpells(witch)).toEqual(["fly", "hold-person"]);
    const state = startMonsterConcentration(
      fightWith("witch-entry", WITCH),
      "monster-1",
      "fly"
    );
    const lookup = homebrewMonsterLookup(library);
    // CON 14 (+2) with proficiency at CR 5 (+3).
    expect(monsterConcentrationSave(creature(state), 22, lookup)).toEqual({
      monsterId: "monster-1",
      spell: "fly",
      ability: "CON",
      dc: 11,
      bonus: 5,
    });
  });
});

// ─── A troll-like regenerator: fire switches its Regeneration off ─────────────

const BOG_TROLL: CustomMonster = {
  name: "Bog Troll",
  ac: 15,
  maxHp: 84,
  cr: "5",
  creatureType: "giant",
  mechanics: {
    traits: [
      {
        name: "Regeneration",
        text: "The bog troll regains 10 Hit Points at the start of each of its turns. If the bog troll takes Acid or Fire damage, this trait doesn't function on the bog troll's next turn.",
      },
      {
        name: "Magic Resistance",
        text: "The bog troll has Advantage on saving throws against spells and other magical effects.",
      },
    ],
    actions: [
      {
        name: "Rend",
        text: "Melee Attack Roll: +7, reach 10 ft. Hit: 11 (2d6 + 4) Slashing damage.",
      },
    ],
  },
};

describe("a homebrew troll", () => {
  const troll = block("troll-entry", BOG_TROLL);
  const regeneration = troll.traits
    ?.flatMap((entry) => (entry.kind === "narrative" && entry.fact ? [entry.fact] : []))
    .find(
      (fact): fact is Extract<MonsterTraitFact, { kind: "regeneration" }> =>
        fact.kind === "regeneration"
    );

  it("reads its trait facts from the print", () => {
    expect(regeneration).toEqual({
      kind: "regeneration",
      amount: 10,
      suppressedBy: ["acid", "fire"],
    });
    expect(troll.traits?.[1]).toMatchObject({
      fact: { kind: "advantage", rolls: ["save"], when: "vs-spells" },
    });
  });

  it("regenerates at its turn start unless fire landed since its last turn", () => {
    if (!regeneration) throw new Error("no regeneration fact");
    const fight = advanceTurn(fightWith("troll-entry", BOG_TROLL)); // the Bandit's turn
    const burned = applyAdversaryDamageParts(fight, CAMPAIGN_ID, "monster-1", [
      { amount: 12, type: "fire" },
    ]);
    const trollTurn = advanceTurn(burned);
    expect(regenerationSuppressedBy(trollTurn, "monster-1", regeneration)).toEqual([
      "fire",
    ]);
    expect(
      regenerationTurnStart(trollTurn, CAMPAIGN_ID, "monster-1", regeneration).encounter
    ).toBe(trollTurn);

    const slashed = applyAdversaryDamageParts(fight, CAMPAIGN_ID, "monster-1", [
      { amount: 12, type: "slashing" },
    ]);
    const healed = regenerationTurnStart(
      advanceTurn(slashed),
      CAMPAIGN_ID,
      "monster-1",
      regeneration
    ).encounter;
    expect(creature(healed).hp.current).toBe(82);
  });
});

// ─── Storage, validation and the encounter link ──────────────────────────────

describe("the stored template and the encounter link", () => {
  it("the library codec carries the stat block unchanged, unknown fields too", () => {
    const item: CustomMonster = {
      ...BRUTE,
      mechanics: {
        ...BRUTE.mechanics,
        futureField: { x: 1 },
      } as HomebrewMonsterMechanics,
    };
    const stored = JSON.parse(
      JSON.stringify({ entries: [libraryEntry("brute-entry", item)] })
    ) as Record<string, unknown>;
    const parsed = parseLibraryEntries(stored);
    expect(parsed.ok && parsed.entries[0]?.item).toEqual(item);
    // The unknown field is inert: it never reaches the stat block.
    expect(block("brute-entry", item)).not.toHaveProperty("futureField");
  });

  it("a field its schema rejects is left out of play, never repaired", () => {
    const item: CustomMonster = {
      ...BRUTE,
      mechanics: {
        ...BRUTE.mechanics,
        sizes: ["Colossal"],
        legendary: { uses: 0 },
      } as unknown as HomebrewMonsterMechanics,
    };
    const mechanics = homebrewMonsterMechanics(item);
    expect(mechanics).not.toHaveProperty("sizes");
    expect(mechanics).not.toHaveProperty("legendary");
    expect(block("brute-entry", item).sizes).toEqual(["Medium"]);
    expect(item.mechanics).toHaveProperty("sizes", ["Colossal"]);
  });

  it("a malformed structured entry falls back to its text; a routine over a missing entry is dropped", () => {
    const item: CustomMonster = {
      ...BRUTE,
      mechanics: {
        actions: [
          {
            id: "slam",
            kind: "attack",
            name: "Slam",
            attack: "melee",
            toHit: "six",
            damage: [],
            text: "Melee Attack Roll: +6, reach 5 ft. Hit: 13 (2d8 + 4) Bludgeoning damage.",
          },
          {
            id: "multiattack",
            kind: "narrative",
            name: "Multiattack",
            multiattack: { steps: [{ count: 2, use: ["claw"] }] },
          },
        ],
      } as unknown as HomebrewMonsterMechanics,
    };
    const actions = block("brute-entry", item).actions;
    expect(actions[0]).toMatchObject({ id: "slam", kind: "attack", toHit: 6 });
    expect(actions[1]).toEqual({
      id: "multiattack",
      kind: "narrative",
      name: "Multiattack",
    });
  });

  it("a text-only template (no stat block) resolves to nothing", () => {
    const plain: CustomMonster = { name: "Thug", ac: 12, maxHp: 32 };
    expect(homebrewMonsterStatBlock("thug", plain)).toBeUndefined();
    expect(homebrewMonsterLookup([libraryEntry("thug", plain)])("homebrew:thug")).toBe(
      undefined
    );
  });

  it("the encounter reaches the stat block through homebrewId, the catalogue through srdId", () => {
    const library = [libraryEntry("brute-entry", BRUTE)];
    const lookup = homebrewMonsterLookup(library, (id) =>
      id === "goblin" ? block("goblin-stub", BRUTE) : undefined
    );
    const brute = creature(fightWith("brute-entry", BRUTE));
    expect(encounterMonsterBlockId(brute)).toBe("homebrew:brute-entry");
    expect(lookup(encounterMonsterBlockId(brute) ?? "")?.actions).toHaveLength(3);
    expect(encounterMonsterBlockId({ srdId: "goblin" })).toBe("goblin");
    expect(lookup("goblin")).toBeDefined();
    expect(encounterMonsterBlockId({})).toBeUndefined();
    expect(lookup("homebrew:deleted-entry")).toBeUndefined();
  });

  it("the encounter reader accepts homebrewId and rejects a malformed one", () => {
    const state = fightWith("brute-entry", BRUTE);
    const stored = JSON.parse(JSON.stringify(state)) as EncounterState;
    expect(creature(parseEncounterState(stored)).homebrewId).toBe("brute-entry");
    for (const bad of ["", 3, { id: "x" }]) {
      const doc = JSON.parse(JSON.stringify(state)) as {
        combatants: Array<Record<string, unknown>>;
      };
      const first = doc.combatants[0];
      if (first) first.homebrewId = bad;
      expect(() => parseEncounterState(doc), JSON.stringify(bad)).toThrow();
    }
  });
});
