/**
 * The new creation screen (approved prototypes create-1, create-2): every class as a
 * card whose art is data (a glyph until the full set of paintings exists), the
 * «Personaggio» summary, and every background with its skills and origin feat.
 */
import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "@/ui/icon-names";

import {
  backgroundRows,
  classCards,
  creationSummary,
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
