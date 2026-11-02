/** Conformance, category 9: conditions and exhaustion (corpus.md § 9). */
import { describe, expect } from "vitest";
import { getSpellById } from "@/data/spells";
import { deathSaveD20Context } from "@/lib/character-d20-tests";
import { diedOfExhaustion } from "@/lib/character-status";
import {
  concentrationEffectIdsOwnedBy,
  effectIdsEndingOnAct,
  foldCombatEffectOps,
} from "@/lib/combat-effects";
import {
  exhaustionPenalty,
  exhaustionSpeedReductionFt,
  unarmedStrikeSaveDc,
} from "@/lib/compute";
import { CONDITION_RULES, withImpliedConditions } from "@/lib/condition";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { projectedEncounterConditions } from "@/lib/effective-conditions";
import type { Grant } from "@/lib/grants";
import { MOCK_CHARACTER } from "@/lib/mock";
import { attacksAgainstSelf } from "@/lib/play/attacks-against";
import { removeCondition } from "@/lib/play/conditions";
import { escapeGrappleSkill, judgeEscapeGrapple } from "@/lib/play/escape-grapple";
import { endStatesOnAct } from "@/lib/play/states";
import { setExhaustion } from "@/lib/play/vitals";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterDoc, CustomFeature, SessionState } from "@/types/character";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import { customInstanceId } from "../__helpers__/custom-items";
import { rule } from "./rule";

const withSession = (session: Partial<SessionState>): CharacterDoc => ({
  ...MOCK_CHARACTER,
  session: { ...MOCK_CHARACTER.session, ...session },
});

const withGrants = (
  grants: Grant[],
  session: Partial<SessionState> = {}
): CharacterDoc => {
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
  const doc = withSession(session);
  return {
    ...doc,
    character: { ...doc.character, features: [...doc.character.features, feature] },
  };
};

const creature = (id: string) => ({ kind: "monster" as const, combatantId: id });

const conditionEffect = (
  id: string,
  actor: string,
  conditionId: string,
  duration: ActiveCombatEffect["duration"] = { kind: "encounter" }
): CombatEffectOp => ({
  id: `op-${id}`,
  kind: "apply",
  effect: {
    id,
    actor: creature(actor),
    target: creature("lyra"),
    source: { kind: "feature", id: `${actor}-source`, actionId: `${actor}-action` },
    payload: { kind: "condition", conditionId },
    duration,
  },
});

describe("conformance · 9. conditions and exhaustion", () => {
  rule({ category: 9, case: "2024 exhaustion", source: "GLOSS", status: "works" }, () => {
    expect(exhaustionPenalty(3)).toBe(-6);
    expect(exhaustionSpeedReductionFt(3)).toBe(15);
    expect(diedOfExhaustion({ exhaustion: 6 })).toBe(true);
    const fresh = deriveCharacter(MOCK_CHARACTER);
    const tired = deriveCharacter(withSession({ exhaustion: 2 }));
    // Every d20 Test drops by 4 (saves, initiative); Speed by 10 ft.
    expect(tired.saves.map((s) => s.bonus)).toEqual(fresh.saves.map((s) => s.bonus - 4));
    expect(tired.initiativeBonus).toBe(fresh.initiativeBonus - 4);
    expect(tired.walkingSpeedFt).toBe(fresh.walkingSpeedFt - 10);
    // Death saves are d20 Tests too.
    expect(
      deathSaveD20Context(withSession({ exhaustion: 2 })).modifierTerms
    ).toContainEqual(expect.objectContaining({ kind: "exhaustion", value: -4 }));
    // Spell save DCs don't move.
    expect(tired.spellcasting?.saveDc).toBe(fresh.spellcasting?.saveDc);
  });

  rule(
    { category: 9, case: "Exhaustion immunity", source: "FVTT#7492", status: "M3" },
    () => {
      const immune = withGrants([
        { type: "condition-immunity", condition: "exhaustion" },
      ]);
      // An immune creature gains no Exhaustion level.
      expect(setExhaustion(immune, 1)).toBeNull();
    }
  );

  rule(
    {
      category: 9,
      case: "Invisible is relative to the observer",
      source: "GLOSS",
      status: "data",
    },
    () => {
      expect(attacksAgainstSelf("invisible")).toContainEqual({
        kind: "unseen",
        mode: "disadvantage",
      });
      // Advantage on Initiative, in the production gate table.
      expect(resolveConditionEffects(["invisible"]).advantages).toContainEqual(
        expect.objectContaining({ rollType: "initiative" })
      );
    }
  );

  rule(
    {
      category: 9,
      case: 'Hide grants Invisible "while hidden"',
      source: "ERRATA; FVTT#7397",
      status: "M3",
    },
    () => {
      const hidden = withSession({ conditions: ["invisible"], hiddenDc: 17 });
      // Making an attack roll ends the Hide-granted invisibility.
      const after = endStatesOnAct(hidden, "attack-roll");
      expect(after).not.toBeNull();
      expect(after?.session.conditions).not.toContain("invisible");
    }
  );

  rule(
    { category: 9, case: 'What counts as "found"', source: "ENWORLD", status: "works" },
    () => {
      // Disputed: the table rules it. Removing the chip also forgets the find DC.
      const hidden = withSession({ conditions: ["invisible"], hiddenDc: 17 });
      const found = removeCondition(hidden, "invisible");
      expect(found?.session.conditions).not.toContain("invisible");
      expect(found?.session.hiddenDc).toBeUndefined();
    }
  );

  rule(
    {
      category: 9,
      case: "Blindsight and Truesight reveal hidden creatures",
      source: "SAC #4",
      status: "M3",
    },
    () => {
      const potion = "potion:potion-of-invisibility";
      const both = withSession({
        conditions: ["invisible"],
        hiddenDc: 15,
        activeFeatures: [potion],
      });
      // Ending the Hide-granted Invisible leaves the potion's Invisible.
      const revealed = removeCondition(both, "invisible");
      expect(revealed?.session.activeFeatures).toContain(potion);
    }
  );

  rule({ category: 9, case: "Incapacitated", source: "GLOSS", status: "data" }, () => {
    const gate = resolveConditionEffects(["incapacitated"]);
    expect([...gate.blockedSlots].sort()).toEqual(["action", "bonus", "reaction"]);
    expect(gate.breaksConcentration).toBe(true);
    expect(JSON.stringify(getSrdFeatureSource("barbarian-rage"))).toContain(
      '"incapacitated"'
    );
    // Disadvantage on Initiative, in the production gate table.
    expect(gate.disadvantages).toContainEqual(
      expect.objectContaining({ rollType: "initiative" })
    );
  });

  rule({ category: 9, case: "Unconscious", source: "GLOSS", status: "works" }, () => {
    expect(withImpliedConditions(["unconscious"])).toEqual(
      expect.arrayContaining(["unconscious", "incapacitated", "prone"])
    );
    expect([...resolveConditionEffects(["unconscious"]).autoFailSaves].sort()).toEqual([
      "DEX",
      "STR",
    ]);
    const against = attacksAgainstSelf("unconscious");
    expect(against).toContainEqual({ kind: "roll", mode: "advantage" });
    expect(against).toContainEqual({ kind: "autoCrit", distanceFt: 5 });
  });

  rule(
    { category: 9, case: "Stunned can move", source: "SAC #5", status: "works" },
    () => {
      expect(resolveConditionEffects(["stunned"]).speedZero).toBe(false);
      expect(resolveConditionEffects(["paralyzed"]).speedZero).toBe(true);
    }
  );

  rule(
    { category: 9, case: "Grappled 2024", source: "GLOSS; SAC #31", status: "M3" },
    () => {
      const gate = resolveConditionEffects(["grappled"]);
      expect(gate.speedZero).toBe(true);
      expect(gate.disadvantages).toContainEqual(
        expect.objectContaining({ rollType: "attack", vs: "grappled" })
      );
      // The grapple ends when the grappler is Incapacitated (the only
      // actor-incapacitated sweep today covers concentration effects).
      const ops = [conditionEffect("grapple", "ogre", "grappled")];
      expect(concentrationEffectIdsOwnedBy(ops, "ogre")).toContain("grapple");
    }
  );

  rule(
    {
      category: 9,
      case: "Grapple's escape DC",
      source: "RPGBOT; WIKI monk:main",
      status: "works",
    },
    () => {
      // 8 + STR mod (+3 at 16) + PB (+3 at level 5).
      expect(unarmedStrikeSaveDc(16, 5)).toBe(14);
      expect(escapeGrappleSkill((s) => (s === "acrobatics" ? 6 : 2)).skill).toBe(
        "acrobatics"
      );
      expect(judgeEscapeGrapple(10, 4, 14)).toEqual({ total: 14, escaped: true });
      expect(judgeEscapeGrapple(9, 4, 14).escaped).toBe(false);
    }
  );

  rule(
    { category: 9, case: "Grappled + Prone", source: "GLOSS; SAC #33", status: "works" },
    () => {
      expect(CONDITION_RULES.prone.requirements).toContainEqual(
        expect.objectContaining({
          kind: "prone-movement",
          standCost: "half-speed-round-down",
          standBlockedAtSpeedZero: true,
        })
      );
      // Grappled zeroes Speed, so the prone creature can't stand.
      expect(resolveConditionEffects(["grappled", "prone"]).speedZero).toBe(true);
    }
  );

  rule(
    { category: 9, case: "Prone ranged vs melee", source: "GLOSS", status: "works" },
    () => {
      expect(attacksAgainstSelf("prone")).toContainEqual({
        kind: "range",
        thresholdFt: 5,
        within: "advantage",
        beyond: "disadvantage",
      });
      expect(resolveConditionEffects(["prone"]).disadvantages).toContainEqual(
        expect.objectContaining({ rollType: "attack" })
      );
    }
  );

  rule(
    {
      category: 9,
      case: "Frightened needs line of sight",
      source: "SAC #12; SAC #127",
      status: "M3",
    },
    () => {
      // Immune to Frightened (Heroism) while the condition is on: suppressed.
      const doc = withGrants([{ type: "condition-immunity", condition: "frightened" }], {
        conditions: ["frightened"],
      });
      expect(deriveCharacter(doc).conditionImmunities.has("frightened")).toBe(true);
      expect(deriveCharacter(doc).conditions).not.toContain("frightened");
    }
  );

  rule(
    {
      category: 9,
      case: "A condition doesn't stack with itself, but each source keeps its own duration",
      source: "GLOSS",
      status: "works",
    },
    () => {
      const ops: CombatEffectOp[] = [
        conditionEffect("fear-a", "dragon", "frightened"),
        conditionEffect("fear-b", "lich", "frightened", {
          kind: "turn-boundary",
          combatantId: "lich",
          round: 3,
          phase: "turn-end",
        }),
      ];
      expect(
        foldCombatEffectOps(ops)
          .map((e) => e.id)
          .sort()
      ).toEqual(["fear-a", "fear-b"]);
      const revoked: CombatEffectOp[] = [
        ...ops,
        {
          id: "op-r",
          kind: "revoke",
          effectId: "fear-a",
          actorId: "dragon",
          targetId: "lyra",
        },
      ];
      expect(projectedEncounterConditions(foldCombatEffectOps(revoked))).toEqual([
        "frightened",
      ]);
    }
  );

  rule(
    { category: 9, case: "Rogue Knock Out", source: "WIKI rogue:main", status: "M3" },
    () => {
      const source = getSrdFeatureSource("rogue-devious-strikes");
      const grants = source && "grants" in source ? (source.grants ?? []) : [];
      const knockOut = grants.find(
        (g) => g.type === "cunning-strike-option" && g.optionId === "knock-out"
      );
      expect(knockOut).toBeDefined();
      // 1 minute, ends on damage, repeat save at the end of each of its turns.
      const text = JSON.stringify(knockOut);
      expect(text).toContain("target-damaged");
      expect(text).toContain("repeat-save");
    }
  );

  rule(
    { category: 9, case: "Abjure Foes", source: "WIKI paladin:main", status: "M3" },
    () => {
      const abjure = getSrdFeatureSource("paladin-abjure-foes");
      expect(abjure).toBeDefined();
      // Frightened, ending on damage, limiting the turn to one of move/action/bonus.
      const text = JSON.stringify(abjure);
      expect(text).toContain('"frightened"');
      expect(text).toContain("target-damaged");
    }
  );

  rule(
    { category: 9, case: "Sanctuary breaking", source: "SAC #139", status: "works" },
    () => {
      expect(JSON.stringify(getSpellById("sanctuary")?.grants)).toContain(
        '"endsEarlyOn":["attack-roll","cast-spell","deal-damage"]'
      );
      const op: CombatEffectOp = {
        id: "op-s",
        kind: "apply",
        effect: {
          id: "sanct",
          actor: creature("cleric"),
          target: creature("lyra"),
          source: { kind: "spell", id: "sanctuary", actionId: "spell-sanctuary" },
          payload: { kind: "grant-group", activeKey: "spell-sanctuary" },
          duration: { kind: "encounter" },
        },
      };
      expect(effectIdsEndingOnAct([op], "lyra", "attack-roll")).toEqual(["sanct"]);
      // A grapple or a shove isn't one of the acts.
      expect(effectIdsEndingOnAct([op], "lyra", "grapple")).toEqual([]);
    }
  );
});
