/**
 * SRD 5.2.1 Paladin 2, Fighting Style: "You gain a Fighting Style feat of your
 * choice". The level-up asks for that feat; it never adds the Defense style on
 * its own as well (a second style, +1 AC the player did not pick).
 */
import { describe, expect, it } from "vitest";

import { levelUpAsks, NO_ANSWERS } from "@/domains/leveling/level-up-asks";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  initialCreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { commitLevelUp } from "@/lib/level-up-commit";
import type { CharacterDoc } from "@/types/character";

function paladin(): CharacterDoc {
  const acts: CreationDraftAction[] = [
    { type: "setName", name: "Test" },
    { type: "setAlignment", alignment: "neutral" },
    { type: "selectClass", classId: "paladin" },
    { type: "selectRace", raceId: "human" },
    { type: "fillReadyMade" },
  ];
  const built = buildNewCharacter(
    acts.reduce(creationDraftReducer, initialCreationDraft()),
    {
      displayName: null,
    }
  );
  if (!built.ok) throw new Error(built.error);
  return {
    id: "x",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    revision: 0,
    ...built.payload,
  };
}

const ids = (doc: CharacterDoc) =>
  doc.character.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []));

describe("Paladin 2 Fighting Style on level-up", () => {
  it("adds the style the player picks and no Defense of its own", () => {
    const doc = paladin();
    const row = levelUpAsks(doc, "paladin", NO_ANSWERS, "en").rows.find(
      (r) => r.key === "fightingStyle"
    );
    const style = row?.options.find((o) => o.id === "archery")?.id ?? null;
    expect(style).toBe("archery");
    const picks = levelUpAsks(
      doc,
      "paladin",
      { ...NO_ANSWERS, fightingStyle: style },
      "en"
    ).picks;
    const after = ids(commitLevelUp(doc, picks));
    expect(after).toContain("archery");
    expect(after).not.toContain("paladin-fighting-style-defense");
  });
});
