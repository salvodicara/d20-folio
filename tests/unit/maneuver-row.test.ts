/**
 * «Al colpo» lists the learned maneuvers that ride a hit (board 2b mock, D5a): each
 * says its cost in Superiority Dice with how many are left, what the die adds to, and
 * the save, «1 Dado di Superiorità (3 rimasti) · +1d8 danni · TS FOR · CD 14».
 */
import { describe, expect, it } from "vitest";

import i18n from "@/i18n";
import type { ManeuverOptionVM } from "@/domains/play/after-hit-options";
import { maneuverDetail } from "@/domains/play/maneuver-row";

const m = (over: Partial<ManeuverOptionVM>): ManeuverOptionVM =>
  ({
    id: "m",
    name: "m",
    die: "d8",
    diceLeft: 3,
    diceTotal: 4,
    addsTo: "damage",
    save: null,
    disabled: false,
    ...over,
  }) as ManeuverOptionVM;

describe("maneuverDetail", () => {
  it("cost, what the die adds to, the save (Italian)", () => {
    const t = i18n.getFixedT("it");
    expect(maneuverDetail(m({ save: { ability: "STR", dc: 14 } }), t)).toBe(
      "1 Dado di Superiorità (3 rimasti) · +1d8 danni · TS FOR · CD 14"
    );
  });

  it("a die on the attack roll says so (English)", () => {
    const t = i18n.getFixedT("en");
    expect(maneuverDetail(m({ addsTo: "attack-roll", diceLeft: 1 }), t)).toBe(
      "1 Superiority Die (1 left) · +1d8 to the attack roll"
    );
  });
});
