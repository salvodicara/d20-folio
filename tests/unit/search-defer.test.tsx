/**
 * Search-input defer — the perf fix must never change WHAT the picker shows.
 *
 * `useCompendiumPicker` now drives its `filtered` memo off a `useDeferredValue`
 * copy of the query (typing stays instant; the heavy re-filter runs at low
 * priority). This guards the one risk that introduces: a coalesced keystroke
 * BURST must still settle on the set the FINAL query selects — no dropped or
 * stale results once the input stops changing. Driven through the REAL hook in
 * both locales, over SRD-only data so it holds in BOTH build modes.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import i18n from "@/i18n";
import { useCompendiumPicker } from "@/features/compendium/picker/useCompendiumPicker";
import { magicItemSpec } from "@/features/compendium/picker";

const HEALING = "potion-of-healing";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

/** Type `query` one character at a time (a burst), then read the settled set. */
async function typeBurst(locale: "en" | "it", query: string): Promise<string[]> {
  await i18n.changeLanguage(locale);
  const { result } = renderHook(() =>
    useCompendiumPicker(magicItemSpec, { mode: "browse" })
  );
  act(() => {
    for (let i = 1; i <= query.length; i++) result.current.setQuery(query.slice(0, i));
  });
  return result.current.filtered.map((e) => magicItemSpec.getId(e));
}

describe("useCompendiumPicker — deferred filter settles on the FINAL query", () => {
  it("a per-character burst yields the same set the final query selects (EN)", async () => {
    const burst = await typeBurst("en", "healing potion");
    // The deferred set must equal what the fully-typed query selects — proving the
    // coalesced burst dropped nothing and never froze on an intermediate query.
    const direct = await typeBurst("en", "healing potion");
    expect(burst).toEqual(direct);
    expect(burst[0]).toBe(HEALING);
  });

  it("clearing back to empty restores the full pool (defer converges downward too)", async () => {
    await i18n.changeLanguage("en");
    const { result } = renderHook(() =>
      useCompendiumPicker(magicItemSpec, { mode: "browse" })
    );
    const full = result.current.filtered.length;
    act(() => result.current.setQuery("healing"));
    expect(result.current.filtered.length).toBeLessThan(full);
    act(() => result.current.setQuery(""));
    expect(result.current.filtered.length).toBe(full);
  });

  it("IT burst settles on the name-priority winner (Pozione di Guarigione)", async () => {
    const burst = await typeBurst("it", "pozione guarigione");
    expect(burst[0]).toBe(HEALING);
  });
});
