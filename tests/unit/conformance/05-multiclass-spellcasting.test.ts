/** Conformance, category 5: multiclass and spellcasting (corpus.md § 5). */
import { beforeEach, describe, expect } from "vitest";
import { getMagicItem } from "@/data/magic-items";
import { getSpellById } from "@/data/spells";
import { buildCastOptions, type FreeCastSource } from "@/lib/cast-options";
import { economyActionCategory } from "@/lib/combat-economy";
import {
  applyCommitOps,
  planResourceConversion,
  type CommitStore,
} from "@/lib/cost-engine";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { canMulticlassInto, multiclassEntryGrants } from "@/lib/multiclass";
import { computeMulticlassSpellSlots } from "@/lib/multiclass-slots";
import { castOptionExpendsSpellSlot } from "@/lib/play/cast-payment";
import { castEconomySlot } from "@/lib/play/metamagic";
import { longRestCharacter, shortRestCharacter } from "@/lib/play/rests";
import { applySheetEvent, type SheetEvent } from "@/lib/play/sheet-events";
import { canRitualCast } from "@/lib/ritual";
import { resolveSpellAbility } from "@/lib/resolve-spell-ability";
import { resolveActions } from "@/lib/smart-tracker";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc, SrdSpellRef } from "@/types/character";
import { rule } from "./rule";

const SCORES = { STR: 10, DEX: 14, CON: 14, INT: 16, WIS: 14, CHA: 16 } as const;

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

/** Remaining slots of one level (normal or Pact) on the sheet. */
function remaining(doc: CharacterDoc, level: number, pactMagic = false): number {
  const row = doc.character.spellSlots.find(
    (s) => s.level === level && !!s.pactMagic === pactMagic
  );
  const key = pactMagic ? `pact-${level}` : String(level);
  return (row?.total ?? 0) - (doc.session.spellSlots[key]?.used ?? 0);
}

/** A pure CommitStore over a sheet: every op becomes the sheet event the store dispatches. */
function sheetStore(start: CharacterDoc): {
  store: CommitStore;
  doc: () => CharacterDoc;
} {
  let doc = start;
  const on = (e: SheetEvent) => {
    doc = applySheetEvent(doc, e) ?? doc;
  };
  return {
    doc: () => doc,
    store: {
      useSpellSlot: (level, pactMagic = false) =>
        on({ kind: "spend-slot", level, pactMagic }),
      restoreSpellSlot: (level, pactMagic = false) =>
        on({ kind: "restore-slot", level, pactMagic }),
      createSpellSlot: (level) => on({ kind: "create-slot", level }),
      useTracker: (trackerId, amount = 1) =>
        on({ kind: "spend-tracker", trackerId, amount }),
      restoreTracker: (trackerId, amount = 1) =>
        on({ kind: "restore-tracker", trackerId, amount }),
      useEquipmentItem: () => {},
      restoreEquipmentItem: () => {},
      getConcentration: () => doc.session.concentration,
      setConcentration: () => {},
    },
  };
}

const combat = () => useCombatStore.getState();

const MAGIC_INITIATE: FreeCastSource = {
  sourceId: "magic-initiate-cleric",
  sourceName: "Magic Initiate",
  usesPerRest: 1,
  usedNow: 0,
  recovery: { kind: "tracker", rest: "long" },
};

describe("conformance · 5. multiclass and spellcasting", () => {
  beforeEach(() => combat().resetTurn());

  rule(
    {
      category: 5,
      case: "Shared slot table",
      source: "WIKI class:multiclassing",
      status: "works",
    },
    () => {
      // Wizard 3 (full) + Paladin 3 (half, round up: 2) + Eldritch Knight 3 (third: 1) = 6.
      const slots = computeMulticlassSpellSlots([
        { classId: "wizard", level: 3 },
        { classId: "paladin", level: 3 },
        { classId: "fighter", subclassId: "eldritch-knight", level: 3 },
      ]);
      expect(slots).toEqual([
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 3 },
      ]);
      // Paladin 1 already contributes (2024 rounds half-casters up).
      expect(
        computeMulticlassSpellSlots([
          { classId: "wizard", level: 1 },
          { classId: "paladin", level: 1 },
        ])
      ).toEqual([{ level: 1, total: 3 }]);
    }
  );

  rule(
    {
      category: 5,
      case: "Pact Magic is a separate pool",
      source: "WIKI class:multiclassing; FVTT#6862",
      status: "works",
    },
    () => {
      const doc = character({
        classId: "wizard",
        level: 3,
        secondaryClasses: [{ classId: "warlock", level: 3 }],
      });
      expect(doc.character.spellSlots).toContainEqual({
        level: 2,
        total: 2,
        pactMagic: true,
      });
      const spent = sheet(
        doc,
        { kind: "spend-slot", level: 1, pactMagic: false },
        { kind: "spend-slot", level: 2, pactMagic: true }
      );
      expect(remaining(spent, 1)).toBe(remaining(doc, 1) - 1);
      expect(remaining(spent, 2, true)).toBe(1);
      // A Short Rest brings back the Pact slot only.
      const rested = shortRestCharacter(spent);
      expect(remaining(rested, 2, true)).toBe(2);
      expect(remaining(rested, 1)).toBe(remaining(spent, 1));
      // The pools are interchangeable: a Pact slot can pay for a Wizard spell.
      const options = buildCastOptions(
        doc.character.spellSlots,
        doc.session.spellSlots,
        1
      );
      expect(options.some((o) => o.kind === "slot" && o.pactMagic === true)).toBe(true);
    }
  );

  rule(
    {
      category: 5,
      case: "Prepared spells belong to one class",
      source: "WIKI class:multiclassing",
      status: "works",
    },
    () => {
      // Cleric 5 (WIS) / Bard 3 (CHA), Cure Wounds prepared through both classes.
      const doc = character({
        classId: "cleric",
        level: 5,
        secondaryClasses: [{ classId: "bard", level: 3 }],
      });
      const viaCleric = { srdId: "cure-wounds", prepared: true, viaClass: "cleric" };
      const viaBard = { srdId: "cure-wounds", prepared: true, viaClass: "bard" };
      const refs: SrdSpellRef[] = [viaCleric, viaBard];
      const classes = getSpellById("cure-wounds")?.classes;
      // Each copy is cast with its own class's ability, so two DCs.
      expect(refs.map((ref) => resolveSpellAbility(ref, doc.character, classes))).toEqual(
        ["WIS", "CHA"]
      );
    }
  );

  rule(
    {
      category: 5,
      case: "Cantrips scale by character level",
      source: "WIKI class:multiclassing; SAC #41",
      status: "works",
    },
    () => {
      // Fighter 4 / Warlock 1 / Wizard 1: character level 6, one level in each caster.
      const doc = character({
        classId: "fighter",
        level: 4,
        secondaryClasses: [
          { classId: "warlock", level: 1 },
          { classId: "wizard", level: 1 },
        ],
        spells: [{ srdId: "fire-bolt" }, { srdId: "eldritch-blast" }],
      });
      const actions = resolveActions(doc);
      expect(actions.find((a) => a.id === "spell-fire-bolt")?.summary.damage).toBe(
        "2d10"
      );
      expect(
        actions.find((a) => a.id === "spell-eldritch-blast")?.summary.instances
      ).toBe(2);
    }
  );

  rule(
    {
      category: 5,
      case: "Multiclass prerequisites use base scores",
      source: "SAC #40; SAC #42",
      status: "works",
    },
    () => {
      // Gauntlets of Ogre Power set STR 19, but the prerequisite reads the base 12.
      const weak = character({
        classId: "wizard",
        level: 3,
        abilityScores: { ...SCORES, STR: 12 },
        equipment: [{ srdId: "gauntlets-of-ogre-power", equipped: true }],
      });
      expect(canMulticlassInto(weak.character, "barbarian")).toBe(false);
      const strong = character({
        classId: "wizard",
        level: 3,
        abilityScores: { ...SCORES, STR: 13 },
      });
      expect(canMulticlassInto(strong.character, "barbarian")).toBe(true);
      // Some proficiencies, never the new class's saving throws.
      const grants = multiclassEntryGrants("fighter");
      expect(grants).not.toBeNull();
      expect(Object.keys(grants ?? {})).not.toContain("savingThrows");
    }
  );

  rule(
    {
      category: 5,
      case: "One spell with a slot per turn",
      source: "SAC #102; SAC #103",
      status: "works",
    },
    () => {
      const doc = character({
        classId: "wizard",
        level: 5,
        spells: [
          { srdId: "magic-missile", prepared: true },
          { srdId: "shield", prepared: true },
          { srdId: "fire-bolt" },
        ],
      });
      const actions = resolveActions(doc);
      const costs = (id: string) => actions.find((a) => a.id === id)?.costsSlot;
      // Action, Reaction and cantrip: only the slotted ones count.
      expect(costs("spell-magic-missile")).toBe(true);
      expect(costs("spell-shield")).toBe(true);
      expect(costs("spell-fire-bolt")).toBe(false);
      // One slot-paid cast per turn, whatever its timing.
      expect(combat().commitSpellSlotCast("round-2:wizard")).not.toBeNull();
      expect(combat().commitSpellSlotCast("round-2:wizard")).toBeNull();
      // The next creature's turn is a new allowance (a Reaction there).
      expect(combat().commitSpellSlotCast("round-2:goblin")).not.toBeNull();
    }
  );

  rule(
    {
      category: 5,
      case: "Slotless casts escape the limit",
      source: "KIBBLES #21",
      status: "works",
    },
    () => {
      const options = buildCastOptions(
        [{ level: 1, total: 2 }],
        {},
        1,
        [MAGIC_INITIATE],
        [{ sourceName: "Spell Mastery" }]
      );
      const expends = (kind: string) =>
        options
          .filter((o) => (o.kind ?? "slot") === kind)
          .map(castOptionExpendsSpellSlot);
      expect(expends("slot")).toEqual([true]);
      expect(expends("free-cast")).toEqual([false]);
      expect(expends("mastery")).toEqual([false]);
      expect(castOptionExpendsSpellSlot({ kind: "ritual", level: 1 })).toBe(false);
    }
  );

  rule(
    {
      category: 5,
      case: "Quickened Spell doesn't give two slotted spells",
      source: "SAC #65",
      status: "works",
    },
    () => {
      // Quickened turns the Action cast into a Bonus Action cast...
      expect(castEconomySlot("action", ["quickened-spell"])).toBe("bonus");
      // ...but the slot it spends still claims the turn's one slot.
      expect(combat().commitSpellSlotCast("round-3:sorcerer")).not.toBeNull();
      expect(combat().commitSpellSlotCast("round-3:sorcerer")).toBeNull();
    }
  );

  rule(
    {
      category: 5,
      case: "Font of Magic slots vanish",
      source: "WIKI sorcerer:main",
      status: "works",
    },
    () => {
      // Sorcerer 3 with every slot unspent creates a level-1 slot for 2 points.
      const doc = character({ classId: "sorcerer", level: 3 });
      const full = remaining(doc, 1);
      const ops = planResourceConversion(
        {
          produces: "spell-slot",
          fromTracker: "sorcerer-font-of-magic",
          maxSlotLevel: 5,
          costTable: [{ slotLevel: 1, cost: 2, minLevel: 2 }],
        },
        { producedSlotLevel: 1 }
      );
      const { store, doc: after } = sheetStore(doc);
      applyCommitOps(ops, store);
      // The created slot exists above the table's maximum...
      expect(remaining(after(), 1)).toBe(full + 1);
      // ...and vanishes at the Long Rest.
      expect(remaining(longRestCharacter(after()), 1)).toBe(full);
    }
  );

  rule(
    {
      category: 5,
      case: "Spells from feats and species",
      source: "SAC #85; ITEMS",
      status: "works",
    },
    () => {
      // A Wizard takes Magic Initiate (Cleric) choosing Wisdom: Bless uses WIS,
      // castable once per Long Rest for free or with the Wizard's own slots.
      const doc = character({ classId: "wizard", level: 3 });
      const bless: SrdSpellRef = {
        srdId: "bless",
        spellAbilityOverride: "WIS",
        freeCastSource: {
          sourceId: "magic-initiate-cleric",
          rest: "long",
          usesPerRest: 1,
        },
      };
      expect(
        resolveSpellAbility(bless, doc.character, getSpellById("bless")?.classes)
      ).toBe("WIS");
      const options = buildCastOptions(
        doc.character.spellSlots,
        doc.session.spellSlots,
        1,
        [MAGIC_INITIATE]
      );
      expect(options.some((o) => o.kind === "slot")).toBe(true);
      expect(options.filter((o) => o.kind === "free-cast")).toHaveLength(1);
    }
  );

  rule(
    {
      category: 5,
      case: "Ritual casting differs by class",
      source: "SAC #76; SAC #72; SAC #93",
      status: "works",
    },
    () => {
      const detectMagic = { level: 1, ritual: true };
      const ritual = (classId: string, isPrepared: boolean) =>
        canRitualCast({ spell: detectMagic, classId, isPrepared });
      expect(ritual("wizard", false)).toBe(true);
      expect(ritual("cleric", false)).toBe(false);
      expect(ritual("cleric", true)).toBe(true);
      // A ritual cast spends no slot.
      expect(castOptionExpendsSpellSlot({ kind: "ritual", level: 1 })).toBe(false);
    }
  );

  rule(
    {
      category: 5,
      case: "Spells cast without slots use base level",
      source: "SAC #101",
      status: "works",
    },
    () => {
      const options = buildCastOptions([{ level: 3, total: 2 }], {}, 1, [MAGIC_INITIATE]);
      expect(options.filter((o) => o.kind === "free-cast").map((o) => o.level)).toEqual([
        1,
      ]);
    }
  );

  rule(
    {
      category: 5,
      case: "Items that cast spells",
      source: "ITEMS; SAC #155",
      status: "works",
    },
    () => {
      // Wand of Fireballs: Fireball at its lowest level (3) for 1 charge, more
      // charges for higher levels, no slot, the item's printed DC.
      const cast = getMagicItem("wand-of-fireballs")?.grants?.find(
        (g) => g.type === "free-cast-spell"
      );
      expect(cast).toMatchObject({
        spellId: "fireball",
        castOverrides: { saveDC: 15 },
        castLevels: [
          { level: 3, cost: 1 },
          { level: 4, cost: 2 },
          { level: 5, cost: 3 },
        ],
      });
      const options = buildCastOptions([], {}, 3, [
        {
          sourceId: "wand-of-fireballs",
          sourceName: "Wand of Fireballs",
          usesPerRest: 7,
          usedNow: 0,
          recovery: { kind: "tracker", rest: "long" },
          castLevels: [
            { level: 3, cost: 1 },
            { level: 4, cost: 2 },
          ],
        },
      ]);
      expect(options[0]).toMatchObject({ kind: "free-cast", level: 3, cost: 1 });
      expect(options.some(castOptionExpendsSpellSlot)).toBe(false);
    }
  );

  rule(
    {
      category: 5,
      case: "Spell Scroll class restriction",
      source: "SAC #50; SAC #158; ITEMS",
      status: "works",
    },
    () => {
      // A Scroll of Cure Wounds: a Cleric (on the list) can cast it, a Wizard can't.
      const scroll = { srdId: "spell-scroll", quantity: 1, scrollSpell: "cure-wounds" };
      const castsFromScroll = (classId: string) =>
        resolveActions(character({ classId, level: 3, equipment: [scroll] })).some(
          (a) => a.spellId === "cure-wounds" && a.source !== "spell"
        );
      expect(castsFromScroll("cleric")).toBe(true);
      expect(castsFromScroll("wizard")).toBe(false);
    }
  );

  rule(
    {
      category: 5,
      case: "Nature Magician converts uses into slots",
      source: "WIKI druid:main",
      status: "works",
    },
    () => {
      const magician = {
        produces: "spell-slot",
        fromTracker: "druid-wild-shape",
        perUnitSlotLevels: 2,
        maxSlotLevel: 5,
      } as const;
      // Druid 20 with a spent 4th-level slot turns two Wild Shape uses into it.
      const doc = sheet(character({ classId: "druid", level: 20 }), {
        kind: "spend-slot",
        level: 4,
        pactMagic: false,
      });
      const ops = planResourceConversion(magician, { unitsSpent: 2 });
      expect(ops).toEqual([
        { op: "spend-tracker", trackerId: "druid-wild-shape", amount: 2 },
        { op: "gain-spell-slot", level: 4 },
      ]);
      const { store, doc: after } = sheetStore(doc);
      applyCommitOps(ops, store);
      expect(remaining(after(), 4)).toBe(remaining(doc, 4) + 1);
      expect(after().session.trackers["druid-wild-shape"]?.used).toBe(2);
      // Capped at level 5: three uses still make a 5th-level slot.
      expect(planResourceConversion(magician, { unitsSpent: 3 })).toContainEqual({
        op: "gain-spell-slot",
        level: 5,
      });
    }
  );

  rule(
    {
      category: 5,
      case: "Spell attacks aren't weapon attacks",
      source: "SAC #98; SAC #99; SAC #144",
      status: "works",
    },
    () => {
      const doc = character({
        classId: "fighter",
        level: 5,
        secondaryClasses: [{ classId: "wizard", level: 1 }],
        spells: [{ srdId: "fire-bolt" }, { srdId: "true-strike" }],
        weapons: [{ srdId: "longsword", quantity: 1 }],
      });
      const actions = resolveActions(doc);
      const category = (pick: (a: (typeof actions)[number]) => boolean) => {
        const action = actions.find(pick);
        if (!action) throw new Error("missing action");
        return economyActionCategory(action);
      };
      // A weapon swing fills an attack of the Attack action; a spell never does: it
      // is the Magic action (which Action Surge's extra action can't be).
      expect(category((a) => a.source === "weapon")).toBe("attack");
      expect(category((a) => a.id === "spell-fire-bolt")).toBe("magic");
      expect(category((a) => a.id === "spell-true-strike")).toBe("magic");
    }
  );
});
