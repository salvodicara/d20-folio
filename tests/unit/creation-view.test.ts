/**
 * The new creation screen (approved prototypes create-1, create-2): every class as a
 * card whose art is data (a glyph until the full set of paintings exists), the
 * «Personaggio» summary, and every background with its skills and origin feat.
 */
import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "@/ui/icon-names";

import {
  abilityTiles,
  backgroundRows,
  classCards,
  creationSummary,
  choiceSlotRows,
  speciesRows,
  suggestedBonus,
  toggleChoicePick,
  suggestedScores,
} from "@/domains/creation/creation-view";
import {
  creationFacts,
  creationDraftReducer,
  initialCreationDraft,
} from "@/lib/creation/draft";

describe("classCards", () => {
  it("lists every class, each with the same kind of art", () => {
    const cards = classCards("it");
    expect(cards.length).toBeGreaterThanOrEqual(12);
    expect(new Set(cards.map((c) => c.art.kind))).toEqual(new Set(["glyph"]));
    expect(cards.find((c) => c.id === "cleric")).toEqual({
      id: "cleric",
      name: "Chierico",
      art: { kind: "glyph", icon: "g-class-cleric" },
    });
  });
});

describe("class art", () => {
  it("every class has its glyph in the sprite", () => {
    for (const c of classCards("en")) expect(ICON_NAMES).toContain(c.art.icon);
  });
});

describe("creationSummary", () => {
  it("a level-1 cleric: hit die, primary ability, armour, and the background once chosen", () => {
    let draft = creationDraftReducer(initialCreationDraft(), {
      type: "selectClass",
      classId: "cleric",
    });
    draft = creationDraftReducer(draft, {
      type: "selectBackground",
      backgroundId: "acolyte",
    });
    const s = creationSummary(draft, creationFacts(draft), "it");
    expect(s.classId).toBe("cleric");
    expect(s.level).toBe(1);
    expect(s.hitDie).toBe("d8");
    expect(s.primaryAbility).toBe("Saggezza");
    expect(s.armor).toBe("leggere, medie, scudi");
    expect(s.background).toBe("Accolito");
  });
});

describe("backgroundRows", () => {
  it("each background with its two skills and its origin feat", () => {
    const rows = backgroundRows("it");
    const acolyte = rows.find((r) => r.id === "acolyte");
    expect(acolyte?.name).toBe("Accolito");
    expect(acolyte?.skills).toEqual(["Intuizione", "Religione"]);
    expect(acolyte?.feat).toBeTruthy();
  });
});

describe("speciesRows", () => {
  it("each species with up to three of its traits", () => {
    const elf = speciesRows("it").find((s) => s.id === "elf");
    expect(elf?.name).toBe("Elfo");
    expect(elf?.traits.length).toBeGreaterThan(0);
    expect(elf?.traits.length).toBeLessThanOrEqual(3);
    expect(elf?.traits).toContain("Scurovisione");
  });
});

describe("abilityTiles", () => {
  it("each ability with its base, the background bonus and the effective score", () => {
    let draft = creationDraftReducer(initialCreationDraft(), {
      type: "selectClass",
      classId: "cleric",
    });
    draft = creationDraftReducer(draft, {
      type: "selectBackground",
      backgroundId: "acolyte",
    });
    const tiles = abilityTiles(draft, creationFacts(draft));
    expect(tiles.map((t) => t.code)).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
    for (const tile of tiles) {
      expect(tile.score).toBe(tile.base + tile.bonus);
      expect(tile.mod).toBe(Math.floor((tile.score - 10) / 2));
    }
  });
});

describe("suggestedScores", () => {
  it("the class's ready-made scores", () => {
    const cleric = suggestedScores("cleric");
    expect(Object.keys(cleric).sort()).toEqual([
      "CHA",
      "CON",
      "DEX",
      "INT",
      "STR",
      "WIS",
    ]);
    expect(Math.max(...Object.values(cleric))).toBe(cleric.WIS);
  });
});

describe("suggestedBonus", () => {
  it("puts the +2 then the +1 on the background's two best abilities for the build", () => {
    const scores = suggestedScores("cleric");
    // Acolyte boosts INT, WIS or CHA; a Cleric's build is highest in WIS, then CHA.
    expect(suggestedBonus(scores, ["INT", "WIS", "CHA"])).toEqual(["WIS", "CHA"]);
  });
  it("keeps the background's order on a tie", () => {
    const flat = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } as const;
    expect(suggestedBonus(flat, ["CON", "STR", "DEX"])).toEqual(["CON", "STR"]);
  });
});

describe("choiceSlotRows", () => {
  const humanWithMagicInitiate = () => {
    const draft = [
      { type: "selectRace", raceId: "human" } as const,
      { type: "setHumanFeat", featId: "magic-initiate-wizard" } as const,
    ].reduce(creationDraftReducer, initialCreationDraft());
    return { draft, facts: creationFacts(draft) };
  };

  it("an empty skill pool is any skill, minus the ones the build has", () => {
    const { draft, facts } = humanWithMagicInitiate();
    const [skillful] = choiceSlotRows(
      facts.speciesChoiceSlots,
      draft.choicePicks,
      { skills: new Set(["athletics"]), spells: new Set() },
      "en"
    );
    expect(skillful?.title).toBe("Pick 1 Skill");
    expect(skillful?.options.map((o) => o.id)).not.toContain("athletics");
    expect(skillful?.options.map((o) => o.label)).toContain("Perception");
  });

  it("a feat's spells name their list and skip the build's own spells", () => {
    const { draft, facts } = humanWithMagicInitiate();
    const [cantrips, spell] = choiceSlotRows(
      facts.humanFeatSlots,
      draft.choicePicks,
      { skills: new Set(), spells: new Set(["light"]) },
      "en"
    );
    expect(cantrips?.title).toBe("Pick 2 Wizard Cantrips");
    expect(cantrips?.options.map((o) => o.id)).not.toContain("light");
    expect(cantrips?.options.map((o) => o.id)).toContain("mage-hand");
    expect(spell?.title).toBe("Pick 1 Wizard Spell");
  });

  it("toggling fills a slot to its amount, then the oldest pick gives way", () => {
    const { draft, facts } = humanWithMagicInitiate();
    const row = () =>
      choiceSlotRows(
        facts.humanFeatSlots,
        picks,
        { skills: new Set(), spells: new Set() },
        "en"
      )[0];
    let picks = draft.choicePicks;
    for (const id of ["light", "mage-hand", "prestidigitation"]) {
      const current = row();
      if (current) picks = toggleChoicePick(picks, current, id);
    }
    expect(row()?.picked).toEqual(["mage-hand", "prestidigitation"]);
    const current = row();
    if (current) picks = toggleChoicePick(picks, current, "mage-hand");
    expect(row()?.picked).toEqual(["prestidigitation"]);
  });
});
