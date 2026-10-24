/**
 * Magic items, batch 3: the creatures items call, the Necklace of Fireballs' beads,
 * and the light, knots and wards the text states. Every case is read from the
 * item's English catalogue text (the creature it names, how many, the bead roll,
 * the save DC), never typed twice.
 */
import { describe, expect, it } from "vitest";
import enMonsters from "@/i18n/en/srd/monsters.json";
import { getMagicItem, SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { getMonster } from "@/data/monsters";
import { getSpellById } from "@/data/spells";
import type { SrdMagicItemData } from "@/data/types";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { migrateLegacyItemResources } from "@/lib/item-resources";
import { localizeSrd } from "@/i18n/resolver";
import { buildItemSummonGroups } from "@/lib/views/companion-row-view";
import { freeCastSourcesForSpell } from "@/lib/views/spell-cast-sources";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";
import { srd } from "../_harness/loc";
import { makeCharacterDoc } from "./_helpers";

const text = (id: string): string => srd("magic-item", id, "description", "en");

function item(id: string): SrdMagicItemData {
  const found = getMagicItem(id);
  if (!found) throw new Error(`missing magic item ${id}`);
  return found;
}

function worn(itemId: string, extra: Partial<SrdEquipmentRef> = {}): SrdEquipmentRef {
  return {
    srdId: itemId,
    instanceId: `${itemId}-copy`,
    equipped: true,
    attuned: true,
    quantity: 1,
    ...extra,
  };
}

function bearer(
  ref: SrdEquipmentRef,
  session: Partial<CharacterDoc["session"]> = {}
): CharacterDoc {
  return makeCharacterDoc({ equipment: [ref] }, session);
}

/** The bestiary id whose English name the text writes ("Giant Constrictor Snake"). */
function monsterNamed(name: string): string {
  const entry = Object.entries(enMonsters as Record<string, { name?: string }>).find(
    ([, value]) => value.name === name
  );
  if (!entry) throw new Error(`no bestiary creature named ${name}`);
  return entry[0];
}

// ── Creatures the item calls ──────────────────────────────────────────────────

/** [item, the sentence that names the creature, how many the text says]. */
const SUMMONS: ReadonlyArray<[string, RegExp, (t: string) => number]> = [
  ["figurine-of-wondrous-power", /It can become an? ([A-Z][a-z]+) for up to/, () => 1],
  [
    "staff-of-the-python",
    /causing the staff to become an? ([A-Z][\w ]+?) in that/,
    () => 1,
  ],
  [
    "horn-of-valhalla",
    /Each spirit uses the ([A-Z]\w+) stat block/,
    // The table's first (most common) horn, Silver, calls 2 spirits.
    (t) => Number(/01-40 Silver (\d+)/.exec(t)?.[1]),
  ],
  ["ring-of-djinni-summoning", /summon a particular ([A-Z]\w+) from/, () => 1],
  ["efreeti-bottle", /an ([A-Z]\w+) appears in an unoccupied space/, () => 1],
];

describe("items that call a bestiary creature", () => {
  it.each(SUMMONS)("%s calls the creature its text names", (id, phrase, howMany) => {
    const t = text(id);
    const name = phrase.exec(t)?.[1];
    expect(name, id).toBeDefined();
    const monsterId = monsterNamed(name ?? "");
    expect(getMonster(monsterId), monsterId).toBeDefined();

    const groups = buildItemSummonGroups(bearer(worn(id)));
    expect(groups).toEqual([
      {
        itemId: id,
        groupId: `magic-item:${id}-copy`,
        options: [monsterId],
        monsterId,
        count: howMany(t),
        current: Array.from({ length: howMany(t) }, () => undefined),
      },
    ]);
  });

  it.each(SUMMONS)("%s calls nothing while it is not equipped", (id) => {
    expect(buildItemSummonGroups(bearer(worn(id, { equipped: false })))).toEqual([]);
  });

  it.each(SUMMONS.filter(([id]) => item(id).attunement).map(([id]) => [id] as const))(
    "%s calls nothing until you attune to it",
    (id) => {
      expect(text(id)).toMatch(/./);
      expect(buildItemSummonGroups(bearer(worn(id, { attuned: false })))).toEqual([]);
    }
  );

  it("Horn of Valhalla: a Bronze horn's 4 spirits each keep their own Hit Points", () => {
    const spirits = Number(/76-90 Bronze (\d+)/.exec(text("horn-of-valhalla"))?.[1]);
    expect(spirits).toBe(4);
    const key = "magic-item:horn-of-valhalla-copy";
    const [group] = buildItemSummonGroups(
      bearer(worn("horn-of-valhalla"), {
        companionCount: { [key]: spirits },
        companionHp: { [`${key}#3`]: { current: 7 } },
      })
    );
    expect(group).toMatchObject({
      monsterId: "berserker",
      count: 4,
      current: [undefined, undefined, 7, undefined],
    });
  });

  it("two copies of one item are two groups, keyed by copy", () => {
    const doc = makeCharacterDoc({
      equipment: [
        worn("efreeti-bottle", { instanceId: "bottle-a" }),
        worn("efreeti-bottle", { instanceId: "bottle-b" }),
      ],
    });
    expect(buildItemSummonGroups(doc).map((g) => g.groupId)).toEqual([
      "magic-item:bottle-a",
      "magic-item:bottle-b",
    ]);
  });

  it("Iron Flask: the creature trapped inside is whichever the player picks", () => {
    const id = "iron-flask";
    expect(text(id)).toMatch(/target a creature that you can see/);
    expect(text(id)).toMatch(/The flask can hold only one creature at a time/);
    const key = `magic-item:${id}-copy`;
    expect(buildItemSummonGroups(bearer(worn(id)))).toEqual([
      { itemId: id, groupId: key, options: [], pick: {}, count: 1, current: [undefined] },
    ]);
    const [held] = buildItemSummonGroups(
      bearer(worn(id), { companionVariant: { [key]: "efreeti" } })
    );
    expect(held).toMatchObject({ monsterId: "efreeti", count: 1 });
  });

  it("every item that calls creatures names real bestiary entries", () => {
    for (const entry of SRD_MAGIC_ITEMS) {
      for (const option of entry.summonedMonsters?.options ?? []) {
        expect(
          getMonster(option.monsterId),
          `${entry.id} → ${option.monsterId}`
        ).toBeDefined();
      }
    }
  });
});

// ── Necklace of Fireballs ─────────────────────────────────────────────────────

describe("Necklace of Fireballs", () => {
  const id = "necklace-of-fireballs";

  it("has the bead count the text rolls, and they never come back", () => {
    const m = /Has (\d+)d(\d+)\+(\d+) beads/.exec(text(id));
    expect(m).not.toBeNull();
    expect(item(id).resources).toEqual([
      {
        kind: "counter",
        id: "beads",
        unit: "beads",
        capacity: {
          kind: "entered-roll",
          roll: { dice: Number(m?.[1]), sides: Number(m?.[2]), modifier: Number(m?.[3]) },
        },
        initial: { kind: "full" },
      },
    ]);
  });

  it("a thrown bead is a Fireball at the text's save DC, paid with one bead", () => {
    const m = /detonates as a Fireball \(DEX DC (\d+), (\d+d\d+) fire\)/.exec(text(id));
    expect(m).not.toBeNull();
    const fireball = getSpellById("fireball");
    expect(fireball?.damageDice).toBe(m?.[2]);
    // The table has rolled the necklace's beads (7): the cast is paid from them.
    const instanceId = `${id}-copy`;
    const doc = bearer(worn(id), {
      itemResources: {
        [instanceId]: {
          itemId: id,
          instanceId,
          revision: 0,
          resources: { beads: { capacity: 7, current: 7, disabled: false } },
          disposition: "magical",
          causalHead: null,
        },
      },
    });
    const row = freeCastSourcesForSpell(doc, "fireball", "en", "SIG").find(
      (source) =>
        source.payment?.kind === "item-resource" &&
        source.payment.instanceId === `${id}-copy`
    );
    expect(row).toBeDefined();
    expect(row?.castOverrides).toEqual({ saveDC: Number(m?.[1]) });
    // Several beads at once: the Fireball goes up one level per bead past the first.
    expect(text(id)).toMatch(/throw multiple beads at once for increased damage/);
    expect(row?.castLevels?.[0]).toEqual({ level: fireball?.level, cost: 1 });
    for (const [i, step] of (row?.castLevels ?? []).entries()) {
      expect(step).toEqual({ level: (fireball?.level ?? 0) + i, cost: i + 1 });
    }
    expect(row?.castLevels?.at(-1)?.level).toBe(9);
  });

  const necklaceOwner = (charges: { current: number; max: number }) =>
    makeCharacterDoc({
      equipment: [{ srdId: id, quantity: 1, equipped: true, charges }],
    });
  const ids = () => "00000000-0000-4000-8000-000000000001";

  it("the dry-run maps a legacy bead counter onto the rolled capacity it fits", () => {
    const result = migrateLegacyItemResources(
      necklaceOwner({ current: 5, max: 9 }),
      SRD_MAGIC_ITEMS,
      ids
    );
    expect(result.status).toBe("migrated");
    if (result.status === "ambiguous") return;
    const instanceId = ids();
    expect(result.doc.session.itemResources?.[instanceId]?.resources).toEqual({
      beads: { capacity: 9, current: 5, disabled: false },
    });
    expect(result.doc.character.equipment[0]).not.toHaveProperty("charges");
  });

  it("a legacy counter the roll could never make stays ambiguous", () => {
    // 1d6 + 3 makes 4..9 beads: a counter of 12 is not a necklace this table rolled.
    const result = migrateLegacyItemResources(
      necklaceOwner({ current: 2, max: 12 }),
      SRD_MAGIC_ITEMS,
      ids
    );
    expect(result).toMatchObject({
      status: "ambiguous",
      ambiguities: [{ itemId: id, reason: "unsupported-legacy-spec" }],
    });
  });
});

// ── Light, knots and wards ────────────────────────────────────────────────────

describe("states and wards the text states", () => {
  it("Candle of Invocation: while it is lit, you have Advantage on D20 Tests", () => {
    const id = "candle-of-invocation";
    expect(text(id)).toMatch(
      /While you are within that light, you have Advantage on D20 Tests/
    );
    const doc = bearer(worn(id));
    const kinds = () =>
      aggregateCharacterGrants(doc.character, doc.session)
        .advantages.filter((a) => a.vs === id)
        .map((a) => a.rollType)
        .sort();
    expect(kinds()).toEqual([]);
    doc.session.activeFeatures = [`magic-item:${id}-copy:${id}`];
    expect(kinds()).toEqual(["attack", "check", "save"]);
  });

  it("Rope of Climbing: knotted, it grants Advantage on checks to climb with it", () => {
    const id = "rope-of-climbing";
    expect(text(id)).toMatch(
      /grants Advantage on ability checks made to climb using the rope/
    );
    const doc = bearer(worn(id));
    const climb = () =>
      aggregateCharacterGrants(doc.character, doc.session).advantages.filter(
        (a) => a.rollType === "check" && a.vs === "athletics-climb"
      );
    expect(climb()).toHaveLength(0);
    doc.session.activeFeatures = [`magic-item:${id}-copy:rope-of-climbing-knotted`];
    expect(climb()).toHaveLength(1);
  });

  /** [item, the protection the text states]. */
  const WARDS: ReadonlyArray<[string, RegExp]> = [
    [
      "amulet-of-proof-against-detection-and-location",
      /you can’t be targeted by Divination spells or perceived through magical scrying sensors/,
    ],
    [
      "ring-of-mind-shielding",
      /you are immune to magic that allows other creatures to read your thoughts/,
    ],
  ];

  it.each(WARDS)("%s: worn and attuned, its ward is a Defenses line", (id, phrase) => {
    expect(text(id)).toMatch(phrase);
    const notes = (attuned: boolean) => {
      const doc = bearer(worn(id, { attuned }));
      return aggregateCharacterGrants(doc.character, doc.session).defenseNotes;
    };
    expect(notes(false)).toHaveLength(0);
    expect(notes(true)).toHaveLength(1);
    for (const locale of ["en", "it"] as const) {
      expect(localizeSrd("magic-item", `${id}.grants.0`, "description", locale)).not.toBe(
        ""
      );
    }
  });
});
