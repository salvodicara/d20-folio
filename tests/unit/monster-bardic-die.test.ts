/**
 * A creature in the fight can hold a Bardic Inspiration die a bard gave it. On the new
 * fight screen the DM spends it from the creature's line (the classic monster card's
 * «Spendi Ispirazione Bardica»); the undo gives the same die back. Only the DM.
 */
import { describe, expect, it } from "vitest";

import { planMonsterBardicDie } from "@/features/campaigns/combat-lifecycle";
import {
  addMonster,
  beginEncounterTurns,
  setMonsterBardicInspirationDie,
  startEncounter,
} from "@/lib/play/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const fight = (die = "d8"): EncounterState => {
  let state = startEncounter({}, [], 1_000);
  state = addMonster(state, {
    ac: 13,
    count: 1,
    initiative: 12,
    maxHp: 10,
    name: "Guard",
  });
  state = setMonsterBardicInspirationDie(state, "monster-1", die);
  return beginEncounterTurns(state, ["monster-1"]);
};

const table = (encounter: EncounterState) =>
  ({
    id: "camp",
    dmUid: "dm",
    memberDetails: {},
    encounterInit: {},
    encounter,
  }) as unknown as CampaignDoc;

const dieOf = (state: EncounterState | null | undefined) => {
  const guard = state?.combatants.find((c) => c.id === "monster-1");
  return guard?.kind === "monster" ? guard.bardicInspirationDie : "missing";
};

describe("the DM spends a creature's Bardic Inspiration die", () => {
  it("spending clears it, and the undo gives the same die back", () => {
    const spent = planMonsterBardicDie(table(fight()), {
      uid: "dm",
      monsterId: "monster-1",
      die: "",
    });
    expect(spent?.previous).toBe("d8");
    expect(dieOf(spent?.patch.encounter)).toBeUndefined();
    const back = planMonsterBardicDie(table(spent?.patch.encounter ?? fight()), {
      uid: "dm",
      monsterId: "monster-1",
      die: spent?.previous ?? "",
    });
    expect(dieOf(back?.patch.encounter)).toBe("d8");
  });

  it("only the DM, and only a die that is there", () => {
    expect(
      planMonsterBardicDie(table(fight()), {
        uid: "ana",
        monsterId: "monster-1",
        die: "",
      })
    ).toBeNull();
    expect(
      planMonsterBardicDie(table(fight("")), {
        uid: "dm",
        monsterId: "monster-1",
        die: "",
      })
    ).toBeNull();
  });
});
