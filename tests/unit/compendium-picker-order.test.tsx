/**
 * Compendium browse order: with no query, a list reads alphabetically by the name the
 * reader sees (Italian names in Italian, not the English data order), inside its
 * natural group: spells by level, class features by class then level.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import i18n from "@/i18n";
import { useCompendiumPicker } from "@/features/compendium/picker/useCompendiumPicker";
import { featureSpec, spellSpec, type PickerCtx } from "@/features/compendium/picker";
import type { CompendiumPickerSpec } from "@/features/compendium/picker/types";

const ctx = (locale: "en" | "it"): PickerCtx => ({
  t: i18n.getFixedT(locale),
  locale,
  character: null,
  mode: "browse",
});

async function browse<T>(
  spec: CompendiumPickerSpec<T>,
  locale: "en" | "it"
): Promise<T[]> {
  await i18n.changeLanguage(locale);
  const { result } = renderHook(() => useCompendiumPicker(spec, { mode: "browse" }));
  return result.current.filtered;
}

const sorted = (names: string[], locale: string) =>
  [...names].sort((a, b) => a.localeCompare(b, locale, { sensitivity: "base" }));

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("compendium browse order", () => {
  it("Italian cantrips read alphabetically by their Italian name", async () => {
    const spells = await browse(spellSpec, "it");
    const cantrips = spells.filter((s) => s.level === 0);
    const names = cantrips.map((s) => spellSpec.getName(s, ctx("it")));
    expect(names.length).toBeGreaterThan(5);
    expect(names).toEqual(sorted(names, "it"));
  });

  it("spells stay grouped by level", async () => {
    const levels = (await browse(spellSpec, "it")).map((s) => s.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("a class's features run from level 1 up", async () => {
    const features = await browse(featureSpec, "it");
    const barbarian = features.filter((f) => f.class === "barbarian").map((f) => f.level);
    expect(barbarian.length).toBeGreaterThan(5);
    expect(barbarian).toEqual([...barbarian].sort((a, b) => a - b));
  });
});
