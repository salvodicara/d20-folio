import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FEATS_BY_ID } from "@/data/feats";
import { importCharacter } from "@/lib/character-io";
import {
  applySpellChoicePicks,
  pendingSpellChoicesForFeat,
} from "@/lib/feat-spell-choices";
import { incompleteFreeCastChoiceFeatIds } from "@/lib/feature-choice-repair";

function briox() {
  const raw = readFileSync(
    join(process.cwd(), "content-pack/fixtures/team/briox-wizard.json"),
    "utf8"
  );
  const imported = importCharacter(raw);
  if (!imported.success) throw new Error(imported.error);
  return imported.doc.character;
}

describe("grandfathered feat-choice repair", () => {
  it("detects Briox's missing Magic Initiate free-cast provenance", () => {
    expect(incompleteFreeCastChoiceFeatIds(briox())).toEqual(["magic-initiate-wizard"]);
  });

  it("clears the repair signal after the normal picker materializes the choices", () => {
    const character = briox();
    const slots = pendingSpellChoicesForFeat(
      FEATS_BY_ID.get("magic-initiate-wizard") ?? {}
    );
    const cantrips = slots.find((slot) => slot.kind === "cantrip");
    const spell = slots.find((slot) => slot.kind === "spell");
    if (!cantrips || !spell) throw new Error("expected every Magic Initiate slot");
    const spells = applySpellChoicePicks(
      character.spells,
      {
        [cantrips.slotId]: ["mind-sliver", "ray-of-frost"],
        [spell.slotId]: ["shield"],
      },
      slots,
      character.abilityScores
    );

    expect(incompleteFreeCastChoiceFeatIds({ ...character, spells })).toEqual([]);
    expect(spells.filter((candidate) => !("custom" in candidate))).toHaveLength(
      character.spells.length
    );
  });
});
