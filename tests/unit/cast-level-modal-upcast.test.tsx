/**
 * S12c — the Cast Level modal previews the SCALED damage dice per slot row.
 *
 * Before S12c the modal showed only the slot level + remaining count, so a
 * player upcasting Fireball had no way to see that a 5th-level slot deals 10d6
 * instead of 8d6 (the combat card + cast row showed the base dice regardless of
 * the chosen slot). This thin render test pins the WIRING: the modal reads the
 * spell's `damageDice`/`damageDicePerUpcast` facts and renders the scaled dice
 * on each slot row — the engine math itself is unit-tested in
 * `spell-data-integrity` + `utils` (golden rule 13: cheapest test per fact).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CastLevelModal } from "@/components/sheet/CastLevelModal";
import { getSpellById } from "@/data/spells";

function upcastFacts(id: string) {
  const s = getSpellById(id);
  if (!s) throw new Error(`spell ${id} not found`);
  return {
    level: s.level,
    damageDice: s.damageDice,
    damageDicePerUpcast: s.damageDicePerUpcast,
    healDice: s.healDice,
    healDicePerUpcast: s.healDicePerUpcast,
    instances: s.instances,
    instancesPerUpcast: s.instancesPerUpcast,
  };
}

describe("CastLevelModal — upcast damage preview (S12c)", () => {
  it("shows the SCALED dice on each slot row when a higher slot is offered", () => {
    // Fireball cast with 3rd/4th/5th slots available — the rows must read
    // 8d6 / 9d6 / 10d6, NOT the base 8d6 everywhere (the fail-before state).
    render(
      <CastLevelModal
        request={{
          spellName: "Fireball",
          baseLevel: 3,
          options: [
            { kind: "slot", level: 3, remaining: 2, total: 3 },
            { kind: "slot", level: 4, remaining: 1, total: 1 },
            { kind: "slot", level: 5, remaining: 1, total: 1 },
          ],
          upcast: upcastFacts("fireball"),
        }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("8d6")).toBeInTheDocument(); // base 3rd-level slot
    expect(screen.getByText("9d6")).toBeInTheDocument(); // 4th-level upcast
    expect(screen.getByText("10d6")).toBeInTheDocument(); // 5th-level upcast
  });

  it("previews a ray-count spell as 'N × dice' scaling the COUNT, not the dice", () => {
    // Scorching Ray cast at 2nd/3rd/4th — 3 / 4 / 5 rays, each a constant 2d6.
    render(
      <CastLevelModal
        request={{
          spellName: "Scorching Ray",
          baseLevel: 2,
          options: [
            { kind: "slot", level: 2, remaining: 1, total: 1 },
            { kind: "slot", level: 3, remaining: 1, total: 1 },
            { kind: "slot", level: 4, remaining: 1, total: 1 },
          ],
          upcast: upcastFacts("scorching-ray"),
        }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("3 × 2d6")).toBeInTheDocument(); // base 2nd
    expect(screen.getByText("4 × 2d6")).toBeInTheDocument(); // 3rd → +1 ray
    expect(screen.getByText("5 × 2d6")).toBeInTheDocument(); // 4th → +2 rays
  });

  it("RA-07 — previews the SCALED heal dice per slot for a healing spell", () => {
    // Cure Wounds (2d8 base, +2d8/slot above 1) cast with 1st/2nd/3rd slots — the
    // rows must read 2d8 / 4d8 / 6d8, mirroring the damage-upcast preview. Before
    // RA-07 the heal spells carried no upcast preview at all (fail-before state).
    render(
      <CastLevelModal
        request={{
          spellName: "Cure Wounds",
          baseLevel: 1,
          options: [
            { kind: "slot", level: 1, remaining: 2, total: 3 },
            { kind: "slot", level: 2, remaining: 1, total: 1 },
            { kind: "slot", level: 3, remaining: 1, total: 1 },
          ],
          upcast: upcastFacts("cure-wounds"),
        }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("2d8")).toBeInTheDocument(); // base 1st-level slot
    expect(screen.getByText("4d8")).toBeInTheDocument(); // 2nd-level upcast
    expect(screen.getByText("6d8")).toBeInTheDocument(); // 3rd-level upcast
  });

  it("renders no damage chip when the spell carries no scaling facts", () => {
    // A non-damage / custom spell (no `upcast`) shows the bare level only.
    render(
      <CastLevelModal
        request={{
          spellName: "Suggestion",
          baseLevel: 2,
          options: [
            { kind: "slot", level: 2, remaining: 1, total: 1 },
            { kind: "slot", level: 3, remaining: 1, total: 1 },
          ],
        }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    // No "NdM" damage chip anywhere in the rendered rows.
    expect(screen.queryByText(/^\d+d\d+$/)).toBeNull();
  });
});

describe("RA-07 — the SRD heal family carries its 2024 upcast increment", () => {
  // The heal-side twin of `damageDicePerUpcast` — each dice-scaling healing spell
  // declares the per-slot increment RAW (SRD 5.2.1). Fixed-amount heals (Heal,
  // Mass Heal, Goodberry) and non-scaling leveled heals (Aura of Vitality,
  // Regenerate) deliberately carry NO increment. Cheapest test per fact (rule 13).
  it.each([
    ["cure-wounds", "2d8"],
    ["healing-word", "2d4"],
    ["prayer-of-healing", "2d8"],
    ["mass-healing-word", "1d4"],
    ["mass-cure-wounds", "1d8"],
  ])("%s scales by %s per slot above its own level", (id, inc) => {
    expect(getSpellById(id)?.healDicePerUpcast).toBe(inc);
  });

  it("a fixed-amount heal (Heal) carries no upcast increment", () => {
    const heal = getSpellById("heal");
    expect(heal?.healDice).toBe("70");
    expect(heal?.healDicePerUpcast).toBeUndefined();
  });
});
