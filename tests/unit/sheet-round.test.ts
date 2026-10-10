/**
 * One answer to "which round is this sheet in": the DM's encounter round when the
 * open character is that encounter's PC, otherwise the solo turn engine's round.
 * The turn band, the round-1 attack clauses and the round a timed state is lit in
 * all read it, so a solo round left over from before the fight never leaks in.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  sheetRound,
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { makeCharacterDoc } from "./_helpers";

const status = (characterId: string, round: number) =>
  ({ characterId, round }) as unknown as GlobalCombat;

afterEach(() => {
  useCombatStatusStore.setState({ status: null });
  useCombatStore.getState().endCombat();
  useCharacterStore.setState({ character: null });
});

describe("sheetRound", () => {
  it("is the encounter round for the encounter's own character", () => {
    expect(sheetRound(status("hero", 2), "hero", 10)).toBe(2);
  });

  it("is the solo round outside an encounter or for another of the user's heroes", () => {
    expect(sheetRound(null, "hero", 10)).toBe(10);
    expect(sheetRound(status("other-hero", 2), "hero", 10)).toBe(10);
  });
});

describe("a timed state lit inside the DM's encounter", () => {
  it("is stamped from the encounter round, not a leftover solo round", () => {
    const doc = makeCharacterDoc({
      classId: "barbarian",
      level: 5,
      features: [{ srdId: "barbarian-rage" }],
    });
    useCombatStore.setState({ round: 10 });
    useCombatStatusStore.setState({ status: status(doc.id, 2) });
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().setActiveFeature("barbarian-rage", true);
    expect(
      useCharacterStore.getState().character?.session.effectTimers?.["barbarian-rage"]
        ?.tickedRound
    ).toBe(1);
  });

  it("keeps the solo round when the open hero is not in the fight", () => {
    const doc = makeCharacterDoc({
      classId: "barbarian",
      level: 5,
      features: [{ srdId: "barbarian-rage" }],
    });
    useCombatStore.setState({ round: 10 });
    useCombatStatusStore.setState({ status: status("someone-else", 2) });
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().setActiveFeature("barbarian-rage", true);
    expect(
      useCharacterStore.getState().character?.session.effectTimers?.["barbarian-rage"]
        ?.tickedRound
    ).toBe(9);
  });
});
