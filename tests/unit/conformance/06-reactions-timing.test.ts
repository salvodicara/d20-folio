/** Conformance, category 6: reactions and timing (corpus.md § 6). */
import { beforeEach, describe, expect } from "vitest";
import { getMonster } from "@/data/monsters";
import { getSpellById } from "@/data/spells";
import { ALL_REACTION_TRIGGERS } from "@/data/types";
import {
  addMonster,
  advanceTurn,
  applyInitiativeSwaps,
  beginEncounterTurns,
  monsterLimitedUses,
  restoreMonsterUse,
  setInitiativeSwap,
  spendMonsterUse,
  startEncounter,
} from "@/features/campaigns/encounter";
import { effectiveAC } from "@/lib/aggregate-character";
import { metamagicOptionsForCast } from "@/lib/cast-options";
import { economyActionCategory } from "@/lib/combat-economy";
import { evaluateD20Test, reviewD20Test } from "@/lib/d20-test";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { takeDamage } from "@/lib/play/damage";
import {
  READIED_SPELL_REACTION_ID,
  READY_ACTION_ID,
  readiedHold,
  readiedSpellExpires,
} from "@/lib/play/ready";
import { applySheetEvent, type SheetEvent } from "@/lib/play/sheet-events";
import { resolveActions, resolveTrackers } from "@/lib/smart-tracker";
import { useCombatStore } from "@/stores/combatStore";
import type { EncounterState } from "@/types/campaign";
import type { CharacterDoc } from "@/types/character";
import type { D20TestObservation, D20TestRequest } from "@/types/d20-test";
import { rule } from "./rule";

const SCORES = { STR: 10, DEX: 16, CON: 14, INT: 16, WIS: 12, CHA: 14 } as const;

function character(
  spec: Partial<ScenarioSpec> & Pick<ScenarioSpec, "classId" | "level">
) {
  return buildScenario({
    name: "Conformance",
    raceId: "human",
    background: "sage",
    abilityScores: { ...SCORES },
    ...spec,
  });
}

function sheet(doc: CharacterDoc, ...events: SheetEvent[]): CharacterDoc {
  return events.reduce((d, e) => applySheetEvent(d, e) ?? d, doc);
}

function action(doc: CharacterDoc, id: string) {
  const found = resolveActions(doc).find((a) => a.id === id);
  if (!found) throw new Error(`missing action ${id}`);
  return found;
}

const combat = () => useCombatStore.getState();

// ─── D20 Test kernel fixtures (the player enters every die) ──────────────────

const fixed = (value: number) => ({ kind: "fixed" as const, value });
const MATERIAL = { characterId: "c-1", kind: "character-play" as const, uid: "u-1" };
const ACTOR = { entityId: "actor-1", material: MATERIAL, ordinal: 1 };
const TARGET = { entityId: "target-1", material: MATERIAL, ordinal: 2 };
const NO_ROLL_RULES = {
  advantageSourceIds: [],
  disadvantageSourceIds: [],
  extraD20SourceIds: [],
  faceFloors: [],
  replacements: [],
  substitutions: [],
  totalFloors: [],
};

function observe(
  request: D20TestRequest,
  face: number,
  extra: Partial<Pick<D20TestObservation, "enteredModifiers" | "tableOverride">> = {}
): D20TestObservation {
  const trail = reviewD20Test(request, {})?.d20Requirement?.trails[0];
  if (!trail) throw new Error("the request rolls no d20");
  return {
    d20: {
      aggregates: [],
      trails: [{ initialFace: face, steps: [], trailId: trail.trailId }],
    },
    enteredModifiers: extra.enteredModifiers ?? [],
    tableOverride: extra.tableOverride ?? null,
  };
}

/** Ally's Wisdom save, +2, DC 15, with a Bardic Inspiration die that may be added. */
const SAVE: D20TestRequest = {
  actor: ACTOR,
  ability: "WIS",
  difficultyClass: fixed(15),
  enteredModifiers: [
    {
      kind: "exact",
      maximum: fixed(6),
      minimum: fixed(1),
      required: false,
      sourceId: "bi",
    },
  ],
  kind: "saving-throw",
  modifiers: [{ sourceId: "wis", value: fixed(2) }],
  resolution: { kind: "rolled" },
  rollRules: NO_ROLL_RULES,
  target: null,
  testId: "save-1",
};

/** A monster's attack +5 against AC 15, open to Cutting Words' subtracted die. */
const ATTACK: D20TestRequest = {
  actor: ACTOR,
  armorClass: fixed(15),
  automaticCriticalSourceIds: [],
  criticalThreshold: fixed(20),
  enteredModifiers: [
    {
      kind: "exact",
      maximum: fixed(-1),
      minimum: fixed(-6),
      required: false,
      sourceId: "cutting-words",
    },
  ],
  kind: "attack",
  modifiers: [{ sourceId: "attack", value: fixed(5) }],
  resolution: { kind: "rolled" },
  rollRules: NO_ROLL_RULES,
  target: TARGET,
  testId: "attack-1",
};

// ─── Encounter fixtures ──────────────────────────────────────────────────────

function lichFight(): EncounterState {
  const start = startEncounter({ ana: { characterId: "c-ana" } }, ["ana"], 1);
  const withLich = addMonster(start, {
    name: "Lich",
    srdId: "lich",
    ac: 20,
    maxHp: 315,
    count: 1,
    initiative: 20,
  });
  return beginEncounterTurns(withLich, ["pc-ana", "monster-1"]);
}

describe("conformance · 6. reactions and timing", () => {
  beforeEach(() => combat().resetTurn());

  rule(
    {
      category: 6,
      case: "One reaction per round",
      source: "SAC #103; GLOSS",
      status: "works",
    },
    () => {
      expect(combat().useReaction("base-opportunity-attack")).toBe(true);
      // The round's one Reaction is gone, whatever the next trigger is.
      expect(combat().useReaction("spell-shield")).toBe(false);
      // It comes back when your own turn starts.
      combat().resetTurn();
      expect(combat().useReaction("spell-shield")).toBe(true);
      // A Reaction spell on your own turn still counts against the one-slot rule.
      const wizard = character({
        classId: "wizard",
        level: 3,
        spells: [{ srdId: "shield", prepared: true }],
      });
      expect(action(wizard, "spell-shield")).toMatchObject({
        type: "reaction",
        costsSlot: true,
      });
      expect(combat().commitSpellSlotCast("round-1:wizard")).not.toBeNull();
      expect(combat().commitSpellSlotCast("round-1:wizard")).toBeNull();
    }
  );

  rule(
    {
      category: 6,
      case: "Counterspell 2024",
      source: "WIKI spell:counterspell",
      status: "works",
    },
    () => {
      // The 2024 facts: seen casting within 60 ft, a CON save, Somatic only.
      expect(getSpellById("counterspell")).toMatchObject({
        reactionTrigger: "creatureCastsSpell",
        saveAbility: "CON",
        components: { v: false, s: true, m: false },
      });
      // A countered spell wastes the action but not the slot: the cast's cost
      // carries a refund on "countered" (the turn meter's "Countered" gives the slot
      // back: countered-cast.test.tsx).
      const wizard = character({
        classId: "wizard",
        level: 5,
        spells: [{ srdId: "fireball", prepared: true }],
      });
      expect(action(wizard, "spell-fireball")).toMatchObject({
        costsSlot: true,
        refund: { on: "countered" },
      });
    }
  );

  rule(
    {
      category: 6,
      case: "Subtle Spell vs Counterspell",
      source: "dndbeyond forums 232094",
      status: "works",
    },
    () => {
      // Components are data: Revivify keeps a costly, consumed material even when
      // Subtle Spell strips V and S, so it can still be seen and countered.
      const revivify = getSpellById("revivify");
      expect(revivify?.components).toMatchObject({
        m: true,
        costGp: 300,
        consumed: true,
      });
      const [subtle] = metamagicOptionsForCast(
        ["subtle-spell"],
        {
          level: 3,
          castingTime: "action",
          forcesSave: false,
          dealsDamage: false,
          makesAttack: false,
        },
        3
      );
      expect(subtle).toMatchObject({ id: "subtle-spell", appliesToSpell: true, cost: 1 });
    }
  );

  rule(
    {
      category: 6,
      case: "Counterspell vs slotless monster casts",
      source: "dndbeyond forums 218392; ERRATA",
      status: "works",
    },
    () => {
      // A lich casts from "N/Day Each" counters, one per spell, not from slots.
      const lich = getMonster("lich");
      if (!lich) throw new Error("missing lich");
      const uses = monsterLimitedUses(lich).filter((u) => u.kind === "spell");
      const fingerOfDeath = uses.find((u) => u.spellId === "finger-of-death");
      const scrying = uses.find((u) => u.spellId === "scrying");
      if (!fingerOfDeath || !scrying) throw new Error("missing daily spells");
      let fight = spendMonsterUse(lichFight(), "monster-1", fingerOfDeath.key, 1);
      const spent = () => fight.combatants.find((c) => c.id === "monster-1");
      expect(spent()).toMatchObject({ spent: { [fingerOfDeath.key]: 1 } });
      expect(spent()).not.toMatchObject({ spent: { [scrying.key]: 1 } });
      // Whether a countered daily use is lost is the DM's call: it can be given back.
      fight = restoreMonsterUse(fight, "monster-1", fingerOfDeath.key);
      expect(spent()).not.toHaveProperty("spent");
    }
  );

  rule(
    {
      category: 6,
      case: "Shield changes the past",
      source: "WIKI spell:shield",
      status: "works",
    },
    () => {
      const wizard = character({
        classId: "wizard",
        level: 3,
        spells: [{ srdId: "shield", prepared: true }],
      });
      const shield = action(wizard, "spell-shield");
      expect(shield).toMatchObject({
        type: "reaction",
        activatesKey: "spell-shield",
        // Until the start of your next turn.
        activeTurnBoundary: { phase: "turn-start", turns: 1 },
      });
      expect(getSpellById("shield")?.reactionTrigger).toBe("hitOrMagicMissileTarget");
      const before = effectiveAC(wizard.character, wizard.session);
      const shielded = effectiveAC(wizard.character, {
        ...wizard.session,
        activeFeatures: [...(wizard.session.activeFeatures ?? []), "spell-shield"],
      });
      expect(shielded).toBe(before + 5);
    }
  );

  rule(
    {
      category: 6,
      case: '"When hit" vs "when targeted" vs "when damaged"',
      source: "SAC #59; WIKI monk:main; WIKI rogue:main",
      status: "works",
    },
    () => {
      // The three windows exist as triggers.
      expect(ALL_REACTION_TRIGGERS).toEqual(
        expect.arrayContaining(["hitOrMagicMissileTarget", "hitByAttack", "takeDamage"])
      );
      // Uncanny Dodge answers a hit, before damage: the claimed Reaction halves it.
      const rogue = character({
        classId: "rogue",
        subclassId: "thief",
        level: 5,
        background: "criminal",
      });
      expect(action(rogue, "rogue-uncanny-dodge-reaction").summary.trigger).toEqual({
        ui: "combat.reactionTrigger_hitByAttack",
      });
      const dodging: CharacterDoc = {
        ...rogue,
        session: {
          ...rogue.session,
          activeFeatures: [
            ...(rogue.session.activeFeatures ?? []),
            "rogue-uncanny-dodge",
          ],
        },
      };
      const taken = takeDamage(dodging, 21, {
        hit: { attacker: null, attackMode: "melee" },
      });
      expect(rogue.session.hp.current - (taken?.session.hp.current ?? 0)).toBe(10);
    }
  );

  rule(
    {
      category: 6,
      case: "Readied action timing",
      source: "SAC #13; SAC #14; SAC #25; SAC #27",
      status: "works",
    },
    () => {
      const wizard = character({ classId: "wizard", level: 3 });
      // Ready takes your action; the readied thing is released with your Reaction.
      expect(action(wizard, READY_ACTION_ID).type).toBe("action");
      expect(READIED_SPELL_REACTION_ID).toBe("readied-spell");
      // A spell readied on round 3 is held until the start of your next turn.
      const session = { ...wizard.session, readiedSpell: readiedHold(3, null) };
      expect(readiedSpellExpires(session, 3)).toBe(false);
      expect(readiedSpellExpires(session, 4)).toBe(true);
      // You may take a different Reaction instead (an Opportunity Attack).
      expect(action(wizard, "base-opportunity-attack").type).toBe("reaction");
    }
  );

  rule(
    {
      category: 6,
      case: "Opportunity Attacks",
      source: "SAC #28; SAC #29; GLOSS",
      status: "works",
    },
    () => {
      const fighter = character({ classId: "fighter", level: 1 });
      expect(action(fighter, "base-opportunity-attack")).toMatchObject({
        type: "reaction",
        costsSlot: false,
      });
    }
  );

  rule(
    {
      category: 6,
      case: "OA as Grapple or Shove",
      source: "SAC #30; KIBBLES #3",
      status: "works",
    },
    () => {
      const fighter = character({ classId: "fighter", level: 1 });
      // Grapple and Shove are Unarmed Strike options, so they fill an attack slot.
      expect(economyActionCategory(action(fighter, "base-grapple"))).toBe("attack");
      expect(economyActionCategory(action(fighter, "base-shove"))).toBe("attack");
      // They use a save, not an attack roll.
      expect(action(fighter, "base-grapple").summary).toMatchObject({
        saveAbility: "STR",
      });
      expect(action(fighter, "base-grapple").summary.attackBonus).toBeUndefined();
    }
  );

  rule(
    {
      category: 6,
      case: "Post-roll reactions",
      source: "SAC #49; rpgbot 2024 transition guide",
      status: "works",
    },
    () => {
      // Bardic Inspiration after the save fails: 10 + 2 = 12 fails DC 15...
      expect(evaluateD20Test(SAVE, {}, observe(SAVE, 10))?.outcome.status).toBe(
        "failure"
      );
      // ...and the die added after the roll turns it into a success.
      const inspired = observe(SAVE, 10, {
        enteredModifiers: [{ kind: "exact", sourceId: "bi", value: 4 }],
      });
      expect(evaluateD20Test(SAVE, {}, inspired)?.outcome.status).toBe("success");
      // Cutting Words subtracts after the roll: 12 + 5 = 17 hits AC 15, minus 3 misses.
      expect(evaluateD20Test(ATTACK, {}, observe(ATTACK, 12))?.outcome.status).toBe(
        "success"
      );
      const cut = observe(ATTACK, 12, {
        enteredModifiers: [{ kind: "exact", sourceId: "cutting-words", value: -3 }],
      });
      expect(evaluateD20Test(ATTACK, {}, cut)?.outcome).toMatchObject({ hit: false });
      // Cutting Words is a Reaction that spends a Bardic Inspiration use.
      const bard = character({
        classId: "bard",
        subclassId: "college-of-lore",
        level: 3,
      });
      expect(action(bard, "bard-lore-cutting-words-reaction")).toMatchObject({
        type: "reaction",
        costTracker: "bard-bardic-inspiration",
      });
    }
  );

  rule(
    {
      category: 6,
      case: "Choose-to-succeed effects",
      source: "WIKI feat:mage-slayer; WIKI rogue:main",
      status: "works",
    },
    () => {
      // A failed save turned into a success after the outcome is known (Stroke of Luck).
      const turned = observe(SAVE, 3, {
        tableOverride: {
          kind: "outcome",
          outcome: "success",
          reasonId: "stroke-of-luck",
          sourceId: "rogue-stroke-of-luck",
        },
      });
      const result = evaluateD20Test(SAVE, {}, turned);
      expect(result?.computedOutcome.status).toBe("failure");
      expect(result?.outcome).toMatchObject({
        status: "success",
        basis: "table-override",
      });
      // Stroke of Luck is a counted use.
      const rogue = character({ classId: "rogue", subclassId: "thief", level: 20 });
      expect(
        resolveTrackers(rogue).find((t) => t.id === "rogue-stroke-of-luck")
      ).toMatchObject({
        total: 1,
      });
    }
  );

  rule(
    {
      category: 6,
      case: "Sneak Attack on others' turns",
      source: "SAC #58",
      status: "M5",
    },
    () => {
      const rogue = character({ classId: "rogue", subclassId: "thief", level: 5 });
      const spend: SheetEvent = {
        kind: "spend-tracker",
        trackerId: "rogue-sneak-attack",
        amount: 1,
      };
      const doc = sheet(
        rogue,
        spend, // Sneak Attack on the rogue's turn (round 1)
        { kind: "recover-per-turn-trackers" }, // End Turn
        spend, // a second Sneak Attack on the goblin's turn, with an OA
        { kind: "expire-effect-boundaries", round: 2, phase: "turn-start" } // rogue's turn 2
      );
      // A new turn: the once-per-turn use is available again.
      expect(doc.session.trackers["rogue-sneak-attack"]?.used ?? 0).toBe(0);
    }
  );

  rule(
    {
      category: 6,
      case: "Legendary actions",
      source: "dndbeyond posts 1890",
      status: "M5",
    },
    () => {
      const lich = getMonster("lich");
      if (!lich) throw new Error("missing lich");
      // Each action costs one use; the pool comes back at the start of its turn.
      let fight = lichFight();
      for (let i = 0; i < 3; i++)
        fight = spendMonsterUse(fight, "monster-1", "legendary", 3);
      const lichRow = () => fight.combatants.find((c) => c.id === "monster-1");
      expect(lichRow()).toMatchObject({ spent: { legendary: 3 } });
      fight = advanceTurn(fight);
      expect(lichRow()).not.toHaveProperty("spent");
      // In its lair the monster gets one more use (3, or 4 in its lair).
      const pool = monsterLimitedUses(lich).find((u) => u.kind === "legendary");
      expect(pool).toMatchObject({ max: 3, lairMax: 4 });
    }
  );

  rule(
    {
      category: 6,
      case: "Alert initiative swap",
      source: "WIKI feat:alert",
      status: "works",
    },
    () => {
      const start = startEncounter(
        { ana: { characterId: "c-ana" }, bo: { characterId: "c-bo" } },
        ["ana", "bo"],
        1
      );
      const state = addMonster(start, {
        name: "Goblin",
        ac: 15,
        maxHp: 7,
        count: 1,
        initiative: 12,
      });
      // Bo (Alert) swaps with willing ally Ana after initiative is rolled.
      const swapped = setInitiativeSwap(state, "pc-bo", "pc-ana");
      expect(swapped.initiativeSwaps).toEqual([
        { sourceId: "pc-bo", targetId: "pc-ana" },
      ]);
      expect(
        applyInitiativeSwaps(["pc-ana", "monster-1", "pc-bo"], swapped.initiativeSwaps)
      ).toEqual(["pc-bo", "monster-1", "pc-ana"]);
      // Never with an enemy.
      expect(setInitiativeSwap(state, "pc-bo", "monster-1")).toBe(state);
    }
  );
});
