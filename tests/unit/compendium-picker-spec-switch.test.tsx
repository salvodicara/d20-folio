/**
 * Compendium picker — SPEC-SWITCH survival (owner crash report, GitHub #7).
 *
 * The picker resets its per-type state (query · facets · selection) via the
 * derive-from-props pattern when the spec changes. React's contract for a
 * render-phase setState is that the CURRENT pass still finishes executing with
 * the OLD state before the re-render — so every derivation downstream of the
 * reset must be computed from PASS-LOCAL effective values, never from the
 * about-to-be-replaced state. The shipped bug: switching the type ribbon away
 * from Spells and back ran the spell facet predicates against ANOTHER type's
 * filter state (its group ids missing → `value.conc` of undefined → crash),
 * and every subsequent tab switch crashed the body again, leaving the ribbon
 * painted with stale selections ("le linguette rimangono illuminate").
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCompendiumPicker } from "@/features/compendium/picker/useCompendiumPicker";
import { COMPENDIUM_SPECS } from "@/features/compendium/picker/specs";
import type { AnyCompendiumSpec } from "@/features/compendium/picker/specs";

const spec = (id: string): AnyCompendiumSpec => {
  const s = COMPENDIUM_SPECS.find((x) => x.id === id);
  if (!s) throw new Error(`missing spec ${id}`);
  return s;
};

describe("useCompendiumPicker — spec switch (crash #7)", () => {
  it("survives switching away from Spells and back, filters intact", () => {
    const spells = spec("spell");
    const feats = spec("feat");
    const { result, rerender } = renderHook(
      ({ s }: { s: AnyCompendiumSpec }) =>
        useCompendiumPicker(s as never, { mode: "browse" }),
      { initialProps: { s: spells } }
    );
    expect(result.current.filtered.length).toBeGreaterThan(0);

    // Away… (the reset swaps the facet state to the feats groups)
    rerender({ s: feats });
    expect(result.current.filtered.length).toBeGreaterThan(0);

    // …and BACK: this pass runs the spell predicates while the state still
    // holds the feats groups — the crash site. It must not throw, and the
    // spell list must come back full under the spec's own defaults.
    rerender({ s: spells });
    expect(result.current.filtered.length).toBeGreaterThan(0);
  });

  it("a touched facet on one type never leaks into the next type's pass", () => {
    const spells = spec("spell");
    const items = spec("items");
    const { result, rerender } = renderHook(
      ({ s }: { s: AnyCompendiumSpec }) =>
        useCompendiumPicker(s as never, { mode: "browse" }),
      { initialProps: { s: spells } }
    );
    // Touch the spells concentration facet…
    act(() => result.current.setFilterValue("cast", { conc: true, ritual: false }));
    const concCount = result.current.filtered.length;
    expect(concCount).toBeGreaterThan(0);

    // …switch type twice (each pass must survive foreign state shapes)…
    rerender({ s: items });
    expect(result.current.filtered.length).toBeGreaterThan(0);
    rerender({ s: spells });

    // …and the facet is back to its OWN spec default (not the touched value).
    expect(result.current.filtered.length).toBeGreaterThan(concCount);
  });
});
