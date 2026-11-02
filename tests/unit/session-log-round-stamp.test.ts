import { describe, expect, it } from "vitest";

import { seenRound, type GlobalCombat } from "@/features/campaigns/global-combat-context";

import {
  buildReport,
  createMemorySessionLogStore,
  createSessionRecorder,
  foldSession,
} from "@/lib/session-log";
import type { LogItem, PlayEvent, SeenRound } from "@/lib/session-log";

import * as v025 from "./__fixtures__/session-log-v0.25.0-reader";

const DM = "dm-uid";
let clock = 0;
const line = (id: string, by: string, event: PlayEvent, seen?: SeenRound): LogItem => ({
  type: "event",
  id,
  by,
  at: ++clock,
  event,
  ...(seen ? { seen } : {}),
});

/** The Cragmaw shape: the DM's page marks round 1 and 2, then the DM is away while the
 *  fight reaches round 3. Ana's sheet keeps writing, stamped with the round it saw. On
 *  return, the DM's mirror catches up with round 2's beats and the round 3 marker. */
const away: LogItem[] = [
  line("start", DM, { kind: "encounter-start", encounterId: "7" }),
  line("r1", DM, { kind: "round-start", round: 1 }),
  line(
    "a1",
    "ana",
    { kind: "damage", amount: 4, actor: "pc-ana" },
    { encounterId: "7", round: 1 }
  ),
  line("r2", DM, { kind: "round-start", round: 2 }),
  line(
    "a2",
    "ana",
    { kind: "damage", amount: 6, actor: "pc-ana" },
    { encounterId: "7", round: 2 }
  ),
  line(
    "a3",
    "ana",
    { kind: "heal", amount: 5, actor: "pc-ana" },
    { encounterId: "7", round: 3 }
  ),
  line("m2", DM, { kind: "damage", amount: 3, target: "pc-ana" }),
  line("r3", DM, { kind: "round-start", round: 3 }),
  line("m3", DM, { kind: "down", target: "monster-1" }),
];

const rounds = (entries: ReturnType<typeof foldSession>) =>
  Object.fromEntries(entries.map((e) => [e.id, e.round ?? null]));

describe("a line stamped with the round its device saw", () => {
  it("lands in that round even when the round's marker was written later", () => {
    expect(rounds(foldSession(away, { dmUid: DM }))).toMatchObject({
      a1: 1,
      a2: 2,
      a3: 3,
      m2: 2,
      m3: 3,
    });
  });

  it("is placed by position when the stamp names another encounter", () => {
    const log = [
      ...away.slice(0, 3),
      line("x", "ana", { kind: "heal", amount: 1 }, { encounterId: "6", round: 9 }),
    ];
    expect(rounds(foldSession(log, { dmUid: DM })).x).toBe(1);
  });

  it("follows the DM's move instead of its stamp", () => {
    const log: LogItem[] = [
      ...away,
      { type: "move", id: "mv", by: DM, at: ++clock, target: "a3", after: "a1" },
    ];
    expect(rounds(foldSession(log, { dmUid: DM })).a3).toBe(1);
  });
});

describe("the report of a caught-up fight", () => {
  it("shows each round once, in order, with every line of that round", () => {
    const [fight] = buildReport(foldSession(away, { dmUid: DM }));
    expect(fight?.kind).toBe("encounter");
    if (fight?.kind !== "encounter") return;
    expect(fight.rounds.map((r) => [r.round, r.entries.map((e) => e.id)])).toEqual([
      [1, ["a1"]],
      [2, ["a2", "m2"]],
      [3, ["a3", "m3"]],
    ]);
  });
});

describe("the report of a fight the DM's page left in round 1", () => {
  it("still lists the rounds in order when a later round's line comes first", () => {
    const log = [
      ...away.slice(0, 2),
      line("late", "ana", { kind: "heal", amount: 2 }, { encounterId: "7", round: 3 }),
      line("b1", DM, { kind: "damage", amount: 1, target: "pc-ana" }),
      line("r2b", DM, { kind: "round-start", round: 2 }),
      line("b2", DM, { kind: "damage", amount: 2, target: "pc-ana" }),
    ];
    const [fight] = buildReport(foldSession(log, { dmUid: DM }));
    if (fight?.kind !== "encounter") throw new Error("expected the fight");
    expect(fight.rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  });
});

describe("the recorder", () => {
  it("stamps a recorded event with the fight its device sees, and nothing else", async () => {
    const store = createMemorySessionLogStore();
    let seen: SeenRound | undefined = { encounterId: "7", round: 2 };
    const recorder = createSessionRecorder({
      store,
      uid: "ana",
      now: () => new Date(2026, 10, 2, 21),
      seen: () => seen,
    });
    const id = await recorder.record({ kind: "heal", amount: 2 });
    await recorder.correct(id, { kind: "heal", amount: 3 });
    seen = undefined;
    await recorder.record({ kind: "heal", amount: 1 });
    const items = store.items("2026-11-02");
    expect(items.map((item) => ("seen" in item ? item.seen : null))).toEqual([
      { encounterId: "7", round: 2 },
      null,
      null,
    ]);
  });
});

describe("a v0.25.0 client reading a stamped line", () => {
  it("keeps the line and folds it exactly as the same line without the stamp", () => {
    const stamped = away.filter((item) => item.type === "event");
    const plain = stamped.map((item) => {
      const copy = { ...item };
      delete copy.seen;
      return copy;
    });
    expect(stamped.filter(v025.isLogItem)).toHaveLength(stamped.length);
    expect(v025.foldSession(stamped.filter(v025.isLogItem), { dmUid: DM })).toEqual(
      v025.foldSession(plain.filter(v025.isLogItem), { dmUid: DM })
    );
  });
});

describe("the round a sheet line is stamped with", () => {
  const status = {
    campaignId: "camp",
    characterId: "hero",
    round: 3,
    encounter: { epoch: 7 },
  } as unknown as GlobalCombat;

  it("is this character's fight in the line's campaign", () => {
    expect(seenRound(status, "camp", "hero")).toEqual({ encounterId: "7", round: 3 });
  });

  it("is none out of combat, in another campaign, or for another character", () => {
    expect(seenRound(null, "camp", "hero")).toBeUndefined();
    expect(seenRound(status, "other", "hero")).toBeUndefined();
    expect(seenRound(status, "camp", "sidekick")).toBeUndefined();
  });
});
