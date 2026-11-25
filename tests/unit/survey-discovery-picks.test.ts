/**
 * The read-only Magical Discoveries survey (#1289) counts, per Lore Bard of level 6+,
 * the always-prepared spells marked by the feature and those with no mark, counts only.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyDiscoveryPicks } from "../../scripts/survey-discovery-picks";
import { makeCharacterDoc } from "./_helpers";

const doc = (path: string, character: CharacterDoc) => ({
  path,
  data: {
    schema: 3,
    build: serializeCharacterEnvelope(character).build,
    state: {},
  } as RawMap,
});
const FEATURE = "bard-lore-additional-magical-secrets";

describe("surveyDiscoveryPicks", () => {
  it("counts marked and unmarked picks per Lore Bard, and only counts", () => {
    const marked = makeCharacterDoc({
      classes: [{ classId: "bard", subclassId: "college-of-lore", level: 9 }],
      spells: [
        { srdId: "guidance", prepared: true, alwaysPrepared: true, grantedBy: FEATURE },
        { srdId: "fireball", prepared: true, alwaysPrepared: true, grantedBy: FEATURE },
      ],
    });
    const old = makeCharacterDoc({
      classes: [{ classId: "bard", subclassId: "college-of-lore", level: 9 }],
      spells: [
        { srdId: "guidance", prepared: true, alwaysPrepared: true },
        { srdId: "fireball", prepared: true, alwaysPrepared: true },
      ],
    });
    const young = makeCharacterDoc({
      classes: [{ classId: "bard", subclassId: "college-of-lore", level: 5 }],
    });
    expect(
      surveyDiscoveryPicks([
        doc("users/u1/characters/a", marked),
        doc("users/u2/characters/b", old),
        doc("users/u3/characters/c", young),
      ])
    ).toEqual({
      format: "d20-folio-discovery-picks-survey-v1",
      loreBards: 2,
      byMarks: { "2/0": 1, "0/2": 1 },
      unreadable: {},
    });
  });
});
