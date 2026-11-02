/**
 * Which Scontro buttons a member sees (owner's combat lifecycle, 2026-10-23): a fight
 * started by a roll is everyone's to pass, step back and end; a fight the DM started by
 * hand (no clock) keeps passing to the DM or whoever's turn it is. Anyone with a
 * character who hasn't rolled may roll in. «Riapri» only for a just-ended fight while
 * none runs. The engine's reason to end is offered, never applied silently.
 */
import { describe, expect, it } from "vitest";

import { fightControls } from "@/domains/combat/fight-controls";
import type { EncounterState } from "@/types/campaign";

const HOUR = 60 * 60 * 1000;
const fight = (extra: Partial<EncounterState> = {}) =>
  ({
    combatants: [
      { id: "pc-u1", kind: "pc", memberUid: "u1", characterId: "c1" },
      {
        id: "m1",
        kind: "monster",
        name: "Raider",
        hp: { current: 5, max: 11, temp: 0 },
        conditions: [],
      },
    ],
    order: ["pc-u1", "m1"],
    currentCombatantId: "m1",
    round: 1,
    epoch: 1,
    clock: { startedAt: 0, lastActivityAt: 0, turnStartedAt: 0, turnsBegun: true },
    ...extra,
  }) as unknown as EncounterState;
const me = { uid: "u2", isDm: false, hasCharacter: true, rolled: false, missing: 2 };

describe("fightControls", () => {
  it("no fight: roll to start it, reopen only when one just ended", () => {
    expect(fightControls(null, null, me, 0)).toMatchObject({
      roll: true,
      pass: false,
      reopen: false,
    });
    expect(fightControls(null, fight(), me, 0)).toMatchObject({ reopen: true });
    expect(fightControls(null, null, { ...me, hasCharacter: false }, 0).roll).toBe(false);
  });

  it("a fight started by a roll: anyone passes, steps back and ends it", () => {
    expect(fightControls(fight(), null, me, 0)).toMatchObject({
      pass: true,
      back: true,
      end: true,
      reopen: false,
    });
  });

  it("a fight the DM started by hand: passing stays with the DM or whoever's turn it is", () => {
    const manual = fight({ clock: undefined });
    expect(fightControls(manual, null, me, 0)).toMatchObject({
      pass: false,
      back: false,
    });
    expect(fightControls(manual, null, { ...me, isDm: true }, 0)).toMatchObject({
      pass: true,
      back: true,
    });
    expect(
      fightControls({ ...manual, currentCombatantId: "pc-u2" }, null, me, 0).pass
    ).toBe(true);
  });

  it("whoever hasn't rolled may still roll in; whoever has, may not again", () => {
    expect(fightControls(fight(), null, me, 0).roll).toBe(true);
    expect(fightControls(fight(), null, { ...me, rolled: true }, 0).roll).toBe(false);
  });

  it("offers the engine's reason to end, without ending", () => {
    expect(fightControls(fight(), null, me, 0).suggestEnd).toBeNull();
    expect(fightControls(fight(), null, me, 2 * HOUR).suggestEnd).toBe("idle");
    const won = fight({
      combatants: [
        {
          id: "m1",
          kind: "monster",
          hp: { current: 0, max: 11, temp: 0 },
          conditions: [],
        },
      ] as never,
    });
    expect(fightControls(won, null, me, 0).suggestEnd).toBe("enemies-defeated");
  });

  it("«Tira per chi manca» is the DM's, only while someone hasn't rolled, fight or not", () => {
    const dm = { ...me, isDm: true, hasCharacter: false };
    expect(fightControls(fight(), null, dm, 0).rollMissing).toBe(true);
    expect(fightControls(null, null, dm, 0).rollMissing).toBe(true);
    expect(fightControls(fight(), null, { ...dm, missing: 0 }, 0).rollMissing).toBe(
      false
    );
    expect(fightControls(fight(), null, me, 0).rollMissing).toBe(false);
  });
});
