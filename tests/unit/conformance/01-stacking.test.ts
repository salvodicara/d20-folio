/** Conformance, category 1: stacking and ordering (corpus.md § 1). */
import { describe, expect } from "vitest";
import { netRollState } from "@/lib/condition-effects";
import { gainTempHp } from "@/lib/play/vitals";
import { MOCK_CHARACTER } from "@/lib/mock";
import { rule } from "./rule";

describe("conformance · 1. stacking and ordering", () => {
  rule(
    {
      category: 1,
      case: "Advantage/disadvantage cancel regardless of count",
      source: "GLOSS",
      status: "works",
    },
    () => {
      // Three sources of Advantage and one of Disadvantage: a straight roll.
      const adv = [true, true, true].some(Boolean);
      const dis = [true].some(Boolean);
      expect(netRollState(adv, dis)).toBe("none");
      expect(netRollState(true, false)).toBe("advantage");
    }
  );

  rule(
    { category: 1, case: "Temp HP never add together", source: "GLOSS", status: "works" },
    () => {
      const doc = {
        ...MOCK_CHARACTER,
        session: {
          ...MOCK_CHARACTER.session,
          hp: { ...MOCK_CHARACTER.session.hp, temp: 8 },
        },
      };
      // A smaller new grant changes nothing; a larger one replaces, never adds.
      expect(gainTempHp(doc, 5)).toBeNull();
      expect(gainTempHp(doc, 10)?.hp.temp).toBe(10);
    }
  );
});
