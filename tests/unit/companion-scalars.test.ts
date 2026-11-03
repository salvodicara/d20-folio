/** Companion AC, HP and speeds resolve through the shared Scalar language (edge-case M6). */
import { describe, expect, it } from "vitest";
import { DRACONIC_SPIRIT, OTHERWORLDLY_STEED } from "@/data/spells/companions";
import { resolveCompanion } from "@/lib/compute";
import { SCALAR_BINDINGS } from "@/lib/scalar";
import type { CompanionStatBlock } from "@/data/types";

const SCORES = { STR: 10, DEX: 10, CON: 10, INT: 18, WIS: 10, CHA: 10 };
const atSlot = (block: CompanionStatBlock, castLevel?: number) =>
  resolveCompanion(
    block,
    7,
    SCORES,
    null,
    5,
    castLevel === undefined ? {} : { castLevel }
  );

describe("companion Scalars", () => {
  it("Otherworldly Steed: AC 10 + level, HP 5 + 10 × level, Fly 60 ft. from a 4th-level slot", () => {
    expect(atSlot(OTHERWORLDLY_STEED)).toMatchObject({ ac: 12, hpMax: 25 });
    expect(atSlot(OTHERWORLDLY_STEED, 3).speeds).toEqual({ walk: 60 });
    expect(atSlot(OTHERWORLDLY_STEED, 4)).toMatchObject({
      ac: 14,
      hpMax: 45,
      speeds: { walk: 60, fly: 60 },
    });
  });

  it("a slot below the spell's level resolves at the spell's own level", () => {
    expect(atSlot(DRACONIC_SPIRIT, 3)).toMatchObject({ ac: 19, hpMax: 50 });
    expect(atSlot(DRACONIC_SPIRIT, 7)).toMatchObject({ ac: 21, hpMax: 70 });
  });

  it("a block's Scalar can read the owner's level in the feature and modifiers", () => {
    // Steel Defender: AC 12 + INT, HP 5 + 5 × Artificer level.
    const block: CompanionStatBlock = {
      ac: {
        base: {
          kind: "add",
          terms: [
            { kind: "fixed", value: 12 },
            { kind: "binding", bindingId: SCALAR_BINDINGS.abilityModifier("INT") },
          ],
        },
      },
      hp: {
        base: {
          kind: "add",
          terms: [
            { kind: "fixed", value: 5 },
            {
              kind: "multiply",
              factors: [
                { kind: "fixed", value: 5 },
                { kind: "binding", bindingId: SCALAR_BINDINGS.featureLevel },
              ],
            },
          ],
        },
        perLevel: 0,
      },
    };
    expect(resolveCompanion(block, 5, SCORES)).toMatchObject({ ac: 16, hpMax: 30 });
  });
});
