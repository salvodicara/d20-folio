/**
 * The Alert feat's Initiative Swap (2024) on the new fight screen: the DM swaps an Alert
 * hero's place in the order with a willing ally's, as the classic screen does. The ally
 * has rolled, is on the hero's side, and is not Incapacitated (nor under a condition that
 * includes it). The swap is one move; its undo puts the order and the record back.
 */
import { describe, expect, it } from "vitest";

import { alertSwapAllies, withSwappedInitiatives } from "@/domains/combat/alert-swap";
import { planAlertSwap, planAlertSwapUndo } from "@/features/campaigns/combat-lifecycle";
import { lifecycleOrdered } from "@/lib/play/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const row = (
  id: string,
  extra: Partial<{
    kind: "pc" | "monster";
    side: "ally" | "enemy";
    initiative: number | null;
    conditions: string[];
  }> = {}
) => ({
  id,
  kind: extra.kind ?? "pc",
  initiative: extra.initiative === undefined ? 10 : extra.initiative,
  conditions: extra.conditions ?? [],
  ...(extra.side ? { side: extra.side } : {}),
});

describe("the willing allies an Alert hero may swap with", () => {
  it("rolled allies on the hero's side, never Incapacitated", () => {
    const rows = [
      row("pc-ana"),
      row("pc-bo"),
      row("pc-cy", { initiative: null }),
      row("pc-di", { conditions: ["unconscious"] }),
      row("pc-ed", { conditions: ["stunned"] }),
      row("monster-1", { kind: "monster" }),
      row("monster-2", { kind: "monster", side: "ally" }),
    ];
    expect(alertSwapAllies(rows, "pc-ana")).toEqual(["pc-bo", "monster-2"]);
  });
});

describe("the numbers the lines show after a swap", () => {
  it("each shows the other's Initiative, as the rule swaps them", () => {
    const rows = [
      row("pc-ana", { initiative: 25 }),
      row("pc-bo", { initiative: 18 }),
      row("monster-1", { kind: "monster", initiative: 15 }),
    ];
    const shown = withSwappedInitiatives(rows, [
      { sourceId: "pc-ana", targetId: "pc-bo" },
    ]);
    expect(shown.map((r) => [r.id, r.initiative])).toEqual([
      ["pc-ana", 18],
      ["pc-bo", 25],
      ["monster-1", 15],
    ]);
    expect(withSwappedInitiatives(rows, undefined)).toBe(rows);
  });
});

const fight = (): EncounterState =>
  ({
    combatants: [
      { kind: "pc", id: "pc-ana", memberUid: "ana", characterId: "c1" },
      { kind: "pc", id: "pc-bo", memberUid: "bo", characterId: "c2" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 15,
        initiative: 15,
        conditions: [],
        hp: { current: 7, temp: 0, max: 7 },
      },
    ],
    order: ["monster-1", "pc-bo", "pc-ana"],
    currentCombatantId: "monster-1",
    round: 1,
    nextMonsterOrdinal: 2,
    epoch: 3,
    status: "active",
  }) as unknown as EncounterState;

const table = (encounter: EncounterState) =>
  ({
    id: "camp",
    dmUid: "dm",
    memberDetails: {},
    encounterInit: {},
    encounter,
  }) as unknown as CampaignDoc;

describe("the DM's Alert swap", () => {
  it("trades the two places and records the swap; the undo puts both back", () => {
    const done = planAlertSwap(table(fight()), {
      uid: "dm",
      sourceId: "pc-ana",
      targetId: "pc-bo",
    });
    expect(done?.patch.encounter?.order).toEqual(["monster-1", "pc-ana", "pc-bo"]);
    expect(done?.patch.encounter?.initiativeSwaps).toEqual([
      { sourceId: "pc-ana", targetId: "pc-bo" },
    ]);
    const undone = planAlertSwapUndo(table(done?.patch.encounter ?? fight()), {
      uid: "dm",
      sourceId: "pc-ana",
      targetId: "pc-bo",
    });
    expect(undone?.encounter?.order).toEqual(["monster-1", "pc-bo", "pc-ana"]);
    expect(undone?.encounter?.initiativeSwaps).toBeUndefined();
  });

  it("the turn stays on its place: the one who now holds it has it", () => {
    const held = { ...fight(), currentCombatantId: "pc-bo" } as EncounterState;
    const done = planAlertSwap(table(held), {
      uid: "dm",
      sourceId: "pc-ana",
      targetId: "pc-bo",
    });
    expect(done?.patch.encounter?.currentCombatantId).toBe("pc-ana");
    const undone = planAlertSwapUndo(table(done?.patch.encounter ?? held), {
      uid: "dm",
      sourceId: "pc-ana",
      targetId: "pc-bo",
    });
    expect(undone?.encounter?.currentCombatantId).toBe("pc-bo");
  });

  it("a roll after the swap, before turns begin, keeps it", () => {
    const before = {
      ...fight(),
      clock: { startedAt: 0, lastActivityAt: 0, turnStartedAt: 0, turnsBegun: false },
    } as EncounterState;
    const done = planAlertSwap(table(before), {
      uid: "dm",
      sourceId: "pc-ana",
      targetId: "pc-bo",
    });
    const swapped = done?.patch.encounter ?? before;
    // Every roll re-sorts the order before turns begin: ana 9, bo 12, the goblin 15.
    const resorted = lifecycleOrdered({
      ...swapped,
      initiatives: { "pc-ana": 9, "pc-bo": 12 },
    });
    expect(resorted.order).toEqual(["monster-1", "pc-ana", "pc-bo"]);
  });

  it("only the DM, only a hero, never with an enemy", () => {
    expect(
      planAlertSwap(table(fight()), { uid: "ana", sourceId: "pc-ana", targetId: "pc-bo" })
    ).toBeNull();
    expect(
      planAlertSwap(table(fight()), {
        uid: "dm",
        sourceId: "monster-1",
        targetId: "pc-bo",
      })
    ).toBeNull();
    expect(
      planAlertSwap(table(fight()), {
        uid: "dm",
        sourceId: "pc-ana",
        targetId: "monster-1",
      })
    ).toBeNull();
  });
});
