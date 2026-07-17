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
import { evaluateGrants, type Grant } from "@/lib/grants";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";

const BUFF_SPELLS = [
  "mage-armor",
  "shield",
  "shield-of-faith",
  "longstrider",
  "divine-favor",
  "hex",
  "hunters-mark",
  "barkskin",
  "spider-climb",
  "darkvision",
  "aid",
  "fly",
  "haste",
  "protection-from-energy",
  "stoneskin",
  "fire-shield",
  "freedom-of-movement",
  "true-seeing",
  "mind-blank",
  "foresight",
] as const;

describe("PROSE sweep — standing buff spells carry while-active grants", () => {
  it.each(BUFF_SPELLS)("%s wraps its standing effect behind spell-%s", (id) => {
    const wa = (getSpellById(id)?.grants ?? []).find(
      (g): g is Extract<Grant, { type: "while-active" }> => g.type === "while-active"
    );
    expect(wa?.activeKey).toBe(`spell-${id}`);
    expect(wa?.grants.length).toBeGreaterThan(0);
  });

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
