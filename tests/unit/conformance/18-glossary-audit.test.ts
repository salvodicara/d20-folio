/** Conformance, category 18: the rules glossary audit (corpus.md § 18). */
import { describe, expect } from "vitest";
import { localizeSrd } from "@/i18n/resolver";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { MOCK_CHARACTER } from "@/lib/mock";
import { resolveActions } from "@/lib/smart-tracker";
import { buildMasteryRiders } from "@/lib/views/mastery-rider-view";
import type { CharacterDoc } from "@/types/character";
import { masteryHitEffects } from "@/lib/play/mastery-hit-effects";
import { monsterTurnModifiers } from "@/lib/play/monster-turn-modifiers";
import type { CombatEffectOp } from "@/types/combat-effect";
import { rule } from "./rule";

const lyra = (session: Partial<CharacterDoc["session"]> = {}): CharacterDoc => ({
  ...MOCK_CHARACTER,
  session: { ...MOCK_CHARACTER.session, conditions: [], ...session },
});

let effectN = 0;
/** One hit by a fighter's weapon with `mastery` on orc-1, as encounter ops. */
const masteryHit = (mastery: string): CombatEffectOp[] =>
  masteryHitEffects({
    masteries: [mastery],
    actionId: "weapon",
    actor: { kind: "pc", combatantId: "pc-ana", memberUid: "ana", characterId: "c1" },
    target: { kind: "monster", combatantId: "orc-1" },
    round: 1,
    effectId: () => `m${++effectN}`,
  }).map((effect) => ({ id: `op-${effect.id}`, kind: "apply" as const, effect }));

describe("18. Rules glossary audit", () => {
  rule(
    {
      category: 18,
      case: "Grapple and Shove: the target picks the save",
      source: "GLOSS Unarmed Strike",
      status: "M21",
    },
    () => {
      for (const id of ["base-grapple", "base-shove"]) {
        const card = resolveActions(lyra()).find((row) => row.id === id);
        // Read loosely: the field arrives with the fix.
        expect(Reflect.get(card?.summary ?? {}, "saveAbilities")).toEqual(["STR", "DEX"]);
      }
    }
  );

  rule(
    {
      category: 18,
      case: "Sap gives the target Disadvantage",
      source: "GLOSS Weapon Mastery",
      status: "works",
    },
    () => {
      const [sap] = buildMasteryRiders({ weaponMastery: "sap" }, "en");
      expect(sap?.apply).toBe("target-attack-disadvantage");
      // A Sap hit leaves the monster's next attack at Disadvantage.
      expect(monsterTurnModifiers(masteryHit("sap"), "orc-1").attack).toBe(
        "disadvantage"
      );
    }
  );

  rule(
    {
      category: 18,
      case: "Slow lowers the target's Speed",
      source: "GLOSS Weapon Mastery",
      status: "works",
    },
    () => {
      const [slow] = buildMasteryRiders({ weaponMastery: "slow" }, "en");
      expect(slow?.apply).toBe("target-speed-loss");
      // Two Slow hits: still only −10 ft.
      const twice = [...masteryHit("slow"), ...masteryHit("slow")];
      expect(monsterTurnModifiers(twice, "orc-1").speedDeltaFt).toBe(-10);
    }
  );

  rule(
    {
      category: 18,
      case: "Travel pace effects are rolls, not penalties",
      source: "SRD 5.2.1 Travel Pace",
      status: "M21",
    },
    () => {
      const effect = (pace: string) =>
        localizeSrd("rule", `travel-pace.${pace}`, "effect", "en");
      expect(effect("fast")).toMatch(/Disadvantage.*Perception.*Survival/);
      expect(effect("normal")).toMatch(/Disadvantage.*Stealth/);
      expect(effect("slow")).toMatch(/Advantage.*Perception.*Survival/);
    }
  );

  rule(
    {
      category: 18,
      case: "Dodge ends on Incapacitated or Speed 0",
      source: "GLOSS Dodge",
      status: "M21",
    },
    () => {
      const dodging = (conditions: string[]) => {
        const doc = lyra({ activeFeatures: ["base-dodge"], conditions });
        return aggregateCharacterGrants(
          doc.character,
          doc.session
        ).incomingAttackDisadvantages.filter((c) => c.sourceId === "base-dodge").length;
      };
      expect(dodging([])).toBe(1);
      expect(dodging(["incapacitated"])).toBe(0);
      // Grappled sets Speed to 0.
      expect(dodging(["grappled"])).toBe(0);
    }
  );

  rule(
    {
      category: 18,
      case: "Petrified means immune to Poisoned",
      source: "GLOSS Petrified",
      status: "M21",
    },
    () => {
      const on = effectiveSessionConditions(
        lyra({ conditions: ["petrified", "poisoned"] }).session
      );
      expect(on).toContain("petrified");
      expect(on).not.toContain("poisoned");
    }
  );
});
