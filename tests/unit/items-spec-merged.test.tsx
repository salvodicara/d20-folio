/**
 * Unified Items spec — the merged Equipment + Magic Items browser (2026-08-01).
 *
 * The two corpora stay SEPARATE data shapes; `itemsSpec` wraps each row in a
 * discriminated `ItemEntry` and delegates the per-corpus facts to the existing
 * equipment/magic specs. These tests pin the MERGE contract:
 *   • the data spans BOTH corpora, in mundane-then-magic order;
 *   • getId is unique + kind-prefixed (no cross-corpus collision);
 *   • the smart facet rail: a Magic lens, one Kind axis spanning both datasets,
 *     and the magic-only Rarity + Attunement axes that render only in a magic
 *     context (their `render` returns null otherwise, so the strip hides);
 *   • the predicates gate the right corpus;
 *   • onAdd routes to the corpus commit (mundane weapon → weapons[], magic → equipment[]).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { itemsSpec, type ItemEntry, type PickerCtx } from "@/features/compendium/picker";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

const t = ((key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue ?? key) as unknown as PickerCtx["t"];

function ctx(character: CharacterDoc | null = null): PickerCtx {
  return { t, locale: "en", character, mode: character ? "add" : "browse" };
}

/** Assert-present helper (the lint bans `!`): fail loudly on a missing fixture. */
function req<T>(v: T | undefined | null, what: string): T {
  if (v == null) throw new Error(`missing fixture: ${what}`);
  return v;
}

function group(id: string) {
  return req(
    itemsSpec.filters.find((f) => f.id === id),
    `items filter group "${id}"`
  );
}

const equipmentEntry = (
  pred: (i: (typeof SRD_EQUIPMENT)[number]) => boolean
): ItemEntry => ({
  kind: "equipment",
  item: req(SRD_EQUIPMENT.find(pred), "equipment fixture"),
});
const magicEntry = (
  pred: (i: (typeof SRD_MAGIC_ITEMS)[number]) => boolean
): ItemEntry => ({
  kind: "magic",
  item: req(SRD_MAGIC_ITEMS.find(pred), "magic fixture"),
});

describe("itemsSpec — unified data over both corpora", () => {
  it("spans mundane equipment THEN magic items (curated order)", () => {
    expect(itemsSpec.data.length).toBe(SRD_EQUIPMENT.length + SRD_MAGIC_ITEMS.length);
    const first = itemsSpec.data[0] as ItemEntry;
    const last = itemsSpec.data[itemsSpec.data.length - 1] as ItemEntry;
    expect(first.kind).toBe("equipment");
    expect(last.kind).toBe("magic");
    // The boundary is exactly at the equipment count.
    expect((itemsSpec.data[SRD_EQUIPMENT.length] as ItemEntry).kind).toBe("magic");
  });

  it("gives every row a UNIQUE, kind-prefixed id (no cross-corpus collision)", () => {
    const ids = itemsSpec.data.map((e) => itemsSpec.getId(e));
    expect(new Set(ids).size).toBe(ids.length);
    const eq = itemsSpec.data[0] as ItemEntry;
    expect(itemsSpec.getId(eq)).toMatch(/^e:/);
    const mg = itemsSpec.data[SRD_EQUIPMENT.length] as ItemEntry;
    expect(itemsSpec.getId(mg)).toMatch(/^m:/);
  });
});

describe("itemsSpec — smart facet rail", () => {
  it("exposes exactly four axes: magic · kind · rarity · attunement", () => {
    expect(itemsSpec.filters.map((f) => f.id)).toEqual([
      "magic",
      "kind",
      "rarity",
      "attunement",
    ]);
  });

  it("the Kind axis spans BOTH corpora (Weapon matches mundane AND magic weapons)", () => {
    const kind = group("kind");
    const mundaneWeapon = equipmentEntry((i) => i.category === "weapon");
    const magicWeapon = magicEntry((i) => i.type === "weapon");
    const magicRing = magicEntry((i) => i.type === "ring");
    expect(kind.predicate(mundaneWeapon, "weapon", ctx(), {})).toBe(true);
    expect(kind.predicate(magicWeapon, "weapon", ctx(), {})).toBe(true);
    expect(kind.predicate(magicRing, "weapon", ctx(), {})).toBe(false);
    // null = All → everything passes.
    expect(kind.predicate(magicRing, null, ctx(), {})).toBe(true);
  });

  it("the Magic lens gates by corpus (magic vs mundane)", () => {
    const lens = group("magic");
    const eq = equipmentEntry(() => true);
    const mg = magicEntry(() => true);
    expect(lens.predicate(eq, "all", ctx(), {})).toBe(true);
    expect(lens.predicate(mg, "all", ctx(), {})).toBe(true);
    expect(lens.predicate(mg, "magic", ctx(), {})).toBe(true);
    expect(lens.predicate(eq, "magic", ctx(), {})).toBe(false);
    expect(lens.predicate(eq, "mundane", ctx(), {})).toBe(true);
    expect(lens.predicate(mg, "mundane", ctx(), {})).toBe(false);
  });

  it("Rarity + Attunement are magic-only (a mundane row never matches a set value)", () => {
    const rarity = group("rarity");
    const attune = group("attunement");
    const eq = equipmentEntry(() => true);
    const rareMagic = magicEntry((i) => i.rarity === "rare");
    expect(rarity.predicate(rareMagic, "rare", ctx(), {})).toBe(true);
    expect(rarity.predicate(eq, "rare", ctx(), {})).toBe(false);
    const attuned = magicEntry((i) => i.attunement);
    expect(attune.predicate(attuned, true, ctx(), {})).toBe(true);
    expect(attune.predicate(eq, true, ctx(), {})).toBe(false);
  });

  it("Rarity + Attunement RENDER only in a magic context (hidden off a mundane pool)", () => {
    const rarity = group("rarity");
    const attune = group("attunement");
    const noop = () => {};
    // No magic signal → both hidden (null render → the strip is skipped).
    expect(rarity.render(null, noop, ctx(), { magic: "all", kind: null })).toBeNull();
    expect(attune.render(null, noop, ctx(), { magic: "all", kind: null })).toBeNull();
    // Magic lens on → both surface.
    expect(rarity.render(null, noop, ctx(), { magic: "magic" })).not.toBeNull();
    // A magic-only Kind (ring) also enters magic context.
    expect(attune.render(null, noop, ctx(), { kind: "ring" })).not.toBeNull();
  });

  it("carries glossary terms on the jargon axes (Rarity, Attunement)", () => {
    expect(group("rarity").term).toBe("magicRarity");
    expect(group("attunement").term).toBe("attunement");
  });
});

describe("itemsSpec — onAdd routes to the right corpus commit", () => {
  beforeEach(() => {
    useCharacterStore.setState({
      character: structuredClone(MOCK_CHARACTER),
      loading: false,
      error: null,
    });
  });

  it("a mundane weapon lands in weapons[]; a magic item lands in equipment[]", () => {
    const character = req(useCharacterStore.getState().character, "loaded character");
    const weaponsBefore = character.character.weapons.length;
    const equipBefore = character.character.equipment.length;

    itemsSpec.onAdd?.(
      equipmentEntry((i) => i.category === "weapon"),
      ctx(character),
      1
    );
    const afterWeapon = req(
      useCharacterStore.getState().character,
      "character after weapon"
    );
    expect(afterWeapon.character.weapons.length).toBe(weaponsBefore + 1);

    itemsSpec.onAdd?.(
      magicEntry((i) => i.type === "wondrous" && !i.attunement),
      ctx(afterWeapon),
      1
    );
    const afterMagic = req(
      useCharacterStore.getState().character,
      "character after magic"
    );
    expect(afterMagic.character.equipment.length).toBe(equipBefore + 1);
  });
});
