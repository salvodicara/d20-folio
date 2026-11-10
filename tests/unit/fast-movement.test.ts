/**
 * Barbarian Fast Movement (SRD 5.2.1): +10 ft «while you aren't wearing Heavy
 * armor».
 */
import { describe, expect, it } from "vitest";
import { deriveCharacter } from "@/lib/views/derive-character";
import { makeCharacterDoc } from "./_helpers";

const barbarian = (equipment: { srdId: string; equipped: boolean }[]) =>
  makeCharacterDoc({
    classes: [{ classId: "barbarian", level: 5 }],
    features: [{ srdId: "barbarian-fast-movement" }],
    equipment,
  });

describe("Fast Movement", () => {
  it("+10 ft in medium armor, none in heavy armor", () => {
    const light = deriveCharacter(
      barbarian([{ srdId: "half-plate-armor", equipped: true }])
    );
    const heavy = deriveCharacter(barbarian([{ srdId: "plate-armor", equipped: true }]));
    expect(light.walkingSpeedFt - heavy.walkingSpeedFt).toBeGreaterThanOrEqual(10);
  });
});
