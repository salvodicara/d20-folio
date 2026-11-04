/**
 * A Speed loss that lands on the character (edge-case M10; a monster's "the target's
 * Speed is reduced by 10 feet until the end of its next turn") lowers the sheet's
 * Speed until that turn edge, and the same source hitting twice doesn't stack.
 */
import { describe, expect, it } from "vitest";

import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { riderTakenEvents } from "@/lib/play/rider-taken";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import type { RiderEffect } from "@/lib/activities";

const slow: RiderEffect = {
  kind: "speed-reduction",
  feet: 10,
  until: { phase: "turn-end", anchor: "target" },
};
const source = { srd: { kind: "monster" as const, key: "wolf", field: "name" } };

const speedBonus = (doc: CharacterDoc) =>
  aggregateCharacterGrants(doc.character, doc.session).speedBonusFt;

const land = (doc: CharacterDoc, effect: RiderEffect, src = source) =>
  riderTakenEvents(doc, effect, {
    damageTaken: 5,
    source: src,
    boundary: { round: 3, phase: "turn-end" },
  }).reduce((now, event) => applySheetEvent(now, event) ?? now, doc);

describe("a Speed loss on the character", () => {
  it("lowers the Speed until the named turn edge", () => {
    const before = speedBonus(MOCK_CHARACTER);
    const after = land(MOCK_CHARACTER, slow);
    expect(speedBonus(after)).toBe(before - 10);
    const [key] = (after.session.activeFeatures ?? []).filter((k) =>
      k.startsWith("rider-speed-loss:")
    );
    expect(after.session.effectBoundaries?.[key ?? ""]).toEqual({
      round: 3,
      phase: "turn-end",
    });
  });

  it("the same source twice reduces it once; a different source adds", () => {
    const before = speedBonus(MOCK_CHARACTER);
    const twice = land(land(MOCK_CHARACTER, slow), slow);
    expect(speedBonus(twice)).toBe(before - 10);
    const other = { srd: { kind: "monster" as const, key: "ogre", field: "name" } };
    expect(speedBonus(land(twice, slow, other))).toBe(before - 20);
  });
});
