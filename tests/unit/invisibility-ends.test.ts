/**
 * Invisibility (SRD 5.2.1): "The spell ends early immediately after the target makes
 * an attack roll, deals damage, or casts a spell." Cast on yourself, the attack, the
 * spell or the damage ends it: Invisible goes, and with the spell its Concentration.
 * Live before this: nothing ended it (the spell's state declared no end on an act).
 */
import { describe, expect, it } from "vitest";

import { concentrationValue } from "@/lib/concentration";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { MOCK_CHARACTER } from "@/lib/mock";
import { endStatesOnAct } from "@/lib/play/states";
import type { CharacterDoc } from "@/types/character";

const invisible = (): CharacterDoc => ({
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    spells: [{ srdId: "invisibility", prepared: true }],
  },
  session: {
    ...MOCK_CHARACTER.session,
    concentration: concentrationValue("invisibility"),
    activeFeatures: ["spell-invisibility"],
    conditions: ["invisible"],
    effectTimers: {},
  },
});

describe("Invisibility on yourself ends on your attack, spell or damage", () => {
  for (const act of ["attack-roll", "cast-spell", "deal-damage"] as const) {
    it(`a ${act} ends it`, () => {
      const ended = endStatesOnAct(invisible(), act);
      expect(ended?.ended).toContain("spell-invisibility");
      const session = ended?.session;
      expect(session?.activeFeatures ?? []).not.toContain("spell-invisibility");
      expect(session && effectiveSessionConditions(session)).not.toContain("invisible");
      expect(session?.concentration).toBe("");
    });
  }

  it("moving or talking does not", () => {
    expect(endStatesOnAct(invisible(), "loud-noise")).toBeNull();
  });
});
