import { describe, it, expect } from "vitest";
import {
  resolveGrantSourcesForRace,
  resolveAllGrantSources,
} from "@/lib/resolve-grant-sources";
import { evaluateGrants } from "@/lib/grants";
import { deriveSensesAndSpeeds, deriveAdvantageChips } from "@/lib/views/sheet-view";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("resolveGrantSourcesForRace (L1/L6)", () => {
  it("returns empty for an unknown / empty race", () => {
    expect(resolveGrantSourcesForRace(undefined)).toEqual([]);
    expect(resolveGrantSourcesForRace("")).toEqual([]);
    expect(resolveGrantSourcesForRace("not-a-race")).toEqual([]);
  });

  it("matches the race id case-insensitively (doc may store 'Elf')", () => {
    const lower = resolveGrantSourcesForRace("elf");
    const upper = resolveGrantSourcesForRace("Elf");
    expect(upper.length).toBeGreaterThan(0);
    expect(upper.length).toBe(lower.length);
  });

  it("emits the Elf's darkvision + Fey Ancestry grants", () => {
    const sources = resolveGrantSourcesForRace("Elf");
    const grants = sources.flatMap((s) => [...(s.grants ?? [])]);
    expect(grants.some((g) => g.type === "darkvision")).toBe(true);
    expect(grants.some((g) => g.type === "advantage-on" && g.vs === "charmed")).toBe(
      true
    );
  });
});

describe("resolveAllGrantSources surfaces species traits", () => {
  it("makes the Elf mock surface Darkvision 60 ft + advantage vs Charmed", () => {
    const cd = MOCK_CHARACTER.character;
    const agg = evaluateGrants(resolveAllGrantSources(cd));
    const { senses } = deriveSensesAndSpeeds(agg, parseInt(cd.speed, 10) || 0);
    const chips = deriveAdvantageChips(agg, { advantages: [], disadvantages: [] });
    expect(senses.some((s) => s.kind === "darkvision" && s.rangeFt === 60)).toBe(true);
    expect(chips.some((c) => c.vs === "charmed")).toBe(true);
  });
});
