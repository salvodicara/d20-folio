/** Conformance, category 17: at-the-table gaps (corpus.md § 17). */
import { describe, expect } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { concentrationSaveDc } from "@/lib/compute";
import { enteredD20FaceCount } from "@/lib/character-d20-tests";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { sessionToCombatState } from "@/lib/combat-state";
import { peerDamageState } from "@/lib/play/peer-damage";
import {
  initialTrayRow,
  rowAmount,
  rowAmountByType,
  setD20Face,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { takeDamage } from "@/lib/play/damage";
import { causalPatch, undoPatch } from "@/lib/play/causal-patch";
import { setCompanionHp } from "@/lib/play/companions";
import { recoverPerTurnTrackers } from "@/lib/play/states";
import { longRestCharacter } from "@/lib/play/rests";
import { withOverride, isHandSet, termPart } from "@/lib/value-breakdown";
import { deriveDamageDefenses } from "@/lib/views/sheet-view";
import { classFeatures } from "@/data/classes";
import { getMagicItem } from "@/data/magic-items";
import { asRaceId } from "@/data/srd-names";
import { MOCK_CHARACTER } from "@/lib/mock";
import { firedTriggerOffers } from "@/lib/smart-tracker";
import { concentrationValue } from "@/lib/concentration";
import type { CharacterDoc, SessionState } from "@/types/character";
import { makeCharacterDoc } from "../_helpers";
import { rule } from "./rule";

const lyra = (session: Partial<CharacterDoc["session"]> = {}): CharacterDoc => ({
  ...MOCK_CHARACTER,
  session: { ...MOCK_CHARACTER.session, conditions: [], ...session },
});
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

describe("conformance · 17. at-the-table gaps", () => {
  rule(
    {
      category: 17,
      case: "Physical dice entered by hand",
      source: "SAC #61; WIKI rogue:main",
      status: "works",
    },
    async () => {
      // Advantage asks for two d20 faces; one polarity each way cancels to one.
      expect(
        enteredD20FaceCount({ advantageSourceIds: ["a"], disadvantageSourceIds: [] })
      ).toBe(2);
      expect(
        enteredD20FaceCount({ advantageSourceIds: ["a"], disadvantageSourceIds: ["b"] })
      ).toBe(1);
      // Great Weapon Fighting turns typed faces [1, 2] on 2d6 into 3 + 3: the damage
      // entry needs the raw faces, not only a total.
      const { applyDieFaceFloor } = await import("@/lib/play/damage-tray");
      expect(applyDieFaceFloor([1, 2], { floorBelow: 2, floorTo: 3 })).toBe(6);
    }
  );

  rule(
    { category: 17, case: "Hand-entered crits", source: "GLOSS", status: "works" },
    () => {
      // The player types the doubled dice; a natural 20 also lands the on-a-20 rider.
      const plan: DamageTrayPlan = {
        effect: "damage",
        damageType: "slashing",
        attack: {
          onMiss: "none",
          onRoll20: [{ dice: "14", amount: 14, damageType: "slashing" }],
        },
        targets: ["monster-1"],
      };
      const crit = setD20Face(initialTrayRow(plan, "monster-1"), 20, plan);
      expect(crit.attack).toBe("critical");
      expect(crit.multiplier).toBe("1");
      expect(rowAmount(16, crit, plan)).toBe(30);
    }
  );

  rule(
    {
      category: 17,
      case: "Damage typed in without a type breakdown",
      source: "WIKI druid:main (Primal Strike); SAC #36",
      status: "works",
    },
    () => {
      // An infernal tiefling (fire resistance) takes 10 fire + 10 radiant: 5 + 10 = 15.
      const tiefling = makeCharacterDoc(
        { race: asRaceId("tiefling") },
        { grantBundleChoices: { "tiefling-legacy": "infernal" } }
      );
      const defenses = deriveDamageDefenses(
        aggregateCharacterGrants(tiefling.character, tiefling.session),
        {},
        undefined,
        2,
        false,
        []
      );
      expect(defenses.resistances.has("fire")).toBe(true);
      const mixed: DamageTrayPlan = {
        effect: "damage",
        damageTypes: ["fire", "radiant"],
        targets: ["pc-tiefling"],
      };
      const row = initialTrayRow(mixed, "pc-tiefling", defenses);
      expect(rowAmountByType({ fire: 10, radiant: 10 }, row, mixed)).toBe(15);
    }
  );

  rule(
    {
      category: 17,
      case: "Monster kills and who dealt them",
      source: "WIKI spell:hex",
      status: "works",
    },
    () => {
      // Hunter's Mark moves when its marked target drops to 0: the drop offers the
      // Bonus Action that moves it, and only for the marked creature.
      const ranger: CharacterDoc = {
        ...MOCK_CHARACTER,
        character: {
          ...MOCK_CHARACTER.character,
          spells: [{ srdId: "hunters-mark", prepared: true }],
        },
        session: {
          ...MOCK_CHARACTER.session,
          concentration: concentrationValue("hunters-mark"),
          // Casting lights the spell's state (`spell-hunters-mark`).
          activeFeatures: ["spell-hunters-mark"],
        },
      };
      expect(
        firedTriggerOffers(ranger, "reduced-to-zero", { targetMarked: true })
      ).toEqual([expect.objectContaining({ actionId: "move-mark" })]);
      expect(
        firedTriggerOffers(ranger, "reduced-to-zero", { targetMarked: false })
      ).toEqual([]);
    }
  );

  rule(
    {
      category: 17,
      case: "Wild Shape mid-combat",
      source: "WIKI druid:main; WIKI druid:moon; FVTT#5962",
      status: "works",
    },
    () => {
      // The form ends on Incapacitated and swaps the stat block (a form rule).
      const wildShape = classFeatures.find((f) => f.id === "druid-wild-shape");
      expect(wildShape).toBeDefined();
      expect(JSON.stringify(wildShape)).toContain('"incapacitated"');
    }
  );

  rule(
    {
      category: 17,
      case: "Area spells that hit allies",
      source: "SAC #91; WIKI rogue:main",
      status: "works",
    },
    () => {
      // A PC already at 0 caught in the caster's Fireball suffers a death-save failure.
      const after = peerHit(0, 12, { conditions: ["unconscious"] });
      expect(after.deathSaves.failures).toBe(1);
    }
  );

  rule(
    {
      category: 17,
      case: "Creatures outside the combat tracker",
      source: "WIKI spell:find-familiar; WIKI spell:summon-beast; SAC #145",
      status: "M19",
    },
    async () => {
      // A companion's HP lives on its owner's sheet today…
      const session = setCompanionHp(MOCK_CHARACTER.session, "find-familiar", 3);
      expect(session.companionHp?.["find-familiar"]).toEqual({ current: 3 });
      // …but its own initiative (familiar) or the caster's (summon) needs a roster.
      const companions: Record<string, unknown> = await import("@/lib/play/companions");
      expect(companions.companionInitiative).toBeTypeOf("function");
    }
  );

  rule(
    {
      category: 17,
      case: "Retroactive reactions at the table",
      source: "WIKI spell:shield",
      status: "works",
    },
    () => {
      // The hit is applied, then Shield is remembered: the hit undoes exactly.
      const before = lyra();
      const hit = takeDamage(before, 12);
      if (!hit) throw new Error("no hit");
      const patch = causalPatch(before.session, hit.session);
      expect(undoPatch(hit.session, patch)?.hp).toEqual(before.session.hp);
    }
  );

  rule(
    {
      category: 17,
      case: "Initiative triggers when rolled physically",
      source: "WIKI barbarian:main; WIKI monk:main; WIKI feat:alert",
      status: "works",
    },
    () => {
      // Incapacitated rolls Initiative with Disadvantage.
      expect(
        resolveConditionEffects(["incapacitated"], {}).disadvantages.some(
          (d) => d.rollType === "initiative"
        )
      ).toBe(true);
      // Persistent Rage refills Rage when Initiative is rolled, once per Long Rest:
      // the trigger carries its own limit (M8 trigger rules).
      const persistent = classFeatures.find((f) => f.id === "barbarian-persistent-rage");
      expect(persistent?.grants?.[0]).toMatchObject({
        limit: { per: "long-rest", max: 1 },
      });
    }
  );

  rule(
    {
      category: 17,
      case: "Per-turn limits on others' turns",
      source: "SAC #58",
      status: "works",
    },
    () => {
      // Sneak Attack used on the rogue's own turn (round 5): the same turn keeps it
      // spent; an opportunity attack on the enemy's turn may use it again.
      const rogue = makeCharacterDoc(
        { classId: "rogue", level: 5, features: [{ srdId: "rogue-sneak-attack" }] },
        { trackers: { "rogue-sneak-attack": { used: 1, turnKey: "5:pc-rogue" } } }
      );
      expect(recoverPerTurnTrackers(rogue, "5:pc-rogue")).toBeNull();
      expect(recoverPerTurnTrackers(rogue, "5:monster-1")).not.toBeNull();
    }
  );

  rule(
    {
      category: 17,
      case: "Hidden curses and DM-only state",
      source: "ITEMS",
      status: "M20",
    },
    async () => {
      // A cursed item carries its curse as hidden, DM-revealed state: the catalogue
      // says what the curse binds; the case works once the DM side reveals it.
      expect(getMagicItem("berserker-axe")).toHaveProperty("curse");
      const id = "@/lib/item-overlays";
      const overlays = (await import(/* @vite-ignore */ id)) as Record<string, unknown>;
      expect(typeof overlays.revealCurse).toBe("function");
      // Engine-ready, needs a caller: the case works once the DM's item panel
      // (mocked and approved first) reveals it.
      const panelId = "@/domains/campaign/dm-item-panel-view";
      const panel = (await import(/* @vite-ignore */ panelId)) as Record<string, unknown>;
      expect(typeof panel.dmItemPanelView).toBe("function");
    }
  );

  rule(
    {
      category: 17,
      case: "DM-adjudicated outcomes",
      source: "GLOSS; SAC #38",
      status: "works",
    },
    () => {
      // "DM ruled: 14" replaces the computed value and is marked as a ruling.
      const ruled = withOverride([termPart("breakdown.base", 11)], 14);
      expect(isHandSet(ruled)).toBe(true);
    }
  );

  rule(
    {
      category: 17,
      case: "Owlbear and VTT damage applied outside the app",
      source: "SAC #109; FVTT#5394",
      status: "works",
    },
    () => {
      // The player types the VTT's 24: temp HP absorb first, and the concentration DC
      // comes from the whole 24, not what got past the temp HP.
      const hit = takeDamage(lyra(), 24);
      expect(hit?.session.hp).toMatchObject({ current: 19, temp: 0 });
      expect(concentrationSaveDc(24)).toBe(12);
    }
  );

  rule(
    {
      category: 17,
      case: "Lingering penalties across sessions",
      source: "WIKI spell:raise-dead; GLOSS",
      status: "works",
    },
    () => {
      // One "we long-rested" pass: Raise Dead fades by 1, Exhaustion drops a level,
      // temp HP end.
      const rested = longRestCharacter(
        lyra({ fadingPenalties: { "raise-dead": 4 }, exhaustion: 2 })
      ).session;
      expect(rested.fadingPenalties).toEqual({ "raise-dead": 3 });
      expect(rested.exhaustion).toBe(1);
      expect(rested.hp.temp).toBe(0);
    }
  );
});
