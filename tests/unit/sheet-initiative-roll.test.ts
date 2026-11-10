/**
 * The Play screen's initiative roll is the fight's first for this player, so it regains
 * what tops up on it (2024 Bard Superior Inspiration: «When you roll Initiative, you
 * regain expended uses of Bardic Inspiration until you have two if you have fewer than
 * that»), as the classic turn band does.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

import { rollInitiativeFromSheet } from "@/domains/play/sheet-initiative-roll";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const t = ((key: string) => key) as unknown as TFunction;

const bard = () =>
  makeCharacterDoc(
    {
      classes: [{ classId: "bard", level: 18, subclassId: "college-of-lore" }],
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 20 },
      features: [
        { srdId: "bard-bardic-inspiration" },
        { srdId: "bard-superior-inspiration" },
      ],
    },
    { trackers: { "bard-bardic-inspiration": { used: 5 } } }
  );

describe("rollInitiativeFromSheet", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(bard());
  });

  it("sends the roll and regains Bardic Inspiration up to two (Superior Inspiration)", () => {
    const send = vi.fn();
    rollInitiativeFromSheet({ send, t, locale: "en" });
    expect(send).toHaveBeenCalledTimes(1);
    const trackers = useCharacterStore.getState().character?.session.trackers ?? {};
    expect(trackers["bard-bardic-inspiration"]).toEqual({ used: 3 });
  });
});
