/**
 * Guard: every PUBLIC SRD spell that both affects an area and deals dice damage
 * declares its printed area as typed data (`SrdSpellData.areaShape`), or is
 * listed below with the reason its area is not one of the five shapes the grid
 * can derive (sphere · cube · cone · line · cylinder).
 *
 * Why a guard: `projectCharacter` (`src/lib/combat-projection.ts`) turns a
 * save-damage spell with an `areaShape` into an automated area program and
 * everything else into a `manual-table` the DM adjudicates. Without this test a
 * missing shape would silently downgrade a spell from automated to adjudicated,
 * which is exactly the "half-built by omission" failure the mechanics spec
 * forbids. The allowlist makes each downgrade a written decision.
 *
 * Public SRD data only (`src/data/spells/*`), so the assertion is identical in
 * both build modes; the private pack pins its own rows in its own suite.
 */
import { describe, expect, it } from "vitest";
import type { SrdSpellData } from "@/data/types";
import { SRD_CANTRIPS } from "@/data/spells/cantrips";
import { SRD_SPELLS_LEVEL1 } from "@/data/spells/level1";
import { SRD_SPELLS_LEVEL2 } from "@/data/spells/level2";
import { SRD_SPELLS_LEVEL3 } from "@/data/spells/level3";
import { SRD_SPELLS_LEVEL4 } from "@/data/spells/level4";
import { SRD_SPELLS_LEVEL5 } from "@/data/spells/level5";
import { SRD_SPELLS_LEVEL6 } from "@/data/spells/level6";
import { SRD_SPELLS_LEVEL7 } from "@/data/spells/level7";
import { SRD_SPELLS_LEVEL8 } from "@/data/spells/level8";
import { SRD_SPELLS_LEVEL9 } from "@/data/spells/level9";

const PUBLIC_SPELLS: readonly SrdSpellData[] = [
  ...SRD_CANTRIPS,
  ...SRD_SPELLS_LEVEL1,
  ...SRD_SPELLS_LEVEL2,
  ...SRD_SPELLS_LEVEL3,
  ...SRD_SPELLS_LEVEL4,
  ...SRD_SPELLS_LEVEL5,
  ...SRD_SPELLS_LEVEL6,
  ...SRD_SPELLS_LEVEL7,
  ...SRD_SPELLS_LEVEL8,
  ...SRD_SPELLS_LEVEL9,
];

/**
 * A spell whose printed area is NOT one of the five derivable shapes, with the
 * reason. Each one degrades to a `manual-table` program: the cast spends its
 * economy and lands in the log, and the table decides who is caught.
 */
const NOT_A_DERIVABLE_SHAPE: Readonly<Record<string, string>> = {
  "blade-barrier": "a Wall — straight or ringed, chosen at cast",
  "call-lightning": "a placed storm Cylinder whose per-turn bolt is a second area",
  "chain-lightning": "arcs to chosen creatures; no printed area",
  "conjure-animals": "an Emanation of spirits originating from the caster",
  "conjure-celestial": "the damage is the conjured celestial's, not a placed area",
  "conjure-elemental": "the damage is the conjured elemental's, not a placed area",
  "conjure-woodland-beings": "an Emanation of spirits originating from the caster",
  "dragons-breath": "a Cone the BUFFED creature exhales later, not this cast",
  "evards-black-tentacles": "a Square of ground",
  "fire-storm": "ten separate 10-foot Cubes",
  "flaming-sphere": "an Emanation around a conjured object that moves each turn",
  "meteor-swarm": "four separate 40-foot-radius Spheres",
  "spirit-guardians": "an Emanation centred on the caster, moving with them",
  tsunami: "a Wall of water",
  "wall-of-fire": "a Wall — straight or ringed, chosen at cast",
  "wall-of-ice": "a Wall",
  "wall-of-thorns": "a Wall",
  "wind-wall": "a Wall",
};

describe("SRD area spells declare their printed shape", () => {
  const rows = PUBLIC_SPELLS.filter((spell) => spell.area && spell.damageDice);

  it("covers every public area-damage spell", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("each one declares `areaShape` or is an allowlisted non-shape", () => {
    const missing = rows
      .filter((spell) => !spell.areaShape && !(spell.id in NOT_A_DERIVABLE_SHAPE))
      .map((spell) => spell.id);
    expect(
      missing,
      "add `areaShape` from the SRD 5.2.1 text, or list the spell in " +
        "NOT_A_DERIVABLE_SHAPE with the reason its area is not derivable."
    ).toEqual([]);
  });

  it("no spell is both shaped and allowlisted", () => {
    const both = rows
      .filter((spell) => spell.areaShape && spell.id in NOT_A_DERIVABLE_SHAPE)
      .map((spell) => spell.id);
    expect(both).toEqual([]);
  });

  it("every allowlist entry names a real area-damage spell", () => {
    const ids = new Set(rows.map((spell) => spell.id));
    const stale = Object.keys(NOT_A_DERIVABLE_SHAPE).filter((id) => !ids.has(id));
    expect(stale, "remove the stale allowlist entry").toEqual([]);
  });

  it("a declared shape carries a positive size, and `widthFt` only on a Line", () => {
    const bad: string[] = [];
    for (const spell of rows) {
      const shape = spell.areaShape;
      if (!shape) continue;
      if (!(shape.sizeFt > 0)) bad.push(`${spell.id}: sizeFt`);
      if (shape.kind === "line" ? !(shape.widthFt && shape.widthFt > 0) : shape.widthFt) {
        bad.push(`${spell.id}: widthFt`);
      }
    }
    expect(bad).toEqual([]);
  });
});
