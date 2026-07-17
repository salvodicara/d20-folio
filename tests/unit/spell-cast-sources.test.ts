/**
 * resolveSpellCastOptions — the shared cast-option source the Spells page and
 * the Combat page both render from (ARCHITECTURE.md combat model parity). Covers upcast
 * slots, ref-level free casts (Aberrant), signature gating, and cantrips.
 */
import { describe, expect, it } from "vitest";
import {
  resolveSpellCastOptions,
  resolveMetamagicForCast,
  remainingSorceryPoints,
  freeCastSourcesForSpell,
} from "@/lib/views/spell-cast-sources";
import { MOCK_CHARACTER } from "@/lib/mock";
import { makeCharacterDoc } from "./_helpers";
import type { CharacterDoc } from "@/types/character";

const LABELS = { mastery: "MASTERY", signature: "SIGNATURE" };

function withSlots(overrides: Partial<CharacterDoc["character"]> = {}): CharacterDoc {
  const c = structuredClone(MOCK_CHARACTER);
  c.character.spellSlots = [
    { level: 1, total: 4 },
    { level: 2, total: 3 },
    { level: 3, total: 2 },
  ];
  c.session.spellSlots = {};
  Object.assign(c.character, overrides);
  return c;
}

describe("resolveSpellCastOptions", () => {
  it("offers every slot level at/above the spell's base level", () => {
    const c = withSlots({ spells: [{ srdId: "bless", prepared: true }] });
    const opts = resolveSpellCastOptions(c, "bless", 1, true, "en", LABELS);
    expect(opts.filter((o) => o.kind === "slot").map((o) => o.level)).toEqual([1, 2, 3]);
  });

  it("cantrips (base level 0) have no options", () => {
    const c = withSlots();
    expect(resolveSpellCastOptions(c, "fire-bolt", 0, true, "en", LABELS)).toEqual([]);
  });

  it("surfaces a ref-level free cast (Aberrant freeCastSource) at base level", () => {
    const c = withSlots({
      spells: [
        {
          srdId: "chromatic-orb",
          prepared: true,
          freeCastSource: {
            sourceId: "test-free-cast-feat",
            rest: "long",
            usesPerRest: 1,
          },
        },
      ],
    });
    const opts = resolveSpellCastOptions(c, "chromatic-orb", 1, true, "en", LABELS);
    expect(
      opts.some((o) => o.kind === "free-cast" && o.sourceId === "test-free-cast-feat")
    ).toBe(true);
  });
});

// S9 — a charged magic item (Wand of Magic Missiles, Staff of Healing) emits its
// cast row through the SAME free-cast-spell seam feats use, keyed by an
// item-charge tracker (= the item id). Table over the wired charged items.
describe("S9 — charged-item cast rows via the spell-cast-sources seam", () => {
  function withItem(srdId: string): CharacterDoc {
    const c = structuredClone(MOCK_CHARACTER);
    c.character.spells = [];
    // Attuned: several charged items (staves, some wands) require attunement and
    // are inert until attuned (issue #37); attuning is harmless for the rest.
    c.character.equipment = [{ srdId, equipped: true, quantity: 1, attuned: true }];
    c.session.spellSlots = {};
    c.session.trackers = {};
    return c;
  }

  it.each([
    { itemId: "wand-of-magic-missiles", spellId: "magic-missile", charges: 7 },
    { itemId: "staff-of-healing", spellId: "cure-wounds", charges: 10 },
    // Single-fixed-spell wands wired to the SAME free-cast + charge-tracker seam
    // (RAW: each has 7 charges, regains 1d6+1 at dawn). Polymorph's stat-swap
    // stays the user override — only the CAST affordance + charges are modeled.
    { itemId: "wand-of-web", spellId: "web", charges: 7 },
    { itemId: "wand-of-fireballs", spellId: "fireball", charges: 7 },
    { itemId: "wand-of-lightning-bolts", spellId: "lightning-bolt", charges: 7 },
    { itemId: "wand-of-polymorph", spellId: "polymorph", charges: 7 },
    // RAW: 3 charges, casts Detect Magic, regains 1d3 at dawn (uncommon).
    { itemId: "wand-of-magic-detection", spellId: "detect-magic", charges: 3 },
    // NON-wand items with the IDENTICAL single-fixed-spell mechanic — the family
    // spans every item type, not just wands (the closure fix). RAW dawn-renewing
    // pools confirmed via curl: helm/medallion/eyes (wondrous), trident/mace (weapon).
    { itemId: "helm-of-teleportation", spellId: "teleport", charges: 3 },
    { itemId: "medallion-of-thoughts", spellId: "detect-thoughts", charges: 5 },
    { itemId: "eyes-of-charming", spellId: "charm-person", charges: 3 },
    { itemId: "trident-of-fish-command", spellId: "dominate-beast", charges: 3 },
    // The PACK charged items (Niko's Mace, Wave — the cast-alongside-standing-grant
    // closure) are pinned in content-pack/tests/unit/spell-cast-sources.pack.test.ts.
  ])(
    "$itemId emits a free-cast row for $spellId keyed by the item charge tracker",
    ({ itemId, spellId, charges }) => {
      const c = withItem(itemId);
      const sources = freeCastSourcesForSpell(c, spellId, "en", "SIG");
      const row = sources.find((s) => s.sourceId === itemId);
      expect(row).toBeDefined();
      // The charge pool size IS the item's charge count; tracker key = item id.
      expect(row?.usesPerRest).toBe(charges);
      expect(row?.usedNow).toBe(0);
    }
  );

  it("an unequipped charged item emits NO cast row (the equip gate holds)", () => {
    const c = withItem("wand-of-magic-missiles");
    c.character.equipment = [
      { srdId: "wand-of-magic-missiles", equipped: false, quantity: 1 },
    ];
    expect(freeCastSourcesForSpell(c, "magic-missile", "en", "SIG")).toEqual([]);
  });

  it("a spent charge tracker drops the cast row (no charges left)", () => {
    const c = withItem("wand-of-magic-missiles");
    c.session.trackers = { "wand-of-magic-missiles": { used: 7 } };
    expect(freeCastSourcesForSpell(c, "magic-missile", "en", "SIG")).toEqual([]);
  });
});

// LEAK GUARD — a free-cast cast row must display a LOCALIZED source NAME, never the
// raw tracker id. Regression for "the cast modal showed `fey-touched:misty-step`":
// the per-spell key `${featId}:${spellId}` must resolve to the FEAT name by its
// prefix, in BOTH languages, and NEVER contain a `:` or equal the raw sourceId.
// (The grant-data-driven Fey-Touched leg — a PACK multi-free-cast feat — lives in
// content-pack/tests/unit/spell-cast-sources.pack.test.ts; this public leg pins the
// same prefix resolution over a ref-level composite key.)
describe("free-cast source NAME never leaks the raw tracker id", () => {
  function initiateChar(): CharacterDoc {
    const c = structuredClone(MOCK_CHARACTER);
    c.character.features = [
      ...c.character.features.filter(
        (f) => "custom" in f || f.srdId !== "magic-initiate-wizard"
      ),
      { srdId: "magic-initiate-wizard" },
    ];
    c.character.spells = [
      {
        srdId: "command",
        prepared: true,
        alwaysPrepared: true,
        freeCastSource: {
          sourceId: "magic-initiate-wizard:command",
          rest: "long",
          usesPerRest: 1,
        },
      },
    ];
    c.session.trackers = {};
    return c;
  }

  it.each([
    { locale: "en" as const, name: "Magic Initiate (Wizard)" },
    { locale: "it" as const, name: "Iniziato alla Magia (Mago)" },
  ])(
    "$locale — the composite-key free-cast names the FEAT, not the key",
    ({ locale, name }) => {
      const c = initiateChar();
      const sources = freeCastSourcesForSpell(c, "command", locale, "SIG");
      const row = sources.find((s) => s.sourceId === "magic-initiate-wizard:command");
      expect(row).toBeDefined();
      expect(row?.sourceName).toBe(name);
      // No raw id ever reaches the label.
      expect(row?.sourceName).not.toContain(":");
      expect(row?.sourceName).not.toBe(row?.sourceId);
    }
  );
});

// ── Per-cast Metamagic (Sorcerer) — the shared resolver both cast paths call ──
describe("resolveMetamagicForCast + remainingSorceryPoints", () => {
  /** A Sorcerer of `level` knowing `metamagicIds`, with Font of Magic + slots. */
  function sorcerer(level: number, metamagicIds: string[]): CharacterDoc {
    return makeCharacterDoc({
      classes: [
        { classId: "sorcerer", subclassId: "", level, metamagicChoices: metamagicIds },
      ],
      features: [{ srdId: "sorcerer-font-of-magic" }, { srdId: "sorcerer-metamagic" }],
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
      ],
      spells: [
        { srdId: "bane", prepared: true },
        { srdId: "bless", prepared: true },
      ],
    });
  }

  it("remainingSorceryPoints = pool total (= level) minus session usage", () => {
    const c = sorcerer(5, ["careful-spell"]);
    expect(remainingSorceryPoints(c)).toBe(5);
    c.session.trackers = { "sorcerer-font-of-magic": { used: 2 } };
    expect(remainingSorceryPoints(c)).toBe(3);
  });

  it("a non-Sorcerer (no Font of Magic) has 0 Sorcery Points and no options", () => {
    const bard = structuredClone(MOCK_CHARACTER);
    expect(remainingSorceryPoints(bard)).toBe(0);
    expect(resolveMetamagicForCast(bard, "bane")).toEqual([]);
  });

  it("offers the Sorcerer's known options for a save spell, affordable per SP", () => {
    const c = sorcerer(5, ["careful-spell", "heightened-spell"]);
    const out = resolveMetamagicForCast(c, "bane");
    expect(out.map((o) => o.id)).toEqual(["careful-spell", "heightened-spell"]);
    // 5 SP covers both (1 + 2).
    expect(out.every((o) => o.affordable)).toBe(true);
    // bane forces a CHA save → Heightened applies.
    expect(out.find((o) => o.id === "heightened-spell")?.appliesToSpell).toBe(true);
  });

  it("Heightened does NOT apply to a no-save spell (bless) — data-driven", () => {
    const c = sorcerer(5, ["heightened-spell"]);
    const out = resolveMetamagicForCast(c, "bless");
    expect(out[0]?.appliesToSpell).toBe(false);
  });

  it("affordability follows the depleted pool (golden rule 20)", () => {
    const c = sorcerer(5, ["heightened-spell"]);
    c.session.trackers = { "sorcerer-font-of-magic": { used: 4 } }; // 1 SP left
    const out = resolveMetamagicForCast(c, "bane");
    expect(out[0]?.affordable).toBe(false); // costs 2, only 1 left
  });

  // G6/W3 — 2024 Metamagic DOES apply to cantrips. A damage/attack cantrip
  // (Fire Bolt: 1d10 fire, ranged attack) offers Empowered/Quickened/Distant/
  // Seeking/Transmuted but NOT the save-only or cantrip-excluding options.
  it("offers the applicable options for a damage cantrip (Fire Bolt) — G6", () => {
    const c = sorcerer(9, [
      "empowered-spell",
      "quickened-spell",
      "distant-spell",
      "seeking-spell",
      "transmuted-spell",
      "heightened-spell",
      "twinned-spell",
      "extended-spell",
      "careful-spell",
    ]);
    const by = new Map(
      resolveMetamagicForCast(c, "fire-bolt").map((o) => [o.id, o.appliesToSpell])
    );
    // Damage + ranged attack + Action time → these apply.
    for (const id of [
      "empowered-spell",
      "quickened-spell",
      "distant-spell",
      "seeking-spell",
      "transmuted-spell",
    ]) {
      expect(by.get(id)).toBe(true);
    }
    // Fire Bolt forces no save; Extended/Twinned never apply to a cantrip.
    for (const id of [
      "heightened-spell",
      "careful-spell",
      "twinned-spell",
      "extended-spell",
    ]) {
      expect(by.get(id)).toBe(false);
    }
  });

  // A save cantrip (Sacred Flame: DEX save) offers Heightened/Careful.
  it("offers Heightened + Careful for a save cantrip (Sacred Flame) — G6", () => {
    const c = sorcerer(9, ["heightened-spell", "careful-spell", "seeking-spell"]);
    const by = new Map(
      resolveMetamagicForCast(c, "sacred-flame").map((o) => [o.id, o.appliesToSpell])
    );
    expect(by.get("heightened-spell")).toBe(true);
    expect(by.get("careful-spell")).toBe(true);
    // Sacred Flame makes no attack roll → Seeking doesn't apply.
    expect(by.get("seeking-spell")).toBe(false);
  });

  it("returns [] for a non-Sorcerer cantrip and for an unknown spell id", () => {
    const bard = structuredClone(MOCK_CHARACTER);
    expect(resolveMetamagicForCast(bard, "fire-bolt")).toEqual([]);
    const c = sorcerer(5, ["empowered-spell"]);
    expect(resolveMetamagicForCast(c, "not-a-real-spell")).toEqual([]);
  });

  it("is read-only — never mutates the session", () => {
    const c = sorcerer(5, ["careful-spell", "heightened-spell"]);
    const before = JSON.stringify(c.session);
    resolveMetamagicForCast(c, "bane");
    remainingSorceryPoints(c);
    expect(JSON.stringify(c.session)).toBe(before);
  });
});
