/**
 * An object in the area (SRD 5.2.1 "Object"): immune to Poison and Psychic damage,
 * it fails every saving throw. Its other numbers (AC, HP, resistances by material)
 * are the DM's.
 */
import { describe, expect, it } from "vitest";

import { OBJECT_DEFENSES, resolveDamageIntake } from "@/lib/damage-intake";

describe("damage to an object", () => {
  it("Poison and Psychic do nothing, Fire lands whole", () => {
    const hit = (type: "poison" | "psychic" | "fire") =>
      resolveDamageIntake([{ amount: 12, type, delivery: "automatic" }], OBJECT_DEFENSES)
        .netTotal;
    expect(hit("poison")).toBe(0);
    expect(hit("psychic")).toBe(0);
    expect(hit("fire")).toBe(12);
  });
});
