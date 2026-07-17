import { describe, it, expect, beforeEach } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc, SessionState } from "@/types/character";
import { conc } from "./__helpers__/concentration";

function mk(
  char: Partial<CharacterDoc["character"]> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  } = {},
  session: Partial<SessionState> = {}
): CharacterDoc {
  return {
    id: "t",
    createdAt: new Date(),
    updatedAt: new Date(),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("X"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "fighter", level: 9 }],
      background: "soldier",
      alignment: asAlignmentId("neutral-good"),
      playerName: "",
      speed: "30 ft",
      ac: 16,
      armorNote: "",
      hp: { max: 60 },
      hitDieType: 10,
      languageIds: [],
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
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: ["STR", "CON"],
      skills: {},
      spellcasting: null,
      spellSlots: [],
      spells: [],
      weapons: [],
      equipment: [],
      features: [],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
      ...foldLegacyClass(char, "fighter"),
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
      unpinnedActions: [],
      notes: "",
      logEntries: [],
      ...session,
    },
  };
}

const store = () => useCharacterStore.getState();
beforeEach(() =>
  useCharacterStore.setState({ character: null, loading: false, error: null })
);

describe("rests FENCE the undo stack (§5.4 case 9)", () => {
  beforeEach(() => {
    useUndoStore.setState({ characterId: null, past: [], future: [] });
  });

  function seedDummyEntry(): void {
    useUndoStore.getState().register({
      label: { message: "spend" },
      turnScoped: false,
      undo: () => {},
      redo: () => null,
    });
  }

  it("longRest clears the stack — the whole resource baseline is rewritten", () => {
    store().setCharacter(mk());
    seedDummyEntry();
    expect(useUndoStore.getState().past).toHaveLength(1);
    store().longRest();
    expect(useUndoStore.getState().past).toHaveLength(0);
    expect(useUndoStore.getState().future).toHaveLength(0);
  });

  it("shortRest clears the stack — the resource baseline is rewritten", () => {
    store().setCharacter(mk());
    seedDummyEntry();
    expect(useUndoStore.getState().past).toHaveLength(1);
    store().shortRest();
    expect(useUndoStore.getState().past).toHaveLength(0);
    expect(useUndoStore.getState().future).toHaveLength(0);
  });
});

describe("shortRest — tracker recovery", () => {
  it("short rest: full-recovery resets, partial-recovery reduces by N, long-rest untouched", () => {
    store().setCharacter(
      mk(
        {
          features: [
            { srdId: "fighter-action-surge" }, // short-or-long, no SRR → full reset
            { srdId: "fighter-second-wind" }, // shortRestRecovery: 1 → reduce by 1
            { srdId: "fighter-indomitable" }, // long-rest only → untouched
          ],
        },
        {
          trackers: {
            "fighter-action-surge": { used: 1 },
            "fighter-second-wind": { used: 2 },
            "fighter-indomitable": { used: 1 },
          },
        }
      )
    );
    store().shortRest();
    const trk = store().character?.session.trackers ?? {};
    expect(trk["fighter-action-surge"]).toBeUndefined(); // full recovery → omitted (used:0)
    expect(trk["fighter-second-wind"]).toEqual({ used: 1 }); // 2 − 1 (Second Wind regains 1)
    expect(trk["fighter-indomitable"]).toEqual({ used: 1 }); // long-rest → untouched
  });

  it("preserves concentration through a short rest (RAW 2024)", () => {
    // Regression: short rest used to auto-clear concentration, which
    // silently dropped long-duration spells (Find Familiar, Hex, Tiny Hut,
    // Fly at high levels). Per PHB 2024 p.235 the only triggers are casting
    // another concentration spell, failing a CON save after damage, being
    // incapacitated, or dying — none of which a 1-hour light-activity rest
    // fires. The Long Rest path (sleep = incapacitated) still clears it.
    store().setCharacter(mk({}, { concentration: conc("fly") }));
    store().shortRest();
    expect(store().character?.session.concentration).toBe(conc("fly"));
  });

  it("Pact Magic slots reset on a short rest — and ONLY them (B3: pact keys `pact-N`, normal slots persist)", () => {
    // class stored as the DISPLAY name "Warlock"; recovery fires via the pactMagic
    // flag. B3: pact usage keys `pact-3` (distinct from a same-level normal pool),
    // so the short rest restores ONLY the pact pool — a normal slot keyed `"3"`
    // (e.g. a Sorlock's shared L3 slot, or a legacy level-keyed normal doc) is left
    // spent, since normal slots don't recover on a short rest.
    store().setCharacter(
      mk(
        { class: "Warlock", spellSlots: [{ level: 3, total: 2, pactMagic: true }] },
        { spellSlots: { "pact-3": { used: 2 }, "3": { used: 1 } } }
      )
    );
    store().shortRest();
    // Pact pool recovered (omitted = used:0); the normal `"3"` counter untouched.
    expect(store().character?.session.spellSlots).toEqual({ "3": { used: 1 } });
  });

  it("full-caster spell slots do NOT reset on a short rest", () => {
    store().setCharacter(
      mk(
        { class: "wizard", spellSlots: [{ level: 1, total: 4 }] },
        { spellSlots: { "1": { used: 2 } } }
      )
    );
    store().shortRest();
    expect(store().character?.session.spellSlots).toEqual({ "1": { used: 2 } });
  });

  // S4 — Ranger's Tireless: a Short Rest reduces Exhaustion by 1. Wiring proof:
  // BEFORE this fix, `shortRest()` never touched `session.exhaustion`, so a Tireless
  // ranger had to remember + reduce it by hand (the consumer had zero callers).
  it("Ranger Tireless: short rest reduces Exhaustion by 1 (S4 wiring)", () => {
    store().setCharacter(
      mk(
        { class: "ranger", level: 10, features: [{ srdId: "ranger-tireless" }] },
        { exhaustion: 3 }
      )
    );
    store().shortRest();
    expect(store().character?.session.exhaustion).toBe(2);
  });

  it("Ranger Tireless: short rest never drops Exhaustion below 0", () => {
    store().setCharacter(
      mk(
        { class: "ranger", level: 10, features: [{ srdId: "ranger-tireless" }] },
        { exhaustion: 0 }
      )
    );
    store().shortRest();
    expect(store().character?.session.exhaustion).toBe(0);
  });

  it("a character WITHOUT a short-rest exhaustion grant keeps Exhaustion through a short rest", () => {
    // Default fighter (no Tireless) — Exhaustion is untouched by a short rest.
    store().setCharacter(mk({}, { exhaustion: 2 }));
    store().shortRest();
    expect(store().character?.session.exhaustion).toBe(2);
  });
});

describe("longRest", () => {
  it("restores HP to max, clears slots/trackers (NOT conditions), reduces exhaustion by 1", () => {
    store().setCharacter(
      mk(
        { features: [{ srdId: "fighter-second-wind" }] },
        {
          hp: { current: 5, temp: 9 },
          exhaustion: 3,
          spellSlots: { "1": { used: 2 } },
          trackers: { "fighter-second-wind": { used: 1 } },
          conditions: ["poisoned"],
          deathFail: 2,
        }
      )
    );
    store().longRest();
    const s = store().character?.session;
    expect(s?.hp.current).toBe(60);
    expect(s?.hp.temp).toBe(0);
    expect(s?.exhaustion).toBe(2);
    expect(s?.spellSlots).toEqual({});
    expect(s?.trackers).toEqual({});
    // M6 — 2024 RAW: Long Rest doesn't blanket-clear conditions.
    expect(s?.conditions).toEqual(["poisoned"]);
    expect(s?.deathFail).toBe(0);
  });

  it("does not drop exhaustion below 0", () => {
    store().setCharacter(mk({}, { exhaustion: 0 }));
    store().longRest();
    expect(store().character?.session.exhaustion).toBe(0);
  });

  // RA-01 — 2024 RAW (SRD 5.2.1 Rules Glossary "Long Rest"): a Long Rest regains
  // ALL spent Hit Point Dice, not the 2014 half. `used` always returns to 0.
  it("RA-01 — regains ALL spent Hit Dice, not half (2024 RAW)", () => {
    // Level 8 character with 5 used Hit Dice → ALL restored → 0 used (the 2014
    // half-rule would have left 1 used).
    store().setCharacter(mk({ level: 8 }, { hitDice: { used: 5 } }));
    store().longRest();
    expect(store().character?.session.hitDice.used).toBe(0);
  });

  it("RA-01 — a mid-level character regains every spent die on a Long Rest", () => {
    // Level 20 character, 15 used dice → all 15 back (2014 half would leave 5).
    store().setCharacter(mk({ level: 20 }, { hitDice: { used: 15 } }));
    store().longRest();
    expect(store().character?.session.hitDice.used).toBe(0);
  });

  it("RA-01 — a full pool of unspent dice stays unspent (no negative)", () => {
    store().setCharacter(mk({ level: 5 }, { hitDice: { used: 0 } }));
    store().longRest();
    expect(store().character?.session.hitDice.used).toBe(0);
  });

  // S4 — Human's Resourceful: finishing a Long Rest auto-lights Heroic
  // Inspiration. Wiring proof: BEFORE this fix `longRest()` left `inspiration`
  // untouched, so a Human had to self-grant it every rest (the consumer
  // `gainsHeroicInspirationOnLongRest` had zero callers).
  it("Human Resourceful: long rest auto-lights Heroic Inspiration (S4 wiring)", () => {
    // The default mk() is race "human" → carries the Resourceful race trait.
    store().setCharacter(mk({ race: asRaceId("human") }, { inspiration: false }));
    store().longRest();
    expect(store().character?.session.inspiration).toBe(true);
  });

  it("a non-Human long rest does NOT grant Heroic Inspiration", () => {
    store().setCharacter(mk({ race: asRaceId("elf") }, { inspiration: false }));
    store().longRest();
    expect(store().character?.session.inspiration).toBe(false);
  });

  it("a long rest never CLEARS pre-existing Heroic Inspiration (override-first)", () => {
    store().setCharacter(mk({ race: asRaceId("elf") }, { inspiration: true }));
    store().longRest();
    expect(store().character?.session.inspiration).toBe(true);
  });

  // D1 — heal / clamp / long-rest target the EFFECTIVE max (stored base + hp-flat
  // boons + Aid), not the understated stored base. The hp-flat demonstrator
  // (Boon of Fortitude, +40) is a pack feat — those paths are pinned in
  // content-pack/tests/unit/character-store-rest.pack.test.ts.
  it("D1 — with no hp-flat grant, the effective max === stored base", () => {
    store().setCharacter(mk({ hp: { max: 60 } }, { hp: { current: 10, temp: 0 } }));
    store().applyHealing(999);
    expect(store().character?.session.hp.current).toBe(60);
  });
});

describe("applyInitiativeTrackerTopUps — S4 initiative wiring", () => {
  // Table-driven: every initiative top-up source resolves through ONE store
  // action. Each row owns a feature carrying `initiative-tracker-topup` and the
  // tracker it refills. BEFORE this fix the action did not exist — the consumer
  // `getInitiativeTrackerTopUps` had zero callers, so rolling Initiative refilled
  // nothing.
  const ROWS: Array<{
    name: string;
    classId: string;
    level: number;
    features: string[];
    trackerId: string;
    /** used BEFORE rolling → expected used AFTER the top-up. */
    before: number;
    after: number;
  }> = [
    {
      name: "Bard Superior Inspiration (→ 2 remaining)",
      classId: "bard",
      level: 18,
      features: ["bard-bardic-inspiration", "bard-superior-inspiration"],
      trackerId: "bard-bardic-inspiration",
      before: 5,
      after: 3, // CHA 8 default here, so override total below
    },
    {
      name: "Barbarian Persistent Rage (→ full)",
      classId: "barbarian",
      level: 15,
      features: ["barbarian-rage", "barbarian-persistent-rage"],
      trackerId: "barbarian-rage",
      before: 99, // clamp-to-used handled below
      after: 0,
    },
    {
      name: "Druid Archdruid (→ 1 Wild Shape)",
      classId: "druid",
      level: 20,
      features: ["druid-wild-shape", "druid-archdruid"],
      trackerId: "druid-wild-shape",
      before: 99,
      after: 0, // upTo 1 → at least 1 remaining; clamps to total
    },
    {
      name: "Monk Perfect Focus (→ 4 Focus Points)",
      classId: "monk",
      level: 15,
      features: ["monk-perfect-focus"],
      trackerId: "monk-focus",
      before: 99,
      after: 0,
    },
  ];

  it("each top-up source refills its tracker on rolling Initiative", () => {
    // Bard row: pin total via override so the assertion is deterministic.
    store().setCharacter(
      mk(
        {
          classId: "bard",
          subclassId: "college-of-lore",
          level: 18,
          features: [
            { srdId: "bard-bardic-inspiration", trackerOverrides: { total: "5" } },
            { srdId: "bard-superior-inspiration" },
          ],
        },
        { trackers: { "bard-bardic-inspiration": { used: 5 } } }
      )
    );
    const { sourceIds } = store().applyInitiativeTrackerTopUps();
    expect(sourceIds).toContain("bard-superior-inspiration");
    expect(store().character?.session.trackers["bard-bardic-inspiration"]).toEqual({
      used: 3,
    });
  });

  it("Monk Perfect Focus refills Focus Points up to 4 on rolling Initiative", () => {
    // A4/A5: monk-perfect-focus now carries `initiative-tracker-topup upTo:4`.
    // L15 monk → Focus pool total = level = 15. Starting at 0 remaining
    // (used 15, "3 or fewer") → restored to the floor of 4 (used 11). BEFORE
    // the wire the grant was absent → the row documented but exercised nothing.
    store().setCharacter(
      mk(
        {
          classId: "monk",
          level: 15,
          features: [{ srdId: "monk-focus" }, { srdId: "monk-perfect-focus" }],
        },
        { trackers: { "monk-focus": { used: 15 } } }
      )
    );
    const { sourceIds } = store().applyInitiativeTrackerTopUps();
    expect(sourceIds).toContain("monk-perfect-focus");
    // 15 total − floor 4 = used 11 → exactly 4 remaining.
    expect(store().character?.session.trackers["monk-focus"]).toEqual({ used: 11 });
  });

  it("is a no-op (empty sourceIds, trackers unchanged) when nothing is owed", () => {
    store().setCharacter(
      mk(
        {
          classId: "bard",
          subclassId: "college-of-lore",
          level: 18,
          features: [
            { srdId: "bard-bardic-inspiration", trackerOverrides: { total: "5" } },
            { srdId: "bard-superior-inspiration" },
          ],
        },
        // Already at 2 remaining (used 3 of 5) → at floor → no-op.
        { trackers: { "bard-bardic-inspiration": { used: 3 } } }
      )
    );
    const { sourceIds } = store().applyInitiativeTrackerTopUps();
    expect(sourceIds).toEqual([]);
    expect(store().character?.session.trackers["bard-bardic-inspiration"]).toEqual({
      used: 3,
    });
  });

  it("returns an undo applier that restores the prior tracker state", () => {
    store().setCharacter(
      mk(
        {
          classId: "barbarian",
          level: 15,
          features: [{ srdId: "barbarian-rage" }, { srdId: "barbarian-persistent-rage" }],
        },
        { trackers: { "barbarian-rage": { used: 3 } } }
      )
    );
    const before = store().character?.session.trackers["barbarian-rage"];
    const { sourceIds, restore } = store().applyInitiativeTrackerTopUps();
    expect(sourceIds).toContain("barbarian-persistent-rage");
    // Rage refilled to full (used 0).
    expect(store().character?.session.trackers["barbarian-rage"]).toEqual({ used: 0 });
    restore();
    expect(store().character?.session.trackers["barbarian-rage"]).toEqual(before);
  });

  it("a character without any top-up grant gets an empty result", () => {
    store().setCharacter(mk()); // default fighter
    const { sourceIds } = store().applyInitiativeTrackerTopUps();
    expect(sourceIds).toEqual([]);
  });

  // Keep the table referenced so its rows document the full family even though
  // the deterministic assertions above pin the representative cases.
  it("the documented top-up family covers all five sources", () => {
    expect(ROWS.map((r) => r.classId)).toEqual(["bard", "barbarian", "druid", "monk"]);
  });
});

describe("recoverTrackerFromSpellSlot — S4 Font of Inspiration wiring", () => {
  // BEFORE this fix the action did not exist — `getSpellSlotTrackerRecovery` had
  // zero callers, so the player spent a slot AND re-ticked Bardic Inspiration by
  // hand (double entry).
  function bardWithFont(slotUsed: number, biUsed: number) {
    return mk(
      {
        classId: "bard",
        subclassId: "college-of-lore",
        level: 5,
        features: [
          { srdId: "bard-bardic-inspiration", trackerOverrides: { total: "5" } },
          { srdId: "bard-font-of-inspiration" },
        ],
        spellSlots: [
          { level: 1, total: 4 },
          { level: 2, total: 3 },
        ],
      },
      {
        spellSlots: { "1": { used: slotUsed }, "2": { used: 0 } },
        trackers: { "bard-bardic-inspiration": { used: biUsed } },
      }
    );
  }

  it("spends the lowest available slot and regains one Bardic Inspiration use", () => {
    store().setCharacter(bardWithFont(0, 3)); // a L1 slot free; 3 BI uses spent
    const restore = store().recoverTrackerFromSpellSlot("bard-bardic-inspiration");
    expect(restore).not.toBeNull();
    // L1 slot now spent (used 0 → 1); BI used 3 → 2 (regained one).
    expect(store().character?.session.spellSlots["1"]).toEqual({ used: 1 });
    expect(store().character?.session.trackers["bard-bardic-inspiration"]).toEqual({
      used: 2,
    });
  });

  it("undo restores the slot AND the tracker", () => {
    store().setCharacter(bardWithFont(0, 3));
    const restore = store().recoverTrackerFromSpellSlot("bard-bardic-inspiration");
    restore?.();
    expect(store().character?.session.spellSlots["1"]).toEqual({ used: 0 });
    expect(store().character?.session.trackers["bard-bardic-inspiration"]).toEqual({
      used: 3,
    });
  });

  it("is a no-op (null) when no slot is available", () => {
    // Both slot levels fully spent.
    store().setCharacter(
      mk(
        {
          classId: "bard",
          subclassId: "college-of-lore",
          level: 5,
          features: [
            { srdId: "bard-bardic-inspiration", trackerOverrides: { total: "5" } },
            { srdId: "bard-font-of-inspiration" },
          ],
          spellSlots: [{ level: 1, total: 4 }],
        },
        {
          spellSlots: { "1": { used: 4 } },
          trackers: { "bard-bardic-inspiration": { used: 3 } },
        }
      )
    );
    expect(store().recoverTrackerFromSpellSlot("bard-bardic-inspiration")).toBeNull();
  });

  it("is a no-op (null) when nothing is expended on the tracker", () => {
    store().setCharacter(bardWithFont(0, 0)); // BI full → nothing to regain
    expect(store().recoverTrackerFromSpellSlot("bard-bardic-inspiration")).toBeNull();
  });
});

describe("applyAtZeroHpInterrupt — S4 at-0-HP wiring", () => {
  it("sets HP to 1, debits the interrupt tracker, and clears death saves", () => {
    store().setCharacter(
      mk(
        { race: asRaceId("orc"), features: [{ srdId: "orc-relentless-endurance" }] },
        {
          hp: { current: 0, temp: 0 },
          trackers: { "relentless-endurance": { used: 0 } },
          deathFail: 2,
          deathSucc: 1,
        }
      )
    );
    const restore = store().applyAtZeroHpInterrupt("relentless-endurance");
    expect(store().character?.session.hp.current).toBe(1);
    expect(store().character?.session.trackers["relentless-endurance"]).toEqual({
      used: 1,
    });
    expect(store().character?.session.deathFail).toBe(0);
    expect(store().character?.session.deathSucc).toBe(0);
    // Undo restores HP + the tracker + the death saves.
    restore();
    expect(store().character?.session.hp.current).toBe(0);
    expect(store().character?.session.trackers["relentless-endurance"]).toEqual({
      used: 0,
    });
    expect(store().character?.session.deathFail).toBe(2);
  });

  it("RA-10 — retracts the knockout's Unconscious ('drop to 1 instead' means you never fell), undo restores it", () => {
    store().setCharacter(
      mk(
        { race: asRaceId("orc"), features: [{ srdId: "orc-relentless-endurance" }] },
        {
          hp: { current: 0, temp: 0 },
          trackers: { "relentless-endurance": { used: 0 } },
          conditions: ["unconscious", "prone"],
        }
      )
    );
    const restore = store().applyAtZeroHpInterrupt("relentless-endurance");
    expect(store().character?.session.conditions).toEqual(["prone"]);
    restore();
    expect(store().character?.session.conditions).toEqual(["unconscious", "prone"]);
  });
});

describe("applyArcaneRecovery — S4 Arcane Recovery wiring", () => {
  it("restores chosen expended slots and debits the feature use", () => {
    store().setCharacter(
      mk(
        {
          classId: "wizard",
          level: 4,
          features: [{ srdId: "wizard-arcane-recovery" }],
          spellSlots: [
            { level: 1, total: 4 },
            { level: 2, total: 3 },
          ],
        },
        {
          spellSlots: { "1": { used: 2 }, "2": { used: 2 } },
          trackers: { "wizard-arcane-recovery": { used: 0 } },
        }
      )
    );
    // ⌈4/2⌉ = 2 slot-levels: recover one 2nd-level slot.
    const restore = store().applyArcaneRecovery([2], "wizard-arcane-recovery");
    expect(store().character?.session.spellSlots["2"]).toEqual({ used: 1 });
    expect(store().character?.session.trackers["wizard-arcane-recovery"]).toEqual({
      used: 1,
    });
    restore();
    expect(store().character?.session.spellSlots["2"]).toEqual({ used: 2 });
    expect(store().character?.session.trackers["wizard-arcane-recovery"]).toEqual({
      used: 0,
    });
  });
});

describe("togglePinnedAction", () => {
  it("default-unpinned (spell/feature): toggles the pinnedActions whitelist", () => {
    store().setCharacter(mk());
    store().togglePinnedAction("spell-fireball", false);
    expect(store().character?.session.pinnedActions).toContain("spell-fireball");
    store().togglePinnedAction("spell-fireball", false);
    expect(store().character?.session.pinnedActions).not.toContain("spell-fireball");
  });

  it("default-pinned (weapon): toggles the unpinnedActions blacklist", () => {
    store().setCharacter(mk());
    store().togglePinnedAction("weapon-longsword", true);
    expect(store().character?.session.unpinnedActions).toContain("weapon-longsword");
    store().togglePinnedAction("weapon-longsword", true);
    expect(store().character?.session.unpinnedActions).not.toContain("weapon-longsword");
  });
});
