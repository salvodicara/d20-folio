/**
 * Fight markers from every device in the fight, not only the DM's open campaign page
 * (T6): a player's device writes the fight's start, its rounds and its end, never the
 * DM's beats and never a correction. The ids are the DM mirror's own, so two devices
 * writing the same marker leave one line. A device joining mid-fight writes the missing
 * markers in order (start, then each round), one after the other.
 */
import { describe, expect, it } from "vitest";

import {
  createEncounterMirror,
  createMemorySessionLogStore,
  foldSession,
  loggedIds,
  mirrorEncounter,
} from "@/lib/session-log";
import type { LogItem } from "@/lib/session-log";
import type { EncounterState } from "@/types/campaign";
import type { CombatChronicleEvent } from "@/types/combat-chronicle";

const DM = "dm";

function fight(round: number, events: CombatChronicleEvent[] = []): EncounterState {
  return {
    combatants: [
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 10,
        conditions: [],
        hp: { current: 7, temp: 0, max: 7 },
      },
    ],
    nextMonsterOrdinal: 2,
    round,
    currentCombatantId: null,
    epoch: 77,
    status: "active",
    events,
  };
}

const hit: CombatChronicleEvent = {
  id: "0",
  round: 1,
  kind: "hp-damage",
  targetId: "monster-1",
  amount: 9,
  current: 2,
  max: 11,
};

const markerIds = (encounter: EncounterState | null, log: LogItem[] = []) =>
  mirrorEncounter(encounter, foldSession(log, { dmUid: DM }), loggedIds(log), {
    markersOnly: true,
  }).map((d) => d.id);

describe("fight markers from a player's device", () => {
  it("writes the start and the rounds, never the DM's beats", () => {
    expect(markerIds(fight(2, [hit]))).toEqual([
      "enc:77:start",
      "enc:77:round:1",
      "enc:77:round:2",
    ]);
  });

  it("writes the end of a fight that is over, and nothing the DM already wrote", () => {
    const log: LogItem[] = ["enc:77:start", "enc:77:round:1"].map((id, at) => ({
      type: "event",
      id,
      by: DM,
      at,
      event:
        id === "enc:77:start"
          ? {
              kind: "encounter-start",
              encounterId: "77",
              names: { "monster-1": "Goblin" },
            }
          : { kind: "round-start", round: 1 },
    }));
    expect(markerIds(fight(1), log)).toEqual([]);
    expect(markerIds(null, log)).toEqual(["enc:77:end"]);
  });

  it("never corrects the DM's start line (only its author may)", () => {
    const log: LogItem[] = [
      {
        type: "event",
        id: "enc:77:start",
        by: DM,
        at: 0,
        event: { kind: "encounter-start", encounterId: "77" },
      },
    ];
    // The live fight names a monster the logged start does not: the DM's mirror would
    // correct it; a player's markers do not.
    expect(markerIds(fight(1), log)).toEqual(["enc:77:round:1"]);
  });

  it("two devices writing the same markers leave one line each", async () => {
    const store = createMemorySessionLogStore();
    const at = () => new Date(2026, 10, 24, 21);
    const devices = ["ana", "ben"].map((uid) =>
      createEncounterMirror({ store, uid, dmUid: DM, now: at, markersOnly: true })
    );
    for (const device of devices) device.update(fight(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const lines = foldSession(store.items("2026-11-24"), { dmUid: DM });
    expect(lines.map((e) => e.id)).toEqual([
      "enc:77:start",
      "enc:77:round:1",
      "enc:77:round:2",
    ]);
    for (const device of devices) device.stop();
  });

  it("a device joining mid-fight writes the missing markers in order, one after the other", async () => {
    const order: string[] = [];
    const memory = createMemorySessionLogStore();
    // Appends that settle in reverse order: only one-at-a-time sending keeps the order.
    let delay = 30;
    const store = {
      ...memory,
      append: (sessionId: string, item: LogItem) =>
        new Promise<void>((resolve) => {
          const wait = (delay = Math.max(1, delay - 10));
          setTimeout(() => {
            order.push(item.id);
            void memory.append(sessionId, item).then(resolve);
          }, wait);
        }),
    };
    const device = createEncounterMirror({
      store,
      uid: "ana",
      dmUid: DM,
      now: () => new Date(2026, 10, 24, 21),
      markersOnly: true,
    });
    device.update(fight(3));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(order).toEqual([
      "enc:77:start",
      "enc:77:round:1",
      "enc:77:round:2",
      "enc:77:round:3",
    ]);
    device.stop();
  });
});
