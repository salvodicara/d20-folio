/**
 * Regression: `sanitizeSession` must fill every nested sub-object FIELD-BY-FIELD.
 *
 * The previous top-level `??` fallback (`hp: session.hp ?? { current: 0, temp: 0 }`)
 * silently accepted a partial sub-object — e.g. a legacy import that wrote
 * `hp: { current: 10 }` would land in the store with `temp = undefined`, then
 * propagate NaN through HpBar arithmetic. Same issue for `hitDice` and `currency`.
 * This guard pins the defensive shape. It ALSO pins the B5 one-way read-normalization:
 * a legacy `hp.aidBonus` (superseded by the Aid while-active grant) is silently
 * DROPPED here, never carried into state.
 */
import { describe, expect, it } from "vitest";
import { sanitizeSession } from "@/lib/character-io";
import type { SessionState } from "@/types/character";

describe("sanitizeSession backfills missing nested fields", () => {
  it("hp with only `current` set still produces { current, temp }", () => {
    const partial = { hp: { current: 10 } } as unknown as Partial<SessionState>;
    const out = sanitizeSession(partial);
    expect(out.hp).toEqual({ current: 10, temp: 0 });
  });

  it("hitDice missing produces { used: 0 }, not undefined-bearing", () => {
    const out = sanitizeSession({});
    expect(out.hitDice).toEqual({ used: 0 });
    // Even when hitDice is present but partial:
    const partial = sanitizeSession({
      hitDice: {} as SessionState["hitDice"],
    });
    expect(partial.hitDice).toEqual({ used: 0 });
  });

  it("currency with only `gp` set produces a complete 5-key object", () => {
    const partial = {
      currency: { gp: 50 },
    } as unknown as Partial<SessionState>;
    const out = sanitizeSession(partial);
    expect(out.currency).toEqual({ pp: 0, gp: 50, ep: 0, sp: 0, cp: 0 });
  });

  it("fully empty session produces a complete, type-safe SessionState", () => {
    const out = sanitizeSession({});
    // None of these may be undefined — they're load-bearing for the store.
    expect(out.hp.current).toBe(0);
    expect(out.hp.temp).toBe(0);
    expect(out.hitDice.used).toBe(0);
    expect(out.currency).toEqual({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
    expect(out.trackers).toEqual({});
    expect(out.spellSlots).toEqual({});
    expect(out.conditions).toEqual([]);
    expect(out.logEntries).toEqual([]);
  });

  it("preserves valid sub-object values unchanged", () => {
    const full: SessionState["hp"] = { current: 22, temp: 5 };
    const out = sanitizeSession({ hp: full });
    expect(out.hp).toEqual(full);
  });

  // B5 / rule 10 — a not-yet-migrated session carrying a legacy `hp.aidBonus` is
  // SILENTLY DROPPED at this boundary (superseded by the Aid while-active grant);
  // it is never carried into state, so it can't double-count with the Aid toggle.
  it("drops a legacy `hp.aidBonus` (one-way read-normalization)", () => {
    const legacy = {
      hp: { current: 22, temp: 5, aidBonus: 7 },
    } as unknown as Partial<SessionState>;
    const out = sanitizeSession(legacy);
    expect(out.hp).toEqual({ current: 22, temp: 5 });
    expect("aidBonus" in out.hp).toBe(false);
  });

  /**
   * #81 — the field-by-field rebuild used to OMIT every newer optional session
   * field, so a reload silently reset Rage/Bladesong toggles, lineage/Circle
   * choices, companion HP, and manifested/pact-weapon overrides. The `...session`
   * spread must round-trip them verbatim.
   */
  it("round-trips every newer optional session field (#81)", () => {
    const session: Partial<SessionState> = {
      activeFeatures: ["rage", "innate-sorcery"],
      grantBundleChoices: { "circle-of-the-land": "coast" },
      companionHp: { "steel-defender": { current: 17 } },
      manifestedWeaponOverrides: {
        "psychic-blade-1": { attackBonus: 9, damage: "1d6+5" },
      },
      pactWeaponConfig: {
        "pact-weapon-1": {
          weaponName: "Greatsword",
          damageDie: "2d6",
          baseDamageType: "slashing",
          chosenDamageType: "necrotic",
          attackBonus: null,
          damage: null,
        },
      },
      pactWeaponRiderTypes: { lifedrinker: "radiant" },
      // D37 — the held Bardic Inspiration die was the latest casualty of this
      // omission bug: picking a die reset a few seconds later (the save dropped it).
      bardicInspirationDie: "d8",
      // PLAY-NO-EDIT — the session defense overlay must survive a reload, or a
      // potion's resistance would vanish on the next server echo.
      sessionDefenses: {
        resistance: ["fire"],
        conditionImmunity: ["frightened"],
      },
    };
    const out = sanitizeSession(session);
    expect(out.sessionDefenses).toEqual(session.sessionDefenses);
    expect(out.activeFeatures).toEqual(session.activeFeatures);
    expect(out.grantBundleChoices).toEqual(session.grantBundleChoices);
    expect(out.companionHp).toEqual(session.companionHp);
    expect(out.manifestedWeaponOverrides).toEqual(session.manifestedWeaponOverrides);
    expect(out.pactWeaponConfig).toEqual(session.pactWeaponConfig);
    expect(out.pactWeaponRiderTypes).toEqual(session.pactWeaponRiderTypes);
    expect(out.bardicInspirationDie).toBe("d8");
  });
});
