/**
 * TABLE-DRIVEN GUARD — every class's `startingEquipment` packages pinned to the
 * 2024 wikidot facts (`dnd2024.wikidot.com/<class>:main`, "Starting Equipment:
 * Choose A or B"). Any future drift in the item ids, quantities, option gold, or
 * the all-gold alternative fails CI here (the single home for that fact — see
 * the EQUIP-AUDIT fix). Item ids are STABLE catalogue ids (never display
 * strings). The Monk/Bard chosen-tool pack member is the `fromToolChoice` marker
 * (not a static id) — its presence + per-marker item count is pinned here too
 * (`toolChoiceCounts`); its RESOLUTION to the picked tool is in
 * `starting-equipment-resolves.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { classTables, getClassTable } from "@/data/classes";

/** The expected Option-A item set (srdId → quantity) for one class. */
type ItemSet = Record<string, number>;

interface ClassEquipFacts {
  /** Ordered option labels (A/B, or Fighter's A/B/C). */
  labels: string[];
  /** The FIRST gear option's items (srdId → quantity). */
  optionAItems: ItemSet;
  /** Gold per option, keyed by label. */
  gold: Record<string, number>;
  /**
   * A SECOND gear option (Fighter B) — most classes' Option B is all-gold so
   * this is omitted; only the Fighter has a second gear package.
   */
  optionBItems?: ItemSet;
  optionBLabel?: string;
  /**
   * Number of `fromToolChoice` marker members in Option A, and the items each
   * grants (`count`). The Monk pack lists "the Artisan's Tools or Musical
   * Instrument chosen for the tool proficiency above" and the Bard "a Musical
   * Instrument of your choice" — both modeled as the marker, not a static id, so
   * the chosen tool is a first-class VISIBLE pack member. Omitted for classes
   * whose pack has no chosen-tool member.
   */
  toolChoiceCounts?: number[];
}

// Verified 2026-06-13 against dnd2024.wikidot.com/<class>:main.
const FACTS: Record<string, ClassEquipFacts> = {
  barbarian: {
    labels: ["A", "B"],
    optionAItems: { greataxe: 1, handaxe: 4, "explorers-pack": 1 },
    gold: { A: 15, B: 75 },
  },
  bard: {
    labels: ["A", "B"],
    // "a Musical Instrument of your choice" is the `fromToolChoice` marker
    // (toolChoiceCounts below), NOT a static `musical-instrument` id — it
    // resolves to the player's actual chosen instrument.
    optionAItems: {
      "leather-armor": 1,
      dagger: 2,
      "entertainers-pack": 1,
    },
    gold: { A: 19, B: 90 },
    toolChoiceCounts: [1],
  },
  cleric: {
    labels: ["A", "B"],
    optionAItems: {
      "chain-shirt": 1,
      shield: 1,
      mace: 1,
      "holy-symbol": 1,
      "priests-pack": 1,
    },
    gold: { A: 7, B: 110 },
  },
  druid: {
    labels: ["A", "B"],
    optionAItems: {
      "leather-armor": 1,
      shield: 1,
      sickle: 1,
      // "Druidic Focus (Quarterstaff)" is ONE wiki entry — the focus IS the
      // quarterstaff form, modeled as the single druidic-focus item (mirrors the
      // wizard's "Arcane Focus (Quarterstaff)"). No separate quarterstaff weapon.
      "druidic-focus": 1,
      "explorers-pack": 1,
      "herbalism-kit": 1,
    },
    gold: { A: 9, B: 50 },
  },
  fighter: {
    labels: ["A", "B", "C"],
    optionAItems: {
      "chain-mail": 1,
      greatsword: 1,
      flail: 1,
      javelin: 8,
      "dungeoneers-pack": 1,
    },
    optionBLabel: "B",
    optionBItems: {
      "studded-leather-armor": 1,
      scimitar: 1,
      shortsword: 1,
      longbow: 1,
      arrows: 20,
      quiver: 1,
      "dungeoneers-pack": 1,
    },
    gold: { A: 4, B: 11, C: 155 },
  },
  monk: {
    labels: ["A", "B"],
    // "the Artisan's Tools or Musical Instrument chosen for the tool proficiency
    // above" is the `fromToolChoice` marker (toolChoiceCounts below) — a
    // first-class VISIBLE pack member resolving to the chosen tool.
    optionAItems: { spear: 1, dagger: 5, "explorers-pack": 1 },
    gold: { A: 11, B: 50 },
    toolChoiceCounts: [1],
  },
  paladin: {
    labels: ["A", "B"],
    optionAItems: {
      "chain-mail": 1,
      shield: 1,
      longsword: 1,
      javelin: 6,
      "holy-symbol": 1,
      "priests-pack": 1,
    },
    gold: { A: 9, B: 150 },
  },
  ranger: {
    labels: ["A", "B"],
    optionAItems: {
      "studded-leather-armor": 1,
      scimitar: 1,
      shortsword: 1,
      longbow: 1,
      arrows: 20,
      quiver: 1,
      "druidic-focus": 1,
      "explorers-pack": 1,
    },
    gold: { A: 7, B: 150 },
  },
  rogue: {
    labels: ["A", "B"],
    optionAItems: {
      "leather-armor": 1,
      dagger: 2,
      shortsword: 1,
      shortbow: 1,
      arrows: 20,
      quiver: 1,
      "thieves-tools": 1,
      "burglars-pack": 1,
    },
    gold: { A: 8, B: 100 },
  },
  sorcerer: {
    labels: ["A", "B"],
    optionAItems: { spear: 1, dagger: 2, "arcane-focus": 1, "dungeoneers-pack": 1 },
    gold: { A: 28, B: 50 },
  },
  warlock: {
    labels: ["A", "B"],
    optionAItems: {
      "leather-armor": 1,
      sickle: 1,
      dagger: 2,
      "arcane-focus": 1,
      book: 1,
      "scholars-pack": 1,
    },
    gold: { A: 15, B: 100 },
  },
  wizard: {
    labels: ["A", "B"],
    optionAItems: {
      dagger: 2,
      "arcane-focus": 1,
      robe: 1,
      spellbook: 1,
      "scholars-pack": 1,
    },
    gold: { A: 5, B: 55 },
  },
};

/** Collapse an option's items into an srdId → total-quantity map. */
function itemSetOf(
  items: ReadonlyArray<{ srdId?: string; quantity?: number; fromToolChoice?: true }>
): ItemSet {
  const out: ItemSet = {};
  for (const item of items) {
    // Skip name-only flavour AND the `fromToolChoice` marker (asserted separately).
    if (item.srdId === undefined) continue;
    out[item.srdId] = (out[item.srdId] ?? 0) + (item.quantity ?? 1);
  }
  return out;
}

/** The item-count of each `fromToolChoice` marker in an option, in order. */
function toolChoiceCountsOf(
  items: ReadonlyArray<{ fromToolChoice?: true; quantity?: number }>
): number[] {
  return items.filter((i) => i.fromToolChoice === true).map((i) => i.quantity ?? 1);
}

describe("class starting-equipment facts (2024 wikidot)", () => {
  it("pins every class — no class is missing from the fact table", () => {
    // The Artificer is content-pack-only; its facts are pinned in
    // content-pack/tests/unit/starting-equipment-facts.pack.test.ts. Every
    // OTHER loaded class must have a row here (the filter tolerates absence —
    // in SRD-only mode there is simply no artificer to skip).
    expect(Object.keys(FACTS).sort()).toEqual(
      classTables
        .map((c) => c.id)
        .filter((id) => id !== "artificer")
        .sort()
    );
  });

  for (const [classId, facts] of Object.entries(FACTS)) {
    describe(classId, () => {
      const options = getClassTable(classId)?.startingEquipment ?? [];

      it("offers exactly the expected option labels in order", () => {
        expect(options.map((o) => o.label)).toEqual(facts.labels);
      });

      it("Option A grants the correct items (ids + quantities)", () => {
        const a = options.find((o) => o.label === "A");
        expect(a).toBeDefined();
        expect(itemSetOf(a?.items ?? [])).toEqual(facts.optionAItems);
      });

      it("Option A carries the expected chosen-tool pack members", () => {
        const a = options.find((o) => o.label === "A");
        expect(toolChoiceCountsOf(a?.items ?? [])).toEqual(facts.toolChoiceCounts ?? []);
      });

      it("every option grants the correct gold", () => {
        for (const opt of options) {
          expect(opt.gold, `${classId} option ${opt.label} gold`).toBe(
            facts.gold[opt.label]
          );
        }
      });

      if (facts.optionBItems) {
        it("the second gear option grants the correct items", () => {
          const b = options.find((o) => o.label === facts.optionBLabel);
          expect(b).toBeDefined();
          expect(itemSetOf(b?.items ?? [])).toEqual(facts.optionBItems);
        });
      } else {
        it("the all-gold option carries no items", () => {
          const allGold = options.filter((o) => o.label !== "A");
          for (const opt of allGold) {
            expect(opt.items, `${classId} option ${opt.label}`).toHaveLength(0);
          }
        });
      }
    });
  }
});
