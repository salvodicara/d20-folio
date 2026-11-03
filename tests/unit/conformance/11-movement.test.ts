/** Conformance, category 11: movement and mounts (corpus.md § 11). */
import { describe, expect } from "vitest";
import { TRAVEL_PACE_REFERENCE } from "@/data/travel-pace";
import { addMonster } from "@/features/campaigns/encounter";
import { CONDITION_RULES } from "@/lib/condition";
import type { Grant } from "@/lib/grants";
import { deriveJumps } from "@/lib/jump";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { MOCK_CHARACTER } from "@/lib/mock";
import { resolveActions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "../_helpers";
import { takeDamage } from "@/lib/play/damage";
import {
  DIFFICULT_TERRAIN_COST_PER_FOOT,
  spendMovement,
} from "@/lib/play/difficult-terrain";
import { fallDamageDice, fallLandsProne } from "@/lib/play/fall";
import {
  MOUNT_CONTROLLED_ACTIONS,
  mountActionOptions,
  mountedTurnOrder,
} from "@/lib/play/mounts";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import { createTurnEconomyState, reduceTurnEconomy } from "@/lib/turn-economy";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterDoc, CustomFeature } from "@/types/character";
import type {
  TurnEconomyCommand,
  TurnEconomyProjection,
  TurnEconomyState,
} from "@/types/turn-economy";
import { customInstanceId } from "../__helpers__/custom-items";
import { rule } from "./rule";
import { activeZones, zonePayload, zoneTriggers } from "@/lib/zones";

/** A zone the caster left on the field, as the encounter stores it (edge-case M9). */
function zoneOf(spellId: string, castLevel: number, spared: string[] = []) {
  const [zone] = activeZones([
    {
      id: `zone-${spellId}`,
      actor: { kind: "monster", combatantId: "caster" },
      target: { kind: "monster", combatantId: "caster" },
      source: { kind: "spell", id: spellId, actionId: `spell-${spellId}`, castLevel },
      payload: zonePayload(spellId, spared),
      duration: { kind: "encounter" },
    },
  ]);
  if (!zone) throw new Error(`no zone for ${spellId}`);
  return zone;
}

const withGrants = (grants: Grant[], exhaustion = 0): CharacterDoc => {
  const feature: CustomFeature = {
    custom: true,
    title: "Homebrew",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    grants,
    instanceId: customInstanceId("conformance"),
  };
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      features: [...MOCK_CHARACTER.character.features, feature],
    },
    session: { ...MOCK_CHARACTER.session, conditions: [], exhaustion },
  };
};

/** A turn with a 30-ft walk and a Bonus Action Dash on offer. */
const projection = (speedFt = 30, costPerFoot = 1): TurnEconomyProjection => ({
  actions: { extraSlots: [], override: null },
  attacks: { options: [], perAttackAction: { base: 1, override: null } },
  bonusActions: {
    dualWielder: false,
    limit: { base: 1, override: null },
    requirements: [{ actionKind: "dash", requirementId: "feature.bonus-dash" }],
  },
  freeInteractions: { limit: { base: 1, override: null } },
  incapacitated: false,
  movement: {
    costPerFoot: {
      base: 1,
      override:
        costPerFoot === 1 ? null : { reasonId: "movement.terrain", value: costPerFoot },
    },
    modes: [{ mode: "walk", speedFt: { base: speedFt, override: null } }],
    requirements: [],
  },
  reactions: { limit: { base: 1, override: null }, requirements: [] },
});

const start = (): Readonly<TurnEconomyState> => {
  const state = createTurnEconomyState("turn.1");
  if (!state) throw new Error("turn state must conform");
  return state;
};

const step = (
  state: Readonly<TurnEconomyState>,
  caps: TurnEconomyProjection,
  command: TurnEconomyCommand
): Readonly<TurnEconomyState> | null => {
  const result = reduceTurnEconomy(state, caps, command);
  return result.status === "planned" ? result.after : null;
};

const must = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
};

const move = (claimId: string, distanceFt: number): TurnEconomyCommand => ({
  claimId,
  distanceFt,
  kind: "move",
  mode: "walk",
});

const dash: TurnEconomyCommand = {
  action: { kind: "dash" },
  claimId: "action.dash",
  kind: "claim-action",
};

const bonusDash: TurnEconomyCommand = {
  bonusAction: { kind: "action", requirementId: "feature.bonus-dash" },
  claimId: "bonus.dash",
  kind: "claim-bonus-action",
};

const featureJson = (id: string): string => JSON.stringify(getSrdFeatureSource(id));

describe("conformance · 11. movement and mounts", () => {
  rule(
    {
      category: 11,
      case: "Speed changes cover every speed",
      source: "GLOSS",
      status: "works",
    },
    () => {
      const fresh = deriveCharacter(withGrants([{ type: "fly-speed", amount: 40 }]));
      const tired = deriveCharacter(withGrants([{ type: "fly-speed", amount: 40 }], 2));
      expect(tired.walkingSpeedFt).toBe(fresh.walkingSpeedFt - 10);
      // Exhaustion's −10 ft lands on the fly speed too.
      expect(tired.speeds.find((s) => s.kind === "fly")?.rangeFt).toBe(30);
    }
  );

  rule(
    {
      category: 11,
      case: "Difficult terrain doesn't stack",
      source: "GLOSS",
      status: "works",
    },
    () => {
      // Two sources of difficult terrain still cost ×2.
      expect(DIFFICULT_TERRAIN_COST_PER_FOOT).toBe(2);
      expect(spendMovement(0, 10, DIFFICULT_TERRAIN_COST_PER_FOOT, 30)).toBe(20);
      // Crawling in difficult terrain adds its own foot: ×3.
      const crawl = must(step(start(), projection(30, 3), move("move.crawl", 10)));
      expect(crawl.movement[0]?.costFt).toBe(30);
      expect(step(crawl, projection(30, 3), move("move.more", 5))).toBeNull();
    }
  );

  rule(
    {
      category: 11,
      case: "Jumping 2024",
      source: "GLOSS; WIKI monk:main",
      status: "M14",
    },
    () => {
      // STR 15: long jump 15 ft, high jump 3 + 2 = 5 ft (with a run-up).
      const doc = makeCharacterDoc({
        abilityScores: { STR: 15, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      });
      const agg = aggregateCharacterGrants(doc.character, doc.session);
      expect(deriveJumps(doc.character.abilityScores, agg)).toMatchObject({
        long: 15,
        high: 5,
      });
      // Step of the Wind doubles the jump distance for the turn.
      expect(featureJson("monk-step-of-the-wind")).toContain("jump");
    }
  );

  rule(
    {
      category: 11,
      case: "Teleportation",
      source: "GLOSS; WIKI druid:moon",
      status: "works",
    },
    () => {
      // Casting a teleport spell spends no movement: only marked feet are spent.
      const cast = must(
        step(start(), projection(), {
          action: { kind: "magic" },
          claimId: "action.misty-step",
          kind: "claim-action",
        })
      );
      expect(cast.movement).toEqual([]);
      expect(step(cast, projection(), move("move.after", 30))).not.toBeNull();
    }
  );

  rule(
    {
      category: 11,
      case: "Forced movement",
      source: "SAC; KIBBLES #17",
      status: "works",
    },
    () => {
      // Pushed into Spike Growth on someone else's turn: the area still counts it.
      const spikes = zoneOf("spike-growth", 2);
      expect(
        zoneTriggers(spikes, {
          kind: "move-within",
          creatureId: "orc",
          turn: { round: 1, combatantId: "druid" },
          forced: true,
        }).fires
      ).toBe(true);
    }
  );

  rule(
    {
      category: 11,
      case: "Dragging a grappled creature",
      source: "GLOSS; KIBBLES #15",
      status: "works",
    },
    () => {
      expect(CONDITION_RULES.grappled.requirements).toContainEqual({
        exemption: "subject-tiny-or-two-plus-sizes-smaller",
        extraMovementCostPerFoot: 1,
        kind: "source-moves-grappled-subject",
      });
      // The grappler pays ×2, with no half-speed cap.
      expect(spendMovement(0, 15, 2, 30)).toBe(30);
    }
  );

  rule({ category: 11, case: "Dash twice", source: "SAC #19", status: "works" }, () => {
    let turn = must(step(start(), projection(), dash));
    turn = must(step(turn, projection(), bonusDash));
    // Speed 30, two Dashes: 90 ft.
    turn = must(step(turn, projection(), move("move.1", 90)));
    expect(step(turn, projection(), move("move.2", 5))).toBeNull();
    // At speed 0 Dash adds nothing.
    const still = must(step(start(), projection(0), dash));
    expect(step(still, projection(0), move("move.0", 5))).toBeNull();
  });

  rule(
    { category: 11, case: "Flying and prone", source: "GLOSS; SAC #16", status: "M14" },
    () => {
      // A flyer without Hover falls when knocked Prone.
      expect(JSON.stringify(CONDITION_RULES.prone)).toContain("hover");
    }
  );

  rule(
    { category: 11, case: "Falling", source: "GLOSS; WIKI monk:main", status: "works" },
    () => {
      expect(fallDamageDice(25, "ft")).toBe(2);
      expect(fallDamageDice(500, "ft")).toBe(20);
      expect(fallLandsProne(0)).toBe(false);
      expect(fallLandsProne(3)).toBe(true);
      // Slow Fall reduces falling (Bludgeoning) damage by 5 × Monk level.
      for (const level of [4, 9, 20]) {
        const monk = makeCharacterDoc({
          classId: "monk",
          level,
          features: [{ srdId: "monk-slow-fall" }],
        });
        const slowFall = resolveActions(monk, "combat").find((a) =>
          a.id.startsWith("monk-slow-fall")
        );
        expect(slowFall?.summary.damageReduction).toMatchObject({
          bonus: 5 * level,
          damageTypes: ["bludgeoning"],
        });
      }
    }
  );

  rule(
    {
      category: 11,
      case: "Controlled mount",
      source: "DDB; BLACKCITADEL",
      status: "works",
    },
    () => {
      const link = { mountId: "monster-1", riderId: "monster-2", controlled: true };
      expect(mountedTurnOrder(["monster-1", "goblin", "monster-2"], [link])).toEqual([
        "goblin",
        "monster-2",
        "monster-1",
      ]);
      const encounter = addMonster(
        {
          combatants: [],
          nextMonsterOrdinal: 1,
          round: 1,
          currentCombatantId: null,
          epoch: 1,
          status: "active",
        },
        { name: "Horse", ac: 11, maxHp: 13, count: 2, initiative: 10, xp: 50 }
      );
      const state = { ...encounter, mounts: [link] };
      expect(mountActionOptions(state, "monster-1")).toEqual(MOUNT_CONTROLLED_ACTIONS);
      expect([...MOUNT_CONTROLLED_ACTIONS]).toEqual(["dash", "disengage", "dodge"]);
      // An intelligent (uncontrolled) mount acts on its own.
      const free = { ...state, mounts: [{ ...link, controlled: false }] };
      expect(mountActionOptions(free, "monster-1")).toBeNull();
    }
  );

  rule(
    {
      category: 11,
      case: "Moving through other creatures' spaces",
      source: "SAC #17; DDB",
      status: "works",
    },
    () => {
      // Spaces are the map's (Owlbear): the meter prices feet, not squares.
      expect(spendMovement(0, 10, 1, 30)).toBe(10);
      expect(spendMovement(0, 10, 2, 30)).toBe(20);
    }
  );

  rule(
    {
      category: 11,
      case: "Damage doesn't stop movement",
      source: "SAC #23",
      status: "works",
    },
    () => {
      const doc = withGrants([]);
      let turn = must(step(start(), projection(), move("move.1", 15)));
      // A hit lands mid-move: no speed-zero condition, movement keeps going.
      const hit = must(takeDamage(doc, 5));
      expect(hit.session.conditions).toEqual([]);
      turn = must(step(turn, projection(), move("move.2", 15)));
      expect(turn.movement).toHaveLength(2);
    }
  );

  rule(
    {
      category: 11,
      case: "Moving the summoned pack",
      source: "WIKI spell:conjure-animals",
      status: "works",
    },
    () => {
      // Moving the pack onto a creature counts as it entering, once per turn.
      const pack = zoneOf("conjure-animals", 3);
      const first = zoneTriggers(pack, {
        kind: "moved-onto",
        creatureId: "orc",
        turn: { round: 2, combatantId: "druid" },
      });
      expect(first.fires).toBe(true);
      expect(
        zoneTriggers(
          pack,
          {
            kind: "end-turn",
            creatureId: "orc",
            turn: { round: 2, combatantId: "druid" },
          },
          first.fires ? first.ledger : {}
        ).fires
      ).toBe(false);
    }
  );

  rule(
    {
      category: 11,
      case: "Movement before and after attacks",
      source: "WIKI barbarian:main; WIKI fighter:main",
      status: "M14",
    },
    () => {
      // Half speed attached to entering Rage / using Second Wind.
      expect(featureJson("barbarian-instinctive-pounce")).toContain("self-move");
      expect(featureJson("fighter-tactical-shift")).toContain("self-move");
    }
  );

  rule(
    {
      category: 11,
      case: "Travel pace isn't used in combat",
      source: "SAC #18",
      status: "works",
    },
    () => {
      // Travel pace is exploration reference (per minute/hour/day), never turn feet.
      const normal = TRAVEL_PACE_REFERENCE.find((p) => p.id === "normal");
      expect(normal).toMatchObject({ perMinuteFt: 300, perHourMiles: 3 });
      expect(projection().movement.modes[0].speedFt.base).toBe(30);
    }
  );
});
