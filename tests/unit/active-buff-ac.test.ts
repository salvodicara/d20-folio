/**
 * S7 — active while-active AC effects reach the DISPLAYED AC end-to-end.
 *
 * The plumbing existed but the three production AC callers in
 * `aggregate-character.ts` never passed `agg.acFormulas` into `computeAC`, so a
 * lit Wild-Shape form / active Mage Armor / Barkskin floor never changed the
 * shown AC. These tests drive the WHOLE seam — a real character + a buff toggled
 * on in `session.activeFeatures` → `effectiveAC` — so the wiring (not just the
 * isolated `computeAC` formula) is pinned:
 *
 *   • Mage Armor (`spell-mage-armor`, `no-armor` 13 + DEX) raises an unarmored AC.
 *   • Shield (`spell-shield`, `ac-bonus` +5) adds onto the worn AC.
 *   • Shield of Faith (`spell-shield-of-faith`, `ac-bonus` +2) adds onto it.
 *   • Barkskin (`spell-barkskin`, `always` floor 17) lifts a low AC to 17.
 *   • Circle of the Moon form (`druid-moon-circle-forms`, `while-active` 13 + WIS,
 *     PACK content) replaces the body's AC, taken as the MAX vs the normal AC —
 *     exercised in content-pack/tests/unit/active-buff-ac.pack.test.ts.
 *
 * Active-GATING: every assertion toggles the buff via `session.activeFeatures`;
 * with the key absent the AC is the bare body AC (the buff is gated off at
 * aggregation time — the evaluator only emits a `while-active` formula when its
 * key is active). The manual `acOverride` still wins over every buff (rule 8).
 *
 * Gated on STABLE keys (`spell-mage-armor`, …) + the formula `condition` — never
 * a display name (golden rule 7).
 */
import { describe, expect, it } from "vitest";
import { effectiveAC } from "@/lib/aggregate-character";
import { makeCharacterDoc } from "./_helpers";
import type { SrdSpellRef } from "@/types/character";

/**
 * A caster with the buff spells PREPARED, so their standing grants resolve. (The
 * grant seam keys on a prepared spell's standing effect, not class legality, so
 * the four buffs coexist on one fixture to exercise every AC condition kind.)
 */
function mageDoc(
  active: string[],
  extra: Partial<Parameters<typeof makeCharacterDoc>[0]> = {}
) {
  const spells: SrdSpellRef[] = [
    { srdId: "mage-armor", prepared: true },
    { srdId: "shield", prepared: true },
    { srdId: "shield-of-faith", prepared: true },
    { srdId: "barkskin", prepared: true },
  ];
  return makeCharacterDoc(
    {
      classId: "wizard",
      subclassId: "evoker",
      level: 5,
      // DEX 16 (+3): unarmored body AC = 10 + 3 = 13.
      abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 16, WIS: 12, CHA: 8 },
      spells,
      equipment: [],
      ...extra,
    },
    { activeFeatures: active }
  );
}

describe("active buff AC reaches the displayed AC (effectiveAC)", () => {
  it("no buffs up → bare unarmored body AC (10 + DEX)", () => {
    const { character, session } = mageDoc([]);
    expect(effectiveAC(character, session)).toBe(13);
  });

  it("Mage Armor active → 13 + DEX (16), inactive → no change", () => {
    const on = mageDoc(["spell-mage-armor"]);
    expect(effectiveAC(on.character, on.session)).toBe(16); // 13 + DEX 3

    // The SAME doc with the key absent stays at the body AC — proves the gating.
    const off = mageDoc([]);
    expect(effectiveAC(off.character, off.session)).toBe(13);
  });

  it("Shield active → +5 onto the AC (stacks with Mage Armor)", () => {
    const shield = mageDoc(["spell-shield"]);
    expect(effectiveAC(shield.character, shield.session)).toBe(18); // 13 + 5

    const both = mageDoc(["spell-mage-armor", "spell-shield"]);
    expect(effectiveAC(both.character, both.session)).toBe(21); // 13 + DEX 3 + 5
  });

  it("Shield of Faith active → +2 onto the AC", () => {
    const sof = mageDoc(["spell-shield-of-faith"]);
    expect(effectiveAC(sof.character, sof.session)).toBe(15); // 13 + 2
  });

  it("Barkskin active → floors a low AC to 17, no-op once AC already exceeds it", () => {
    const bark = mageDoc(["spell-barkskin"]);
    expect(effectiveAC(bark.character, bark.session)).toBe(17); // 13 floored to 17

    // Mage Armor + Shield already give 21 > 17 → Barkskin is a no-op (floor lost).
    const high = mageDoc(["spell-mage-armor", "spell-shield", "spell-barkskin"]);
    expect(effectiveAC(high.character, high.session)).toBe(21);
  });

  it("an INACTIVE buff key changes nothing (the gating, not just a default)", () => {
    // A made-up key that is NOT any spell's activeKey: the aggregate emits no
    // formula/bonus for it, so the AC is the bare body AC.
    const noise = mageDoc(["not-a-real-buff"]);
    expect(effectiveAC(noise.character, noise.session)).toBe(13);
  });

  it("the manual AC override wins over every active buff (override-first)", () => {
    const pinned = mageDoc(["spell-mage-armor", "spell-shield", "spell-barkskin"], {
      acOverride: 99,
    });
    expect(effectiveAC(pinned.character, pinned.session)).toBe(99);
  });
});

// The Circle of the Moon Wild-Shape form AC (a PACK subclass feature) is
// exercised in content-pack/tests/unit/active-buff-ac.pack.test.ts.
