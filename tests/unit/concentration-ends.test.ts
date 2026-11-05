/**
 * A state whose arrival ends its target's Concentration (`ends-concentration`, a spell
 * whose failed save breaks it): which of the effects a tray writes carry it, and whose
 * Concentration that ends — mine on my sheet, another PC's through its spends ledger,
 * a monster's by revoking the effects it holds by Concentration. The catalogue spell
 * here is a stand-in: the public SRD has none.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/spells", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/data/spells")>();
  const tune = {
    id: "test-tune",
    grants: [
      {
        type: "while-active",
        activeKey: "spell-test-tune",
        recipient: "selected",
        grants: [
          { type: "disadvantage-on", rollType: "save", vs: "concentration-con-save" },
          { type: "ends-concentration" },
        ],
      },
    ],
  };
  return {
    ...real,
    getSpellById: (id: string) => (id === "test-tune" ? tune : real.getSpellById(id)),
  };
});

import {
  concentrationBreaks,
  effectEndsConcentration,
} from "@/lib/play/concentration-ends";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
} from "@/types/combat-effect";

const me: CombatantRef = {
  kind: "pc",
  combatantId: "pc-me",
  memberUid: "me",
  characterId: "c-me",
};
const bren: CombatantRef = {
  kind: "pc",
  combatantId: "pc-bren",
  memberUid: "bren",
  characterId: "c-bren",
};
const ogre: CombatantRef = { kind: "monster", combatantId: "m-ogre" };

const state = (target: CombatantRef, spell = "test-tune"): ActiveCombatEffect => ({
  id: `fx-${target.combatantId}-${spell}`,
  actor: me,
  target,
  source: { kind: "spell", id: spell, actionId: "cast" },
  payload: { kind: "grant-group", activeKey: `spell-${spell}` },
  duration: { kind: "concentration", actorId: "pc-me", sourceId: spell },
});

describe("which states end Concentration", () => {
  it("one whose catalogue group carries ends-concentration; Bane's doesn't", () => {
    expect(effectEndsConcentration(state(ogre))).toBe(true);
    expect(effectEndsConcentration(state(ogre, "bane"))).toBe(false);
  });
});

describe("whose Concentration a tray's states end", () => {
  // The Ogre holds Hold Person on Bren by Concentration.
  const held: CombatEffectOp = {
    id: "op-hold",
    kind: "apply",
    effect: {
      id: "fx-hold",
      actor: ogre,
      target: bren,
      source: { kind: "spell", id: "hold-person", actionId: "m-cast" },
      payload: { kind: "condition", conditionId: "paralyzed" },
      duration: { kind: "concentration", actorId: "m-ogre", sourceId: "hold-person" },
    },
  };

  it("mine, Bren's and the Ogre's: the Ogre's held effects are revoked", () => {
    expect(
      concentrationBreaks([state(me), state(bren), state(ogre)], [held], "pc-me")
    ).toEqual({ self: true, pcs: [bren], monsterEffectIds: ["fx-hold"] });
  });

  it("a state that doesn't end it ends nothing", () => {
    expect(concentrationBreaks([state(ogre, "bane")], [held], "pc-me")).toEqual({
      self: false,
      pcs: [],
      monsterEffectIds: [],
    });
  });
});
