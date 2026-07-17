/**
 * Marked-target model — Hex + Hunter's Mark per-hit bonus dice as a while-active
 * "vs marked/cursed target" weapon rider (S10).
 *
 * 2024 RAW (dnd2024.wikidot.com spell:hex / spell:hunter-s-mark):
 *  - Hunter's Mark (L1, Concentration, Bonus Action): "you deal an extra 1d6 Force
 *    damage to the target whenever you hit it with an attack roll." Upcast raises
 *    DURATION only (die stays 1d6).
 *  - Hex (L1, Concentration, Bonus Action): "you deal an extra 1d6 Necrotic damage
 *    to the target whenever you hit it with an attack roll." Upcast = duration only.
 *
 * The optimal model (given the no-modeled-enemies identity): each spell is a
 * `while-active` concentration buff (auto-lit on cast via S1, retracts on
 * concentration drop) carrying a `damage-rider` with the minimal `vsMarkedTarget`
 * flag — a DISPLAY-ONLY chip on weapon attack rows LABELED "vs marked/cursed
 * target". The app can't know which attack lands on the marked creature, so the
 * die must NOT auto-fold into every attack's base damage (the over-application the
 * audit flagged); the player applies it only on the right hit. The move-the-mark,
 * Hunter's Mark's find-Advantage, and Hex's ability-check Disadvantage stay
 * narrative (no modeled enemy / per-target tracking).
 */
import { describe, it, expect } from "vitest";
import { evaluateGrants, type GrantSource, type Grant } from "@/lib/grants";
import { resolveActions } from "@/lib/smart-tracker";
import { activeKeysForConcentration } from "@/lib/aggregate-character";
import { concentrationValue } from "@/lib/concentration";
import { getSpellById } from "@/data/spells";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

// ── The spell data declares the marked-target rider ────────────────────────

describe("Hex + Hunter's Mark declare a vsMarkedTarget while-active rider", () => {
  const cases = [
    {
      id: "hunters-mark",
      activeKey: "spell-hunters-mark",
      damageType: "force",
      mark: "marked",
    },
    { id: "hex", activeKey: "spell-hex", damageType: "necrotic", mark: "cursed" },
  ] as const;

  it.each(cases)(
    "$id wraps a +1d6 $damageType weapon rider ($mark) behind $activeKey",
    ({ id, activeKey, damageType, mark }) => {
      const wa = (getSpellById(id)?.grants ?? []).find(
        (g): g is Extract<Grant, { type: "while-active" }> => g.type === "while-active"
      );
      expect(wa?.activeKey).toBe(activeKey);
      const rider = wa?.grants.find(
        (g): g is Extract<Grant, { type: "damage-rider" }> => g.type === "damage-rider"
      );
      expect(rider).toMatchObject({
        type: "damage-rider",
        dice: "1d6",
        damageType,
        appliesTo: "weapon",
        vsMarkedTarget: mark,
      });
    }
  );
});

// ── The evaluator carries vsMarkedTarget through (and only while lit) ───────

describe("evaluateGrants — vsMarkedTarget on a while-active damage-rider", () => {
  const source: GrantSource = {
    id: "hex",
    grants: [
      {
        type: "while-active",
        activeKey: "spell-hex",
        grants: [
          {
            type: "damage-rider",
            dice: "1d6",
            damageType: "necrotic",
            appliesTo: "weapon",
            vsMarkedTarget: "cursed",
          },
        ],
      },
    ],
  };

  it("aggregates the flag only while the toggle is lit", () => {
    expect(evaluateGrants([source]).damageRiders).toEqual([]);
    const on = evaluateGrants([source], new Set(["spell-hex"]));
    expect(on.damageRiders).toEqual([
      {
        dice: "1d6",
        damageType: "necrotic",
        appliesTo: "weapon",
        oncePerTurn: false,
        vsMarkedTarget: "cursed",
        sourceId: "hex",
        whileActiveKey: "spell-hex",
      },
    ]);
  });

  it("a plain rider (no flag) omits vsMarkedTarget (back-compat)", () => {
    const plain = evaluateGrants([
      {
        id: "plain",
        grants: [
          {
            type: "damage-rider",
            dice: "1d8",
            damageType: "radiant",
            appliesTo: "weapon",
          },
        ],
      },
    ]);
    expect(plain.damageRiders[0]).not.toHaveProperty("vsMarkedTarget");
  });
});

// ── Consumer: the weapon row shows the labeled rider ONLY while active ──────

/** A minimal caster (base class → no other weapon riders) with the marked spell
 *  prepared + a longsword; `activeKeys` lights the while-active toggle. */
function markedCaster(spellId: string, activeKeys: string[]): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      classes: [{ classId: "fighter", level: 5 }],
      features: [],
      spells: [{ srdId: spellId, prepared: true }],
      weapons: [{ srdId: "longsword", quantity: 1 }],
    },
    session: {
      ...MOCK_CHARACTER.session,
      conditions: [],
      concentration: concentrationValue(spellId),
      activeFeatures: activeKeys,
    },
  };
}

describe("Hunter's Mark rides weapon attack rows while active (display-only)", () => {
  it("LIT: the longsword row shows a +1d6 Force 'vs marked target' rider", () => {
    const doc = markedCaster("hunters-mark", ["spell-hunters-mark"]);
    const sword = resolveActions(doc).find((a) => a.source === "weapon");
    expect(sword?.summary.extraDamage).toEqual([
      expect.objectContaining({
        dice: "1d6",
        damageType: "force",
        vsMarkedTarget: "marked",
      }),
    ]);
  });

  it("FAIL-BEFORE: with the toggle OFF, NO marked-target rider rides the row", () => {
    const doc = markedCaster("hunters-mark", []);
    const sword = resolveActions(doc).find((a) => a.source === "weapon");
    const marked = (sword?.summary.extraDamage ?? []).filter((r) => r.vsMarkedTarget);
    expect(marked).toEqual([]);
  });

  it("the rider is NOT summed into the base weapon damage (over-application guard)", () => {
    const off = markedCaster("hunters-mark", []);
    const on = markedCaster("hunters-mark", ["spell-hunters-mark"]);
    const baseOff = resolveActions(off).find((a) => a.source === "weapon")?.summary
      .damage;
    const baseOn = resolveActions(on).find((a) => a.source === "weapon")?.summary.damage;
    // Lighting the mark leaves the base damage formula untouched — the +1d6 lives
    // ONLY in the separate extraDamage chip, never folded into the total.
    expect(baseOn).toBe(baseOff);
    expect(baseOn).not.toMatch(/1d6/);
  });
});

describe("regression — while-active SPELL riders now reach weapon rows", () => {
  // The marked-target wiring closed a latent gap: the carried-weapon aggregate
  // only pulled feature + invocation grant sources, so NO prepared while-active
  // spell rider surfaced. Divine Favor's always-applies +1d4 Radiant is the
  // pre-existing case — it must now ride the weapon too (same seam).
  it("Divine Favor active → +1d4 Radiant rides the weapon (no vsMarkedTarget)", () => {
    const doc = markedCaster("divine-favor", ["spell-divine-favor"]);
    const sword = resolveActions(doc).find((a) => a.source === "weapon");
    const rider = (sword?.summary.extraDamage ?? [])[0];
    expect(rider).toMatchObject({ dice: "1d4", damageType: "radiant" });
    expect(rider).not.toHaveProperty("vsMarkedTarget");
  });
});

describe("Hex rides weapon attack rows while active (display-only)", () => {
  it("LIT: the longsword row shows a +1d6 Necrotic 'vs cursed target' rider", () => {
    const doc = markedCaster("hex", ["spell-hex"]);
    const sword = resolveActions(doc).find((a) => a.source === "weapon");
    expect(sword?.summary.extraDamage).toEqual([
      expect.objectContaining({
        dice: "1d6",
        damageType: "necrotic",
        vsMarkedTarget: "cursed",
      }),
    ]);
  });

  it("FAIL-BEFORE: with the toggle OFF, NO cursed-target rider rides the row", () => {
    const doc = markedCaster("hex", []);
    const sword = resolveActions(doc).find((a) => a.source === "weapon");
    const marked = (sword?.summary.extraDamage ?? []).filter((r) => r.vsMarkedTarget);
    expect(marked).toEqual([]);
  });
});

// ── Task #27: the marked rider ALSO rides SPELL-ATTACK rows (EB + Hex) ──────

/** A Warlock with Eldritch Blast (a ranged spell attack) + the marked spell
 *  prepared; `activeKeys` lights the while-active toggle, concentration on it. */
function warlockCaster(markSpellId: string, activeKeys: string[]): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      classes: [{ classId: "warlock", level: 5 }],
      features: [],
      spells: [
        { srdId: "eldritch-blast", prepared: true },
        { srdId: markSpellId, prepared: true },
      ],
      weapons: [],
    },
    session: {
      ...MOCK_CHARACTER.session,
      conditions: [],
      concentration: concentrationValue(markSpellId),
      activeFeatures: activeKeys,
    },
  };
}

describe("marked-target rider rides SPELL-ATTACK rows (Eldritch Blast + Hex)", () => {
  it("LIT: the Eldritch Blast row shows a +1d6 Necrotic 'vs cursed target' rider", () => {
    const doc = warlockCaster("hex", ["spell-hex"]);
    const eb = resolveActions(doc).find((a) => a.spellId === "eldritch-blast");
    const marked = (eb?.summary.extraDamage ?? []).filter((r) => r.vsMarkedTarget);
    expect(marked).toEqual([
      expect.objectContaining({
        dice: "1d6",
        damageType: "necrotic",
        vsMarkedTarget: "cursed",
      }),
    ]);
  });

  it("FAIL-BEFORE: with Hex OFF, NO marked rider rides the spell-attack row", () => {
    const doc = warlockCaster("hex", []);
    const eb = resolveActions(doc).find((a) => a.spellId === "eldritch-blast");
    const marked = (eb?.summary.extraDamage ?? []).filter((r) => r.vsMarkedTarget);
    expect(marked).toEqual([]);
  });

  it("the rider is NOT summed into the Eldritch Blast base damage (over-application guard)", () => {
    const on = warlockCaster("hex", ["spell-hex"]);
    const off = warlockCaster("hex", []);
    const dmgOn = resolveActions(on).find((a) => a.spellId === "eldritch-blast")?.summary
      .damage;
    const dmgOff = resolveActions(off).find((a) => a.spellId === "eldritch-blast")
      ?.summary.damage;
    expect(dmgOn).toBe(dmgOff);
  });
});

// ── Retraction: dropping concentration clears the while-active toggle ───────

describe("concentration drop clears the marked-target toggle", () => {
  it.each([
    { id: "hunters-mark", key: "spell-hunters-mark" },
    { id: "hex", key: "spell-hex" },
  ])(
    "$id → activeKeysForConcentration resolves $key (S1 clears it on drop)",
    ({ id, key }) => {
      const doc = markedCaster(id, [key]);
      expect(
        activeKeysForConcentration(doc.character, doc.session, concentrationValue(id))
      ).toEqual([key]);
    }
  );
});
