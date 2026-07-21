import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore, type UndoLabel } from "@/stores/undoStore";
import { localizeToastIntent } from "@/lib/views/toast-intent";
import type { CharacterDoc } from "@/types/character";
import type { CombatPersistence, CombatState } from "@/types/combat-state";
import { makeCharacterDoc } from "./_helpers";
import { conc } from "./__helpers__/concentration";

/**
 * Creates a minimal mock character for testing store operations.
 */
function mockCharacter(overrides?: Partial<CharacterDoc>): CharacterDoc {
  return {
    id: "test-char-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("Test Hero"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "fighter", level: 5 }],
      background: "soldier",
      alignment: asAlignmentId("neutral-good"),
      playerName: "Tester",
      speed: "30 ft",
      ac: 16,
      armorNote: "Chain Mail",
      hp: { max: 44 },
      hitDieType: 10,
      languageIds: ["common", "elvish"],
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
      skills: { athletics: "proficient", perception: "proficient" },
      spellcasting: null,
      spellSlots: [],
      spells: [],
      weapons: [],
      equipment: [],
      features: [],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
    },
    session: {
      hp: { current: 44, temp: 0 },
      hitDice: { used: 0 },
      trackers: {},
      spellSlots: {},
      currency: { pp: 0, gp: 50, ep: 0, sp: 10, cp: 5 },
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
    ...overrides,
  };
}

describe("characterStore — rest mechanics", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  describe("longRest", () => {
    it("restores HP to maximum", () => {
      const char = mockCharacter();
      char.session.hp.current = 20;
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().longRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.hp.current).toBe(44);
    });

    it("resets all spell slots", () => {
      const char = mockCharacter();
      char.session.spellSlots = { "1": { used: 3 }, "2": { used: 1 } };
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().longRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.spellSlots).toEqual({});
    });

    it("resets all trackers", () => {
      const char = mockCharacter();
      char.session.trackers = { rage: { used: 2 }, "second-wind": { used: 1 } };
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().longRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.trackers).toEqual({});
    });

    it("does NOT auto-clear conditions (M6 — 2024 RAW: Long Rest doesn't blanket-remove conditions)", () => {
      const char = mockCharacter();
      char.session.conditions = ["poisoned", "frightened"];
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().longRest();

      const updated = useCharacterStore.getState().character;
      // Conditions are left for the player to clear manually as their cause resolves.
      expect(updated?.session.conditions).toEqual(["poisoned", "frightened"]);
    });

    it("clears concentration", () => {
      const char = mockCharacter();
      char.session.concentration = conc("bless");
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().longRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.concentration).toBe("");
    });

    it("reduces exhaustion by 1", () => {
      const char = mockCharacter();
      char.session.exhaustion = 3;
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().longRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.exhaustion).toBe(2);
    });

    it("does not reduce exhaustion below 0", () => {
      const char = mockCharacter();
      char.session.exhaustion = 0;
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().longRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.exhaustion).toBe(0);
    });

    it("resets death saves", () => {
      const char = mockCharacter();
      char.session.deathSucc = 2;
      char.session.deathFail = 1;
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().longRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.deathSucc).toBe(0);
      expect(updated?.session.deathFail).toBe(0);
    });

    it("clears temp HP", () => {
      const char = mockCharacter();
      char.session.hp.temp = 10;
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().longRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.hp.temp).toBe(0);
    });
  });

  describe("shortRest", () => {
    it("preserves concentration (RAW 2024 — short rest is light activity, not incapacitation)", () => {
      // Regression: short rest used to clear concentration, which silently
      // dropped long-duration concentration spells (Find Familiar, Hex,
      // Tiny Hut, etc.) every time the party took a breather. RAW lists
      // only four triggers and "Short Rest" isn't one of them.
      const char = mockCharacter();
      char.session.concentration = conc("hex");
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().shortRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.concentration).toBe(conc("hex"));
    });

    it("does not restore HP (HP management is handled by the UI)", () => {
      const char = mockCharacter();
      char.session.hp.current = 20;
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().shortRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.hp.current).toBe(20);
    });

    it("does not restore spell slots", () => {
      const char = mockCharacter();
      char.session.spellSlots = { "1": { used: 3 } };
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().shortRest();

      const updated = useCharacterStore.getState().character;
      expect(updated?.session.spellSlots).toEqual({ "1": { used: 3 } });
    });
  });

  describe("death saves", () => {
    it("adds successes correctly", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);

      useCharacterStore.getState().updateSession({ deathSucc: 1 });
      expect(useCharacterStore.getState().character?.session.deathSucc).toBe(1);

      useCharacterStore.getState().updateSession({ deathSucc: 2 });
      expect(useCharacterStore.getState().character?.session.deathSucc).toBe(2);

      useCharacterStore.getState().updateSession({ deathSucc: 3 });
      expect(useCharacterStore.getState().character?.session.deathSucc).toBe(3);
    });

    it("adds failures correctly", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);

      useCharacterStore.getState().updateSession({ deathFail: 1 });
      expect(useCharacterStore.getState().character?.session.deathFail).toBe(1);

      useCharacterStore.getState().updateSession({ deathFail: 3 });
      expect(useCharacterStore.getState().character?.session.deathFail).toBe(3);
    });
  });

  describe("0-HP rules — RA-03 (damage at/into 0) + RA-10 (Unconscious)", () => {
    const store = () => useCharacterStore.getState();
    const sess = () => store().character?.session;

    /** Seed the store with the mock at an explicit HP/dying/conditions slice. */
    function seed(over: {
      current: number;
      temp?: number;
      succ?: number;
      fail?: number;
      conditions?: string[];
    }): void {
      const char = mockCharacter();
      char.session.hp.current = over.current;
      char.session.hp.temp = over.temp ?? 0;
      char.session.deathSucc = over.succ ?? 0;
      char.session.deathFail = over.fail ?? 0;
      char.session.conditions = over.conditions ?? [];
      store().setCharacter(char);
    }

    it("a knockout applies Unconscious and resets the dying track (SRD 'Falling Unconscious')", () => {
      seed({ current: 8, succ: 2, fail: 1 });
      store().applyDamage(8);
      expect(sess()?.hp.current).toBe(0);
      expect(sess()?.conditions).toContain("unconscious");
      expect(sess()?.deathSucc).toBe(0);
      expect(sess()?.deathFail).toBe(0);
    });

    it("a knockout never double-adds an already-present Unconscious chip", () => {
      seed({ current: 8, conditions: ["unconscious"] });
      store().applyDamage(8);
      expect(sess()?.conditions).toEqual(["unconscious"]);
    });

    it("massive damage (remainder past temp+current ≥ max 44) = instant death, no Unconscious", () => {
      seed({ current: 8, temp: 2 });
      store().applyDamage(54); // remainder 44 = max → dead outright
      expect(sess()?.hp.current).toBe(0);
      expect(sess()?.deathFail).toBe(3);
      expect(sess()?.conditions).not.toContain("unconscious");
    });

    it("BOUNDARY: remainder max−1 is a normal knockout (dying, not dead)", () => {
      seed({ current: 8, temp: 2 });
      store().applyDamage(53); // remainder 43 < 44
      expect(sess()?.deathFail).toBe(0);
      expect(sess()?.conditions).toContain("unconscious");
    });

    it("damage while at 0 marks ONE failure and never lowers HP (SRD 'Damage at 0 Hit Points')", () => {
      seed({ current: 0 });
      store().applyDamage(5);
      expect(sess()?.hp.current).toBe(0);
      expect(sess()?.deathFail).toBe(1);
      expect(sess()?.deathSucc).toBe(0);
    });

    it("a Critical Hit at 0 marks TWO failures", () => {
      seed({ current: 0 });
      store().applyDamage(5, { crit: true });
      expect(sess()?.deathFail).toBe(2);
    });

    it("failures at 0 accumulate to dead (3), and a corpse takes no further marks", () => {
      seed({ current: 0, fail: 2 });
      store().applyDamage(5, { crit: true }); // clamped to 3, not 4
      expect(sess()?.deathFail).toBe(3);
      store().applyDamage(50); // dead — inert
      expect(sess()?.deathFail).toBe(3);
      expect(sess()?.deathSucc).toBe(0);
    });

    it("damage at 0 that reaches the HP maximum = instant death", () => {
      seed({ current: 0 });
      store().applyDamage(44); // = max
      expect(sess()?.deathFail).toBe(3);
    });

    it("damage while STABLE ends the stability — successes clear, the failure marks", () => {
      seed({ current: 0, succ: 3 });
      store().applyDamage(5);
      expect(sess()?.deathSucc).toBe(0);
      expect(sess()?.deathFail).toBe(1);
    });

    it("temp HP still absorbs at 0, and the failure still marks (total-damage reading)", () => {
      seed({ current: 0, temp: 5 });
      store().applyDamage(3);
      expect(sess()?.hp.temp).toBe(2);
      expect(sess()?.deathFail).toBe(1);
    });

    it("healing off 0 sheds Unconscious together with the track reset (RA-10)", () => {
      seed({ current: 0, fail: 2, conditions: ["unconscious", "prone"] });
      store().applyHealing(5);
      expect(sess()?.hp.current).toBe(5);
      expect(sess()?.deathFail).toBe(0);
      expect(sess()?.conditions).toEqual(["prone"]);
    });

    it("restoreHpSnapshot restores HP, temp, the dying track, and conditions exactly", () => {
      seed({ current: 0, temp: 0, fail: 2, conditions: ["unconscious"] });
      store().restoreHpSnapshot({
        current: 17,
        temp: 4,
        deathSucc: 1,
        deathFail: 0,
        conditions: ["prone"],
      });
      expect(sess()?.hp).toEqual({ current: 17, temp: 4 });
      expect(sess()?.deathSucc).toBe(1);
      expect(sess()?.deathFail).toBe(0);
      expect(sess()?.conditions).toEqual(["prone"]);
    });
  });

  describe("HP management", () => {
    // Shared by the Concentration-CON-save integration tests below: set the doc,
    // take 10 damage (triggers a Concentration save while concentrating), and read
    // the toast intent's CON-save total. The store resolves EFFECTIVE scores ONCE
    // and feeds the base CON save + both bonus layers (B8), so this exercises the
    // WHOLE seam (effective scores → `savingThrowBonus` → intent), not a helper.
    const saveBonusAfterDamage = async (doc: CharacterDoc): Promise<number> => {
      const { useToastStore } = await import("@/stores/toastStore");
      useCharacterStore.getState().setCharacter(doc);
      useCharacterStore.getState().applyDamage(10);
      const intent = useToastStore.getState().toasts.at(-1)?.intent;
      if (intent?.kind !== "concentration-save") {
        throw new Error("expected a concentration-save toast");
      }
      return intent.saveBonus;
    };

    it("clamps HP to max", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setHP(100);

      expect(useCharacterStore.getState().character?.session.hp.current).toBe(44);
    });

    it("clamps HP to minimum 0", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setHP(-5);

      expect(useCharacterStore.getState().character?.session.hp.current).toBe(0);
    });

    it("sets temp HP correctly", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setTempHP(8);

      expect(useCharacterStore.getState().character?.session.hp.temp).toBe(8);
    });

    it("Death Ward — a lethal hit drops to 1 HP instead of 0 and ends the ward", () => {
      const char = mockCharacter();
      char.session.hp.current = 8;
      char.session.hp.temp = 0;
      char.session.activeFeatures = ["spell-death-ward"];
      useCharacterStore.getState().setCharacter(char);
      // 20 damage would drop 8 → 0; the ward clamps to 1 and ends.
      useCharacterStore.getState().applyDamage(20);
      const after = useCharacterStore.getState().character;
      expect(after?.session.hp.current).toBe(1);
      expect(after?.session.activeFeatures).not.toContain("spell-death-ward");
    });

    it("Death Ward — FAIL-BEFORE: without the ward, the same hit drops to 0", () => {
      const char = mockCharacter();
      char.session.hp.current = 8;
      char.session.hp.temp = 0;
      char.session.activeFeatures = [];
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().applyDamage(20);
      expect(useCharacterStore.getState().character?.session.hp.current).toBe(0);
    });

    it("Death Ward — a NON-lethal hit leaves the ward lit (only the 0-drop fires it)", () => {
      const char = mockCharacter();
      char.session.hp.current = 30;
      char.session.hp.temp = 0;
      char.session.activeFeatures = ["spell-death-ward"];
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().applyDamage(5);
      const after = useCharacterStore.getState().character;
      expect(after?.session.hp.current).toBe(25);
      expect(after?.session.activeFeatures).toContain("spell-death-ward");
    });

    it("Death Ward — temp HP absorbs first: a hit soaked above 0 HP does NOT fire the ward", () => {
      // current 8 + temp 10, take 12: temp soaks 10, HP 8 → 6 (never crosses 0),
      // so the ward stays lit and untouched.
      const char = mockCharacter();
      char.session.hp.current = 8;
      char.session.hp.temp = 10;
      char.session.activeFeatures = ["spell-death-ward"];
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().applyDamage(12);
      const after = useCharacterStore.getState().character;
      expect(after?.session.hp.current).toBe(6);
      expect(after?.session.hp.temp).toBe(0);
      expect(after?.session.activeFeatures).toContain("spell-death-ward");
    });

    it("Death Ward — massive damage still clamps to exactly 1 and ends the ward", () => {
      // RAW: "instead drops to 1 Hit Point" — however deep the overkill.
      const char = mockCharacter();
      char.session.hp.current = 8;
      char.session.hp.temp = 0;
      char.session.activeFeatures = ["spell-death-ward"];
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().applyDamage(100);
      const after = useCharacterStore.getState().character;
      expect(after?.session.hp.current).toBe(1);
      expect(after?.session.activeFeatures).not.toContain("spell-death-ward");
    });

    it("fires a Concentration save toast on applyDamage while concentrating (H6)", async () => {
      const { useToastStore } = await import("@/stores/toastStore");
      const char = mockCharacter();
      char.session.hp.current = 44;
      char.session.concentration = conc("bless");
      useCharacterStore.getState().setCharacter(char);
      // Take 12 damage → DC = max(10, floor(12/2)) = max(10,6) = 10
      useCharacterStore.getState().applyDamage(12);
      expect(useToastStore.getState().toasts.at(-1)?.intent).toMatchObject({
        kind: "concentration-save",
        dc: 10,
      });
      // Take 24 damage → DC = max(10, 12) = 12
      useCharacterStore.getState().applyDamage(24);
      expect(useToastStore.getState().toasts.at(-1)?.intent).toMatchObject({
        kind: "concentration-save",
        dc: 12,
      });
    });

    it("computes Concentration DC from TOTAL damage even when temp absorbs some (regression)", async () => {
      // Bug fix regression: previously the HpBar applied temp-absorption
      // *before* calling setHP, so the concentration-save DC was computed
      // from the smaller current-HP delta. RAW 2024: the trigger is "take
      // damage", not "take damage to current HP".
      // Toasts-as-data (§3.2): the store emits STRUCTURED intents (no
      // localization), so the test asserts on the intent payload — no i18n runtime.
      const { useToastStore } = await import("@/stores/toastStore");
      const char = mockCharacter();
      char.session.hp.current = 40; // within max (44)
      char.session.hp.temp = 5;
      char.session.concentration = conc("bless");
      useCharacterStore.getState().setCharacter(char);
      // Take 20 damage — temp absorbs 5, current loses 15. DC must reflect
      // the TOTAL 20 damage: max(10, floor(20/2)) = 10.
      useCharacterStore.getState().applyDamage(20);
      const state = useCharacterStore.getState().character;
      expect(state?.session.hp.temp).toBe(0);
      expect(state?.session.hp.current).toBe(25);
      expect(useToastStore.getState().toasts.at(-1)?.intent).toMatchObject({
        kind: "concentration-save",
        spell: conc("bless"),
        dc: 10,
      });
      // AX — the intent also carries the character's CON-save total (a number;
      // the exact value derives from the fixture's CON/proficiencies).
      const intent = useToastStore.getState().toasts.at(-1)?.intent;
      expect(
        intent?.kind === "concentration-save" && typeof intent.saveBonus === "number"
      ).toBe(true);
      // Take 20 more damage (temp now 0, current 25 → 5) → DC = max(10, 10) = 10
      useCharacterStore.getState().applyDamage(20);
      expect(useToastStore.getState().toasts.at(-1)?.intent).toMatchObject({
        kind: "concentration-save",
        dc: 10,
      });
      // Take 10 more (would drop to -5, clamped to 0) → auto-drop, no DC
      useCharacterStore.getState().applyDamage(10);
      expect(useToastStore.getState().toasts.at(-1)?.intent).toEqual({
        kind: "concentration-dropped",
        spell: conc("bless"),
      });
      expect(useCharacterStore.getState().character?.session.concentration).toBe("");
    });

    // B8 — the EFFECTIVE-scores seam itself is exercised below (S7, beast CON);
    // the Bladesong-Focus + Headband-of-Intellect demonstrator is pack content,
    // pinned in content-pack/tests/unit/character-store.pack.test.ts.

    it("S7 — the Concentration CON save uses the BEAST's CON while Wild-Shaped (form stat-swap is override-carried)", async () => {
      // 2024 RAW (dnd2024.wikidot.com/druid:main → Wild Shape, "Game Statistics"):
      // "Your game statistics are replaced by the Beast's stat block, but you
      // retain ... Intelligence, Wisdom, and Charisma scores ...". STR/DEX/CON are
      // NOT retained — the beast's CON replaces yours. And "No Spellcasting":
      // "shape-shifting doesn't break your Concentration" — so a transformed Druid
      // still rolls a CON save to MAINTAIN it, and that save uses the BEAST's CON.
      //
      // A beast's CON is a per-beast value with NO formula (every stat block
      // differs), exactly like the beast's natural AC / walking speed — so it rides
      // OVERRIDE-FIRST (declare the LEAST, rule 2): while transformed the player
      // sets the beast's CON into the stored `abilityScores.CON`, NEVER fabricated.
      // The store reads the EFFECTIVE CON (B8) from that same field, so the form
      // stat-swap reaches the concentration-save consumer BY CONSTRUCTION — this
      // pins that integration end-to-end (real store seam → toast intent).
      const druid = (con: number): CharacterDoc => {
        const c = mockCharacter();
        c.character.classes = [{ classId: "druid", level: 4 }];
        c.character.abilityScores = { ...c.character.abilityScores, CON: con };
        c.character.savingThrows = []; // isolate the SCORE effect from proficiency
        c.character.savingThrowBonusOverrides = undefined; // no manual save override
        c.session.hp.current = 44;
        c.session.concentration = conc("bless");
        return c;
      };

      // Body CON 14 (+2) vs a stocky beast's CON 18 (+4): the SAME Druid, the only
      // change is the override-carried CON the player sets on assuming the form.
      const body = await saveBonusAfterDamage(druid(14)); // base-CON concentration save
      const beast = await saveBonusAfterDamage(druid(18)); // beast-CON concentration save
      // The save total moves by exactly the CON-modifier delta (+4 − +2 = +2): the
      // beast's CON — not the druid's retained mental scores — drives the save.
      expect(beast - body).toBe(2);
    });

    it("fires a 'Concentration replaced' toast when setConcentration swaps to a different spell (RAW 2024)", async () => {
      // RAW PHB 2024 p.235: casting a second Concentration spell ends the
      // first. The store does the swap; we surface a toast so the player
      // notices the previous spell dropped.
      const { useToastStore } = await import("@/stores/toastStore");
      const char = mockCharacter();
      char.session.concentration = conc("hex");
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setConcentration(conc("bless"));
      expect(useCharacterStore.getState().character?.session.concentration).toBe(
        conc("bless")
      );
      expect(useToastStore.getState().toasts.at(-1)?.intent).toEqual({
        kind: "concentration-replaced",
        previous: conc("hex"),
        next: conc("bless"),
      });
    });

    it("does NOT fire a 'replaced' toast on first concentration (no previous spell)", async () => {
      const { useToastStore } = await import("@/stores/toastStore");
      const before = useToastStore.getState().toasts.length;
      const char = mockCharacter();
      char.session.concentration = "";
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setConcentration(conc("bless"));
      const after = useToastStore.getState().toasts.length;
      expect(after).toBe(before);
    });

    it("fires a 'stopped concentrating' UNDO toast when setConcentration clears (sets to '')", async () => {
      const { useToastStore } = await import("@/stores/toastStore");
      const before = useToastStore.getState().toasts.length;
      const char = mockCharacter();
      char.session.concentration = conc("bless");
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setConcentration("");
      const toasts = useToastStore.getState().toasts;
      // One new toast was raised — a recoverable (onUndo) one, NOT the "replaced"
      // copy (clearing is destructive and must honour the immediate-commit-with-
      // undo contract; the previous behaviour silently lost the spell).
      expect(toasts.length).toBe(before + 1);
      const latest = toasts.at(-1);
      expect(latest?.intent).toEqual({
        kind: "stopped-concentrating",
        spell: conc("bless"),
      });
      expect(typeof latest?.onUndo).toBe("function");
      // The undo restores the prior concentration.
      latest?.onUndo?.();
      expect(useCharacterStore.getState().character?.session.concentration).toBe(
        conc("bless")
      );
    });

    it("fires a 'removed' UNDO toast when removeCondition is called", async () => {
      const { useToastStore } = await import("@/stores/toastStore");
      const before = useToastStore.getState().toasts.length;
      const char = mockCharacter();
      char.session.conditions = ["Frightened", "Poisoned"];
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().removeCondition("Frightened");
      const toasts = useToastStore.getState().toasts;
      expect(toasts.length).toBe(before + 1);
      // Store emits the condition ID only (the view resolves its localized name).
      expect(toasts.at(-1)?.intent).toEqual({
        kind: "condition-removed",
        conditionId: "Frightened",
      });
      expect(typeof toasts.at(-1)?.onUndo).toBe("function");
      // Removal applied; undo restores the FULL prior condition list.
      expect(useCharacterStore.getState().character?.session.conditions).toEqual([
        "Poisoned",
      ]);
      toasts.at(-1)?.onUndo?.();
      expect(useCharacterStore.getState().character?.session.conditions).toEqual([
        "Frightened",
        "Poisoned",
      ]);
    });

    it("does NOT fire a Concentration toast on applyDamage when not concentrating", async () => {
      const { useToastStore } = await import("@/stores/toastStore");
      const kinds: string[] = [];
      const unsub = useToastStore.subscribe((s) => {
        const latest = s.toasts.at(-1);
        if (latest?.intent) kinds.push(latest.intent.kind);
      });
      const char = mockCharacter();
      char.session.hp.current = 30;
      char.session.concentration = ""; // not concentrating
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().applyDamage(20);
      expect(kinds.filter((k) => k.startsWith("concentration"))).toHaveLength(0);
      unsub();
    });

    it("does NOT fire a Concentration toast on setHP (healing or rest path)", async () => {
      // setHP is the low-level setter — used by rest / undo / level-up.
      // It must NEVER fire the concentration save (that's `applyDamage`'s job).
      const { useToastStore } = await import("@/stores/toastStore");
      const kinds: string[] = [];
      const unsub = useToastStore.subscribe((s) => {
        const latest = s.toasts.at(-1);
        if (latest?.intent) kinds.push(latest.intent.kind);
      });
      const char = mockCharacter();
      char.session.hp.current = 10;
      char.session.concentration = conc("bless");
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setHP(30); // healing via rest
      expect(kinds.filter((k) => k.startsWith("concentration"))).toHaveLength(0);
      unsub();
    });

    it("clamps temp HP to minimum 0", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setTempHP(-3);

      expect(useCharacterStore.getState().character?.session.hp.temp).toBe(0);
    });

    it("auto-drops Concentration when applyDamage brings HP to 0 (RAW 2024)", async () => {
      // Bug fix 2026-05-28: 2024 PHB explicitly states 'If you drop to 0 Hit
      // Points, your Concentration is broken.' Previously applyDamage fired
      // a CON-save toast but left `session.concentration` set, so the sheet
      // showed the spell still being concentrated on even after the
      // character was knocked out.
      const { useToastStore } = await import("@/stores/toastStore");
      const kinds: string[] = [];
      const unsub = useToastStore.subscribe((s) => {
        const latest = s.toasts.at(-1);
        if (latest?.intent) kinds.push(latest.intent.kind);
      });
      const char = mockCharacter();
      char.session.hp.current = 8;
      char.session.concentration = conc("bless");
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().applyDamage(15);
      const state = useCharacterStore.getState().character;
      expect(state?.session.hp.current).toBe(0);
      expect(state?.session.concentration).toBe(""); // auto-dropped
      expect(useToastStore.getState().toasts.at(-1)?.intent).toEqual({
        kind: "concentration-dropped",
        spell: conc("bless"),
      });
      // No CON-save intent — RAW auto-breaks at 0 HP.
      expect(kinds.filter((k) => k === "concentration-save")).toHaveLength(0);
      unsub();
    });

    it("setHP resets death saves when regaining HP from 0 (RAW 2024 — regression)", () => {
      // Bug fix 2026-05-28: RAW PHB: "If you regain any hit points, your
      // Death Saving Throws are reset." Previously deathSucc / deathFail
      // kept their values across a heal — a character revived after 2
      // failed saves re-entered combat already mid-death-throw on the
      // next knockout.
      const char = mockCharacter();
      char.session.hp.current = 0;
      char.session.deathSucc = 2;
      char.session.deathFail = 2;
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setHP(5); // heal 5
      const state = useCharacterStore.getState().character?.session;
      expect(state?.hp.current).toBe(5);
      expect(state?.deathSucc).toBe(0);
      expect(state?.deathFail).toBe(0);
    });

    it("setHP does NOT touch death saves when not transitioning from 0", () => {
      // Healing from 5 → 10 shouldn't touch death saves (they should
      // already be 0 in normal play, but if they're non-zero from some
      // edge case we preserve them).
      const char = mockCharacter();
      char.session.hp.current = 5;
      char.session.deathSucc = 1;
      char.session.deathFail = 1;
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().setHP(10);
      const state = useCharacterStore.getState().character?.session;
      expect(state?.deathSucc).toBe(1);
      expect(state?.deathFail).toBe(1);
    });

    it("Concentration save (not auto-drop) fires when damage doesn't bring HP to 0", async () => {
      const { useToastStore } = await import("@/stores/toastStore");
      const char = mockCharacter();
      char.session.hp.current = 30;
      char.session.concentration = conc("bless");
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().applyDamage(10);
      const state = useCharacterStore.getState().character;
      expect(state?.session.hp.current).toBe(20);
      expect(state?.session.concentration).toBe(conc("bless")); // preserved
      expect(useToastStore.getState().toasts.at(-1)?.intent).toMatchObject({
        kind: "concentration-save",
      });
    });
  });

  // ── S8 ONE-TAP APPLY — the apply seams the new affordances route through ─────
  //
  // S8 adds one-tap apply to the Play tab: a slot-less temp-HP card commits its
  // resolved amount through `gainTempHp` (max-wins), the start-of-turn regen
  // banner heals 5+CON through `applyHealing`, and a dice self-heal (Second Wind)
  // applies the player's ENTERED roll + the deterministic bonus through
  // `applyHealing`. Every apply is undoable via the log-free raw setter
  // (`setTempHP`/`setHP`). Golden rule 21: a die total is NEVER fabricated — the
  // apply takes only a number the engine resolved (temp HP, regen) or the player
  // supplied (the entered die). These pin the apply SEMANTICS the UI relies on.
  describe("S8 one-tap apply seams", () => {
    it("temp-HP apply is MAX-WINS (never lowers an existing pool) + undoable", () => {
      const char = mockCharacter();
      char.session.hp.temp = 6;
      useCharacterStore.getState().setCharacter(char);
      // A slot-less temp-HP card resolves to 4 — below the current 6, so max-wins
      // keeps 6 (temp HP never stack; a smaller grant is a no-op).
      useCharacterStore.getState().gainTempHp(4);
      expect(useCharacterStore.getState().character?.session.hp.temp).toBe(6);
      // A larger grant (10) wins.
      useCharacterStore.getState().gainTempHp(10);
      expect(useCharacterStore.getState().character?.session.hp.temp).toBe(10);
      // Undo restores the EXACT prior pool via the raw setter (mirrors the commit
      // loop's `setTempHP(prevTempHp)` reverse-applier).
      useCharacterStore.getState().setTempHP(6);
      expect(useCharacterStore.getState().character?.session.hp.temp).toBe(6);
    });

    it("regen banner one-tap heals 5+CON, clamps to max, and undo restores prior HP", () => {
      // CON 14 → +2 ⇒ Heroic Rally amount = 5 + 2 = 7 (the value the resolver
      // computes; this pins the APPLY of that number).
      const char = mockCharacter();
      char.session.hp.current = 20; // of max 44 (Bloodied, ≥1)
      useCharacterStore.getState().setCharacter(char);
      const amount = 7;
      const prevHP = 20;
      useCharacterStore.getState().applyHealing(amount);
      expect(useCharacterStore.getState().character?.session.hp.current).toBe(27);
      // Undo via the log-free raw setter (the banner button's `onUndo: setHP(prev)`).
      useCharacterStore.getState().setHP(prevHP);
      expect(useCharacterStore.getState().character?.session.hp.current).toBe(20);
    });

    it("heal apply CLAMPS to effective max (a big roll never overheals)", () => {
      const char = mockCharacter();
      char.session.hp.current = 40; // max 44
      useCharacterStore.getState().setCharacter(char);
      // Second Wind: entered d10 roll 10 + Fighter-level bonus 5 = 15 → clamps to 44.
      useCharacterStore.getState().applyHealing(15);
      expect(useCharacterStore.getState().character?.session.hp.current).toBe(44);
    });

    it("dice heal applies the ENTERED value + bonus — never a fabricated roll", () => {
      const char = mockCharacter();
      char.session.hp.current = 10; // max 44
      useCharacterStore.getState().setCharacter(char);
      // The card composes `enteredRoll + bonus` and passes ONE number to the store
      // (the store has no dice/RNG path). Player rolled 7 on the d10; bonus 5.
      const enteredRoll = 7;
      const bonus = 5;
      useCharacterStore.getState().applyHealing(enteredRoll + bonus);
      expect(useCharacterStore.getState().character?.session.hp.current).toBe(22);
      // The same inputs always apply the same total — deterministic, no Math.random.
      char.session.hp.current = 10;
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().applyHealing(enteredRoll + bonus);
      expect(useCharacterStore.getState().character?.session.hp.current).toBe(22);
    });

    it("OVERRIDE — manual HP/temp setters still work (one-tap is additive, not a takeover)", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      // The manual rail controls (setHP / setTempHP / clamped gainTempHp) are
      // untouched by S8 — the one-tap buttons are a shortcut over the SAME seams.
      useCharacterStore.getState().setHP(30);
      expect(useCharacterStore.getState().character?.session.hp.current).toBe(30);
      useCharacterStore.getState().setTempHP(12);
      expect(useCharacterStore.getState().character?.session.hp.temp).toBe(12);
    });
  });

  describe("spell slots", () => {
    it("uses a spell slot", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().useSpellSlot(1);

      expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(
        1
      );
    });

    it("uses multiple spell slots", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().useSpellSlot(1);
      useCharacterStore.getState().useSpellSlot(1);
      useCharacterStore.getState().useSpellSlot(1);

      expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(
        3
      );
    });

    it("restores a spell slot", () => {
      const char = mockCharacter();
      char.session.spellSlots = { "1": { used: 2 } };
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().restoreSpellSlot(1);

      expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(
        1
      );
    });

    it("does not restore below 0", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().restoreSpellSlot(1);

      expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(
        0
      );
    });
  });

  describe("conditions", () => {
    it("adds a condition", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().addCondition("poisoned");

      expect(useCharacterStore.getState().character?.session.conditions).toContain(
        "poisoned"
      );
    });

    it("does not add duplicate conditions", () => {
      const char = mockCharacter();
      char.session.conditions = ["poisoned"];
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().addCondition("poisoned");

      expect(useCharacterStore.getState().character?.session.conditions).toEqual([
        "poisoned",
      ]);
    });

    it("removes a condition", () => {
      const char = mockCharacter();
      char.session.conditions = ["poisoned", "frightened"];
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().removeCondition("poisoned");

      expect(useCharacterStore.getState().character?.session.conditions).toEqual([
        "frightened",
      ]);
    });

    // RA-06 — SRD 5.2.1 "Concentration": gaining an Incapacitating condition ends
    // Concentration. Before this fix `addCondition` never touched
    // `session.concentration`, so a Stunned/Paralyzed caster kept concentrating.
    it("RA-06 — gaining Stunned drops held Concentration (undoable)", async () => {
      const { useToastStore } = await import("@/stores/toastStore");
      // Clean slate — the one-snackbar rule REPLACES a live undo toast in place,
      // so a leftover from an earlier test would mask the fresh raise.
      useToastStore.setState({ toasts: [], timers: {} });
      const char = mockCharacter();
      char.session.concentration = conc("bless");
      useCharacterStore.getState().setCharacter(char);

      useCharacterStore.getState().addCondition("stunned");

      // Concentration dropped…
      expect(useCharacterStore.getState().character?.session.concentration).toBe("");
      // …with the standard undoable "stopped concentrating" toast (the reversal
      // contract), so a mis-tapped condition is recoverable.
      const toasts = useToastStore.getState().toasts;
      expect(toasts.length).toBe(1);
      const latest = toasts.at(-1);
      expect(latest?.intent).toEqual({
        kind: "stopped-concentrating",
        spell: conc("bless"),
      });
      expect(typeof latest?.onUndo).toBe("function");
      latest?.onUndo?.();
      expect(useCharacterStore.getState().character?.session.concentration).toBe(
        conc("bless")
      );
    });

    it("RA-06 — each Incapacitated-family condition drops Concentration", () => {
      for (const cond of ["incapacitated", "paralyzed", "petrified", "unconscious"]) {
        const char = mockCharacter();
        char.session.concentration = conc("bless");
        useCharacterStore.getState().setCharacter(char);
        useCharacterStore.getState().addCondition(cond);
        expect(
          useCharacterStore.getState().character?.session.concentration,
          `${cond} should drop concentration`
        ).toBe("");
      }
    });

    it("RA-06 — a NON-incapacitating condition (poisoned) leaves Concentration intact", () => {
      const char = mockCharacter();
      char.session.concentration = conc("bless");
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().addCondition("poisoned");
      expect(useCharacterStore.getState().character?.session.concentration).toBe(
        conc("bless")
      );
    });

    it("RA-06 — gaining Stunned while NOT concentrating drops nothing (no toast)", async () => {
      const { useToastStore } = await import("@/stores/toastStore");
      useToastStore.setState({ toasts: [], timers: {} });
      const char = mockCharacter();
      char.session.concentration = "";
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().addCondition("stunned");
      expect(useToastStore.getState().toasts.length).toBe(0);
    });

    // RA-12 — SRD 5.2.1 "Hide [Action]": a successful DC 15 Stealth check makes
    // you Invisible and your check TOTAL is the DC to find you. One undoable unit.
    it("RA-12 — applyHiddenState gains Invisible + remembers the find-DC; undo restores", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);

      const undo = useCharacterStore.getState().applyHiddenState(17);
      const session = useCharacterStore.getState().character?.session;
      expect(session?.conditions).toContain("invisible");
      expect(session?.hiddenDc).toBe(17);

      expect(typeof undo).toBe("function");
      undo?.();
      const after = useCharacterStore.getState().character?.session;
      expect(after?.conditions).not.toContain("invisible");
      expect(after?.hiddenDc).toBeUndefined();
    });

    it("RA-12 — re-hiding while already Invisible only moves the find-DC", () => {
      const char = mockCharacter();
      char.session.conditions = ["invisible"];
      char.session.hiddenDc = 15;
      useCharacterStore.getState().setCharacter(char);

      const undo = useCharacterStore.getState().applyHiddenState(21);
      const session = useCharacterStore.getState().character?.session;
      expect(session?.conditions).toEqual(["invisible"]);
      expect(session?.hiddenDc).toBe(21);
      undo?.();
      expect(useCharacterStore.getState().character?.session.hiddenDc).toBe(15);
      expect(useCharacterStore.getState().character?.session.conditions).toEqual([
        "invisible",
      ]);
    });

    it("RA-12 — removing Invisible clears the find-DC (and undo restores it)", async () => {
      const { useToastStore } = await import("@/stores/toastStore");
      useToastStore.setState({ toasts: [], timers: {} });
      const char = mockCharacter();
      char.session.conditions = ["invisible"];
      char.session.hiddenDc = 18;
      useCharacterStore.getState().setCharacter(char);

      useCharacterStore.getState().removeCondition("invisible");
      expect(useCharacterStore.getState().character?.session.hiddenDc).toBeUndefined();

      const latest = useToastStore.getState().toasts.at(-1);
      latest?.onUndo?.();
      const restored = useCharacterStore.getState().character?.session;
      expect(restored?.conditions).toContain("invisible");
      expect(restored?.hiddenDc).toBe(18);
    });
  });

  // PLAY-NO-EDIT — session defenses mirror the conditions register: add/remove
  // in play, session-scoped, never touching the build's override maps.
  describe("session defenses (PLAY-NO-EDIT)", () => {
    it("adds a session defense to its kind list", () => {
      useCharacterStore.getState().setCharacter(mockCharacter());
      useCharacterStore.getState().addSessionDefense("resistance", "fire");

      expect(
        useCharacterStore.getState().character?.session.sessionDefenses?.resistance
      ).toEqual(["fire"]);
    });

    it("does not add duplicates and keeps kinds independent", () => {
      useCharacterStore.getState().setCharacter(mockCharacter());
      const s = useCharacterStore.getState();
      s.addSessionDefense("resistance", "fire");
      s.addSessionDefense("resistance", "fire");
      s.addSessionDefense("immunity", "poison");
      s.addSessionDefense("conditionImmunity", "frightened");

      const defs = useCharacterStore.getState().character?.session.sessionDefenses;
      expect(defs?.resistance).toEqual(["fire"]);
      expect(defs?.immunity).toEqual(["poison"]);
      expect(defs?.conditionImmunity).toEqual(["frightened"]);
    });

    it("REGRESSION: a play-time defense never touches the build override maps", () => {
      useCharacterStore.getState().setCharacter(mockCharacter());
      useCharacterStore.getState().addSessionDefense("resistance", "fire");
      useCharacterStore.getState().addSessionDefense("vulnerability", "cold");

      const data = useCharacterStore.getState().character?.character;
      expect(data?.damageResistanceOverrides).toBeUndefined();
      expect(data?.damageVulnerabilityOverrides).toBeUndefined();
      expect(data?.damageImmunityOverrides).toBeUndefined();
      expect(data?.conditionImmunityOverrides).toBeUndefined();
    });

    it("removes a session defense and emits an undoable defense-removed toast", () => {
      const char = mockCharacter();
      char.session.sessionDefenses = { resistance: ["fire", "cold"] };
      useCharacterStore.getState().setCharacter(char);
      useToastStore.getState().clearAll();

      useCharacterStore.getState().removeSessionDefense("resistance", "fire");
      expect(
        useCharacterStore.getState().character?.session.sessionDefenses?.resistance
      ).toEqual(["cold"]);

      // The toast carries the structured intent (stable ids, no prose) + undo.
      const toast = useToastStore.getState().toasts.at(-1);
      expect(toast?.intent).toEqual({
        kind: "defense-removed",
        defenseKind: "resistance",
        defenseId: "fire",
      });
      toast?.onUndo?.();
      expect(
        useCharacterStore.getState().character?.session.sessionDefenses?.resistance
      ).toEqual(["fire", "cold"]);
    });

    it("no-ops for an id that is not present", () => {
      const char = mockCharacter();
      char.session.sessionDefenses = { immunity: ["poison"] };
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().removeSessionDefense("immunity", "fire");

      expect(
        useCharacterStore.getState().character?.session.sessionDefenses?.immunity
      ).toEqual(["poison"]);
    });

    it("read-only mode blocks both mutations (T4 backstop)", () => {
      const char = mockCharacter();
      char.session.sessionDefenses = { resistance: ["fire"] };
      useCharacterStore.getState().loadReadonly(char);
      useCharacterStore.getState().addSessionDefense("resistance", "cold");
      useCharacterStore.getState().removeSessionDefense("resistance", "fire");

      expect(
        useCharacterStore.getState().character?.session.sessionDefenses?.resistance
      ).toEqual(["fire"]);
    });
  });

  describe("trackers", () => {
    it("uses a tracker", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().useTracker("rage");

      expect(useCharacterStore.getState().character?.session.trackers["rage"]?.used).toBe(
        1
      );
    });

    it("restores a tracker", () => {
      const char = mockCharacter();
      char.session.trackers = { rage: { used: 2 } };
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().restoreTracker("rage");

      expect(useCharacterStore.getState().character?.session.trackers["rage"]?.used).toBe(
        1
      );
    });

    it("does not restore tracker below 0", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().restoreTracker("rage");

      expect(useCharacterStore.getState().character?.session.trackers["rage"]?.used).toBe(
        0
      );
    });
  });

  describe("pinnedActions", () => {
    it("pins an action", () => {
      const char = mockCharacter();
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().togglePinnedAction("action-1");

      expect(useCharacterStore.getState().character?.session.pinnedActions).toContain(
        "action-1"
      );
    });

    it("unpins an action", () => {
      const char = mockCharacter();
      char.session.pinnedActions = ["action-1", "action-2"];
      useCharacterStore.getState().setCharacter(char);
      useCharacterStore.getState().togglePinnedAction("action-1");

      expect(useCharacterStore.getState().character?.session.pinnedActions).toEqual([
        "action-2",
      ]);
    });
  });
});

// ─── useEquipmentItem ─────────────────────────────────────────────────────────

describe("useEquipmentItem", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null });
  });

  function charWithEquipment(
    items: Array<{ srdId: string; quantity: number; tracked?: boolean }>
  ) {
    const base = mockCharacter();
    return {
      ...base,
      character: {
        ...base.character,
        equipment: items.map(({ srdId, quantity, tracked = true }) => ({
          srdId,
          quantity,
          tracked,
        })),
      },
    };
  }

  it("decrements quantity by 1", () => {
    useCharacterStore.setState({
      character: charWithEquipment([{ srdId: "healing-potion", quantity: 3 }]),
    });
    useCharacterStore.getState().useEquipmentItem("healing-potion");
    const eq = useCharacterStore.getState().character?.character.equipment;
    expect(eq?.[0]).toMatchObject({ srdId: "healing-potion", quantity: 2 });
  });

  it("removes the entry when quantity reaches 0", () => {
    useCharacterStore.setState({
      character: charWithEquipment([{ srdId: "healing-potion", quantity: 1 }]),
    });
    useCharacterStore.getState().useEquipmentItem("healing-potion");
    const eq = useCharacterStore.getState().character?.character.equipment;
    expect(eq).toHaveLength(0);
  });

  it("does not affect other equipment entries", () => {
    useCharacterStore.setState({
      character: charWithEquipment([
        { srdId: "healing-potion", quantity: 2 },
        { srdId: "antitoxin", quantity: 1 },
      ]),
    });
    useCharacterStore.getState().useEquipmentItem("healing-potion");
    const eq = useCharacterStore.getState().character?.character.equipment;
    expect(eq).toHaveLength(2);
    expect(eq?.[1]).toMatchObject({ srdId: "antitoxin", quantity: 1 });
  });

  it("is a no-op when character is null", () => {
    expect(() =>
      useCharacterStore.getState().useEquipmentItem("healing-potion")
    ).not.toThrow();
  });

  it("uses custom- prefix for custom items", () => {
    const base = mockCharacter();
    useCharacterStore.setState({
      character: {
        ...base,
        character: {
          ...base.character,
          equipment: [
            { custom: true, name: "Magic Salve", quantity: 2, tracked: true } as never,
          ],
        },
      },
    });
    useCharacterStore.getState().useEquipmentItem("custom-Magic Salve");
    const eq = useCharacterStore.getState().character?.character.equipment;
    expect((eq?.[0] as { quantity: number }).quantity).toBe(1);
  });
});

describe("characterStore — entity delete (immutable splice + undo pattern)", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  /** Helper to get character from store with assertion (avoids non-null `!`) */
  function getChar() {
    const c = useCharacterStore.getState().character;
    expect(c).not.toBeNull();
    return c as NonNullable<typeof c>;
  }

  it("removes a spell at index and allows re-insertion (undo)", () => {
    const char = mockCharacter({
      character: {
        ...mockCharacter().character,
        spells: [{ srdId: "fire-bolt" }, { srdId: "shield" }, { srdId: "magic-missile" }],
      },
    });
    useCharacterStore.getState().setCharacter(char);

    // Delete index 1 (shield)
    const before = getChar();
    const spells = [...before.character.spells];
    const [removed] = spells.splice(1, 1);
    if (!removed) throw new Error("expected removed spell");
    useCharacterStore
      .getState()
      .setCharacter({ ...before, character: { ...before.character, spells } });

    const after = getChar().character.spells;
    expect(after).toHaveLength(2);
    expect(after[0]).toEqual({ srdId: "fire-bolt" });
    expect(after[1]).toEqual({ srdId: "magic-missile" });

    // Undo — re-insert at original index
    const current = getChar();
    const restored = [...current.character.spells];
    restored.splice(1, 0, removed);
    useCharacterStore.getState().setCharacter({
      ...current,
      character: { ...current.character, spells: restored },
    });

    const undone = getChar().character.spells;
    expect(undone).toHaveLength(3);
    expect(undone[1]).toEqual({ srdId: "shield" });
  });

  it("removes a weapon at index and allows re-insertion (undo)", () => {
    const char = mockCharacter({
      character: {
        ...mockCharacter().character,
        weapons: [
          { srdId: "longsword", quantity: 1 },
          { srdId: "shortbow", quantity: 1 },
        ],
      },
    });
    useCharacterStore.getState().setCharacter(char);

    const before = getChar();
    const weapons = [...before.character.weapons];
    const [removed] = weapons.splice(0, 1);
    if (!removed) throw new Error("expected removed weapon");
    useCharacterStore
      .getState()
      .setCharacter({ ...before, character: { ...before.character, weapons } });

    const after = getChar().character.weapons;
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual({ srdId: "shortbow", quantity: 1 });

    // Undo
    const current = getChar();
    const restored = [...current.character.weapons];
    restored.splice(0, 0, removed);
    useCharacterStore.getState().setCharacter({
      ...current,
      character: { ...current.character, weapons: restored },
    });

    expect(getChar().character.weapons).toHaveLength(2);
    expect(getChar().character.weapons[0]).toEqual({ srdId: "longsword", quantity: 1 });
  });

  it("removes an equipment item at index and allows re-insertion (undo)", () => {
    const char = mockCharacter({
      character: {
        ...mockCharacter().character,
        equipment: [
          { srdId: "rope-silk", quantity: 1 },
          { srdId: "torch", quantity: 5, tracked: true },
          { custom: true, name: "Lucky Coin", quantity: 1 } as never,
        ],
      },
    });
    useCharacterStore.getState().setCharacter(char);

    const before = getChar();
    const equip = [...before.character.equipment];
    const [removed] = equip.splice(1, 1); // torch
    if (!removed) throw new Error("expected removed equipment");
    useCharacterStore
      .getState()
      .setCharacter({ ...before, character: { ...before.character, equipment: equip } });

    const after = getChar().character.equipment;
    expect(after).toHaveLength(2);
    expect((after[0] as { srdId: string }).srdId).toBe("rope-silk");
    expect((after[1] as { name: string }).name).toBe("Lucky Coin");

    // Undo
    const current = getChar();
    const restored = [...current.character.equipment];
    restored.splice(1, 0, removed);
    useCharacterStore.getState().setCharacter({
      ...current,
      character: { ...current.character, equipment: restored },
    });

    expect(getChar().character.equipment).toHaveLength(3);
    expect((getChar().character.equipment[1] as { srdId: string }).srdId).toBe("torch");
  });

  it("removes a feature at index and allows re-insertion (undo)", () => {
    const char = mockCharacter({
      character: {
        ...mockCharacter().character,
        features: [
          { srdId: "fighter-second-wind" },
          { srdId: "fighter-action-surge" },
          {
            custom: true,
            title: "Homebrew Ability",
            emoji: "🔥",
            source: "DM",
            tags: [],
            contentBlocks: [],
          } as never,
        ],
      },
    });
    useCharacterStore.getState().setCharacter(char);

    const before = getChar();
    const features = [...before.character.features];
    const [removed] = features.splice(1, 1); // action-surge
    if (!removed) throw new Error("expected removed feature");
    useCharacterStore
      .getState()
      .setCharacter({ ...before, character: { ...before.character, features } });

    const after = getChar().character.features;
    expect(after).toHaveLength(2);
    expect((after[0] as { srdId: string }).srdId).toBe("fighter-second-wind");
    expect((after[1] as { title: string }).title).toBe("Homebrew Ability");

    // Undo
    const current = getChar();
    const restored = [...current.character.features];
    restored.splice(1, 0, removed);
    useCharacterStore.getState().setCharacter({
      ...current,
      character: { ...current.character, features: restored },
    });

    expect(getChar().character.features).toHaveLength(3);
    expect((getChar().character.features[1] as { srdId: string }).srdId).toBe(
      "fighter-action-surge"
    );
  });
});

describe("characterStore — toggleActiveFeature (L11)", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  it("toggles a feature on (from undefined active set), then off", () => {
    useCharacterStore.getState().setCharacter(mockCharacter());
    useCharacterStore.getState().toggleActiveFeature("barbarian-rage");
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([
      "barbarian-rage",
    ]);

    useCharacterStore.getState().toggleActiveFeature("barbarian-rage");
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([]);
  });

  it("supports multiple independent toggles", () => {
    useCharacterStore.getState().setCharacter(mockCharacter());
    useCharacterStore.getState().toggleActiveFeature("a");
    useCharacterStore.getState().toggleActiveFeature("b");
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([
      "a",
      "b",
    ]);
    useCharacterStore.getState().toggleActiveFeature("a");
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual(["b"]);
  });

  it("is a no-op when there is no character loaded", () => {
    useCharacterStore.getState().toggleActiveFeature("x");
    expect(useCharacterStore.getState().character).toBeNull();
  });
});

describe("characterStore — setGrantBundleChoice (L12, Circle of the Land terrain)", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  /** A level-9 Circle-of-the-Land druid (so all four terrains' L3-9 unlock). */
  function landDruid() {
    return mockCharacter({
      character: {
        ...mockCharacter().character,
        classes: [{ classId: "druid", subclassId: "circle-of-the-land", level: 9 }],
        features: [
          { srdId: "druid-land-circle-spells" },
          { srdId: "druid-land-natures-ward" },
        ],
        spells: [],
      },
    });
  }

  const srdIds = () => {
    const spells = useCharacterStore.getState().character?.character.spells ?? [];
    return spells
      .filter((s) => !("custom" in s))
      .map((s) => (s as { srdId: string }).srdId);
  };

  it("picking Arid injects the arid Circle Spells (always-prepared) + records the choice", () => {
    useCharacterStore.getState().setCharacter(landDruid());
    useCharacterStore.getState().setGrantBundleChoice("druid-land-terrain", "arid");
    expect(srdIds().sort()).toEqual([
      "blight",
      "blur",
      "burning-hands",
      "fire-bolt",
      "fireball",
      "wall-of-stone",
    ]);
    expect(useCharacterStore.getState().character?.session.grantBundleChoices).toEqual({
      "druid-land-terrain": "arid",
    });
  });

  it("switching to Polar removes the arid spells and injects polar (no accumulation)", () => {
    useCharacterStore.getState().setCharacter(landDruid());
    useCharacterStore.getState().setGrantBundleChoice("druid-land-terrain", "arid");
    useCharacterStore.getState().setGrantBundleChoice("druid-land-terrain", "polar");
    const ids = srdIds();
    expect(ids).not.toContain("fireball"); // arid gone
    expect(ids.sort()).toEqual([
      "cone-of-cold",
      "fog-cloud",
      "hold-person",
      "ice-storm",
      "ray-of-frost",
      "sleet-storm",
    ]);
  });

  it("preserves a player's own non-always-prepared spell across a terrain swap", () => {
    const c = landDruid();
    c.character.spells = [{ srdId: "cure-wounds", prepared: true }];
    useCharacterStore.getState().setCharacter(c);
    useCharacterStore.getState().setGrantBundleChoice("druid-land-terrain", "arid");
    expect(srdIds()).toContain("cure-wounds");
  });
});

describe("characterStore — read-only mode (T4: DM views a member's sheet)", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  it("loadReadonly sets the doc and flips the readonly flag", () => {
    useCharacterStore.getState().loadReadonly(mockCharacter());
    const s = useCharacterStore.getState();
    expect(s.character?.id).toBe("test-char-1");
    expect(s.readonly).toBe(true);
  });

  it("setCharacter clears readonly (owner-edit path is editable again)", () => {
    useCharacterStore.getState().loadReadonly(mockCharacter());
    expect(useCharacterStore.getState().readonly).toBe(true);
    useCharacterStore.getState().setCharacter(mockCharacter());
    expect(useCharacterStore.getState().readonly).toBe(false);
  });

  it("EVERY mutation is inert while read-only (no write path)", () => {
    const char = mockCharacter();
    char.session.hp.current = 30;
    useCharacterStore.getState().loadReadonly(char);

    // A representative sweep across the mutator surface — none may change state.
    useCharacterStore.getState().setHP(1);
    useCharacterStore.getState().applyDamage(10);
    useCharacterStore.getState().setTempHP(5);
    useCharacterStore.getState().useSpellSlot(1);
    useCharacterStore.getState().useTracker("rage", 1);
    useCharacterStore.getState().restoreTracker("rage", 1);
    useCharacterStore.getState().addCondition("poisoned");
    useCharacterStore.getState().setConcentration(conc("bless"));
    useCharacterStore.getState().updateSession({ inspiration: true });
    useCharacterStore.getState().longRest();
    useCharacterStore.getState().shortRest();
    useCharacterStore.getState().toggleActiveFeature("rage");
    useCharacterStore.getState().togglePinnedAction("a1");

    const s = useCharacterStore.getState().character;
    expect(s?.session.hp.current).toBe(30); // unchanged
    expect(s?.session.hp.temp).toBe(0);
    expect(s?.session.spellSlots).toEqual({});
    expect(s?.session.trackers).toEqual({});
    expect(s?.session.conditions).toEqual([]);
    expect(s?.session.concentration).toBe("");
    expect(s?.session.inspiration).toBe(false);
  });

  it("mutations work normally once a fresh owner-edit doc is loaded", () => {
    useCharacterStore.getState().loadReadonly(mockCharacter());
    useCharacterStore.getState().setCharacter(mockCharacter());
    useCharacterStore.getState().setHP(10);
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(10);
  });
});

describe("characterStore — hydrateCombatState (combat/state subdoc → session)", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  it("merges a combat snapshot's trio into the session (initiative number → string)", () => {
    useCharacterStore.getState().setCharacter(mockCharacter());
    useCharacterStore.getState().hydrateCombatState({
      hp: { current: 12, temp: 4 },
      conditions: ["poisoned", "prone"],
      initiativeRoll: 18,
      deathSaves: { successes: 1, failures: 2 },
      round: 1,
    });
    const s = useCharacterStore.getState().character?.session;
    expect(s?.hp).toEqual({ current: 12, temp: 4 });
    expect(s?.conditions).toEqual(["poisoned", "prone"]);
    expect(s?.initiative).toBe("18");
    expect(s?.deathSucc).toBe(1);
    expect(s?.deathFail).toBe(2);
  });

  it("an ABSENT subdoc (null) defaults to FULL effective HP, not 0", () => {
    const char = mockCharacter();
    char.session.hp = { current: 0, temp: 0 }; // parent doc reads back stripped
    char.session.conditions = ["stunned"];
    char.session.deathSucc = 3;
    useCharacterStore.getState().setCharacter(char);

    useCharacterStore.getState().hydrateCombatState(null);

    const s = useCharacterStore.getState().character?.session;
    expect(s?.hp).toEqual({ current: 44, temp: 0 }); // effective max for the fixture
    expect(s?.conditions).toEqual([]);
    expect(s?.initiative).toBe("");
    expect(s?.deathSucc).toBe(0);
    expect(s?.deathFail).toBe(0);
  });

  it("clamps a hydrated HP above the effective max and below 0", () => {
    useCharacterStore.getState().setCharacter(mockCharacter());
    useCharacterStore.getState().hydrateCombatState({
      hp: { current: 999, temp: -5 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      round: 1,
    });
    const s = useCharacterStore.getState().character?.session;
    expect(s?.hp).toEqual({ current: 44, temp: 0 });
    expect(s?.initiative).toBe("");
  });

  it("is a no-op when no character is loaded", () => {
    useCharacterStore.getState().hydrateCombatState(null);
    expect(useCharacterStore.getState().character).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FRONTIER-S3 (A2) — the cadence appliers + their undo round-trips
// ════════════════════════════════════════════════════════════════════════════

const rogueDoc = (session = {}): CharacterDoc =>
  makeCharacterDoc(
    { classId: "rogue", level: 3, features: [{ srdId: "rogue-sneak-attack" }] },
    session
  );

const barbarianDoc = (session = {}): CharacterDoc =>
  makeCharacterDoc(
    { classId: "barbarian", level: 3, features: [{ srdId: "barbarian-rage" }] },
    session
  );

describe("characterStore — FRONTIER-S3 cadence appliers", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  describe("recoverPerTurnTrackers", () => {
    it("resets a spent per-turn tracker (Sneak Attack) and undo re-spends it", () => {
      useCharacterStore
        .getState()
        .setCharacter(rogueDoc({ trackers: { "rogue-sneak-attack": { used: 1 } } }));
      const undo = useCharacterStore.getState().recoverPerTurnTrackers();
      expect(undo).not.toBeNull();
      // Reset → the tracker entry is dropped (used: 0 canonical absent).
      expect(
        useCharacterStore.getState().character?.session.trackers["rogue-sneak-attack"]
      ).toBeUndefined();
      // Undo restores the EXACT prior spent state.
      undo?.();
      expect(
        useCharacterStore.getState().character?.session.trackers["rogue-sneak-attack"]
      ).toEqual({ used: 1 });
    });

    it("no-ops (returns null) when nothing is spent", () => {
      useCharacterStore.getState().setCharacter(rogueDoc());
      expect(useCharacterStore.getState().recoverPerTurnTrackers()).toBeNull();
    });
  });

  describe("armEffectTimers", () => {
    it("arms an active maxRounds state (Rage → 100) and is idempotent", () => {
      useCharacterStore
        .getState()
        .setCharacter(barbarianDoc({ activeFeatures: ["barbarian-rage"] }));
      useCharacterStore.getState().armEffectTimers();
      expect(
        useCharacterStore.getState().character?.session.effectTimers?.["barbarian-rage"]
      ).toEqual({ roundsLeft: 100 });
      // Re-arming leaves the existing countdown untouched.
      useCharacterStore.getState().armEffectTimers();
      expect(
        useCharacterStore.getState().character?.session.effectTimers?.["barbarian-rage"]
      ).toEqual({ roundsLeft: 100 });
    });

    it("no-ops when no maxRounds state is active", () => {
      useCharacterStore.getState().setCharacter(barbarianDoc());
      useCharacterStore.getState().armEffectTimers();
      expect(
        useCharacterStore.getState().character?.session.effectTimers
      ).toBeUndefined();
    });
  });

  describe("advanceEffectTimers", () => {
    it("decrements a non-expiring timer and undo restores it exactly", () => {
      useCharacterStore.getState().setCharacter(
        barbarianDoc({
          activeFeatures: ["barbarian-rage"],
          effectTimers: { "barbarian-rage": { roundsLeft: 5 } },
        })
      );
      const { expired, restore } = useCharacterStore.getState().advanceEffectTimers();
      expect(expired).toEqual([]);
      expect(
        useCharacterStore.getState().character?.session.effectTimers?.["barbarian-rage"]
      ).toEqual({ roundsLeft: 4 });
      restore();
      expect(
        useCharacterStore.getState().character?.session.effectTimers?.["barbarian-rage"]
      ).toEqual({ roundsLeft: 5 });
    });

    it("auto-drops an expiring state (Rage at 1) + logs it, and undo restores toggle+timer+log", () => {
      useCharacterStore.getState().setCharacter(
        barbarianDoc({
          activeFeatures: ["barbarian-rage"],
          effectTimers: { "barbarian-rage": { roundsLeft: 1 } },
        })
      );
      const logBefore =
        useCharacterStore.getState().character?.session.logEntries.length ?? 0;
      const { expired, restore } = useCharacterStore.getState().advanceEffectTimers();
      // The state expired: toggle cleared, timer gone, an effect-expired line added.
      expect(expired).toEqual([
        { activeKey: "barbarian-rage", sourceId: "barbarian-rage" },
      ]);
      const afterDrop = useCharacterStore.getState().character;
      expect(afterDrop?.session.activeFeatures).not.toContain("barbarian-rage");
      expect(afterDrop?.session.effectTimers?.["barbarian-rage"]).toBeUndefined();
      expect(afterDrop?.session.logEntries.length).toBe(logBefore + 1);
      expect(afterDrop?.session.logEntries.at(-1)?.event).toEqual({
        kind: "effect-expired",
        sourceId: "barbarian-rage",
      });
      // Undo restores the toggle, the timer, AND removes the expiry log line.
      restore();
      const restored = useCharacterStore.getState().character;
      expect(restored?.session.activeFeatures).toContain("barbarian-rage");
      expect(restored?.session.effectTimers?.["barbarian-rage"]).toEqual({
        roundsLeft: 1,
      });
      expect(restored?.session.logEntries.length).toBe(logBefore);
    });
  });

  describe("consumePotionBuff (S9)", () => {
    it("arms a potion:<id> timer to the potion's duration and undo restores", () => {
      useCharacterStore.getState().setCharacter(barbarianDoc());
      const restore = useCharacterStore.getState().consumePotionBuff("potion-of-speed");
      expect(restore).toBeTypeOf("function");
      expect(
        useCharacterStore.getState().character?.session.effectTimers?.[
          "potion:potion-of-speed"
        ]
      ).toEqual({ roundsLeft: 10 });
      // Undo drops the armed timer (the map returns to its prior empty state).
      restore?.();
      expect(
        useCharacterStore.getState().character?.session.effectTimers
      ).toBeUndefined();
    });

    it("returns null for an instant potion (no duration to arm)", () => {
      useCharacterStore.getState().setCharacter(barbarianDoc());
      expect(
        useCharacterStore.getState().consumePotionBuff("potion-of-healing")
      ).toBeNull();
      expect(
        useCharacterStore.getState().character?.session.effectTimers
      ).toBeUndefined();
    });
  });
});

// S9 — an equipped charged magic item surfaces its charge pool as a rail
// tracker keyed by the item id (the same id the cast flow debits).
describe("resolveTrackers — charged item charge pool (S9)", () => {
  it("an equipped Wand of Magic Missiles surfaces a 7-charge pool tracker", async () => {
    const { resolveTrackers } = await import("@/lib/smart-tracker");
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      equipment: [{ srdId: "wand-of-magic-missiles", equipped: true, quantity: 1 }],
    });
    const wand = resolveTrackers(doc).find((t) => t.id === "wand-of-magic-missiles");
    expect(wand).toBeDefined();
    expect(wand?.total).toBe(7);
    expect(wand?.isPool).toBe(true);
    expect(wand?.recovery).toBe("dawn");
  });

  it("an UNEQUIPPED charged item surfaces no charge tracker", async () => {
    const { resolveTrackers } = await import("@/lib/smart-tracker");
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      equipment: [{ srdId: "wand-of-magic-missiles", equipped: false, quantity: 1 }],
    });
    expect(resolveTrackers(doc).some((t) => t.id === "wand-of-magic-missiles")).toBe(
      false
    );
  });
});

describe("characterStore — S1 concentration drop/swap clears the buff chip", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  // A PALADIN concentrating on Shield of Faith (+2 AC `while-active`, activeKey
  // `spell-shield-of-faith`), with its rail chip lit in `activeFeatures`. The
  // spell must be PREPARED for it to become a grant SOURCE (the chip exists).
  function concentratingOnShieldOfFaith(): CharacterDoc {
    const char = mockCharacter({
      character: {
        ...mockCharacter().character,
        classes: [{ classId: "paladin", level: 5 }],
        spellcasting: {
          ability: "CHA",
          preparedCaster: true,
          preparedMax: 4,
          saveDCOverride: null,
          attackBonusOverride: null,
        },
        spellSlots: [{ level: 1, total: 4 }],
        spells: [
          { srdId: "shield-of-faith", prepared: true },
          { srdId: "bless", prepared: true },
        ],
      },
    });
    char.session.concentration = conc("shield-of-faith");
    char.session.activeFeatures = ["spell-shield-of-faith"];
    return char;
  }

  it("clears the dropped spell's chip when setConcentration('') ends it (+ undo restores it)", async () => {
    const { useToastStore } = await import("@/stores/toastStore");
    useCharacterStore.getState().setCharacter(concentratingOnShieldOfFaith());

    useCharacterStore.getState().setConcentration("");
    // Chip retracted together with concentration.
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([]);

    // The stopped-concentrating UNDO toast restores BOTH atomically.
    const undo = useToastStore.getState().toasts.at(-1)?.onUndo;
    expect(typeof undo).toBe("function");
    undo?.();
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      conc("shield-of-faith")
    );
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([
      "spell-shield-of-faith",
    ]);
  });

  it("on swap, strips ONLY the OLD spell's chip — the new spell's chip stays the player's manual act", () => {
    useCharacterStore.getState().setCharacter(concentratingOnShieldOfFaith());
    // Swap into Bless (Bless carries no while-active grant → no new chip).
    useCharacterStore.getState().setConcentration(conc("bless"));
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      conc("bless")
    );
    // Old buff chip gone; nothing new lit (Bless has no standing-buff grant).
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([]);
  });

  it("clears the chip on the 0-HP auto-drop (applyDamage to 0)", () => {
    const char = concentratingOnShieldOfFaith();
    char.session.hp.current = 10;
    useCharacterStore.getState().setCharacter(char);
    // Lethal hit → concentration auto-breaks at 0 HP (RAW), chip retracts with it.
    useCharacterStore.getState().applyDamage(50);
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(0);
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([]);
  });

  it("a non-buff concentration spell (no while-active grant) leaves activeFeatures untouched on drop", () => {
    const char = mockCharacter({
      character: {
        ...mockCharacter().character,
        classes: [{ classId: "bard", level: 5 }],
        spellcasting: {
          ability: "CHA",
          preparedCaster: false,
          preparedMax: 0,
          saveDCOverride: null,
          attackBonusOverride: null,
        },
        spellSlots: [{ level: 1, total: 4 }],
        spells: [{ srdId: "bless", prepared: true }],
      },
    });
    char.session.concentration = conc("bless");
    // An unrelated chip is lit (e.g. Rage); a non-buff drop must NOT touch it.
    char.session.activeFeatures = ["barbarian-rage"];
    useCharacterStore.getState().setCharacter(char);
    useCharacterStore.getState().setConcentration("");
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([
      "barbarian-rage",
    ]);
  });

  it("the manual chip toggle still works (override-first — auto-light never removes it)", () => {
    useCharacterStore.getState().setCharacter(concentratingOnShieldOfFaith());
    // Player taps the chip off by hand while still concentrating.
    useCharacterStore.getState().toggleActiveFeature("spell-shield-of-faith");
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([]);
    // …and back on.
    useCharacterStore.getState().toggleActiveFeature("spell-shield-of-faith");
    expect(useCharacterStore.getState().character?.session.activeFeatures).toEqual([
      "spell-shield-of-faith",
    ]);
  });
});

// ── C7: combat-state persistence (the injected `CombatPersistence.write` seam) ──
//
// Each trio mutator applies its optimistic in-memory change AND persists the WHOLE
// resulting CombatState through the injected `write` seam — one offline-queueable
// `setDoc(merge)` per op (whole-object last-write-wins). Persisting the store's own
// optimistic reduction (not re-reducing in a transaction) is what makes an OFFLINE
// damage / heal / condition / death-save durably queued instead of silently lost.
describe("characterStore — combat-state persistence (C7 offline-safe write seam)", () => {
  function spyPersistence() {
    return { write: vi.fn<CombatPersistence["write"]>() };
  }
  let persistence: ReturnType<typeof spyPersistence>;
  /** The most recent CombatState handed to `write`. */
  const lastWrite = (): CombatState => {
    const call = persistence.write.mock.calls.at(-1);
    if (!call) throw new Error("write was never called");
    return call[0];
  };

  beforeEach(() => {
    persistence = spyPersistence();
    const char = mockCharacter();
    char.session.hp = { current: 20, temp: 0 }; // room to heal under the 44 effective max
    useCharacterStore.getState().setCharacter(char);
    useCharacterStore.getState().setCombatPersistence(persistence);
  });
  afterEach(() => {
    // Clear the injected seam so it never leaks into the optimistic-only tests above.
    useCharacterStore.getState().setCombatPersistence(null);
  });

  it("applyDamage / applyHealing persist the whole resulting HP (the store's optimistic value, not a delta)", () => {
    useCharacterStore.getState().applyDamage(7);
    expect(lastWrite().hp).toEqual({ current: 13, temp: 0 });
    useCharacterStore.getState().applyHealing(5);
    expect(lastWrite().hp).toEqual({ current: 18, temp: 0 });
  });

  it("setHP / setTempHP / gainTempHp persist the whole resulting state", () => {
    useCharacterStore.getState().setHP(12);
    expect(lastWrite().hp).toEqual({ current: 12, temp: 0 });
    useCharacterStore.getState().setTempHP(6);
    expect(lastWrite().hp).toEqual({ current: 12, temp: 6 });
    // gainTempHp (max-wins) rides setTempHP → ONE write, no double persist.
    persistence.write.mockClear();
    useCharacterStore.getState().gainTempHp(9);
    expect(persistence.write).toHaveBeenCalledTimes(1);
    expect(lastWrite().hp.temp).toBe(9);
  });

  it("addCondition / removeCondition persist the whole conditions list (undo restores it)", () => {
    useCharacterStore.getState().addCondition("prone");
    expect(lastWrite().conditions).toEqual(["prone"]);
    useCharacterStore.getState().removeCondition("prone");
    expect(lastWrite().conditions).toEqual([]);
    // The 5s undo toast restores it (converging the subdoc).
    const toast = useToastStore.getState().toasts.at(-1);
    toast?.onUndo?.();
    expect(lastWrite().conditions).toEqual(["prone"]);
  });

  it("a death-save change persists the whole resulting nested deathSaves", () => {
    useCharacterStore.getState().setDeathSaves(1, 0);
    expect(lastWrite().deathSaves).toEqual({ successes: 1, failures: 0 });
    useCharacterStore.getState().setDeathSaves(2, 1);
    expect(lastWrite().deathSaves).toEqual({ successes: 2, failures: 1 });
  });

  // The headline regression: the SOLO round's sole persisted home is the `combat/state`
  // subdoc (it left `session.round`). Advancing the round writes it there, and — critically —
  // a subsequent NON-round combat write must PRESERVE that round (never reset it to the
  // default 1). Fails before the move: there was no `round` on CombatState to persist.
  it("persistCombatRound writes the SOLO round to the subdoc + mirrors combatRound; later writes preserve it", () => {
    useCharacterStore.getState().persistCombatRound(4);
    expect(lastWrite().round).toBe(4);
    expect(useCharacterStore.getState().combatRound).toBe(4);
    // A later HP write carries the advanced round forward — one home, never clobbered.
    persistence.write.mockClear();
    useCharacterStore.getState().applyDamage(3);
    expect(lastWrite().round).toBe(4);
  });

  it("hydrateCombatState mirrors the subdoc round onto combatRound (absent subdoc → 1)", () => {
    useCharacterStore.getState().hydrateCombatState({
      hp: { current: 10, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      round: 6,
    });
    expect(useCharacterStore.getState().combatRound).toBe(6);
    useCharacterStore.getState().hydrateCombatState(null);
    expect(useCharacterStore.getState().combatRound).toBe(1);
  });

  it("longRest persists the whole restored trio (HP full, death saves cleared)", () => {
    // Down the character first so the rest's HP-restore + death reset are observable.
    useCharacterStore.getState().setDeathSaves(1, 0);
    persistence.write.mockClear();
    useCharacterStore.getState().longRest();
    expect(persistence.write).toHaveBeenCalledTimes(1);
    expect(lastWrite()).toMatchObject({
      hp: { current: 44, temp: 0 },
      deathSaves: { successes: 0, failures: 0 },
    });
  });

  it("persistInitiative writes the SOLO raw roll (string → canonical number)", () => {
    useCharacterStore.getState().updateSession({ initiative: "17" });
    useCharacterStore.getState().persistInitiative();
    expect(lastWrite()).toMatchObject({ initiativeRoll: 17 });
    // A blank initiative canonicalizes to null.
    useCharacterStore.getState().updateSession({ initiative: "" });
    useCharacterStore.getState().persistInitiative();
    expect(lastWrite()).toMatchObject({ initiativeRoll: null });
  });

  it("a NON-initiative write preserves the hydrated solo roll (never clobbers it)", () => {
    // Hydrate a rolled state, then take damage → the whole-object write must keep
    // initiativeRoll, not reset it to null.
    useCharacterStore.getState().hydrateCombatState({
      hp: { current: 20, temp: 0 },
      conditions: [],
      initiativeRoll: 13,
      deathSaves: { successes: 0, failures: 0 },
      round: 1,
    });
    persistence.write.mockClear();
    useCharacterStore.getState().applyDamage(3);
    expect(lastWrite()).toMatchObject({ initiativeRoll: 13 });
  });

  it("a read-only sheet never persists (the optimistic guard short-circuits first)", () => {
    useCharacterStore.getState().loadReadonly(mockCharacter());
    useCharacterStore.getState().setCombatPersistence(persistence);
    useCharacterStore.getState().applyDamage(5);
    useCharacterStore.getState().addCondition("prone");
    expect(persistence.write).not.toHaveBeenCalled();
  });
});

describe("characterStore — undo/redo stack integration (§5.4)", () => {
  beforeEach(() => {
    useUndoStore.setState({ characterId: null, past: [], future: [] });
  });

  it("removeCondition round-trips: undo re-adds, redo re-removes", () => {
    const char = mockCharacter();
    char.session.conditions = ["Frightened", "Poisoned"];
    useCharacterStore.getState().setCharacter(char);

    useCharacterStore.getState().removeCondition("Frightened");
    expect(useCharacterStore.getState().character?.session.conditions).toEqual([
      "Poisoned",
    ]);
    expect(useUndoStore.getState().past).toHaveLength(1);

    // Undo re-adds the FULL prior condition list.
    useUndoStore.getState().undo();
    expect(useCharacterStore.getState().character?.session.conditions).toEqual([
      "Frightened",
      "Poisoned",
    ]);

    // Redo re-runs the SAME removal.
    useUndoStore.getState().redo();
    expect(useCharacterStore.getState().character?.session.conditions).toEqual([
      "Poisoned",
    ]);
    expect(useUndoStore.getState().past).toHaveLength(1);
  });

  it("an {intent} label re-localizes per locale; a {message} label stays frozen", () => {
    const char = mockCharacter();
    char.session.conditions = ["Frightened"];
    useCharacterStore.getState().setCharacter(char);
    useCharacterStore.getState().removeCondition("Frightened");

    const intentEntry = useUndoStore.getState().past.at(-1);
    expect(intentEntry && "intent" in intentEntry.label).toBe(true);

    // Mirror the UI seam (`useToasts().toastMessage`): an {intent} label resolves via
    // `localizeToastIntent` with a LOCALE-BOUND condition-name resolver, so the SAME
    // stored entry renders differently per locale; a {message} label passes through.
    const t = (key: string, args?: Record<string, string | number>): string =>
      args ? `${key} ${JSON.stringify(args)}` : key;
    const spellName = (v: string): string => v;
    const resolve = (label: UndoLabel, condName: (id: string) => string): string =>
      "intent" in label
        ? localizeToastIntent(label.intent, t, condName, spellName)
        : label.message;

    if (!intentEntry) throw new Error("expected an intent-labelled undo entry");
    const en = resolve(intentEntry.label, () => "Frightened");
    const it = resolve(intentEntry.label, () => "Spaventato");
    expect(en).not.toBe(it);
    expect(en).toContain("Frightened");
    expect(it).toContain("Spaventato");

    // A UI-layer {message} label is pre-localized (frozen): the resolver returns it
    // verbatim, independent of the locale-bound condition resolver.
    const frozenLabel: UndoLabel = { message: "Cast Bless (L1)" };
    expect(resolve(frozenLabel, () => "Frightened")).toBe("Cast Bless (L1)");
    expect(resolve(frozenLabel, () => "Spaventato")).toBe("Cast Bless (L1)");
  });
});
