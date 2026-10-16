/**
 * Which catalogue entries a character names that this composition does not hold
 * (`src/data/missing-content.ts`). Without the private pack, a character built
 * with it must not open as a silently stripped sheet; with the pack, the team's
 * real characters must name nothing missing.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCharacter } from "@/lib/character-codec";
import { missingContent, packLoaded } from "@/data/missing-content";
import type { CharacterData } from "@/types/character";

const TEAM_DIR = path.resolve(import.meta.dirname, "../../content-pack/fixtures/team");
const TEAM = existsSync(TEAM_DIR)
  ? readdirSync(TEAM_DIR).filter((name) => name.endsWith(".json"))
  : [];

function team(name: string): CharacterData {
  const result = parseCharacter(readFileSync(path.join(TEAM_DIR, name), "utf8"));
  if (!result.success) throw new Error(`${name}: ${result.error}`);
  return result.doc.character;
}

function base(): CharacterData {
  const name = TEAM[0];
  if (!name) throw new Error("no team fixture");
  return team(name);
}

describe("missing catalogue content", () => {
  it.runIf(packLoaded && TEAM.length > 0).each(TEAM)(
    "with the pack, %s names nothing missing",
    (name) => {
      expect(missingContent(team(name))).toEqual([]);
    }
  );

  it.runIf(!packLoaded && TEAM.length > 0)(
    "without the pack, every team character names what it misses",
    () => {
      for (const name of TEAM) expect(missingContent(team(name)), name).not.toEqual([]);
    }
  );

  it.runIf(TEAM.length > 0)("names an unknown subclass, spell, feature and item", () => {
    const character = base();
    const firstClass = character.classes[0];
    if (!firstClass) throw new Error("no class");
    const probe: CharacterData = {
      ...character,
      classes: [{ ...firstClass, subclassId: "zz-subclass" }],
      spells: [{ srdId: "zz-spell" }],
      features: [{ srdId: "zz-feature" }],
      equipment: [{ srdId: "zz-item", quantity: 1 }],
      weapons: [],
    };
    expect(missingContent(probe)).toEqual(
      expect.arrayContaining([
        { kind: "subclass", id: "zz-subclass" },
        { kind: "spell", id: "zz-spell" },
        { kind: "feature", id: "zz-feature" },
        { kind: "item", id: "zz-item" },
      ])
    );
  });

  it.runIf(TEAM.length > 0)("ignores homebrew entries", () => {
    const character = base();
    const probe: CharacterData = {
      ...character,
      spells: [
        {
          custom: true,
          id: "x",
          name: "Mine",
        } as unknown as CharacterData["spells"][number],
      ],
    };
    expect(missingContent(probe).filter((ref) => ref.kind === "spell")).toEqual([]);
  });
});
