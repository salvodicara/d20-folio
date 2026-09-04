/**
 * Compaction: the pure half of the shared-encounter budget (design §5.3).
 *
 * The load-bearing proof is fold equality — a compacted document folds to exactly the state the
 * uncompacted one folds to — plus the grace window, which keeps the newest actions in the log so
 * a client that is still catching up never loses the actions it has not folded yet.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import {
  CHECKPOINT_GRACE_MS,
  COMPACT_ACTIONS,
  COMPACT_BYTES,
  checkpointThrough,
  compact,
  encounterBytes,
  shouldCompact,
} from "@/lib/combat/checkpoint";
import { fold } from "@/lib/combat/fold";
import { sortBySeq, type Seq } from "@/lib/combat/ids";
import type { Action, Encounter, IntentAction, Relation } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import {
  emptyState,
  nextActionId,
  openingActions,
  seqFactory,
  tableAction,
} from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

/** `checkpointThrough` with the caller's clock reading the newest stamp — the ordinary case,
 *  where the window's upper bound `min(newest.seq.ms, nowMs)` IS the newest stamp. The skew
 *  case below passes `nowMs` explicitly. */
function throughNow(
  encounter: Encounter,
  graceMs: number = CHECKPOINT_GRACE_MS
): Seq | null {
  const sorted = sortBySeq(encounter.log);
  const newest = sorted[sorted.length - 1];
  return checkpointThrough(encounter, graceMs, newest?.seq.ms ?? 0);
}

/** `items[index]`, asserted present (test-only invariant). */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an element at index ${index}`);
  return item;
}

interface Replay {
  readonly dm: string;
  readonly entities: readonly Parameters<typeof testEntity>[0][];
  readonly initiative: Readonly<Record<string, number>>;
  readonly order: readonly string[];
  readonly log: readonly (Omit<Action, "seq"> & { readonly by: string })[];
}

/** The `sara-ogre-ambush` story as ONE self-contained log (opening actions included), so the
 *  whole encounter folds from `initialState()` — the state `compact` folds a head on. */
function replayEncounter(file: string): Encounter {
  const replay = JSON.parse(
    readFileSync(join(__dirname, "replays", file), "utf8")
  ) as Replay;
  const seq = seqFactory(replay.dm);
  const opening = openingActions(
    replay.dm,
    seq,
    replay.entities.map((entity) => testEntity(entity)),
    replay.initiative,
    replay.order
  );
  const log: Action[] = [
    ...opening,
    ...replay.log.map(
      (entry, index): Action =>
        ({ ...entry, seq: { ms: 5_000 + index, counter: 0, by: entry.by } }) as Action
    ),
  ];
  return {
    schema: 1,
    id: file,
    host: { kind: "campaign", campaignId: "replay" },
    log,
    checkpoint: null,
  };
}

/** A log of `count` `end-turn` no-ops stamped `startMs, startMs + stepMs, …`. */
function timedEncounter(count: number, stepMs: number, startMs = 0): Encounter {
  const log: Action[] = [];
  for (let index = 0; index < count; index += 1) {
    log.push(
      tableAction(
        "dm",
        { ms: startMs + index * stepMs, counter: 0, by: "dm" },
        {
          op: "end-turn",
        }
      )
    );
  }
  return {
    schema: 1,
    id: "timed",
    host: { kind: "campaign", campaignId: "camp" },
    log,
    checkpoint: null,
  };
}

describe("combat/checkpoint — budget", () => {
  it("exposes the design's compaction budget", () => {
    expect(COMPACT_ACTIONS).toBe(200);
    expect(COMPACT_BYTES).toBe(512 * 1024);
    expect(CHECKPOINT_GRACE_MS).toBe(5 * 60_000);
  });

  it("measures the encoded document, not the in-memory object", () => {
    const encounter = timedEncounter(3, 1_000);
    expect(encounterBytes(encounter)).toBeGreaterThan(0);
    expect(encounterBytes(timedEncounter(30, 1_000))).toBeGreaterThan(
      encounterBytes(encounter)
    );
  });

  it("compacts past 200 actions or past 512 KiB, never before", () => {
    expect(shouldCompact(timedEncounter(200, 1_000))).toBe(false);
    expect(shouldCompact(timedEncounter(201, 1_000))).toBe(true);
    // Under the action ceiling but over the byte ceiling: one fat unknown key.
    const fat: Encounter = {
      ...timedEncounter(3, 1_000),
      unknown: { blob: "x".repeat(COMPACT_BYTES + 1) },
    };
    expect(fat.log.length).toBeLessThan(COMPACT_ACTIONS);
    expect(shouldCompact(fat)).toBe(true);
  });
});

describe("combat/checkpoint — the grace window", () => {
  it("picks the newest action outside the grace window", () => {
    // ms 0, 100_000, 200_000, 300_000 with a 5-minute grace: only ms 0 is old enough.
    const encounter = timedEncounter(4, 100_000);
    expect(throughNow(encounter)).toEqual({ ms: 0, counter: 0, by: "dm" });
  });

  it("returns null when every action is inside the window", () => {
    expect(throughNow(timedEncounter(5, 1_000))).toBeNull();
    expect(throughNow(timedEncounter(0, 1_000))).toBeNull();
  });

  it("honours a caller-supplied grace", () => {
    const encounter = timedEncounter(4, 100_000);
    expect(throughNow(encounter, 50_000)).toEqual({
      ms: 200_000,
      counter: 0,
      by: "dm",
    });
    expect(throughNow(encounter, 0)).toEqual({
      ms: 300_000,
      counter: 0,
      by: "dm",
    });
  });

  it("breaks a tie on the cutoff millisecond by counter, then by author", () => {
    // Three actions share ms === cutoff; `compareSeq` orders them counter-then-`by`, so the
    // LAST of the three is the one compaction may safely swallow.
    const cutoff = 0;
    const contenders: Seq[] = [
      { ms: cutoff, counter: 0, by: "zoe" },
      { ms: cutoff, counter: 1, by: "amy" },
      { ms: cutoff, counter: 1, by: "bob" },
    ];
    const encounter: Encounter = {
      schema: 1,
      id: "ties",
      host: { kind: "campaign", campaignId: "camp" },
      log: [
        ...contenders.map((seq) => tableAction(seq.by, seq, { op: "end-turn" })),
        tableAction("dm", { ms: 300_000, counter: 0, by: "dm" }, { op: "end-turn" }),
      ],
      checkpoint: null,
    };
    expect(throughNow(encounter)).toEqual({ ms: cutoff, counter: 1, by: "bob" });
  });

  it("a newest action from a clock skewed forward cannot collapse the window", () => {
    // One member's device is a couple of hours fast, so its append stamps ms 10_000_000.
    // Measured off `newest.seq.ms` alone the cutoff would be 9_700_000 — every other
    // action in the log, plus anything a peer has queued but not yet landed. Bounded by
    // the caller's own clock (1_300_000) the cutoff is 1_000_000, exactly as if the
    // skewed stamp had never arrived.
    const encounter: Encounter = {
      schema: 1,
      id: "skew",
      host: { kind: "campaign", campaignId: "camp" },
      log: [
        tableAction("dm", { ms: 1_000_000, counter: 0, by: "dm" }, { op: "end-turn" }),
        tableAction("dm", { ms: 1_200_000, counter: 0, by: "dm" }, { op: "end-turn" }),
        tableAction(
          "fast",
          { ms: 10_000_000, counter: 0, by: "fast" },
          { op: "end-turn" }
        ),
      ],
      checkpoint: null,
    };
    expect(checkpointThrough(encounter, CHECKPOINT_GRACE_MS, 1_300_000)).toEqual({
      ms: 1_000_000,
      counter: 0,
      by: "dm",
    });
  });

  it("never proposes a seq at or before the current checkpoint", () => {
    const base = timedEncounter(4, 100_000);
    const through: Seq = { ms: 0, counter: 0, by: "dm" };
    const already: Encounter = {
      ...base,
      checkpoint: { through, state: emptyState() },
    };
    // ms 0 is already covered and the rest are inside the window → nothing to do.
    expect(throughNow(already)).toBeNull();
    // With a shorter grace the next candidate is the first action AFTER the checkpoint.
    expect(throughNow(already, 150_000)).toEqual({
      ms: 100_000,
      counter: 0,
      by: "dm",
    });
  });
});

/** A two-creature table plus whatever the caller appends, as ONE self-contained log. */
function tableEncounter(extra: (stamp: (ms: number) => Seq) => Action[]): Encounter {
  const opening = openingActions(
    "dm",
    seqFactory("dm", 1_000),
    [
      testEntity({ id: "sara", kind: "pc", controllerUid: "p1" }),
      testEntity({ id: "ogre" }),
    ],
    { sara: 20, ogre: 10 },
    ["sara", "ogre"]
  );
  const stamp = (ms: number): Seq => ({ ms, counter: 0, by: "dm" });
  return {
    schema: 1,
    id: "table",
    host: { kind: "campaign", campaignId: "camp" },
    log: [...opening, ...extra(stamp)],
    checkpoint: null,
  };
}

function undoAction(seq: Seq, of: string): Action {
  return { kind: "undo", id: nextActionId("u"), seq, by: "dm", of, reason: null };
}

describe("combat/checkpoint — compact", () => {
  const encounter = replayEncounter("sara-ogre-ambush.json");
  const sorted = sortBySeq(encounter.log);
  const middle = at(sorted, Math.floor(sorted.length / 2)).seq;

  it("folds to exactly the state the uncompacted document folds to", () => {
    const compacted = compact(encounter, catalogue, middle);
    const before = fold(encounter, catalogue);
    const after = fold(compacted, catalogue);
    expect(after.state).toEqual(before.state);
    expect(after.state.revision).toBe(before.state.revision);
  });

  it("keeps only the actions after `through` and records the checkpoint", () => {
    const compacted = compact(encounter, catalogue, middle);
    expect(compacted.checkpoint?.through).toEqual(middle);
    expect(compacted.log.length).toBeLessThan(encounter.log.length);
    expect(compacted.log.map((action) => action.id)).toEqual(
      sorted.slice(Math.floor(sorted.length / 2) + 1).map((action) => action.id)
    );
    expect(compacted.id).toBe(encounter.id);
    expect(compacted.host).toEqual(encounter.host);
  });

  it("is idempotent under a second compaction on top of the first", () => {
    const once = compact(encounter, catalogue, middle);
    const later = at(sortBySeq(once.log), 1).seq;
    const twice = compact(once, catalogue, later);
    expect(fold(twice, catalogue).state).toEqual(fold(encounter, catalogue).state);
    expect(twice.checkpoint?.through).toEqual(later);
  });
});

describe("combat/checkpoint — undo across the compaction boundary", () => {
  it("keeps an undo that lands AFTER `through` but targets an action before it", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 2_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const encounter = tableEncounter(() => [
      endTurn,
      undoAction({ ms: 2_001, counter: 0, by: "dm" }, endTurn.id),
    ]);
    const before = fold(encounter, catalogue);
    // Sanity: the undo really did negate the end-turn in the uncompacted fold.
    expect(before.state.clock.current).toBe("sara");

    const compacted = compact(encounter, catalogue, endTurn.seq);
    const after = fold(compacted, catalogue);
    expect(after.state).toEqual(before.state);
    expect(after.state.clock.current).toBe("sara");
    expect(after.state.revision).toBe(before.state.revision);
  });

  it("resolves an undo-of-undo whose members straddle `through`", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 2_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const undo = undoAction({ ms: 2_001, counter: 0, by: "dm" }, endTurn.id);
    const undoOfUndo = undoAction({ ms: 2_002, counter: 0, by: "dm" }, undo.id);
    const encounter = tableEncounter(() => [endTurn, undo, undoOfUndo]);
    const before = fold(encounter, catalogue);
    // The undo is itself undone, so the end-turn stands.
    expect(before.state.clock.current).toBe("ogre");

    // `through` between the undo and the undo-of-undo: the pair straddles the boundary.
    const compacted = compact(encounter, catalogue, undo.seq);
    expect(fold(compacted, catalogue).state).toEqual(before.state);
  });

  it("resolves an undo-of-undo entirely inside the head", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 2_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const undo = undoAction({ ms: 2_001, counter: 0, by: "dm" }, endTurn.id);
    const undoOfUndo = undoAction({ ms: 2_002, counter: 0, by: "dm" }, undo.id);
    const later = tableAction(
      "dm",
      { ms: 3_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const encounter = tableEncounter(() => [endTurn, undo, undoOfUndo, later]);
    const before = fold(encounter, catalogue);
    const compacted = compact(encounter, catalogue, undoOfUndo.seq);
    expect(fold(compacted, catalogue).state).toEqual(before.state);
    expect(fold(compacted, catalogue).state.clock.current).toBe("sara");
  });

  it("keeps an undo whose target is also inside the head (the already-correct case)", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 2_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const undo = undoAction({ ms: 2_001, counter: 0, by: "dm" }, endTurn.id);
    const later = tableAction(
      "dm",
      { ms: 3_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const encounter = tableEncounter(() => [endTurn, undo, later]);
    const before = fold(encounter, catalogue);
    const compacted = compact(encounter, catalogue, undo.seq);
    expect(compacted.log.map((action) => action.id)).toEqual([later.id]);
    expect(fold(compacted, catalogue).state).toEqual(before.state);
  });

  it("survives the boundary `checkpointThrough` itself picks for a crossing undo", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 1_000_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const encounter = tableEncounter(() => [
      endTurn,
      undoAction({ ms: 1_000_001, counter: 0, by: "dm" }, endTurn.id),
      tableAction("dm", { ms: 1_300_000, counter: 0, by: "dm" }, { op: "end-turn" }),
    ]);
    // Grace 5 min: cutoff = 1_300_000 - 300_000 = 1_000_000 — exactly the undo's TARGET.
    const through = throughNow(encounter);
    expect(through).toEqual(endTurn.seq);
    if (through === null) throw new Error("unreachable");
    expect(fold(compact(encounter, catalogue, through), catalogue).state).toEqual(
      fold(encounter, catalogue).state
    );
  });
});

describe("combat/checkpoint — bounded rolls (stage 6 §2 D8)", () => {
  const seq = seqFactory("dm", 100_000);
  const ranger = testEntity({
    id: "ranger",
    kind: "pc",
    controllerUid: "p1",
    hp: 20,
    ac: 15,
    abilities: { DEX: 3 },
    mechanics: ["srd:weapon:shortsword", "srd:spell:shield"],
    resources: { "slot-1": { current: 2, max: 2, recharge: "long" } },
  });
  const goblin = testEntity({
    id: "monster-1",
    kind: "monster",
    controllerUid: "dm",
    hp: 30,
    ac: 12,
    mechanics: ["monster:goblin:scimitar"],
  });

  function rollAction(id: string, roller: string, total: number): Action {
    return {
      kind: "roll",
      id,
      seq: seq(),
      by: "dm",
      roll: {
        formula: "1d20+3",
        faces: [total - 3],
        total,
        seed: null,
        source: "manual",
        hidden: false,
        roller,
        purpose: "attack",
        label: null,
      },
    };
  }

  function intentAction(
    id: string,
    by: string,
    entity: string,
    mechanic: string,
    program: string,
    answers: Record<string, unknown>,
    targets: readonly string[]
  ): Action {
    return {
      kind: "intent",
      id,
      seq: seq(),
      by,
      entity,
      mechanic,
      program,
      targets: [...targets],
      answers: answers as IntentAction["answers"],
      payment: [],
      window: null,
      basedOn: 0,
    };
  }

  function declareAction(id: string, relation: Relation): Action {
    return {
      kind: "declare",
      id,
      seq: seq(),
      by: "dm",
      relation,
      remove: false,
      mover: null,
    };
  }

  /**
   * One encounter holding all three cases at the moment of compaction:
   * `roll-settled` was spent by an intent that has already resolved, `roll-held` was spent by
   * the goblin's attack which a Shield window still holds open in `declared`, and
   * `roll-ahead` was rolled but never answered with.
   */
  function encounter(): Encounter {
    const log: Action[] = [
      ...openingActions("dm", seq, [ranger, goblin], { ranger: 20, "monster-1": 10 }, [
        "ranger",
        "monster-1",
      ]),
      declareAction("d-1", { kind: "visible", a: "ranger", b: "monster-1", value: true }),
      declareAction("d-2", { kind: "visible", a: "monster-1", b: "ranger", value: true }),
      declareAction("d-3", { kind: "adjacent", a: "ranger", b: "monster-1" }),
      rollAction("roll-settled", "ranger", 18),
      intentAction(
        "i-settled",
        "p1",
        "ranger",
        "srd:weapon:shortsword",
        "attack",
        { roll: { roll: "roll-settled" }, damage: 4 },
        ["monster-1"]
      ),
      tableAction("dm", seq(), { op: "end-turn" }),
      rollAction("roll-held", "monster-1", 16),
      intentAction(
        "i-held",
        "dm",
        "monster-1",
        "monster:goblin:scimitar",
        "attack",
        { roll: { roll: "roll-held" }, damage: 5 },
        ["ranger"]
      ),
      rollAction("roll-ahead", "ranger", 11),
    ];
    return {
      schema: 1,
      id: "bounded-rolls",
      host: { kind: "campaign", campaignId: "camp" },
      log,
      checkpoint: null,
    };
  }

  it("the fixture really holds a settled roll, a held one and an unspent one", () => {
    const { state } = fold(encounter(), catalogue);
    expect(Object.keys(state.rolls).sort()).toEqual([
      "roll-ahead",
      "roll-held",
      "roll-settled",
    ]);
    expect(state.spent["roll-settled"]).toBe("i-settled");
    expect(state.declared["i-settled"]).toBeUndefined();
    expect(state.declared["i-held"]).toBeDefined();
  });

  it("compaction keeps only the unspent rolls and those a held intent still needs", () => {
    const e = encounter();
    const through = at(sortBySeq(e.log), e.log.length - 1).seq;
    const compacted = compact(e, catalogue, through);
    const state = compacted.checkpoint?.state;
    if (state === undefined) throw new Error("expected a checkpoint");
    expect(Object.keys(state.rolls).sort()).toEqual(["roll-ahead", "roll-held"]);
    // `spent` is NOT pruned: it is the "one roll, one verdict" ledger, four nodes per entry,
    // and forgetting it would let a re-sent intent spend a roll a second time.
    expect(Object.keys(state.spent).sort()).toEqual(["roll-held", "roll-settled"]);
  });

  it("a roll stays consumed across the checkpoint — a re-sent intent is still rejected", () => {
    // The offline-first retry: a client's append times out, the retry lands with a FRESH action
    // id and the same `answers` after the DM has checkpointed. "One roll, one verdict"
    // (ADR-0010) must not depend on which side of the checkpoint the reader is on.
    const e = encounter();
    const through = at(sortBySeq(e.log), e.log.length - 1).seq;
    const compacted = compact(e, catalogue, through);
    const retry: Action = {
      kind: "intent",
      id: "i-retry",
      seq: { ms: 900_000, counter: 0, by: "p1" },
      by: "p1",
      entity: "ranger",
      mechanic: "srd:weapon:shortsword",
      program: "attack",
      targets: ["monster-1"],
      answers: { roll: { roll: "roll-settled" }, damage: 4 },
      payment: [],
      window: null,
      basedOn: 0,
    };
    const expected = {
      action: "i-retry",
      rejection: { reason: "roll-consumed", roll: "roll-settled", by: "i-settled" },
    };
    const uncompacted = fold({ ...e, log: [...e.log, retry] }, catalogue);
    const across = fold({ ...compacted, log: [...compacted.log, retry] }, catalogue);
    expect(uncompacted.rejections).toContainEqual(expected);
    expect(across.rejections).toContainEqual(expected);
    expect(across.state.entities).toEqual(uncompacted.state.entities);
    expect(across.state.revision).toBe(uncompacted.state.revision);
  });

  it("pruning never changes what the document folds to", () => {
    const e = encounter();
    const through = at(sortBySeq(e.log), e.log.length - 1).seq;
    const compacted = compact(e, catalogue, through);
    const before = fold(e, catalogue).state;
    const after = fold(compacted, catalogue).state;
    for (const key of ["entities", "clock", "effects", "windows", "declared"] as const) {
      expect(after[key]).toEqual(before[key]);
    }
  });
});
