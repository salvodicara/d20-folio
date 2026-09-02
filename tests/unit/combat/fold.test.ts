import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { fold } from "@/lib/combat/fold";
import type { Action, Encounter, Relation } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import {
  nextActionId,
  openingActions,
  seqFactory,
  tableAction,
} from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

const ranger = testEntity({
  id: "ranger",
  kind: "pc",
  controllerUid: "p1",
  hp: 20,
  ac: 15,
  abilities: { DEX: 3, CON: 2 },
  saves: { CON: 2 },
  mechanics: ["srd:weapon:longbow", "srd:spell:hunters-mark"],
  resources: { "slot-1": { current: 2, max: 2, recharge: "long" } },
});
const goblin = testEntity({
  id: "monster-1",
  kind: "monster",
  controllerUid: "dm",
  hp: 7,
  ac: 15,
  mechanics: ["monster:goblin:scimitar"],
});

function encounter(log: readonly Action[]): Encounter {
  return {
    schema: 1,
    id: "e1",
    host: { kind: "campaign", campaignId: "c1" },
    log,
    checkpoint: null,
  };
}

function intent(
  by: string,
  seq: () => Action["seq"],
  entity: string,
  mechanic: string,
  program: string,
  extra: Partial<Extract<Action, { kind: "intent" }>> = {}
): Extract<Action, { kind: "intent" }> {
  return {
    kind: "intent",
    id: nextActionId("i"),
    seq: seq(),
    by,
    entity,
    mechanic,
    program,
    targets: [],
    answers: {},
    payment: [],
    window: null,
    basedOn: 0,
    ...extra,
  };
}

/** The visibility declarations every fight in this file starts with. */
function visibility(by: string, seq: () => Action["seq"]): Action[] {
  const relations: Relation[] = [
    { kind: "visible", a: "ranger", b: "monster-1", value: true },
    { kind: "visible", a: "monster-1", b: "ranger", value: true },
  ];
  return relations.map((relation) => ({
    kind: "declare",
    id: nextActionId("d"),
    seq: seq(),
    by,
    relation,
    remove: false,
    mover: null,
  }));
}

/** A deterministic shuffle (seeded LCG) — test-only; the product never uses RNG. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let x = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const j = x % (i + 1);
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1
          )
        )
      : v
  );
}

describe("fold — the log is the truth", () => {
  it("undoing the mark cast restores the slot and removes the effect and its relation", () => {
    const seq = seqFactory("p1");
    const opening = openingActions(
      "dm",
      seq,
      [ranger, goblin],
      { ranger: 20, "monster-1": 10 },
      ["ranger", "monster-1"]
    );
    const cast = intent("p1", seq, "ranger", "srd:spell:hunters-mark", "cast", {
      targets: ["monster-1"],
      payment: [{ kind: "slot", level: 1, pool: "standard" }],
    });
    const before = fold(
      encounter([...opening, ...visibility("dm", seq), cast]),
      catalogue
    );
    expect(mustEntity(before.state, "ranger").resources["slot-1"]?.current).toBe(1);
    expect(Object.keys(before.state.effects)).toHaveLength(1);

    const undo: Action = {
      kind: "undo",
      id: nextActionId("u"),
      seq: seq(),
      by: "p1",
      of: cast.id,
      reason: null,
    };
    const after = fold(
      encounter([...opening, ...visibility("dm", seq), cast, undo]),
      catalogue
    );
    expect(mustEntity(after.state, "ranger").resources["slot-1"]?.current).toBe(2);
    expect(after.state.effects).toEqual({});
    expect(after.state.relations.some((r) => r.kind === "mark")).toBe(false);
    expect(after.rejections).toEqual([]);
  });

  it("every permutation of the same concurrent log folds to the same state", () => {
    const seqA = seqFactory("p1", 1_000);
    const seqB = seqFactory("dm", 1_000);
    const opening = openingActions(
      "dm",
      seqB,
      [ranger, goblin],
      { ranger: 20, "monster-1": 10 },
      ["ranger", "monster-1"]
    );
    const log: Action[] = [
      ...opening,
      ...visibility("dm", seqB),
      intent("p1", seqA, "ranger", "srd:spell:hunters-mark", "cast", {
        targets: ["monster-1"],
        payment: [{ kind: "slot", level: 1, pool: "standard" }],
      }),
      {
        kind: "override",
        id: nextActionId("o"),
        seq: seqB(),
        by: "dm",
        entity: "ranger",
        path: "stats.ac",
        value: 17,
        reason: "ruling",
      },
      tableAction("dm", seqB(), { op: "end-turn" }),
      intent("dm", seqB, "monster-1", "monster:goblin:scimitar", "attack", {
        targets: ["ranger"],
        answers: { roll: 14, damage: 4 },
      }),
      tableAction("dm", seqB(), { op: "end-turn" }),
    ];
    const reference = canonical(fold(encounter(log), catalogue));
    for (let seed = 1; seed <= 25; seed += 1) {
      expect(canonical(fold(encounter(shuffled(log, seed)), catalogue))).toBe(reference);
    }
  });

  it("an offline client's earlier actions merge on reconnect; an action that became illegal is rejected identically on both sides", () => {
    const seqDm = seqFactory("dm", 1_000);
    const seqP1 = seqFactory("p1", 1_050); // the player's appends carry earlier stamps than the DM's later ones
    const opening = openingActions(
      "dm",
      seqDm,
      [ranger, goblin],
      { ranger: 20, "monster-1": 10 },
      ["ranger", "monster-1"]
    );
    const shared: Action[] = [...opening, ...visibility("dm", seqDm)];
    // Offline: the player casts and then, on their next turn, attacks the goblin.
    const playerCast = intent("p1", seqP1, "ranger", "srd:spell:hunters-mark", "cast", {
      targets: ["monster-1"],
      payment: [{ kind: "slot", level: 1, pool: "standard" }],
    });
    // Online: the DM removes the goblin (it fled) with a later stamp than the cast but before the attack.
    const seqDmLater = seqFactory("dm", 1_060);
    const removal = tableAction("dm", seqDmLater(), {
      op: "remove-entity",
      entity: "monster-1",
    });
    const seqP1Later = seqFactory("p1", 1_070);
    const playerAttack = intent(
      "p1",
      seqP1Later,
      "ranger",
      "srd:weapon:longbow",
      "attack",
      {
        targets: ["monster-1"],
        answers: { roll: 15, damage: 3, "rider:effect-1": 2 },
      }
    );
    const onDm = fold(
      encounter([...shared, removal, playerCast, playerAttack]),
      catalogue
    );
    const onPlayer = fold(
      encounter([...shared, playerCast, playerAttack, removal]),
      catalogue
    );
    expect(canonical(onDm)).toBe(canonical(onPlayer));
    expect(onDm.rejections).toEqual([
      {
        action: playerAttack.id,
        rejection: { reason: "unknown-entity", entity: "monster-1" },
      },
    ]);
    expect(onDm.state.entities["monster-1"]).toBeUndefined();
    expect(onDm.state.effects).toEqual({}); // the mark ended with the goblin
  });

  it("a DM override arriving after a player's action wins by fold order and both remain in the log", () => {
    const seq = seqFactory("dm");
    const opening = openingActions(
      "dm",
      seq,
      [ranger, goblin],
      { ranger: 20, "monster-1": 10 },
      ["ranger", "monster-1"]
    );
    const playerOverride: Action = {
      kind: "override",
      id: nextActionId("o"),
      seq: { ms: 5_000, counter: 0, by: "p1" },
      by: "p1",
      entity: "ranger",
      path: "vitals.hp",
      value: 20,
      reason: "player:correction",
    };
    const dmOverride: Action = {
      kind: "override",
      id: nextActionId("o"),
      seq: { ms: 5_001, counter: 0, by: "dm" },
      by: "dm",
      entity: "ranger",
      path: "vitals.hp",
      value: 12,
      reason: "dm:ruling",
    };
    const result = fold(encounter([...opening, dmOverride, playerOverride]), catalogue);
    expect(mustEntity(result.state, "ranger").overrides["vitals.hp"]).toEqual({
      value: 12,
      reason: "dm:ruling",
      by: "dm",
    });
    expect(result.applied).toBe(opening.length + 2);
  });
});
