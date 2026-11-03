/**
 * Every companion stat block says what ends it (edge-case M6). The guard
 * cross-checks the spell: a Concentration spell's creature ends with it, and a
 * creature from a spell without Concentration never claims to.
 */
import { describe, expect, it } from "vitest";
import { classFeatures } from "@/data/classes";
import { spells } from "@/data/spells";
import type { CompanionStatBlock } from "@/data/types";

// The pack's blocks gain their lifecycle in the pack's own change.
const srdSpells = spells.filter((s) => s.source === "SRD" && s.companion);
const srdFeatures = classFeatures.filter((f) => f.source === "SRD" && f.companion);

const forms = (block: CompanionStatBlock) => [block, ...(block.variants ?? [])];

describe("companion lifecycle", () => {
  it("every SRD companion block and form declares what ends it", () => {
    const missing = [...srdSpells, ...srdFeatures].flatMap((source) =>
      forms(source.companion as CompanionStatBlock)
        .filter((form) => !form.lifecycle)
        .map((form) => `${source.id}${form.variantId ? `:${form.variantId}` : ""}`)
    );
    expect(missing).toEqual([]);
  });

  it("a creature ends with Concentration exactly when its spell needs it", () => {
    const mismatched = srdSpells.flatMap((spell) =>
      forms(spell.companion as CompanionStatBlock)
        .filter(
          (form) =>
            (form.lifecycle?.endsOn.includes("concentration") ?? false) !==
            spell.concentration
        )
        .map(() => spell.id)
    );
    expect(mismatched).toEqual([]);
  });

  it("a timer from a feature says how long; a revive needs a body", () => {
    for (const feature of classFeatures.filter((f) => f.companion)) {
      for (const form of forms(feature.companion as CompanionStatBlock)) {
        const life = form.lifecycle;
        if (life?.endsOn.includes("timer")) expect(life.timerMinutes).toBeGreaterThan(0);
        if (life?.revive) expect(life.endsOn).toContain("0-hp:dies");
      }
    }
  });
});
