/**
 * B3 (CRITICAL, Sorlock multiclass) — Pact-Magic and normal spell slots that
 * SHARE a level must NOT share one usage counter.
 *
 * `session.spellSlots` keys usage by `slotUsageKey(slot)` — `String(level)` for a
 * normal/shared slot (so a legacy doc keyed `"1"` resolves UNCHANGED) and
 * `pact-<level>` for a Warlock Pact-Magic slot. Before this fix a Sorcerer 3 /
 * Warlock 2 keyed BOTH L1 pools by `"1"`: spending a shared L1 slot showed the
 * Pact L1 cell as 2−1=1 (its own pool untouched), and `paymentAffordable`/cast
 * options summed BOTH pools' totals (4 + 2) against the single counter — letting
 * the player OVER-SPEND across the two pools.
 *
 * This pins: the keying helper (incl. legacy compat), `buildCastOptions` reading
 * each pool's own counter, and the store write spending the CHOSEN pool only.
 *
 * Two adjacent B3 write-site fixes live in their natural (jsdom) homes — the
 * `.ts` fast lane can't render React: `reconcileSessionAfterBuild` keying its
 * totals map by `slotUsageKey` so a `pact-1` row survives a build edit
 * (`reconcile-build.test.ts`), and `handleCastCustom` threading the chosen
 * option's `pactMagic` so a custom-spell Pact cast spends the Pact pool
 * (`spells-page.test.tsx`).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  slotUsageKey,
  bareSlotIsPact,
  buildCastOptions,
  type SlotRow,
} from "@/lib/cast-options";
import { useCharacterStore } from "@/stores/characterStore";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc } from "@/types/character";

// A Sorcerer 3 / Warlock 2 (Sorlock): a normal L1 pool (4) co-existing with a
// Pact-Magic L1 pool (2) — the collision case.
const SORLOCK_SLOTS: SlotRow[] = [
  { level: 1, total: 4 },
  { level: 2, total: 2 },
  { level: 1, total: 2, pactMagic: true },
];

describe("slotUsageKey — distinct counter per pool, legacy-compatible", () => {
  it('a normal slot keys by its bare level (legacy `"1"` stays the normal pool)', () => {
    expect(slotUsageKey({ level: 1 })).toBe("1");
    expect(slotUsageKey({ level: 5, pactMagic: false })).toBe("5");
  });

  it("a pact slot keys `pact-<level>` so it never collides with the normal pool", () => {
    expect(slotUsageKey({ level: 1, pactMagic: true })).toBe("pact-1");
    expect(slotUsageKey({ level: 1 })).not.toBe(
      slotUsageKey({ level: 1, pactMagic: true })
    );
  });
});

describe("bareSlotIsPact — pool resolution for a level-only cost", () => {
  it("prefers the normal pool when one exists at the level (Sorlock default)", () => {
    expect(bareSlotIsPact(SORLOCK_SLOTS, 1)).toBe(false);
  });

  it("resolves to Pact when the level has ONLY a pact pool (pure Warlock)", () => {
    expect(bareSlotIsPact([{ level: 3, total: 2, pactMagic: true }], 3)).toBe(true);
  });

  it("is false when the level has no slot at all (spend is a no-op)", () => {
    expect(bareSlotIsPact(SORLOCK_SLOTS, 9)).toBe(false);
  });
});

describe("buildCastOptions — each pool reads its OWN usage counter (B3)", () => {
  it("spending a shared (normal) L1 slot leaves the PACT L1 remaining UNTOUCHED at 2", () => {
    // One normal L1 slot spent → keyed `"1"`. The pact L1 pool keys `pact-1`.
    const used = { "1": { used: 1 } };
    const opts = buildCastOptions(SORLOCK_SLOTS, used, 1);
    const normalL1 = opts.find((o) => o.kind === "slot" && o.level === 1 && !o.pactMagic);
    const pactL1 = opts.find((o) => o.kind === "slot" && o.level === 1 && o.pactMagic);
    expect(normalL1).toMatchObject({ remaining: 3, total: 4 }); // 4 − 1
    expect(pactL1).toMatchObject({ remaining: 2, total: 2 }); // pact pool UNTOUCHED
  });

  it("does NOT let the two pools over-spend against one counter", () => {
    // Drain the normal L1 pool fully (`"1"` = 4 used). The pact L1 pool (key
    // `pact-1`, 0 used) must STILL offer its 2 slots — never conflated to 0.
    const used = { "1": { used: 4 } };
    const opts = buildCastOptions(SORLOCK_SLOTS, used, 1);
    expect(opts.some((o) => o.kind === "slot" && o.level === 1 && !o.pactMagic)).toBe(
      false
    );
    const pactL1 = opts.find((o) => o.kind === "slot" && o.level === 1 && o.pactMagic);
    expect(pactL1).toMatchObject({ remaining: 2 });
  });

  it("draining the pact pool leaves the normal pool full (independent counters)", () => {
    const used = { "pact-1": { used: 2 } };
    const opts = buildCastOptions(SORLOCK_SLOTS, used, 1);
    const normalL1 = opts.find((o) => o.kind === "slot" && o.level === 1 && !o.pactMagic);
    expect(normalL1).toMatchObject({ remaining: 4, total: 4 });
    expect(opts.some((o) => o.kind === "slot" && o.level === 1 && o.pactMagic)).toBe(
      false
    );
  });
});

// ── Store-level: spending the chosen pool writes only THAT pool's counter ──────

function sorlockDoc(): CharacterDoc {
  return {
    id: "sorlock-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("Sorlock"),
      quote: "",
      race: asRaceId("tiefling"),
      classes: [
        { classId: "sorcerer", level: 3 },
        { classId: "warlock", level: 2 },
      ],
      background: "sage",
      alignment: asAlignmentId("chaotic-neutral"),
      playerName: "Tester",
      speed: "30 ft",
      ac: 12,
      armorNote: "",
      hp: { max: 30 },
      hitDieType: 6,
      languageIds: ["common"],
      customLanguages: [],
      toolProficiencyIds: [],
      customToolProficiencies: [],
      abilityBudget: 27,
      proficiencyBonusOverride: null,
      levelUpChecklist: null,
      backgroundAsi: {},
      humanOriginFeat: "",
      bgFeat: "",
      lore: {
        traits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        backstory: "",
        age: "",
        height: "",
        weight: "",
        eyes: "",
        hair: "",
        skin: "",
      },
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 16 },
      savingThrows: ["CON", "CHA"],
      skills: {},
      spellcasting: null,
      spellSlots: SORLOCK_SLOTS,
      spells: [],
      weapons: [],
      equipment: [],
      features: [],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
    },
    session: {
      hp: { current: 30, temp: 0 },
      hitDice: { used: 0 },
      trackers: {},
      spellSlots: {},
      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      concentration: "",
      initiative: "",
      conditions: [],
      deathSucc: 0,
      deathFail: 0,
      inspiration: false,
      exhaustion: 0,
      pinnedActions: [],
      notes: "",
      logEntries: [],
    },
  };
}

describe("characterStore — pact-aware slot spend (B3)", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  it('spending a NORMAL L1 slot writes `"1"` and leaves the pact pool empty', () => {
    useCharacterStore.getState().setCharacter(sorlockDoc());
    useCharacterStore.getState().useSpellSlot(1); // normal pool (default)
    const slots = useCharacterStore.getState().character?.session.spellSlots;
    expect(slots?.["1"]?.used).toBe(1);
    expect(slots?.["pact-1"]).toBeUndefined(); // pact pool untouched
  });

  it("spending a PACT L1 slot writes `pact-1` and leaves the normal pool empty", () => {
    useCharacterStore.getState().setCharacter(sorlockDoc());
    useCharacterStore.getState().useSpellSlot(1, true); // pact pool
    const slots = useCharacterStore.getState().character?.session.spellSlots;
    expect(slots?.["pact-1"]?.used).toBe(1);
    expect(slots?.["1"]).toBeUndefined(); // normal pool untouched
  });

  it('a legacy `"1"`-keyed doc still resolves the normal L1 pool unchanged', () => {
    const doc = sorlockDoc();
    doc.session.spellSlots = { "1": { used: 2 } }; // pre-fix stored shape
    useCharacterStore.getState().setCharacter(doc);
    // Restoring (un-spending) the normal pool reads the legacy `"1"` key.
    useCharacterStore.getState().restoreSpellSlot(1);
    const slots = useCharacterStore.getState().character?.session.spellSlots;
    expect(slots?.["1"]?.used).toBe(1); // 2 − 1, NOT a fresh phantom key
    expect(slots?.["pact-1"]).toBeUndefined();
  });

  it("a Short Rest restores ONLY the pact pool, leaving normal slots spent (Sorlock)", () => {
    const doc = sorlockDoc();
    doc.session.spellSlots = { "1": { used: 2 }, "pact-1": { used: 2 } };
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().shortRest();
    const slots = useCharacterStore.getState().character?.session.spellSlots;
    expect(slots?.["1"]?.used).toBe(2); // normal pool: NOT recovered on a short rest
    expect(slots?.["pact-1"]).toBeUndefined(); // pact pool: recovered (omitted = 0)
  });
});
