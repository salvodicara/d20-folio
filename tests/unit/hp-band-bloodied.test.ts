/**
 * One Bloodied rule (architecture pass 2026-10-24): "Bloodied" is at or below half
 * the Hit Point maximum and above 0 (SRD 5.2.1 Rules Glossary). `bloodiedFromHp` is
 * that rule; the concealed HP band a player sees for a monster reads it too, so a
 * band can never call a creature bloodied the sheet doesn't (or the other way).
 * The band itself is characterized against its own formula before the move.
 */
import { describe, expect, it } from "vitest";

import { bloodiedFromHp } from "@/lib/aggregate-character";
import { bloodiedFromHp as fromBand, hpBand } from "@/lib/hp-band";

/** The band exactly as it was written before it read the shared rule. */
function bandBefore(current: number, max: number): string {
  if (current <= 0) return "down";
  const pct = max > 0 ? current / max : 0;
  if (pct <= 0.25) return "nearDeath";
  if (pct <= 0.5) return "bloodied";
  return "healthy";
}

const grid: [number, number][] = [];
for (let max = 1; max <= 20; max++)
  for (let current = -1; current <= max; current++) grid.push([current, max]);

describe("one Bloodied rule", () => {
  it("is the same function from either module", () => {
    expect(fromBand).toBe(bloodiedFromHp);
  });

  it.each(grid)("HP %i of %i: the band is unchanged", (current, max) => {
    expect(hpBand(current, max)).toBe(bandBefore(current, max));
  });

  it.each(grid)(
    "HP %i of %i: bloodied or near death exactly when Bloodied",
    (current, max) => {
      const band = hpBand(current, max);
      expect(band === "bloodied" || band === "nearDeath").toBe(
        bloodiedFromHp(current, max)
      );
    }
  );
});
