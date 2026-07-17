/**
 * Unit tests for buildCastOptions (UPCAST resolver).
 */

import { describe, it, expect } from "vitest";
import {
  buildCastOptions,
  metamagicOptionsForCast,
  toggleMetamagicSelection,
  type MetamagicSpellFacts,
} from "@/lib/cast-options";
import { METAMAGIC_BY_ID } from "@/data/metamagic";

describe("buildCastOptions", () => {
  const slots = [
    { level: 1, total: 4 },
    { level: 2, total: 3 },
    { level: 3, total: 3 },
    { level: 4, total: 1 },
  ];

  it("returns every slot level ≥ baseLevel with remaining slots, sorted asc", () => {
    const opts = buildCastOptions(slots, {}, 2);
    expect(opts.map((o) => o.level)).toEqual([2, 3, 4]);
    expect(opts[0]).toEqual({
      kind: "slot",
      level: 2,
      remaining: 3,
      total: 3,
      pactMagic: false,
    });
    expect(opts[2]).toEqual({
      kind: "slot",
      level: 4,
      remaining: 1,
      total: 1,
      pactMagic: false,
    });
  });

  it("excludes slot rows that are fully spent", () => {
    const used = { "2": { used: 3 }, "3": { used: 3 } };
    const opts = buildCastOptions(slots, used, 2);
    expect(opts.map((o) => o.level)).toEqual([4]);
  });

  it("returns empty list when baseLevel exceeds all known slots", () => {
    expect(buildCastOptions(slots, {}, 9)).toEqual([]);
  });

  it("returns empty list for cantrip (baseLevel 0)", () => {
    expect(buildCastOptions(slots, {}, 0)).toEqual([]);
  });

  it("flags pact-magic rows so the UI can badge them", () => {
    const warlockSlots = [{ level: 3, total: 2, pactMagic: true as const }];
    const opts = buildCastOptions(warlockSlots, {}, 1);
    expect(opts).toEqual([
      { kind: "slot", level: 3, remaining: 2, total: 2, pactMagic: true },
    ]);
  });

  it("never returns options below baseLevel even when those slots have charges", () => {
    const used = { "1": { used: 0 } };
    const opts = buildCastOptions(slots, used, 3);
    expect(opts.map((o) => o.level)).toEqual([3, 4]);
  });

  it("returns single-option list when only the base level has slots — caller should auto-cast", () => {
    const onlyL1 = [{ level: 1, total: 2 }];
    const opts = buildCastOptions(onlyL1, {}, 1);
    expect(opts).toHaveLength(1);
    expect(opts[0]?.level).toBe(1);
  });

  it("treats missing 'used' entry as zero used (full availability)", () => {
    const opts = buildCastOptions(slots, {}, 1);
    expect(
      opts.every((o) =>
        o.kind === "slot" || o.kind === "free-cast" ? o.remaining === o.total : true
      )
    ).toBe(true);
  });

  it("excludes a slot if used >= total exactly", () => {
    const used = { "1": { used: 4 } }; // exactly equal to total
    const opts = buildCastOptions(slots, used, 1);
    expect(opts.map((o) => o.level)).not.toContain(1);
  });

  it("sorts result ascending even if input is shuffled", () => {
    const shuffled = [
      { level: 4, total: 1 },
      { level: 1, total: 4 },
      { level: 3, total: 3 },
    ];
    const opts = buildCastOptions(shuffled, {}, 1);
    expect(opts.map((o) => o.level)).toEqual([1, 3, 4]);
  });

  describe("free-cast sources (Fey-Touched / Shadow-Touched / Magic Initiate)", () => {
    it("appends a free-cast row after the slot rows when the source has charges", () => {
      const opts = buildCastOptions(slots, {}, 2, [
        {
          sourceId: "fey-touched",
          sourceName: "Fey-Touched",
          usesPerRest: 1,
          usedNow: 0,
          rest: "long",
        },
      ]);
      // Slots first (2,3,4), then the free-cast.
      expect(opts).toHaveLength(4);
      const last = opts[opts.length - 1];
      expect(last?.kind).toBe("free-cast");
      if (last?.kind === "free-cast") {
        expect(last.sourceId).toBe("fey-touched");
        expect(last.sourceName).toBe("Fey-Touched");
        expect(last.remaining).toBe(1);
        expect(last.total).toBe(1);
        expect(last.rest).toBe("long");
        expect(last.level).toBe(2);
      }
    });

    it("drops a free-cast source whose tracker is already fully spent", () => {
      const opts = buildCastOptions(slots, {}, 2, [
        {
          sourceId: "fey-touched",
          sourceName: "Fey-Touched",
          usesPerRest: 1,
          usedNow: 1, // spent already
          rest: "long",
        },
      ]);
      expect(opts.some((o) => o.kind === "free-cast")).toBe(false);
    });

    it("supports multiple sources for the same spell (slot + 2 frees)", () => {
      const opts = buildCastOptions(slots, {}, 2, [
        {
          sourceId: "fey-touched",
          sourceName: "Fey-Touched",
          usesPerRest: 1,
          usedNow: 0,
          rest: "long",
        },
        {
          sourceId: "some-other-feat",
          sourceName: "Mystery Feat",
          usesPerRest: 2,
          usedNow: 0,
          rest: "short",
        },
      ]);
      const frees = opts.filter((o) => o.kind === "free-cast");
      expect(frees).toHaveLength(2);
    });

    it("works with zero slots — free-cast becomes the only option", () => {
      const opts = buildCastOptions([], {}, 2, [
        {
          sourceId: "fey-touched",
          sourceName: "Fey-Touched",
          usesPerRest: 1,
          usedNow: 0,
          rest: "long",
        },
      ]);
      expect(opts).toHaveLength(1);
      expect(opts[0]?.kind).toBe("free-cast");
    });

    it("zero free-cast sources is the legacy slot-only path", () => {
      const opts = buildCastOptions(slots, {}, 2);
      expect(opts.every((o) => o.kind === "slot")).toBe(true);
    });
  });

  describe("Wizard L18 Spell Mastery (at-will) row", () => {
    it("appends an at-will Mastery row after slot + free-cast rows", () => {
      const opts = buildCastOptions(slots, {}, 1, [], [{ sourceName: "MASTERY" }]);
      const last = opts[opts.length - 1];
      expect(last?.kind).toBe("mastery");
      if (last?.kind === "mastery") {
        expect(last.sourceName).toBe("MASTERY");
        expect(last.level).toBe(1);
      }
    });

    it("Mastery rows have no charge counter (no tracker)", () => {
      const opts = buildCastOptions(slots, {}, 2, [], [{ sourceName: "MASTERY" }]);
      const masteryRow = opts.find((o) => o.kind === "mastery");
      expect(masteryRow).toBeDefined();
      // mastery rows have only level + sourceName, no remaining/total fields
      if (masteryRow?.kind === "mastery") {
        expect("remaining" in masteryRow).toBe(false);
      }
    });

    it("works alongside both slots and free-cast rows", () => {
      const opts = buildCastOptions(
        slots,
        {},
        1,
        [
          {
            sourceId: "fey-touched",
            sourceName: "Fey-Touched",
            usesPerRest: 1,
            usedNow: 0,
            rest: "long",
          },
        ],
        [{ sourceName: "MASTERY" }]
      );
      const kinds = opts.map((o) => o.kind);
      // Order: slots first, then free-cast, then mastery.
      expect(kinds[kinds.length - 1]).toBe("mastery");
      expect(kinds.filter((k) => k === "free-cast")).toHaveLength(1);
    });

    it("works with zero slots — mastery becomes the only option", () => {
      const opts = buildCastOptions([], {}, 1, [], [{ sourceName: "MASTERY" }]);
      expect(opts).toHaveLength(1);
      expect(opts[0]?.kind).toBe("mastery");
    });
  });
});

// ── Per-cast Metamagic options (Sorcerer) ───────────────────────────────────
describe("metamagicOptionsForCast", () => {
  // A leveled spell that forces a save, deals damage, makes no attack, casts as
  // an Action — the broadest leveled fixture.
  const saveActionSpell: MetamagicSpellFacts = {
    level: 1,
    castingTime: "action",
    forcesSave: true,
    dealsDamage: true,
    makesAttack: false,
  };
  // A no-save Action damage spell — Heightened (requiresSave) doesn't apply.
  const noSaveActionSpell: MetamagicSpellFacts = {
    level: 1,
    castingTime: "action",
    forcesSave: false,
    dealsDamage: true,
    makesAttack: false,
  };
  // A bonus-action save spell — Quickened (requiresActionCastingTime) doesn't apply.
  const bonusSpell: MetamagicSpellFacts = {
    level: 1,
    castingTime: "bonus",
    forcesSave: true,
    dealsDamage: false,
    makesAttack: false,
  };

  it("offers each KNOWN option with its SP cost from the data (no name regex)", () => {
    const out = metamagicOptionsForCast(
      ["careful-spell", "heightened-spell", "quickened-spell"],
      saveActionSpell,
      6
    );
    expect(out.map((o) => o.id)).toEqual([
      "careful-spell",
      "heightened-spell",
      "quickened-spell",
    ]);
    expect(out.find((o) => o.id === "careful-spell")?.cost).toBe(1);
    expect(out.find((o) => o.id === "heightened-spell")?.cost).toBe(2);
    expect(out.find((o) => o.id === "quickened-spell")?.cost).toBe(2);
  });

  it("gates affordability against the remaining Sorcery Points (golden rule 20)", () => {
    // 1 SP remaining: the 1-SP careful applies, the 2-SP heightened is unaffordable.
    const out = metamagicOptionsForCast(
      ["careful-spell", "heightened-spell"],
      saveActionSpell,
      1
    );
    expect(out.find((o) => o.id === "careful-spell")?.affordable).toBe(true);
    expect(out.find((o) => o.id === "heightened-spell")?.affordable).toBe(false);
  });

  it("Heightened applies ONLY to a save spell (data-driven `requiresSave`)", () => {
    const onSave = metamagicOptionsForCast(["heightened-spell"], saveActionSpell, 6);
    const onNoSave = metamagicOptionsForCast(["heightened-spell"], noSaveActionSpell, 6);
    expect(onSave[0]?.appliesToSpell).toBe(true);
    expect(onNoSave[0]?.appliesToSpell).toBe(false);
  });

  it("Quickened applies ONLY to an Action-time spell (data-driven casting time)", () => {
    const onAction = metamagicOptionsForCast(["quickened-spell"], saveActionSpell, 6);
    const onBonus = metamagicOptionsForCast(["quickened-spell"], bonusSpell, 6);
    expect(onAction[0]?.appliesToSpell).toBe(true);
    expect(onBonus[0]?.appliesToSpell).toBe(false);
  });

  it("Empowered/Transmuted apply ONLY to a damage spell (data-driven `requiresDamage`)", () => {
    const noDamage: MetamagicSpellFacts = { ...saveActionSpell, dealsDamage: false };
    for (const id of ["empowered-spell", "transmuted-spell"]) {
      expect(metamagicOptionsForCast([id], saveActionSpell, 6)[0]?.appliesToSpell).toBe(
        true
      );
      expect(metamagicOptionsForCast([id], noDamage, 6)[0]?.appliesToSpell).toBe(false);
    }
  });

  it("Seeking applies ONLY to a spell-attack spell (data-driven `requiresAttack`)", () => {
    const withAttack: MetamagicSpellFacts = { ...noSaveActionSpell, makesAttack: true };
    expect(
      metamagicOptionsForCast(["seeking-spell"], withAttack, 6)[0]?.appliesToSpell
    ).toBe(true);
    expect(
      metamagicOptionsForCast(["seeking-spell"], noSaveActionSpell, 6)[0]?.appliesToSpell
    ).toBe(false);
  });

  it("Distant/Subtle apply broadly (no condition)", () => {
    const out = metamagicOptionsForCast(
      ["distant-spell", "subtle-spell"],
      {
        level: 1,
        castingTime: "reaction",
        forcesSave: false,
        dealsDamage: false,
        makesAttack: false,
      },
      6
    );
    expect(out.every((o) => o.appliesToSpell)).toBe(true);
  });

  // BUG-6 — the RAW "even if you've already used another option" exception lives
  // on Empowered + Seeking ONLY; every other option is a primary.
  it("flags Empowered + Seeking as stackers; all others as primaries (BUG-6)", () => {
    const out = metamagicOptionsForCast(
      [
        "careful-spell",
        "distant-spell",
        "empowered-spell",
        "extended-spell",
        "heightened-spell",
        "quickened-spell",
        "seeking-spell",
        "subtle-spell",
        "transmuted-spell",
        "twinned-spell",
      ],
      {
        level: 1,
        castingTime: "action",
        forcesSave: true,
        dealsDamage: true,
        makesAttack: true,
      },
      99
    );
    const stackers = out
      .filter((o) => o.stacksWithPrimary)
      .map((o) => o.id)
      .sort();
    expect(stackers).toEqual(["empowered-spell", "seeking-spell"]);
  });

  // G6/W3 — cantrips are no longer blanket-dropped; per-option `appliesWhen`
  // decides. Extended + Twinned (excludesCantrip) never apply to a cantrip.
  it("Extended + Twinned never apply to a cantrip (excludesCantrip); broad ones do", () => {
    const cantrip: MetamagicSpellFacts = {
      level: 0,
      castingTime: "action",
      forcesSave: false,
      dealsDamage: true,
      makesAttack: true,
    };
    const out = metamagicOptionsForCast(
      ["extended-spell", "twinned-spell", "distant-spell", "empowered-spell"],
      cantrip,
      6
    );
    expect(out.find((o) => o.id === "extended-spell")?.appliesToSpell).toBe(false);
    expect(out.find((o) => o.id === "twinned-spell")?.appliesToSpell).toBe(false);
    expect(out.find((o) => o.id === "distant-spell")?.appliesToSpell).toBe(true);
    expect(out.find((o) => o.id === "empowered-spell")?.appliesToSpell).toBe(true);
  });

  it("dedupes a repeated id and skips an unknown (stale) pick defensively", () => {
    const out = metamagicOptionsForCast(
      ["careful-spell", "careful-spell", "not-a-real-option"],
      saveActionSpell,
      6
    );
    expect(out.map((o) => o.id)).toEqual(["careful-spell"]);
  });

  it("returns [] when the Sorcerer knows no options", () => {
    expect(metamagicOptionsForCast([], saveActionSpell, 6)).toEqual([]);
  });
});

// BUG-6 — the one-primary-per-cast + additive-stackers toggle reducer.
describe("toggleMetamagicSelection (BUG-6 one-primary rule)", () => {
  // Empowered + Seeking are the only stackers (per the SRD exception).
  const stackers = new Set(["empowered-spell", "seeking-spell"]);
  const costOf = (id: string) => METAMAGIC_BY_ID.get(id)?.cost ?? 0;
  const sumSp = (ids: ReadonlyArray<string>) => ids.reduce((s, id) => s + costOf(id), 0);

  it("adding a SECOND primary SWAPS the first (never both selected/debited)", () => {
    const afterFirst = toggleMetamagicSelection([], "quickened-spell", stackers);
    expect(afterFirst).toEqual(["quickened-spell"]);
    const afterSecond = toggleMetamagicSelection(afterFirst, "distant-spell", stackers);
    // The earlier primary is replaced — exactly ONE primary remains.
    expect(afterSecond).toEqual(["distant-spell"]);
    // SP debits only the surviving primary (Distant = 1), never the sum of both.
    expect(sumSp(afterSecond)).toBe(1);
  });

  it("Empowered + Seeking CAN stack on top of a primary (additive)", () => {
    let sel = toggleMetamagicSelection([], "quickened-spell", stackers); // 2 SP primary
    sel = toggleMetamagicSelection(sel, "empowered-spell", stackers); // +1
    sel = toggleMetamagicSelection(sel, "seeking-spell", stackers); // +1
    expect(sel).toEqual(["quickened-spell", "empowered-spell", "seeking-spell"]);
    // Swapping the PRIMARY keeps both stackers attached.
    const swapped = toggleMetamagicSelection(sel, "distant-spell", stackers);
    expect(swapped).toEqual(["empowered-spell", "seeking-spell", "distant-spell"]);
    // SP cost = sum of the selected options (2 swapped to 1 + 1 + 1 = 3).
    expect(sumSp(swapped)).toBe(3);
  });

  it("toggling a selected option removes it (no-op on the rest)", () => {
    const sel = ["quickened-spell", "empowered-spell"];
    expect(toggleMetamagicSelection(sel, "empowered-spell", stackers)).toEqual([
      "quickened-spell",
    ]);
    expect(toggleMetamagicSelection(sel, "quickened-spell", stackers)).toEqual([
      "empowered-spell",
    ]);
  });
});
