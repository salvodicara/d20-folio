/**
 * Compendium deep-link seed (OWN-25e) — `useCompendiumPicker({ initialSelectedId })`
 * opens straight on an entry's DETAIL, regardless of the facets (which start open).
 * This is the engine half of "Ask the Folio → a spell/item opens it ready to read":
 * the palette emits `/compendium?type=…&sel=<id>` and the page seeds the picker here.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useCompendiumPicker,
  countActiveFacets,
} from "@/features/compendium/picker/useCompendiumPicker";
import { spellSpec } from "@/features/compendium/picker";

describe("useCompendiumPicker — initialSelectedId (OWN-25e)", () => {
  it("opens directly on the entry whose id matches the seed", () => {
    const target = spellSpec.data[2];
    expect(target).toBeDefined();
    if (!target) return;
    const id = spellSpec.getId(target);
    const { result } = renderHook(() =>
      useCompendiumPicker(spellSpec, { mode: "browse", initialSelectedId: id })
    );
    expect(result.current.selected).toBe(target);
  });

  it("starts on the list (no selection) when the seed is omitted", () => {
    const { result } = renderHook(() =>
      useCompendiumPicker(spellSpec, { mode: "browse" })
    );
    expect(result.current.selected).toBeNull();
  });

  it("ignores an unknown seed id (falls back to the list)", () => {
    const { result } = renderHook(() =>
      useCompendiumPicker(spellSpec, {
        mode: "browse",
        initialSelectedId: "no-such-entry-id",
      })
    );
    expect(result.current.selected).toBeNull();
  });
});

describe("useCompendiumPicker — reset (the no-match leaf's start-over)", () => {
  it("clears the query AND every facet back to its initial (full pool restored)", () => {
    const total = spellSpec.data.length;
    const { result } = renderHook(() =>
      useCompendiumPicker(spellSpec, { mode: "browse" })
    );

    act(() => {
      result.current.setQuery("zzz-no-such-spell");
      result.current.setFilterValue("school", "necromancy");
    });
    expect(result.current.count).toBe(0);

    act(() => result.current.reset());
    expect(result.current.query).toBe("");
    expect(result.current.filterState.school).toBeNull();
    expect(result.current.count).toBe(total);
  });
});

describe("countActiveFacets — the mobile Filters tally", () => {
  const initialState = Object.fromEntries(
    spellSpec.filters.map((g) => [g.id, g.initial])
  );

  it("counts 0 on the untouched initial state", () => {
    expect(countActiveFacets(spellSpec.filters, initialState)).toBe(0);
  });

  it("counts each group whose value left its initial", () => {
    expect(countActiveFacets(spellSpec.filters, { ...initialState, level: 3 })).toBe(1);
    expect(
      countActiveFacets(spellSpec.filters, {
        ...initialState,
        level: 3,
        cast: { conc: true, ritual: false },
      })
    ).toBe(2);
  });

  it("a re-toggled-but-equal OBJECT counts as clean (value compare, not reference)", () => {
    expect(
      countActiveFacets(spellSpec.filters, {
        ...initialState,
        cast: { conc: false, ritual: false },
      })
    ).toBe(0);
  });
});
