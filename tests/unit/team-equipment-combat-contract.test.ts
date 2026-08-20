import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { importCharacter } from "@/lib/character-io";
import {
  resolveActions,
  resolveTrackers,
  wornArmorDisadvantageClauses,
} from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { derivePartyMemberStats } from "@/features/campaigns/party-stats";
import type { CharacterDoc } from "@/types/character";

function liveFixture(name: string): CharacterDoc {
  const raw = readFileSync(
    join(process.cwd(), "content-pack/fixtures/team", name),
    "utf8"
  );
  const imported = importCharacter(raw);
  if (!imported.success) throw new Error(imported.error);
  return {
    ...imported.doc,
    id: name,
    createdAt: new Date("2026-08-04"),
    updatedAt: new Date("2026-08-04"),
  };
}

describe("live-team equipment combat contract", () => {
  beforeEach(() => useCharacterStore.setState({ character: null }));

  it("projects Santaera's Healer's Kit as one tracked Utilize action", () => {
    const santaera = liveFixture("santaera-barbarian.json");
    expect(resolveTrackers(santaera)).toContainEqual(
      expect.objectContaining({
        id: "equipment:healers-kit",
        total: 10,
        used: 0,
        recovery: "manual",
        isPool: true,
        unit: "uses",
      })
    );
    const action = resolveActions(santaera).find(
      (candidate) => candidate.id === "equipment-action-healers-kit-stabilize"
    );
    expect(action).toMatchObject({
      id: "equipment-action-healers-kit-stabilize",
      type: "action",
      economyCategory: "utilize",
      costTracker: "equipment:healers-kit",
      trackerCost: 1,
      summary: {
        stabilize: true,
        targeting: { affinity: "ally", maxTargets: 1 },
        uses: { current: 10, total: 10, isPool: true, unit: "uses" },
      },
    });
  });

  it("persists a spent kit use through a Long Rest and keeps the action in sync", () => {
    const santaera = liveFixture("santaera-barbarian.json");
    useCharacterStore.getState().setCharacter(santaera);
    useCharacterStore.getState().useTracker("equipment:healers-kit", 1);
    useCharacterStore.getState().longRest();
    const current = useCharacterStore.getState().character;
    expect(current?.session.trackers["equipment:healers-kit"]?.used).toBe(1);
    expect(
      current &&
        resolveActions(current).find(
          (candidate) => candidate.id === "equipment-action-healers-kit-stabilize"
        )?.summary.uses?.current
    ).toBe(9);
  });

  it("derives Catalion's old imported potion flags from the catalogue", () => {
    const catalion = liveFixture("catalion-bard.json");
    const potion = resolveActions(catalion).find(
      (candidate) => candidate.id === "item-potion-of-healing"
    );
    expect(potion).toMatchObject({
      id: "item-potion-of-healing",
      type: "bonus",
      costEquipment: "potion-of-healing",
      summary: {
        healing: "2d4+2",
        uses: { current: 1, total: 1 },
      },
    });
  });

  it("binds each live shortbow to that character's exact arrow stock", () => {
    for (const fixture of ["santaera-barbarian.json", "chiaviddu-rogue.json"]) {
      const character = liveFixture(fixture);
      expect(
        resolveActions(character).find((candidate) => candidate.id === "weapon-shortbow")
          ?.summary.ammo
      ).toEqual({ itemId: "arrows", remaining: 20 });
    }
  });

  it("honors Mandorlino's Talon overrides and equipped plate-and-shield state", () => {
    const mandorlino = liveFixture("mandorlino-paladin.json");
    const talon = resolveActions(mandorlino).find(
      (candidate) => "custom" in candidate.name && candidate.name.custom === "Talon"
    );
    expect(talon?.summary).toMatchObject({ attackBonus: 6, damage: "1d8+4" });
    expect(derivePartyMemberStats(mandorlino).ac).toBe(20);
  });

  it("surfaces the worn armor's deterministic Stealth disadvantage", () => {
    for (const fixture of ["santaera-barbarian.json", "mandorlino-paladin.json"]) {
      const clauses = wornArmorDisadvantageClauses(liveFixture(fixture));
      expect(clauses).toContainEqual(
        expect.objectContaining({ rollType: "check", vs: "stealth" })
      );
    }
  });
});
