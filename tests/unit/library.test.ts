/**
 * The homebrew-library MODEL (`src/lib/library.ts`) — the account-level promotion of
 * the four per-character custom types.
 *
 * Pins the three facts the whole feature rests on:
 *  1. a saved entry is a TEMPLATE — every per-character play value is stripped, per
 *     kind (table-driven over all four kinds, so a new kind can't ship unstripped);
 *  2. re-saving the same (kind, name) REPLACES in place — original id, original
 *     position, `replaced: true` — and the cap only bites on genuinely new entries;
 *  3. landing re-seeds the create-form defaults and never aliases the stored entry.
 */
import { describe, expect, it } from "vitest";
import {
  customDraftAt,
  entryToCharacterItem,
  isEntryNamed,
  libraryEntryName,
  toLibraryEntry,
  upsertEntry,
  type LibraryDraft,
  type LibraryEntry,
} from "@/lib/library";
import { FREE_TIER_LIMITS } from "@/lib/limits";
import { isItemInstanceId } from "@/lib/item-resources";
import type {
  CustomEquipment,
  CustomFeature,
  CustomSpell,
  CustomWeapon,
} from "@/types/character";
import type { CustomMonster } from "@/types/campaign";
import { customInstanceId } from "./__helpers__/custom-items";

const NOW = 1_700_000_000_000;

const SPELL: CustomSpell = {
  custom: true,
  name: "Hearthfire Bolt",
  level: 2,
  school: "evocation",
  castingTime: "action",
  range: "60 feet",
  components: { v: true, s: true, m: false },
  duration: "Instantaneous",
  concentration: false,
  description: "A dart of banked embers.",
  prepared: true,
  notes: "Lyra's favourite opener",
  tags: [{ label: "signature", color: "#c9a227" }],
  instanceId: customInstanceId("Hearthfire Bolt"),
};

const FEATURE: CustomFeature = {
  custom: true,
  title: "Oath of the Long Road",
  emoji: "scroll",
  source: "Homebrew",
  tags: [{ label: "oath", color: "#c9a227" }],
  contentBlocks: [{ type: "text", text: "Once per long rest, ignore exhaustion." }],
  trackers: [{ id: "custom-oath", label: "Oath", total: "1", recovery: "long-rest" }],
  actions: [{ type: "bonus", label: "Invoke", description: "Shrug off the road." }],
  instanceId: customInstanceId("Oath of the Long Road"),
};

const EQUIPMENT: CustomEquipment = {
  custom: true,
  name: "Ember Wand",
  description: "A charred rowan wand.",
  equipped: true,
  quantity: 3,
  tracked: true,
  attuned: true,
  notes: "found in the barrow",
  charges: { current: 1, max: 7, recovery: "long-rest", recoveryFormula: "1d6+1" },
  instanceId: customInstanceId("Ember Wand"),
};

const WEAPON: CustomWeapon = {
  custom: true,
  name: "Bramble Spear",
  quantity: 4,
  damageDie: "1d8",
  damageType: "piercing",
  attackStat: "STR",
  properties: "Thrown (20/60)",
  notes: "haft is cracked",
  tags: [{ label: "loaned", color: "#8a8a8a" }],
  attackBonusOverride: 7,
  damageOverride: "1d8+5",
  instanceId: customInstanceId("Bramble Spear"),
};

const MONSTER: CustomMonster = {
  name: "Ashmaw Hound",
  ac: 14,
  maxHp: 33,
  creatureType: "monstrosity",
  cr: "2",
  notes: "hunts in pairs",
  portraitUrl: "https://x/monster-ashmaw.jpeg",
  portraitCrop: { x: 5, y: 5, width: 80, height: 80 },
};

/** Every field {@link toLibraryEntry} must have removed, per kind. */
const STRIP_CASES: ReadonlyArray<{
  draft: LibraryDraft;
  name: string;
  stripped: readonly string[];
  kept: readonly string[];
}> = [
  {
    draft: { kind: "spell", item: SPELL },
    name: "Hearthfire Bolt",
    stripped: ["prepared", "notes", "tags"],
    kept: ["name", "level", "school", "description", "components", "instanceId"],
  },
  {
    draft: { kind: "equipment", item: EQUIPMENT },
    name: "Ember Wand",
    stripped: ["equipped", "quantity", "attuned", "notes"],
    // `tracked` is the authored tracking MODE (the tier of isConsumable / isPotion),
    // not play state — the play value is the `quantity` it counts, which IS stripped.
    // Keeping it is what makes the pencil's edit round-trip lossless.
    kept: ["name", "description", "charges", "tracked", "instanceId"],
  },
  {
    draft: { kind: "weapon", item: WEAPON },
    name: "Bramble Spear",
    stripped: ["notes", "tags", "attackBonusOverride", "damageOverride"],
    kept: ["name", "damageDie", "damageType", "attackStat", "properties", "instanceId"],
  },
  {
    draft: { kind: "feature", item: FEATURE },
    name: "Oath of the Long Road",
    // A feature's contentBlocks / trackers / actions / tags ARE its content.
    stripped: [],
    kept: [
      "title",
      "source",
      "tags",
      "contentBlocks",
      "trackers",
      "actions",
      "instanceId",
    ],
  },
  {
    draft: { kind: "monster", item: MONSTER },
    name: "Ashmaw Hound",
    // A monster template has NO per-encounter play value (the encounter re-seeds it);
    // its portrait + creatureType ARE identity, kept whole (the feature-tier case).
    stripped: [],
    kept: ["name", "ac", "maxHp", "creatureType", "cr", "portraitUrl", "portraitCrop"],
  },
];

describe("toLibraryEntry — a saved entry is a template, not a sheet row", () => {
  for (const { draft, name, stripped, kept } of STRIP_CASES) {
    it(`${draft.kind}: strips per-character play state and keeps the content`, () => {
      const entry = toLibraryEntry(draft, NOW);
      expect(entry.kind).toBe(draft.kind);
      expect(entry.savedAt).toBe(NOW);
      // A sheet entry's id IS the item's own instanceId (shared identity between
      // the template and every character's copy); a monster has no instanceId of
      // its own, so it alone still mints a fresh UUID.
      if (draft.kind === "monster") {
        expect(entry.id).toMatch(/[0-9a-f-]{36}/);
      } else {
        expect(entry.id).toBe(draft.item.instanceId);
      }
      expect(libraryEntryName(entry)).toBe(name);
      const item: Record<string, unknown> = { ...entry.item };
      for (const field of stripped) expect(item).not.toHaveProperty(field);
      for (const field of kept) expect(item).toHaveProperty(field);
    });
  }

  it("winds a charge pool back to full (a saved wand is never half-spent)", () => {
    const entry = toLibraryEntry({ kind: "equipment", item: EQUIPMENT }, NOW);
    expect(entry.kind).toBe("equipment");
    if (entry.kind !== "equipment") return;
    expect(entry.item.charges).toEqual({
      current: 7,
      max: 7,
      recovery: "long-rest",
      recoveryFormula: "1d6+1",
    });
  });

  it("resets a weapon's quantity to 1 (the type requires the field)", () => {
    const entry = toLibraryEntry({ kind: "weapon", item: WEAPON }, NOW);
    expect(entry.kind).toBe("weapon");
    if (entry.kind !== "weapon") return;
    expect(entry.item.quantity).toBe(1);
  });

  it("deep-copies — mutating the entry never touches the character's item", () => {
    const entry = toLibraryEntry({ kind: "feature", item: FEATURE }, NOW);
    expect(entry.kind).toBe("feature");
    if (entry.kind !== "feature") return;
    entry.item.contentBlocks.push({ type: "text", text: "rewritten" });
    entry.item.title = "renamed";
    expect(FEATURE.contentBlocks).toHaveLength(1);
    expect(FEATURE.title).toBe("Oath of the Long Road");
  });
});

describe("customDraftAt — only a HOMEBREW row is library material", () => {
  const data = {
    spells: [SPELL, { srdId: "fireball" }],
    features: [FEATURE],
    equipment: [EQUIPMENT],
    weapons: [WEAPON],
  } as unknown as Parameters<typeof customDraftAt>[0];

  it("returns the stored item, tagged with its kind", () => {
    expect(customDraftAt(data, "spell", 0)).toEqual({ kind: "spell", item: SPELL });
    expect(customDraftAt(data, "feature", 0)).toEqual({ kind: "feature", item: FEATURE });
    expect(customDraftAt(data, "equipment", 0)).toEqual({
      kind: "equipment",
      item: EQUIPMENT,
    });
    expect(customDraftAt(data, "weapon", 0)).toEqual({ kind: "weapon", item: WEAPON });
  });

  it("returns null for an SRD reference and for a gone index", () => {
    expect(customDraftAt(data, "spell", 1)).toBeNull();
    expect(customDraftAt(data, "spell", 9)).toBeNull();
    expect(customDraftAt(data, "weapon", 3)).toBeNull();
  });
});

describe("upsertEntry — same (kind, name) replaces in place", () => {
  const first = toLibraryEntry({ kind: "spell", item: SPELL }, NOW);
  const other = toLibraryEntry({ kind: "weapon", item: WEAPON }, NOW);

  it("appends a genuinely new entry", () => {
    const { entries, replaced } = upsertEntry([first], other);
    expect(replaced).toBe(false);
    expect(entries.map((e) => e.id)).toEqual([first.id, other.id]);
  });

  it("replaces the same (kind, name) keeping the OLD id and position", () => {
    const resaved = toLibraryEntry(
      { kind: "spell", item: { ...SPELL, description: "brighter embers" } },
      NOW + 1000
    );
    const { entries, replaced } = upsertEntry([first, other], resaved);
    expect(replaced).toBe(true);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).toBe(first.id); // old id survives
    expect(entries[1]?.id).toBe(other.id); // position preserved
    expect(entries[0]?.savedAt).toBe(NOW + 1000); // content is the new one
    const item = entries[0]?.item as CustomSpell;
    expect(item.description).toBe("brighter embers");
  });

  it("matches the name case- and whitespace-insensitively", () => {
    const resaved = toLibraryEntry(
      { kind: "spell", item: { ...SPELL, name: "  hearthfire BOLT " } },
      NOW
    );
    expect(upsertEntry([first], resaved).replaced).toBe(true);
  });

  it("does NOT collide across kinds with the same name", () => {
    const sameName = toLibraryEntry(
      { kind: "equipment", item: { ...EQUIPMENT, name: SPELL.name } },
      NOW
    );
    const { entries, replaced } = upsertEntry([first], sameName);
    expect(replaced).toBe(false);
    expect(entries).toHaveLength(2);
  });

  it("the cap counts the post-upsert list, so a replace never overflows it", () => {
    const full: LibraryEntry[] = Array.from(
      { length: FREE_TIER_LIMITS.libraryEntries },
      (_, i) =>
        toLibraryEntry(
          {
            kind: "spell",
            item: { ...SPELL, name: `S${i}`, instanceId: customInstanceId(`S${i}`) },
          },
          NOW
        )
    );
    const appended = upsertEntry(full, other);
    expect(appended.replaced).toBe(false);
    expect(appended.entries.length).toBeGreaterThan(FREE_TIER_LIMITS.libraryEntries);
    const replacedSame = upsertEntry(
      full,
      toLibraryEntry({ kind: "spell", item: { ...SPELL, name: "S0" } }, NOW)
    );
    expect(replacedSame.replaced).toBe(true);
    expect(replacedSame.entries).toHaveLength(FREE_TIER_LIMITS.libraryEntries);
  });
});

describe("isEntryNamed — the identity a rename has to move", () => {
  const spell = toLibraryEntry({ kind: "spell", item: SPELL }, NOW);
  const feature = toLibraryEntry({ kind: "feature", item: FEATURE }, NOW);

  it("matches the SAME (kind, name) that upsertEntry matches on", () => {
    expect(isEntryNamed(spell, "spell", "Hearthfire Bolt")).toBe(true);
    expect(isEntryNamed(spell, "spell", "  hearthfire BOLT ")).toBe(true);
    // A feature is named by its title, like everywhere else.
    expect(isEntryNamed(feature, "feature", "Oath of the Long Road")).toBe(true);
  });

  it("never matches another kind or another name", () => {
    expect(isEntryNamed(spell, "equipment", "Hearthfire Bolt")).toBe(false);
    expect(isEntryNamed(spell, "spell", "Hearthfire Bolts")).toBe(false);
    expect(isEntryNamed(feature, "feature", "Oath of the Short Road")).toBe(false);
  });
});

describe("entryToCharacterItem — landing re-seeds the create-form defaults", () => {
  it("a spell lands prepared", () => {
    const landed = entryToCharacterItem(
      toLibraryEntry({ kind: "spell", item: SPELL }, NOW)
    );
    expect(landed.kind).toBe("spell");
    if (landed.kind !== "spell") return;
    expect(landed.item.prepared).toBe(true);
    expect(landed.item.notes).toBeUndefined();
  });

  it("equipment lands equipped, quantity 1, charges full", () => {
    const landed = entryToCharacterItem(
      toLibraryEntry({ kind: "equipment", item: EQUIPMENT }, NOW)
    );
    expect(landed.kind).toBe("equipment");
    if (landed.kind !== "equipment") return;
    expect(landed.item.equipped).toBe(true);
    expect(landed.item.quantity).toBe(1);
    expect(landed.item.charges?.current).toBe(7);
  });

  it("a weapon lands at quantity 1 without the previous owner's overrides", () => {
    const landed = entryToCharacterItem(
      toLibraryEntry({ kind: "weapon", item: WEAPON }, NOW)
    );
    expect(landed.kind).toBe("weapon");
    if (landed.kind !== "weapon") return;
    expect(landed.item.quantity).toBe(1);
    expect(landed.item.attackBonusOverride).toBeUndefined();
    expect(landed.item.damageOverride).toBeUndefined();
  });

  it("round-trips a feature whole, and hands back a COPY (never the stored entry)", () => {
    const entry = toLibraryEntry({ kind: "feature", item: FEATURE }, NOW);
    const landed = entryToCharacterItem(entry);
    expect(landed.kind).toBe("feature");
    if (landed.kind !== "feature" || entry.kind !== "feature") return;
    expect(landed.item).toEqual(entry.item);
    landed.item.title = "edited on the sheet";
    expect(entry.item.title).toBe("Oath of the Long Road");
  });

  it("a library entry keeps the item's instanceId and lands with a fresh one only on collision", () => {
    const item: CustomEquipment = {
      custom: true,
      name: "Boots",
      instanceId: "boots-1",
    };
    const entry = toLibraryEntry({ kind: "equipment", item }, 1);
    expect(entry.id).toBe("boots-1");
    expect(entryToCharacterItem(entry, 1).item.instanceId).toBe("boots-1");
    const landed = entryToCharacterItem(entry, 1, new Set(["boots-1"]));
    expect(landed.item.instanceId).not.toBe("boots-1");
    expect(isItemInstanceId(landed.item.instanceId)).toBe(true);
  });
});
