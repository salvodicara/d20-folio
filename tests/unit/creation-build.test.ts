/**
 * The creation BUILD (`lib/creation/build.ts`) — a draft turned into the stored
 * character, pure. The level-1 Fighter quickbuild (human soldier) is the one
 * fully spelled-out case; the wizard writes exactly this payload
 * (`quickbuild-path` follows the same path through the real page).
 */
import { describe, expect, it } from "vitest";
import {
  creationDraftReducer,
  initialCreationDraft,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { buildNewCharacter } from "@/lib/creation/build";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { backgroundNameById } from "@/data/srd-names";
import { backgroundName } from "@/lib/views/creation-view";

function apply(draft: CreationDraft, ...actions: CreationDraftAction[]): CreationDraft {
  return actions.reduce(creationDraftReducer, draft);
}

const named = apply(
  initialCreationDraft(),
  { type: "setName", name: "  Ada  " },
  { type: "setAlignment", alignment: "lawful-good" }
);

describe("buildNewCharacter — the level-1 Fighter quickbuild", () => {
  const result = buildNewCharacter(named, { displayName: "Tester Person" });
  if (!result.ok) throw new Error(`unexpected ${result.error}`);
  const { character, session, ...meta } = result.payload;

  it("writes the document meta of a fresh, private character", () => {
    expect(meta).toEqual({
      portraitUrl: null,
      portraitCrop: null,
      shared: false,
      status: "active",
    });
  });

  it("writes the identity and the build", () => {
    expect(character).toMatchObject({
      name: "Ada", // trimmed by the name brand
      race: "human",
      classes: [{ classId: "fighter", level: 1 }],
      background: "Soldier",
      alignment: "lawful-good",
      playerName: "Tester",
      speed: "30",
      humanOriginFeat: "alert",
      bgFeat: "savage-attacker",
      backgroundAsi: { STR: 2, CON: 1 },
      hitDieType: 10,
      savingThrows: ["STR", "CON"],
    });
  });

  it("writes the standard array plus the background bonus", () => {
    // STR 15+2, CON 14+1, DEX 13, WIS 12, CHA 10, INT 8.
    expect(character.abilityScores).toEqual({
      STR: 17,
      DEX: 13,
      CON: 15,
      INT: 8,
      WIS: 12,
      CHA: 10,
    });
  });

  it("derives HP and AC from the boosted scores", () => {
    // d10 at level 1 + CON 15 (+2) = 12; unarmored AC 10 + DEX 13 (+1) = 11.
    expect(character.hp).toEqual({ max: 12 });
    expect(session.hp).toEqual({ current: 12, temp: 0 });
    expect(character.ac).toBe(11);
  });

  it("writes background, class and species skills and the origin languages", () => {
    expect(character.skills).toEqual({
      athletics: "proficient",
      intimidation: "proficient",
      perception: "proficient",
      survival: "proficient",
      // The Human's Skillful pick.
      insight: "proficient",
    });
    expect(character.languageIds).toEqual(["common", "dwarvish", "orc"]);
  });

  it("carries the starting kit, its armor worn", () => {
    expect(character.weapons.length).toBeGreaterThan(0);
    expect(
      character.equipment.some((e) => !("custom" in e) && "equipped" in e && e.equipped)
    ).toBe(true);
  });

  it("is a non-caster with no slots, and stores no species traits", () => {
    expect(character.spellcasting).toBeNull();
    expect(character.spellSlots).toEqual([]);
    const ids = character.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []));
    expect(ids).toEqual(expect.arrayContaining(["alert", "savage-attacker"]));
    expect(ids.some((id) => id.startsWith("human"))).toBe(false);
  });
});

describe("buildNewCharacter — what blocks a build", () => {
  it("refuses an empty or whitespace name", () => {
    expect(buildNewCharacter(initialCreationDraft(), { displayName: null })).toEqual({
      ok: false,
      error: "name",
    });
    expect(
      buildNewCharacter(apply(named, { type: "setName", name: "   " }), {
        displayName: null,
      })
    ).toEqual({ ok: false, error: "name" });
  });

  it("refuses an unknown class and a missing due subclass", () => {
    expect(
      buildNewCharacter(apply(named, { type: "selectClass", classId: "nope" }), {
        displayName: null,
      })
    ).toEqual({ ok: false, error: "class" });
    expect(
      buildNewCharacter(apply(named, { type: "setLevel", level: 3 }), {
        displayName: null,
      })
    ).toEqual({ ok: false, error: "subclass" });
  });
});

describe("the stored background name", () => {
  it("is the English catalogue name for every background", () => {
    for (const b of SRD_BACKGROUNDS) {
      expect(backgroundNameById(b.id), b.id).toBe(backgroundName(b.id, "en"));
    }
  });
});
