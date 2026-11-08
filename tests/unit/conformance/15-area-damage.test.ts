/** Conformance, category 15: multi-target and area damage (corpus.md § 15). */
import { describe, expect } from "vitest";
import { resolveActions, masteryNumbers, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction, localizeActions } from "@/lib/views/combat-action-view";
import { NO_DEFENSES, type DamageDefenses } from "@/lib/damage-intake";
import {
  resolveCombatDamagePackets,
  type CombatDamagePartSpec,
} from "@/lib/combat-resolution";
import {
  damageTrayPlan,
  initialTrayRow,
  rowAmount,
  rowAmountByType,
  rowConditions,
  setAttackOutcome,
  setMultiplier,
  toggleCondition,
  toggleSaved,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { sessionToCombatState } from "@/lib/combat-state";
import { concentrationValue } from "@/lib/concentration";
import { peerDamageState } from "@/lib/play/peer-damage";
import type { CharacterDoc, SessionState } from "@/types/character";
import { COVER_STATES } from "@/lib/cover-states";
import { spells } from "@/data/spells";
import { classFeatures } from "@/data/classes";
import { SRD_WEAPONS } from "@/data/weapons";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { DamageType } from "@/types/damage";
import { makeCharacterDoc } from "../_helpers";
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

/** The zone runtime (edge-case M9), which lands with the engine's family. Until
 *  then the data alone doesn't make these cases work. */
async function zoneRuntime(): Promise<Record<string, unknown>> {
  const id = "@/lib/zones";
  return (await import(/* @vite-ignore */ id)) as Record<string, unknown>;
}

const ME = "pc-me";
const FOES = ["monster-1", "monster-2"];

const wizard = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 9 }],
  spells: ["fireball", "magic-missile", "scorching-ray"].map((srdId) => ({ srdId })),
});
const spellbook = resolveActions(wizard, "spellbook").map((row) =>
  localizeAction(row, "en")
);
function action(id: string): ResolvedAction {
  const found = spellbook.find((a) => a.id === id);
  if (!found) throw new Error(`no action ${id}`);
  return found;
}
function plan(a: ResolvedAction, targets: string[]): DamageTrayPlan {
  const found = damageTrayPlan(a, targets, ME);
  if (!found) throw new Error(`no tray for ${a.id}`);
  return found;
}
function defenses(res: DamageType[] = []): DamageDefenses {
  return { ...NO_DEFENSES, resistances: new Set(res) };
}
/** A DEX save-for-half area (Fireball's shape), as the tray plans it. */
const AREA: DamageTrayPlan = {
  effect: "damage",
  damageType: "fire",
  save: { ability: "DEX", dc: 15, onSave: "half" },
  targets: FOES,
};
/** A PC the DM's area spell reaches (the peer write path). */
/** Someone else's hit on the PC, through the PC's own damage rule (edge-case M1). */
const peerHit = (
  current: number,
  amount: number,
  session: Partial<SessionState> = {}
) => {
  const doc: CharacterDoc = {
    ...MOCK_CHARACTER,
    session: {
      ...MOCK_CHARACTER.session,
      hp: { current, temp: 0 },
      conditions: [],
      deathSucc: 0,
      deathFail: 0,
      ...session,
    },
  };
  return peerDamageState(doc, sessionToCombatState(doc.session), amount);
};

describe("conformance · 15. multi-target and area damage", () => {
  rule(
    {
      category: 15,
      case: "One damage roll, many saves",
      source: "rpgbot 2024 transition guide",
      status: "works",
    },
    () => {
      // One rolled 20, each target's own save: full for the failure, half for the success.
      const failed = initialTrayRow(AREA, "monster-1");
      const saved = toggleSaved(initialTrayRow(AREA, "monster-2"), AREA);
      expect(rowAmount(20, failed, AREA)).toBe(20);
      expect(rowAmount(20, saved, AREA)).toBe(10);
    }
  );

  rule(
    {
      category: 15,
      case: "Resistance per target",
      source: "SAC #36; WIKI feat:elemental-adept",
      status: "works",
    },
    () => {
      // A fire + radiant smite (two types, so no single plan type): 10 fire + 10 radiant
      // against a fire-resistant target is 5 + 10 = 15; a plain target takes 20.
      const mixed: DamageTrayPlan = {
        effect: "damage",
        damageTypes: ["fire", "radiant"],
        targets: FOES,
      };
      const resistant = initialTrayRow(mixed, "monster-1", defenses(["fire"]));
      const plain = initialTrayRow(mixed, "monster-2");
      expect(rowAmountByType({ fire: 10, radiant: 10 }, plain, mixed)).toBe(20);
      expect(rowAmountByType({ fire: 10, radiant: 10 }, resistant, mixed)).toBe(15);
    }
  );

  rule(
    {
      category: 15,
      case: "Evasion",
      source: "WIKI rogue:main; SAC #60",
      status: "works",
    },
    () => {
      // The rogue's own Evasion: a saved DEX half-damage area deals 0, a failed one half.
      const evasive: DamageDefenses = {
        ...NO_DEFENSES,
        saveDamageRules: [
          {
            id: "rogue-evasion",
            ability: "DEX",
            requiresDamageOnSuccess: "half",
            onSuccess: "none",
            onFailure: "half",
          },
        ],
      };
      const row = initialTrayRow(AREA, "pc-rogue", evasive);
      expect(rowAmount(20, row, AREA)).toBe(10);
      expect(rowAmount(20, toggleSaved(row, AREA), AREA)).toBe(0);
    }
  );

  rule(
    {
      category: 15,
      case: "Careful Spell and Sculpt-style protection",
      source: "dungeonmister metamagic 2024",
      status: "works",
    },
    () => {
      // The protected ally's row is set to ×0: no damage whatever the roll.
      const ally = setMultiplier(initialTrayRow(AREA, "pc-ally"), "0");
      expect(rowAmount(28, ally, AREA)).toBe(0);
      expect(rowAmount(28, initialTrayRow(AREA, "monster-1"), AREA)).toBe(28);
    }
  );

  rule(
    { category: 15, case: "Allies inside the area", source: "SAC #91", status: "works" },
    () => {
      // Friendly fire drops the ally to 0: their own rules make them Unconscious.
      const after = peerHit(10, 24);
      expect(after.hp.current).toBe(0);
      expect(after.conditions).toContain("unconscious");
    }
  );

  rule(
    {
      category: 15,
      case: "Area shapes and the origin",
      source: "GLOSS",
      status: "works",
    },
    () => {
      // Target picking is the table's: an area spell takes every picked creature, one
      // shared total, never a per-target split.
      const p = plan(action("spell-fireball"), [...FOES, ME]);
      expect(p.targets).toEqual([...FOES, ME]);
      expect(p.perTarget).toBeUndefined();
      expect(spells.find((s) => s.id === "fireball")?.area).toBe(true);
    }
  );

  rule(
    { category: 15, case: "Cover in areas", source: "GLOSS; SAC #34", status: "works" },
    () => {
      // Half and three-quarters cover add to AC and to DEX saves alike.
      const bonus = (level: string) =>
        COVER_STATES.find((c) => c.level === level)?.grant.grants ?? [];
      expect(bonus("half")).toEqual([
        { type: "ac-bonus", amount: 2 },
        { type: "save-bonus", amount: 2, appliesToSave: "DEX" },
      ]);
      expect(bonus("three-quarters")).toEqual([
        { type: "ac-bonus", amount: 5 },
        { type: "save-bonus", amount: 5, appliesToSave: "DEX" },
      ]);
    }
  );

  rule(
    {
      category: 15,
      case: "Multi-ray spells resolve one at a time",
      source: "SAC #97",
      status: "works",
    },
    () => {
      const p = plan(action("spell-scorching-ray"), FOES);
      expect(p.perTarget).toBe(true);
      const hit = initialTrayRow(p, "monster-1");
      const miss = setAttackOutcome(initialTrayRow(p, "monster-2"), "miss", p);
      expect(rowAmount(7, hit, p)).toBe(7);
      expect(rowAmount(9, miss, p)).toBe(0);
      // Each ray is its own packet: defenses resolve per instance.
      const spec = { resolution: "attack" } as CombatDamagePartSpec;
      const packets = resolveCombatDamagePackets(
        [
          { spec, amount: 7, damageType: "fire", instance: 0 },
          { spec, amount: 5, damageType: "fire", instance: 1 },
        ],
        { attack: "hit", save: "failed-save" },
        "half",
        defenses(["fire"])
      );
      expect(packets.map((p) => p.netTotal)).toEqual([3, 2]);
    }
  );

  rule(
    {
      category: 15,
      case: "Per-spell bonuses vs per-ray bonuses",
      source: "SAC #63; SAC #64",
      status: "works",
    },
    () => {
      // Elemental Affinity adds CHA to ONE damage roll of the spell, not to every ray:
      // Scorching Ray's rays stay 2d6 each, and the +3 is a one-roll bonus.
      const sorcerer = makeCharacterDoc(
        {
          classId: "sorcerer",
          subclassId: "draconic-sorcery",
          level: 6,
          abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
          spells: [{ srdId: "scorching-ray", prepared: true }],
          features: [{ srdId: "sorcerer-draconic-sorcery-elemental-affinity" }],
        },
        { grantBundleChoices: { "sorcerer-draconic-elemental-affinity": "fire" } }
      );
      const ray = resolveActions(sorcerer).find((a) => a.id === "spell-scorching-ray");
      expect(ray?.summary.oneRollDamageBonus).toBe(3);
      expect(ray?.summary.damage).toBe("2d6");
    }
  );

  rule(
    {
      category: 15,
      case: "Magic Missile splitting",
      source: "WIKI spell:shield; SAC #49",
      status: "works",
    },
    () => {
      // Darts split across two targets: each row carries its own total.
      const p = plan(action("spell-magic-missile"), FOES);
      expect(p.perTarget).toBe(true);
      expect(
        plan(action("spell-magic-missile"), ["monster-1"]).perTarget
      ).toBeUndefined();
    }
  );

  rule(
    {
      category: 15,
      case: "Uncanny Dodge doesn't work on areas",
      source: "SAC #59",
      status: "works",
    },
    () => {
      const dodge = classFeatures.find((f) => f.id === "rogue-uncanny-dodge");
      expect(dodge?.mechanics?.actions?.[0]).toMatchObject({
        type: "reaction",
        trigger: "hitByAttack",
      });
    }
  );

  rule(
    {
      category: 15,
      case: "Guardian of Faith counts damage dealt",
      source: "SAC #125",
      status: "works",
    },
    async () => {
      // The guardian vanishes after dealing 60 total damage: the damage targets
      // actually take (after resistance), not the rolled total.
      const guardian = spells.find((s) => s.id === "guardian-of-faith");
      expect(guardian).toHaveProperty("budget", expect.objectContaining({ max: 60 }));
      const { budgetSpent } = (await zoneRuntime()) as {
        budgetSpent: (
          budget: { max: number },
          spent: number,
          taken: number
        ) => { spent: number; ends: boolean };
      };
      // 20 rolled, a resistant target takes 10: 10 counts.
      expect(budgetSpent({ max: 60 }, 0, 10)).toEqual({ spent: 10, ends: false });
      // 55 spent, a hit for 20: the hit lands whole, then the guardian vanishes.
      expect(budgetSpent({ max: 60 }, 55, 20)).toEqual({ spent: 60, ends: true });
      // A creature that takes nothing (immune) spends nothing.
      expect(budgetSpent({ max: 60 }, 30, 0)).toEqual({ spent: 30, ends: false });
    }
  );

  rule(
    {
      category: 15,
      case: "Spirit Guardians picks who it ignores",
      source: "enworld spirit-guardians",
      status: "works",
    },
    () => {
      // The caster's chosen allies are spared; an enemy is hit once per turn.
      const guardians = zoneOf("spirit-guardians", 3, ["fighter"]);
      const turn = { round: 1, combatantId: "goblin" };
      expect(
        zoneTriggers(guardians, { kind: "enter", creatureId: "fighter", turn })
      ).toEqual({ fires: false, reason: "spared" });
      const hit = zoneTriggers(guardians, { kind: "enter", creatureId: "goblin", turn });
      expect(hit.fires).toBe(true);
      expect(
        zoneTriggers(
          guardians,
          { kind: "end-turn", creatureId: "goblin", turn },
          hit.fires ? hit.ledger : {}
        )
      ).toEqual({ fires: false, reason: "already-this-turn" });
    }
  );

  rule(
    {
      category: 15,
      case: "Concentration saves from area damage",
      source: "GLOSS",
      status: "works",
    },
    () => {
      // Lyra concentrates on Hypnotic Pattern; a 24-damage Fireball from the DM queues
      // her own save at DC 12.
      const after = peerHit(38, 24, {
        concentration: concentrationValue("hypnotic-pattern"),
      });
      expect(after.pendingConcentrationSaves?.[0]?.difficultyClass).toBe(12);
    }
  );

  rule(
    {
      category: 15,
      case: "Cleave and Nick",
      source: "KIBBLES #1; SAC #39; SAC #81",
      status: "works",
    },
    () => {
      // Nick folds the Light off-hand attack into the Attack action (no Bonus Action).
      const nyx = buildDevScenario("weapon-mastery-nick");
      if (!nyx) throw new Error("scenario missing");
      const rows = localizeActions(nyx, "en").filter((a) => a.offhand);
      expect(rows.find((a) => a.weaponId === "dagger")?.type).toBe("free");
      expect(rows.find((a) => a.weaponId === "shortsword")?.type).toBe("bonus");
      // Cleave rides the Greataxe as its mastery.
      expect(SRD_WEAPONS.find((w) => w.id === "greataxe")?.mastery).toBe("Cleave");
    }
  );

  rule(
    {
      category: 15,
      case: "Topple and Polearm Master saves",
      source: "KIBBLES #11",
      status: "works",
    },
    () => {
      // Every hit offers its own Prone, with its own CON save (8 + mod + PB).
      expect(masteryNumbers(["Topple"], 3, 3)).toEqual({ toppleDc: 14 });
      const fighter = buildDevScenario("weapon-mastery-numbers");
      if (!fighter) throw new Error("scenario missing");
      const topple = localizeActions(fighter, "en").find(
        (a) => a.summary.masteryDetail?.toppleDc
      );
      if (!topple) throw new Error("no Topple weapon");
      const p = plan(topple, ["monster-1"]);
      expect(p.conditions).toMatchObject({ optIn: true, save: { ability: "CON" } });
      const row = toggleCondition(initialTrayRow(p, "monster-1"), "prone", p);
      expect(rowConditions(row)).toEqual(["prone"]);
    }
  );

  rule(
    { category: 15, case: "Objects in the area", source: "GLOSS", status: "M1" },
    async () => {
      // Objects are immune to poison and psychic damage and fail every save.
      const intake: Record<string, unknown> = await import("@/lib/damage-intake");
      expect(intake.OBJECT_DEFENSES).toMatchObject({
        immunities: new Set(["poison", "psychic"]),
      });
      // Engine-ready, needs a caller: the case works once the tray can name an
      // object in the area as a target. The object's rules are in
      // `@/lib/object-targets` (defenses, failed saves, HP); the tray's control is
      // owner-gated.
      const id = "@/lib/play/object-targets";
      const tray = (await import(/* @vite-ignore */ id)) as Record<string, unknown>;
      expect(tray.objectTrayTarget).toBeTypeOf("function");
    }
  );
});
