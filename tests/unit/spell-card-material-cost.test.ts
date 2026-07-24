/**
 * Spell-card material-cost chip (RA-23).
 *
 * `buildMaterialCostTag` reads the STRUCTURED `components.costGp`/`consumed` off
 * the spell VM and formats the compact "M: 300 gp, consumed" chip that leads the
 * Spells-tab card's tag foot (the surface you cast from). It never touches the
 * material prose, and returns null for unpriced or custom spells.
 *
 * fail-before: without `costGp` on the data / the helper, revivify yields null.
 */
import { describe, it, expect } from "vitest";
import { buildMaterialCostTag } from "@/features/character/center/tabs/spells/spell-card-helpers";
import type { SpellCardVM } from "@/lib/views/spells-view";
import { getSpellById } from "@/data/spells";
import type { TFunction } from "i18next";

/** A minimal SRD card VM around a real spell's data (only the components path is read). */
function vmFor(id: string): SpellCardVM {
  const data = getSpellById(id);
  if (!data) throw new Error(`spell ${id} not found`);
  return {
    key: id,
    idx: 0,
    kind: "srd",
    data,
    ref: { srdId: id },
    name: id,
    searchEn: id,
    description: "",
    higherLevels: null,
    facts: { range: "", duration: null, material: null },
    level: data.level,
    isCantrip: data.level === 0,
    concentration: data.concentration,
    ritual: data.ritual,
    concentratingNow: false,
    isPrepared: true,
    isAlwaysPrepared: false,
    prepLocked: false,
    showPrep: true,
    dimmed: false,
    canRitual: false,
    effectWord: null,
    overrideAbility: null,
    attackBonus: null,
    saveDC: null,
    wizardMastery: false,
    wizardSignature: false,
  };
}

/** A faithful-enough `t` for the two material-cost keys (EN copy). */
const t = ((key: string, opts?: { gp?: number }) => {
  if (key === "spells.materialCost") return `M: ${opts?.gp} gp`;
  if (key === "spells.materialCostConsumed") return `M: ${opts?.gp} gp, consumed`;
  return key;
}) as unknown as TFunction;

describe("buildMaterialCostTag (RA-23)", () => {
  it("shows the priced + consumed material as 'M: 300 gp, consumed'", () => {
    expect(buildMaterialCostTag(vmFor("revivify"), t)).toBe("M: 300 gp, consumed");
    expect(buildMaterialCostTag(vmFor("raise-dead"), t)).toBe("M: 500 gp, consumed");
  });

  it("shows a priced-but-not-consumed material without the 'consumed' clause", () => {
    expect(buildMaterialCostTag(vmFor("chromatic-orb"), t)).toBe("M: 50 gp");
    expect(buildMaterialCostTag(vmFor("augury"), t)).toBe("M: 25 gp");
  });

  it("returns null for a spell with no priced material (Fireball)", () => {
    expect(buildMaterialCostTag(vmFor("fireball"), t)).toBeNull();
  });

  it("returns null for a custom spell (vm.data === null)", () => {
    expect(
      buildMaterialCostTag({ ...vmFor("revivify"), kind: "custom", data: null }, t)
    ).toBeNull();
  });
});
