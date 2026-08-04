/**
 * PROSE sweep (2026-06-10) — spells namespace regression table.
 *
 * Spell discipline (a): a buff spell whose printed effect is a STANDING stat
 * change for its duration now carries it as `while-active` grants on
 * `SrdSpellData.grants`, and a PREPARED spell with grants becomes a grant
 * source (`resolveGrantSourcesForSpells`) — the toggle rides the same
 * `activatableGroups`/`session.activeFeatures` seam magic items use.
 * Cast-time effects (damage/heal/saves — discipline (b)) stay on the
 * structured spell fields; genuinely narrative effects stay prose (c).
 */
import { describe, expect, it } from "vitest";
import { getSpellById, spells } from "@/data/spells";
import type { CombatTargeting } from "@/data/types";
import { evaluateGrants, type Grant } from "@/lib/grants";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";

interface StandingSpellExpectation {
  id: string;
  recipient: "caster" | "selected";
  targeting?: CombatTargeting;
}

/**
 * Complete public-SRD census of top-level spell `while-active` grants.
 *
 * Blind spot: this pins ownership and target-count metadata, not whether each inner
 * grant models every clause of the spell or whether the resolver persists it.
 */
const STANDING_SPELLS = [
  { id: "divine-favor", recipient: "caster" },
  {
    id: "heroism",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1, maxTargetsPerUpcast: 1 },
  },
  { id: "hex", recipient: "caster" },
  { id: "hunters-mark", recipient: "caster" },
  {
    id: "longstrider",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1, maxTargetsPerUpcast: 1 },
  },
  {
    id: "mage-armor",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  { id: "shield", recipient: "caster" },
  {
    id: "shield-of-faith",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  { id: "aid", recipient: "selected", targeting: { affinity: "ally", maxTargets: 3 } },
  {
    id: "barkskin",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  { id: "blur", recipient: "caster" },
  {
    id: "darkvision",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  { id: "mirror-image", recipient: "caster" },
  {
    id: "spider-climb",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  {
    id: "warding-bond",
    recipient: "selected",
    targeting: { affinity: "ally", excludeSelf: true, maxTargets: 1 },
  },
  {
    id: "fly",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1, maxTargetsPerUpcast: 1 },
  },
  { id: "haste", recipient: "selected", targeting: { affinity: "ally", maxTargets: 1 } },
  {
    id: "protection-from-energy",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  {
    id: "death-ward",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  { id: "fire-shield", recipient: "caster" },
  {
    id: "freedom-of-movement",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  {
    id: "stoneskin",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  {
    id: "true-seeing",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  {
    id: "mind-blank",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
  {
    id: "foresight",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
  },
] as const satisfies ReadonlyArray<StandingSpellExpectation>;

describe("PROSE sweep — standing buff spells carry while-active grants", () => {
  it.each(STANDING_SPELLS)("$id wraps its standing effect behind spell-$id", ({ id }) => {
    const wa = (getSpellById(id)?.grants ?? []).find(
      (g): g is Extract<Grant, { type: "while-active" }> => g.type === "while-active"
    );
    expect(wa?.activeKey).toBe(`spell-${id}`);
    expect(wa?.grants.length).toBeGreaterThan(0);
  });

  it("covers every public-SRD top-level while-active spell", () => {
    const actual = spells
      .filter(
        (spell) =>
          spell.source === "SRD" &&
          spell.grants?.some((grant) => grant.type === "while-active")
      )
      .map((spell) => spell.id)
      .sort();
    expect(actual).toEqual(STANDING_SPELLS.map(({ id }) => id).sort());
  });

  it.each(STANDING_SPELLS)(
    "$id routes its standing grants to $recipient with the exact target shape",
    ({ id, recipient, ...expected }) => {
      const spell = getSpellById(id);
      const expectedTargeting = "targeting" in expected ? expected.targeting : undefined;
      const whileActive = spell?.grants?.find(
        (grant): grant is Extract<Grant, { type: "while-active" }> =>
          grant.type === "while-active"
      );
      expect(whileActive).toBeDefined();
      expect({
        recipient: whileActive?.recipient ?? "caster",
        targeting: spell?.targeting,
      }).toEqual({ recipient, targeting: expectedTargeting });
    }
  );

  it("every spell grant is a while-active wrapper (cast-time effects stay structured)", () => {
    for (const s of spells) {
      for (const g of s.grants ?? []) {
        expect(g.type, s.id).toBe("while-active");
      }
    }
  });
});

describe("PROSE sweep — prepared spells become grant sources", () => {
  it("only prepared / always-prepared refs emit sources (deduped)", () => {
    const sources = resolveGrantSourcesForSpells([
      { srdId: "haste", prepared: true },
      { srdId: "haste", prepared: true }, // duplicate ref → one source
      { srdId: "fly" }, // not prepared → no source
      { srdId: "mage-armor", alwaysPrepared: true },
      { srdId: "fireball", prepared: true }, // no grants → no source
    ]);
    expect(sources.map((s) => s.id).sort()).toEqual(["haste", "mage-armor"]);
    expect(sources.every((s) => s.ref?.kind === "spell")).toBe(true);
  });

  it("Haste active: +2 AC, Speed ×2, DEX-save advantage flow into the aggregate", () => {
    const sources = resolveGrantSourcesForSpells([{ srdId: "haste", prepared: true }]);
    const off = evaluateGrants(sources);
    expect(off.acBonus).toBe(0);
    const on = evaluateGrants(sources, new Set(["spell-haste"]));
    expect(on.acBonus).toBe(2);
    expect(on.speedMultiplier).toBe(2);
    expect(on.advantages.some((a) => a.rollType === "save")).toBe(true);
  });

  it("Mage Armor active: the 13+DEX formula becomes an AC-formula candidate", () => {
    const sources = resolveGrantSourcesForSpells([
      { srdId: "mage-armor", prepared: true },
    ]);
    const on = evaluateGrants(sources, new Set(["spell-mage-armor"]));
    expect(on.acFormulas.some((f) => f.base === 13 && f.bonuses.includes("DEX"))).toBe(
      true
    );
  });

  it("Stoneskin / Mind Blank actives land their resistances and immunities", () => {
    const sources = resolveGrantSourcesForSpells([
      { srdId: "stoneskin", prepared: true },
      { srdId: "mind-blank", prepared: true },
    ]);
    const on = evaluateGrants(sources, new Set(["spell-stoneskin", "spell-mind-blank"]));
    expect([...on.damageResistances].sort()).toEqual([
      "bludgeoning",
      "piercing",
      "slashing",
    ]);
    expect([...on.damageImmunities]).toContain("psychic");
    expect([...on.conditionImmunities]).toContain("charmed");
  });
});
