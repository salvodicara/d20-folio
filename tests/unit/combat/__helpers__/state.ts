import type { Action, Entity, FoldedState, TableOp } from "@/lib/combat/types";
import type { Seq } from "@/lib/combat/ids";

/** A deterministic sequence stamper for tests: every call is strictly later. */
export function seqFactory(by: string, startMs = 1_000): () => Seq {
  let ms = startMs;
  return () => ({ ms: ms++, counter: 0, by });
}

let ids = 0;
export function nextActionId(prefix = "a"): string {
  ids += 1;
  return `${prefix}-${ids}`;
}

export function tableAction(by: string, seq: Seq, table: TableOp): Action {
  return { kind: "table", id: nextActionId("t"), seq, by, table };
}

export function emptyState(): FoldedState {
  return {
    epoch: 0,
    clock: {
      phase: "idle",
      round: 0,
      order: [],
      current: null,
      initiative: {},
      restOrdinal: 0,
      dayPhaseOrdinal: 0,
    },
    entities: {},
    relations: [],
    effects: {},
    windows: [],
    checks: [],
    declared: {},
    nextOrdinal: 1,
    revision: 0,
    settings: { revealMonsterHp: false },
  };
}

/** Build the standard opening: start, add entities, set initiative, begin turns. */
export function openingActions(
  by: string,
  seq: () => Seq,
  entities: readonly Entity[],
  initiative: Readonly<Record<string, number>>,
  order: readonly string[]
): Action[] {
  return [
    tableAction(by, seq(), { op: "start", epoch: 7 }),
    ...entities.map((entity) => tableAction(by, seq(), { op: "add-entity", entity })),
    ...Object.entries(initiative).map(([entity, value]) =>
      tableAction(by, seq(), { op: "set-initiative", entity, value })
    ),
    tableAction(by, seq(), { op: "begin-turns", order }),
  ];
}
