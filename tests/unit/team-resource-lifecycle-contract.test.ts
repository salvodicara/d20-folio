import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { importCharacter } from "@/lib/character-io";
import { resolveActions, resolveTrackers } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

const TEAM = [
  "bo-monk.json",
  "briox-wizard.json",
  "catalion-bard.json",
  "chiaviddu-rogue.json",
  "mandorlino-paladin.json",
  "santaera-barbarian.json",
] as const;

function liveFixture(name: (typeof TEAM)[number]): CharacterDoc {
  const imported = importCharacter(
    readFileSync(join(process.cwd(), "content-pack/fixtures/team", name), "utf8")
  );
  if (!imported.success) throw new Error(imported.error);
  // Portable fixtures ship without the combat trio; the real app hydrates a
  // full-HP subdoc at load, so the contract mirrors that here (a 0-HP doc
  // cannot rest, by rule).
  return {
    ...imported.doc,
    id: name,
    session: {
      ...imported.doc.session,
      hp: { ...imported.doc.session.hp, current: 1 },
    },
    createdAt: new Date("2026-08-04"),
    updatedAt: new Date("2026-08-04"),
  };
}

function used(trackerId: string): number {
  return useCharacterStore.getState().character?.session.trackers[trackerId]?.used ?? 0;
}

describe("live-team resource lifecycle contract", () => {
  beforeEach(() => useCharacterStore.setState({ character: null }));

  it("never exposes a paid action whose resource tracker is missing", () => {
    for (const fixture of TEAM) {
      const character = liveFixture(fixture);
      const trackers = new Map(
        resolveTrackers(character).map((tracker) => [tracker.id, tracker])
      );
      for (const action of resolveActions(character)) {
        if (!action.costTracker) continue;
        const tracker = trackers.get(action.costTracker);
        expect(tracker, `${fixture}: ${action.id} → ${action.costTracker}`).toBeDefined();
        expect(action.trackerCost ?? 1).toBeLessThanOrEqual(tracker?.total ?? 0);
      }
    }
  });

  it("spends and recovers Bo's Focus at the real short-rest cadence", () => {
    useCharacterStore.getState().setCharacter(liveFixture("bo-monk.json"));
    useCharacterStore.getState().useTracker("monk-focus", 2);
    expect(used("monk-focus")).toBe(2);
    useCharacterStore.getState().shortRest();
    expect(used("monk-focus")).toBe(0);
  });

  it("keeps Catalion's pools distinct across Short and Long Rests", () => {
    useCharacterStore.getState().setCharacter(liveFixture("catalion-bard.json"));
    for (const id of ["bard-bardic-inspiration", "musician", "lucky"])
      useCharacterStore.getState().useTracker(id);

    useCharacterStore.getState().shortRest();
    expect(used("bard-bardic-inspiration")).toBe(1);
    expect(used("musician")).toBe(0);
    expect(used("lucky")).toBe(1);

    useCharacterStore.getState().longRest();
    expect(used("bard-bardic-inspiration")).toBe(0);
    expect(used("lucky")).toBe(0);
  });

  it("recovers Mandorlino's Channel Divinity partially and Lay on Hands fully", () => {
    useCharacterStore.getState().setCharacter(liveFixture("mandorlino-paladin.json"));
    useCharacterStore.getState().useTracker("paladin-channel-divinity", 2);
    useCharacterStore.getState().useTracker("paladin-lay-on-hands", 7);

    useCharacterStore.getState().shortRest();
    expect(used("paladin-channel-divinity")).toBe(1);
    expect(used("paladin-lay-on-hands")).toBe(7);

    useCharacterStore.getState().longRest();
    expect(used("paladin-channel-divinity")).toBe(0);
    expect(used("paladin-lay-on-hands")).toBe(0);
  });

  it("records, spends, undoes, and rerolls Briox's Portent dice", () => {
    useCharacterStore.getState().setCharacter(liveFixture("briox-wizard.json"));
    const store = useCharacterStore.getState();
    store.setTrackerRoll("wizard-diviner-portent", 0, 17);
    store.setTrackerRoll("wizard-diviner-portent", 1, 4);
    const undo = useCharacterStore
      .getState()
      .spendTrackerRoll("wizard-diviner-portent", 0);
    expect(used("wizard-diviner-portent")).toBe(1);
    expect(
      useCharacterStore.getState().character?.session.trackers["wizard-diviner-portent"]
        ?.rolls
    ).toEqual([4]);

    undo?.();
    expect(used("wizard-diviner-portent")).toBe(0);
    expect(
      useCharacterStore.getState().character?.session.trackers["wizard-diviner-portent"]
        ?.rolls
    ).toEqual([17, 4]);

    useCharacterStore.getState().longRest();
    expect(
      useCharacterStore.getState().character?.session.trackers["wizard-diviner-portent"]
    ).toBeUndefined();
  });

  it("recovers one Rage but never fabricates a Healer's Kit recharge", () => {
    useCharacterStore.getState().setCharacter(liveFixture("santaera-barbarian.json"));
    useCharacterStore.getState().useTracker("barbarian-rage", 3);
    useCharacterStore.getState().useTracker("equipment:healers-kit", 2);
    useCharacterStore.getState().setActiveFeature("barbarian-rage", true);
    useCharacterStore.getState().armEffectTimer("barbarian-rage", 80);

    useCharacterStore.getState().shortRest();
    expect(used("barbarian-rage")).toBe(2);
    expect(used("equipment:healers-kit")).toBe(2);
    expect(useCharacterStore.getState().character?.session.activeFeatures).not.toContain(
      "barbarian-rage"
    );

    useCharacterStore.getState().longRest();
    expect(used("barbarian-rage")).toBe(0);
    expect(used("equipment:healers-kit")).toBe(2);
  });
});
