/**
 * Hex and Hunter's Mark move on (edge-case M8): when the marked creature drops to
 * 0 HP, the caster is offered the move-the-mark Bonus Action. The offer carries the
 * move's slot, so a move that takes no action (Vow of Enmity) says so.
 */
import { describe, expect, it } from "vitest";
import { markDropOffers } from "@/lib/play/mark-offers";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const ME = "pc-me";

function hexOn(target: string, actor = ME): CombatEffectOp {
  const effect: ActiveCombatEffect = {
    id: `hex-${target}`,
    actor: { kind: "pc", combatantId: actor, memberUid: "me" },
    target: { kind: "monster", combatantId: target },
    source: { kind: "spell", id: "hex", actionId: "spell-hex" },
    payload: { kind: "target-mark", activeKey: "spell-hex", scope: "cursed" },
    duration: { kind: "encounter" },
  } as ActiveCombatEffect;
  return { id: `op-${target}-${actor}`, kind: "apply", effect };
}

const warlock = (lit: boolean): CharacterDoc =>
  makeCharacterDoc(
    { classId: "warlock", level: 5, spells: [{ srdId: "hex", prepared: true }] as never },
    lit ? ({ activeFeatures: ["spell-hex"], concentration: "hex" } as never) : {}
  );

const rows = (hp: Record<string, number>) =>
  Object.entries(hp).map(([id, currentHp]) => ({ id, currentHp }));

describe("move-the-mark offers", () => {
  it("the cursed creature dropping to 0 offers the move", () => {
    const offers = markDropOffers(
      warlock(true),
      rows({ "monster-1": 5, "monster-2": 9 }),
      rows({ "monster-1": 0, "monster-2": 9 }),
      [hexOn("monster-1")],
      ME
    );
    expect(offers).toEqual([
      {
        sourceId: "hex",
        sourceKind: "spell",
        actionId: "move-mark",
        slot: "bonus",
        targetId: "monster-1",
      },
    ]);
  });

  it("nothing for another creature, another caster's mark, a reload or an unlit spell", () => {
    const ops = [hexOn("monster-1")];
    const drop = [
      rows({ "monster-1": 5, "monster-2": 4 }),
      rows({ "monster-1": 5, "monster-2": 0 }),
    ] as const;
    expect(markDropOffers(warlock(true), ...drop, ops, ME)).toEqual([]);
    expect(
      markDropOffers(
        warlock(true),
        rows({ "monster-1": 5 }),
        rows({ "monster-1": 0 }),
        [hexOn("monster-1", "pc-other")],
        ME
      )
    ).toEqual([]);
    expect(
      markDropOffers(warlock(true), null, rows({ "monster-1": 0 }), ops, ME)
    ).toEqual([]);
    expect(
      markDropOffers(
        warlock(false),
        rows({ "monster-1": 5 }),
        rows({ "monster-1": 0 }),
        ops,
        ME
      )
    ).toEqual([]);
  });
});
