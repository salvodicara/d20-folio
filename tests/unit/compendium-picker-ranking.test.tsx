/**
 * Compendium picker — NAME-PRIORITY ranking (fb4 reuse).
 *
 * The shared picker engine (`useCompendiumPicker`, behind BOTH the Compendium page
 * AND the add-item Equipment/Magic-item tabs) now ranks a NAME hit ABOVE an entry
 * that matches only in its DESCRIPTION — via the SAME `rankedSearch` primitive the
 * wizard pickers use. Regression guard for the owner-reported symptom: searching an
 * item's own name must surface THAT item first, not the items that merely mention it
 * in body text. Driven through the REAL hook so a wiring regression (swapping the
 * name / description corpora, or dropping `nameText`) fails right here.
 *
 * SRD-only fixtures so it holds in BOTH build modes (`just ci` + `just ci-srd-only`):
 * "Potion of Healing" (the name match) vs "Potion of Poison", whose flavour text
 * literally reads "…looks, smells, and tastes like a Potion of Healing…" — a
 * description-only hit that used to sort level with the name match.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import i18n from "@/i18n";
import { useCompendiumPicker } from "@/features/compendium/picker/useCompendiumPicker";
import { magicItemSpec, type PickerCtx } from "@/features/compendium/picker";
import { matchesSearch } from "@/lib/search";

const HEALING = "potion-of-healing";
const POISON = "potion-of-poison";

const ctx = (locale: "en" | "it"): PickerCtx => ({
  t: i18n.getFixedT(locale),
  locale,
  character: null,
  mode: "browse",
});

/** Render the browse-mode magic-item picker in `locale`, run `query`, and return
 *  the ranked list's id order — exactly what the on-screen results render from. */
async function rankedIds(locale: "en" | "it", query: string): Promise<string[]> {
  await i18n.changeLanguage(locale);
  const { result } = renderHook(() =>
    useCompendiumPicker(magicItemSpec, { mode: "browse" })
  );
  act(() => result.current.setQuery(query));
  return result.current.filtered.map((e) => magicItemSpec.getId(e));
}

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("useCompendiumPicker — name-priority ranking (fb4)", () => {
  it("IT 'pozione guarigione' ranks the NAME match (Pozione di Guarigione) FIRST, above a description-only hit (Pozione di Veleno)", async () => {
    const ids = await rankedIds("it", "pozione guarigione");
    const healing = ids.indexOf(HEALING);
    const poison = ids.indexOf(POISON);
    expect(healing).toBeGreaterThanOrEqual(0);
    expect(poison).toBeGreaterThanOrEqual(0);
    // The name match outranks the body-text match (the whole point of the fix)…
    expect(healing).toBeLessThan(poison);
    // …and it is FIRST: it is the only item whose NAME carries BOTH tokens.
    expect(ids[0]).toBe(HEALING);
  });

  it("EN parity — 'healing potion' surfaces Potion of Healing above the description-only Potion of Poison", async () => {
    const ids = await rankedIds("en", "healing potion");
    const healing = ids.indexOf(HEALING);
    const poison = ids.indexOf(POISON);
    expect(healing).toBeGreaterThanOrEqual(0);
    expect(poison).toBeGreaterThanOrEqual(0);
    expect(healing).toBeLessThan(poison);
    expect(ids[0]).toBe(HEALING);
  });

  it("the tiers are what they claim: the winner matches in the NAME corpus, the loser only in the DESCRIPTION corpus", () => {
    const c = ctx("it");
    const healing = magicItemSpec.data.find((e) => magicItemSpec.getId(e) === HEALING);
    const poison = magicItemSpec.data.find((e) => magicItemSpec.getId(e) === POISON);
    expect(healing).toBeDefined();
    expect(poison).toBeDefined();
    if (!healing || !poison) return;
    const q = "pozione guarigione";
    // Potion of Healing matches in the NAME corpus…
    expect(matchesSearch(q, ...magicItemSpec.nameText(healing, c))).toBe(true);
    // …Potion of Poison does NOT (its name lacks "guarigione") — it only matches
    // once the description prose is folded into the FULL corpus.
    expect(matchesSearch(q, ...magicItemSpec.nameText(poison, c))).toBe(false);
    expect(matchesSearch(q, ...magicItemSpec.searchText(poison, c))).toBe(true);
  });
});
