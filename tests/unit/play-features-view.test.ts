/**
 * The Play screen's «Privilegi e tratti» and «Competenze e addestramento» (D&D Beyond's
 * Features & Traits and Proficiencies & Training): every feature the character has,
 * grouped by where it comes from, each with its source, rules text and uses left; and
 * the armor, weapons, tools and languages it is trained in, as the classic sheet lists
 * them (the class table with the player's overrides, the merged tools and languages).
 */
import { describe, expect, it } from "vitest";

import {
  playFeaturesView,
  playProficienciesView,
} from "@/domains/play/play-features-view";
import { MOCK_CHARACTER, MOCK_MULTICLASS_CHARACTER } from "@/lib/mock";
import { makeCharacterDoc } from "./_helpers";

describe("playFeaturesView", () => {
  // Lyra Voss: Bard 9 (College of Lore), Elf, Criminal background.
  const view = playFeaturesView(MOCK_CHARACTER, "en");
  const group = (g: string) => view.groups.find((x) => x.group === g);
  const row = (g: string, id: string) => group(g)?.rows.find((r) => r.id === id);

  it("groups by origin in D&D Beyond's order: class, subclass, species, feats", () => {
    expect(view.groups.map((g) => g.group)).toEqual([
      "class",
      "subclass",
      "race",
      "feat",
    ]);
  });

  it("names each class feature with its class and level, in level order", () => {
    expect(row("class", "bard-bardic-inspiration")).toMatchObject({
      name: "Bardic Inspiration",
      source: "Bard 1",
    });
    const levels = (group("class")?.rows ?? []).map((r) =>
      Number(r.source?.split(" ").pop())
    );
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("lists a feature stored on the sheet AND granted by the class only once", () => {
    const ids = view.groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids.filter((id) => id === "bard-bardic-inspiration")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names a subclass feature with its subclass and level", () => {
    expect(group("subclass")?.rows[0]?.source).toMatch(/^College of Lore \d+$/);
  });

  it("derives the background's Origin feat (Criminal → Alert) with its category", () => {
    expect(row("feat", "alert")).toMatchObject({ name: "Alert", featCategory: "origin" });
  });

  it("shows the uses left of a limited feature and when they come back", () => {
    // the mock has spent 2 of its 5 Bardic Inspiration; Font of Inspiration (level 5)
    // brings them back on a Short Rest
    expect(row("class", "bard-bardic-inspiration")?.uses).toEqual({
      left: 3,
      max: 5,
      recovery: "short",
    });
    expect(row("class", "bard-jack-of-all-trades")?.uses).toBeNull();
  });

  it("carries the feature's rules text, localized", () => {
    expect(row("class", "bard-bardic-inspiration")?.description).toMatch(/Bonus Action/);
    const it = playFeaturesView(MOCK_CHARACTER, "it");
    const ispirazione = it.groups[0]?.rows.find(
      (r) => r.id === "bard-bardic-inspiration"
    );
    expect(ispirazione).toMatchObject({ name: "Ispirazione Bardica", source: "Bardo 1" });
  });

  it("a multiclass lists each class's features up to its own level", () => {
    // Bard 7 / Wizard 2
    const rows = playFeaturesView(MOCK_MULTICLASS_CHARACTER, "en").groups[0]?.rows ?? [];
    expect(rows.find((r) => r.id === "wizard-arcane-recovery")?.source).toBe("Wizard 1");
    const wizardLevels = rows
      .filter((r) => r.source?.startsWith("Wizard "))
      .map((r) => Number(r.source?.slice("Wizard ".length)));
    expect(wizardLevels.length).toBeGreaterThan(0);
    expect(Math.max(...wizardLevels)).toBe(2);
  });

  it("a feature with picks names what was picked (invocations, mastered weapons)", () => {
    const warlock = makeCharacterDoc({
      classes: [
        {
          classId: "warlock",
          level: 2,
          invocationChoices: ["agonizing-blast", "armor-of-shadows"],
        },
      ] as never,
    });
    const invocations = playFeaturesView(warlock, "en").groups[0]?.rows.find(
      (r) => r.id === "warlock-eldritch-invocations"
    );
    expect(invocations?.choices).toEqual(["Agonizing Blast", "Armor of Shadows"]);
    const fighter = makeCharacterDoc({
      classes: [
        { classId: "fighter", level: 1, weaponMasteries: ["longsword"] },
      ] as never,
    });
    const mastery = playFeaturesView(fighter, "it").groups[0]?.rows.find(
      (r) => r.id === "fighter-weapon-mastery"
    );
    expect(mastery?.choices).toEqual(["Spada Lunga"]);
    // nothing picked yet: no list
    expect(
      playFeaturesView(
        makeCharacterDoc({ classId: "fighter", level: 1 }),
        "en"
      ).groups[0]?.rows.find((r) => r.id === "fighter-weapon-mastery")?.choices
    ).toBeUndefined();
  });

  it("a homebrew feature sits last, under its own source line", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 1,
      features: [
        {
          custom: true,
          instanceId: "h1",
          title: { en: "Sea Legs", it: "Piede marino" },
          source: "Ship life",
          contentBlocks: [{ type: "text", text: "You never lose your footing on deck." }],
        } as never,
      ],
    });
    const v = playFeaturesView(doc, "it");
    expect(v.groups.at(-1)).toEqual({
      group: "custom",
      rows: [
        {
          id: "custom-h1",
          name: "Piede marino",
          source: "Ship life",
          description: "You never lose your footing on deck.",
          uses: null,
        },
      ],
    });
  });
});

describe("playProficienciesView", () => {
  it("lists the class's armor and weapons, and the merged tools and languages", () => {
    expect(playProficienciesView(MOCK_CHARACTER, "en")).toEqual({
      armor: "Light armor",
      weapons: "Simple weapons",
      weaponMastery: false,
      tools: "Lute, Viol, Flute, Thieves' Tools",
      languages: "Common, Elvish, Draconic, Thieves' Cant",
    });
  });

  it("honours the player's armor override and says a Fighter has Weapon Mastery", () => {
    const fighter = makeCharacterDoc({
      classId: "fighter",
      level: 1,
      armorProficiencyOverrides: { "heavy-armor": false } as never,
    });
    const view = playProficienciesView(fighter, "en");
    expect(view.armor).toBe("Light armor, Medium armor, Shields");
    expect(view.weaponMastery).toBe(true);
  });
});
