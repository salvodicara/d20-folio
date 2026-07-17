import { describe, it, expect } from "vitest";
import { resolveTrackers } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

const sneak = (level: number) =>
  resolveTrackers(
    makeCharacterDoc({
      classes: [{ classId: "rogue", level: level }],
      features: [{ srdId: "rogue-sneak-attack" }],
    })
  ).find((t) => t.id === "rogue-sneak-attack");

describe("Sneak Attack scaling (H3)", () => {
  it("die shows the scaling damage ⌈level/2⌉d6 (not a flat d6)", () => {
    expect(sneak(1)?.die).toBe("1d6");
    expect(sneak(2)?.die).toBe("1d6");
    expect(sneak(3)?.die).toBe("2d6");
    expect(sneak(5)?.die).toBe("3d6");
    expect(sneak(9)?.die).toBe("5d6");
    expect(sneak(11)?.die).toBe("6d6");
    expect(sneak(19)?.die).toBe("10d6");
    expect(sneak(20)?.die).toBe("10d6");
  });

  it("stays a once-per-turn single use", () => {
    expect(sneak(11)?.total).toBe(1);
  });
});
