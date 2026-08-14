import { describe, expect, it } from "vitest";

import {
  ACTION_JOURNAL_MAX_ACTIONS,
  conformActionFactGuard,
  isActionJournal,
  isActionJournalWorld,
  isJournalAction,
  journalActorRefKey,
  materialRefKey,
  reduceActionJournal,
  resetActionJournal,
} from "@/lib/action-journal";
import type { EntityRef, MaterialRef } from "@/types/mechanics-reference";
import type {
  ActionFactGuard,
  ActionJournal,
  ActionJournalTransitionResult,
  ActionJournalWorld,
  ActionMutation,
  JournalAction,
  JournalActionDraft,
  JournalActorRef,
  JournalMaterialDocument,
  JsonValue,
  ResolvedActionFact,
  StoredValue,
} from "@/types/action-journal";

const CHARACTER = {
  kind: "character-play",
  uid: "user:one",
  characterId: "character:one",
} as const satisfies MaterialRef;
const SHARED = {
  kind: "shared-combat",
  campaignId: "campaign:one",
} as const satisfies MaterialRef;
const ACTOR = {
  material: CHARACTER,
  entityId: "self",
} as const satisfies EntityRef;
const TABLE_AUTHORITY = {
  authority: "table",
  kind: "material-authority",
  material: CHARACTER,
} as const satisfies JournalActorRef;
const ENVIRONMENT_AUTHORITY = {
  authority: "environment",
  kind: "material-authority",
  material: CHARACTER,
} as const satisfies JournalActorRef;

const ABSENT = { present: false } as const satisfies StoredValue;
const HIGH_WATER_PATHS = [
  ["nextOccurrenceOrdinal"],
  ["nextEntityOrdinal"],
  ["nextInventoryOrdinal"],
  ["nextEncounterEpoch"],
  ["timeline", "nextBoundaryOrdinal"],
  ["encounter", "nextCombatantOrdinal"],
] as const;

function present(value: JsonValue): StoredValue {
  return { present: true, value };
}

function emptyJournal(epoch = 1, revision = 0): ActionJournal {
  return { epoch, revision, actions: [] };
}

function localWorld(
  data: Readonly<Record<string, JsonValue>> = { hp: 10 },
  journal: ActionJournal = emptyJournal()
): ActionJournalWorld {
  return {
    scope: CHARACTER,
    documents: [{ material: CHARACTER, journal, data }],
  };
}

function sharedWorld(): ActionJournalWorld {
  const documents: JournalMaterialDocument[] = [
    {
      material: SHARED,
      journal: emptyJournal(7, 3),
      data: { monster: { hp: 8 }, round: 1 },
    },
    {
      material: CHARACTER,
      journal: emptyJournal(11, 5),
      data: { hp: 10, slot: 1 },
    },
  ];
  documents.sort((left, right) =>
    materialRefKey(left.material).localeCompare(materialRefKey(right.material))
  );
  return { scope: SHARED, documents };
}

function documentFor(
  world: ActionJournalWorld,
  material: MaterialRef
): JournalMaterialDocument {
  const key = materialRefKey(material);
  const document = world.documents.find(
    (candidate) => materialRefKey(candidate.material) === key
  );
  if (!document) throw new Error(`Missing fixture document ${key}`);
  return document;
}

function actionDraft(
  world: ActionJournalWorld,
  options: {
    id?: string;
    actor?: JournalActorRef;
    mutations?: readonly ActionMutation[];
    facts?: readonly ActionFactGuard[];
    observed?: readonly MaterialRef[];
  } = {}
): JournalActionDraft {
  const mutations = options.mutations ?? [
    { target: world.scope, path: ["hp"], before: present(10), after: present(7) },
  ];
  const observed = options.observed ?? [
    ...new Map(
      [world.scope, ...mutations.map(({ target }) => target)].map((material) => [
        materialRefKey(material),
        material,
      ])
    ).values(),
  ];
  const documents = observed
    .map((material) => {
      const document = documentFor(world, material);
      return {
        material,
        epoch: document.journal.epoch,
        revision: document.journal.revision,
      };
    })
    .sort((left, right) =>
      materialRefKey(left.material).localeCompare(materialRefKey(right.material))
    );
  const facts = [...(options.facts ?? [])].sort((left, right) =>
    `${JSON.stringify(left.owner)}${JSON.stringify(left.address)}`.localeCompare(
      `${JSON.stringify(right.owner)}${JSON.stringify(right.address)}`
    )
  );
  const sortedMutations = [...mutations].sort((left, right) =>
    `${materialRefKey(left.target)}${JSON.stringify(left.path)}`.localeCompare(
      `${materialRefKey(right.target)}${JSON.stringify(right.path)}`
    )
  );
  return {
    id: options.id ?? "action:one",
    actor: options.actor ?? ACTOR,
    guards: { documents, facts },
    mutations: sortedMutations,
  };
}

function commit(
  world: ActionJournalWorld,
  action: JournalActionDraft,
  facts: readonly ResolvedActionFact[] = []
): ActionJournalTransitionResult {
  return reduceActionJournal(world, { kind: "commit", action }, facts);
}

function currentDocuments(
  world: ActionJournalWorld,
  action: JournalActionDraft
): JournalActionDraft["guards"]["documents"] {
  return action.guards.documents.map(({ material }) => {
    const current = documentFor(world, material).journal;
    return { material, epoch: current.epoch, revision: current.revision };
  });
}

function applied(
  result: ActionJournalTransitionResult
): Extract<ActionJournalTransitionResult, { status: "applied" | "already-applied" }> {
  if (result.status === "rejected")
    throw new Error(`Expected apply, got ${result.reason}`);
  return result;
}

function journalOf(world: ActionJournalWorld): ActionJournal {
  return documentFor(world, world.scope).journal;
}

function isJsonRecord(
  value: JsonValue | undefined
): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dataAt(
  world: ActionJournalWorld,
  path: readonly string[]
): JsonValue | undefined {
  let current: JsonValue | undefined = documentFor(world, CHARACTER).data;
  for (const segment of path) {
    if (!isJsonRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

describe("flat bounded action journal", () => {
  it.each(HIGH_WATER_PATHS.map((path) => ({ path })))(
    "never reverses the high-water path $path across undo and redo",
    ({ path }) => {
      const initial = localWorld({
        encounter: { nextCombatantOrdinal: 1 },
        nextEncounterEpoch: 1,
        nextEntityOrdinal: 1,
        nextInventoryOrdinal: 1,
        nextOccurrenceOrdinal: 1,
        records: {},
        timeline: { nextBoundaryOrdinal: 1 },
      });
      const draft = actionDraft(initial, {
        mutations: [
          {
            target: CHARACTER,
            path,
            before: present(1),
            after: present(2),
          },
          {
            target: CHARACTER,
            path: ["records", "created"],
            before: ABSENT,
            after: present({ ordinal: 1 }),
          },
        ],
      });
      const committed = applied(commit(initial, draft));
      expect(dataAt(committed.world, path)).toBe(2);
      expect(dataAt(committed.world, ["records", "created"])).toEqual({ ordinal: 1 });

      const undone = applied(
        reduceActionJournal(
          committed.world,
          {
            kind: "undo",
            action: draft,
            expectedGeneration: 1,
            documents: currentDocuments(committed.world, draft),
          },
          []
        )
      );
      expect(dataAt(undone.world, path)).toBe(2);
      expect(dataAt(undone.world, ["records", "created"])).toBeUndefined();
      expect(journalOf(undone.world).revision).toBe(2);

      const redone = applied(
        reduceActionJournal(
          undone.world,
          {
            kind: "redo",
            action: draft,
            expectedGeneration: 2,
            documents: currentDocuments(undone.world, draft),
          },
          []
        )
      );
      expect(dataAt(redone.world, path)).toBe(2);
      expect(dataAt(redone.world, ["records", "created"])).toEqual({ ordinal: 1 });
      expect(journalOf(redone.world).revision).toBe(3);
    }
  );

  it("preserves a nested high-water when an ancestor allocation is undone and redone", () => {
    const beforeEncounter = {
      epoch: 1,
      nextCombatantOrdinal: 2,
      participants: { "combatant:1": { ordinal: 1 } },
      round: 1,
    };
    const afterEncounter = {
      epoch: 1,
      nextCombatantOrdinal: 3,
      participants: {
        "combatant:1": { ordinal: 1 },
        "combatant:2": { ordinal: 2 },
      },
      round: 1,
    };
    const initial = localWorld({ encounter: beforeEncounter });
    const draft = actionDraft(initial, {
      mutations: [
        {
          target: CHARACTER,
          path: ["encounter"],
          before: present(beforeEncounter),
          after: present(afterEncounter),
        },
      ],
    });
    const committed = applied(commit(initial, draft));
    expect(dataAt(committed.world, ["encounter", "nextCombatantOrdinal"])).toBe(3);

    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    );
    expect(dataAt(undone.world, ["encounter", "nextCombatantOrdinal"])).toBe(3);
    expect(dataAt(undone.world, ["encounter", "participants"])).toEqual(
      beforeEncounter.participants
    );

    const staleReuse = actionDraft(undone.world, {
      id: "combatant:stale-reuse",
      mutations: [
        {
          target: CHARACTER,
          path: ["encounter"],
          before: present(beforeEncounter),
          after: present(afterEncounter),
        },
      ],
    });
    expect(commit(undone.world, staleReuse)).toMatchObject({
      reason: "mutation-conflict",
      status: "rejected",
    });

    const redone = applied(
      reduceActionJournal(
        undone.world,
        {
          kind: "redo",
          action: draft,
          expectedGeneration: 2,
          documents: currentDocuments(undone.world, draft),
        },
        []
      )
    );
    expect(dataAt(redone.world, ["encounter", "nextCombatantOrdinal"])).toBe(3);
    expect(dataAt(redone.world, ["encounter", "participants"])).toEqual(
      afterEncounter.participants
    );
  });

  it("keeps an encounter ancestor lifecycle reversible without reusing its material epoch", () => {
    const encounter = {
      epoch: 1,
      nextCombatantOrdinal: 1,
      participants: {},
      round: 1,
    };
    const initial = localWorld({ encounter: null, nextEncounterEpoch: 1 });
    const draft = actionDraft(initial, {
      id: "encounter:start",
      mutations: [
        {
          target: CHARACTER,
          path: ["encounter"],
          before: present(null),
          after: present(encounter),
        },
        {
          target: CHARACTER,
          path: ["nextEncounterEpoch"],
          before: present(1),
          after: present(2),
        },
      ],
    });
    const committed = applied(commit(initial, draft));
    expect(dataAt(committed.world, ["encounter"])).toEqual(encounter);
    expect(dataAt(committed.world, ["nextEncounterEpoch"])).toBe(2);

    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    );
    expect(dataAt(undone.world, ["encounter"])).toBeNull();
    expect(dataAt(undone.world, ["nextEncounterEpoch"])).toBe(2);

    const staleStart = actionDraft(undone.world, {
      id: "encounter:stale-start",
      mutations: [
        {
          target: CHARACTER,
          path: ["encounter"],
          before: present(null),
          after: present(encounter),
        },
        {
          target: CHARACTER,
          path: ["nextEncounterEpoch"],
          before: present(1),
          after: present(2),
        },
      ],
    });
    expect(commit(undone.world, staleStart)).toMatchObject({
      reason: "mutation-conflict",
      status: "rejected",
    });

    const redone = applied(
      reduceActionJournal(
        undone.world,
        {
          kind: "redo",
          action: draft,
          expectedGeneration: 2,
          documents: currentDocuments(undone.world, draft),
        },
        []
      )
    );
    expect(dataAt(redone.world, ["encounter"])).toEqual(encounter);
    expect(dataAt(redone.world, ["nextEncounterEpoch"])).toBe(2);
  });

  it.each([
    {
      name: "ancestor lowering",
      path: ["encounter"],
      before: present({ epoch: 1, nextCombatantOrdinal: 3, round: 1 }),
      after: present({ epoch: 1, nextCombatantOrdinal: 2, round: 2 }),
    },
    {
      name: "high-water descendant",
      path: ["encounter", "nextCombatantOrdinal", "nested"],
      before: present(1),
      after: present(2),
    },
  ] as const)("rejects a $name mutation fail-closed", ({ path, before, after }) => {
    const initial = localWorld({
      encounter: { epoch: 1, nextCombatantOrdinal: 3, round: 1 },
    });
    const draft = actionDraft(initial, {
      mutations: [{ target: CHARACTER, path, before, after }],
    });
    expect(commit(initial, draft)).toMatchObject({
      reason: "invalid-action",
      status: "rejected",
    });
  });

  it("allows an ancestor mutation that leaves its nested high-water unchanged", () => {
    const initial = localWorld({
      encounter: { epoch: 1, nextCombatantOrdinal: 3, round: 1 },
    });
    const draft = actionDraft(initial, {
      mutations: [
        {
          target: CHARACTER,
          path: ["encounter"],
          before: present({ epoch: 1, nextCombatantOrdinal: 3, round: 1 }),
          after: present({ epoch: 1, nextCombatantOrdinal: 3, round: 2 }),
        },
      ],
    });
    const committed = applied(commit(initial, draft));
    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    );
    const redone = applied(
      reduceActionJournal(
        undone.world,
        {
          kind: "redo",
          action: draft,
          expectedGeneration: 2,
          documents: currentDocuments(undone.world, draft),
        },
        []
      )
    );
    expect(dataAt(undone.world, ["encounter"])).toEqual({
      epoch: 1,
      nextCombatantOrdinal: 3,
      round: 1,
    });
    expect(dataAt(redone.world, ["encounter"])).toEqual({
      epoch: 1,
      nextCombatantOrdinal: 3,
      round: 2,
    });
  });

  it("allocates from the preserved high-water mark after an undo branch", () => {
    const initial = localWorld({ entities: {}, nextEntityOrdinal: 1 });
    const first = actionDraft(initial, {
      id: "create:one",
      mutations: [
        {
          target: CHARACTER,
          path: ["entities", "summon:1"],
          before: ABSENT,
          after: present({ ordinal: 1 }),
        },
        {
          target: CHARACTER,
          path: ["nextEntityOrdinal"],
          before: present(1),
          after: present(2),
        },
      ],
    });
    const committed = applied(commit(initial, first));
    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: first,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, first),
        },
        []
      )
    );
    const branch = actionDraft(undone.world, {
      id: "create:two",
      mutations: [
        {
          target: CHARACTER,
          path: ["entities", "summon:2"],
          before: ABSENT,
          after: present({ ordinal: 2 }),
        },
        {
          target: CHARACTER,
          path: ["nextEntityOrdinal"],
          before: present(2),
          after: present(3),
        },
      ],
    });
    const branched = applied(commit(undone.world, branch));

    expect(dataAt(branched.world, ["entities", "summon:1"])).toBeUndefined();
    expect(dataAt(branched.world, ["entities", "summon:2"])).toEqual({ ordinal: 2 });
    expect(dataAt(branched.world, ["nextEntityOrdinal"])).toBe(3);
    expect(journalOf(branched.world).actions.map(({ id }) => id)).toEqual(["create:two"]);
  });

  it("undoes and redoes stacked allocations without lowering their shared high-water mark", () => {
    const initial = localWorld({ entities: {}, nextEntityOrdinal: 1 });
    const first = actionDraft(initial, {
      id: "create:one",
      mutations: [
        {
          target: CHARACTER,
          path: ["entities", "summon:1"],
          before: ABSENT,
          after: present({ ordinal: 1 }),
        },
        {
          target: CHARACTER,
          path: ["nextEntityOrdinal"],
          before: present(1),
          after: present(2),
        },
      ],
    });
    const firstCommitted = applied(commit(initial, first));
    const second = actionDraft(firstCommitted.world, {
      id: "create:two",
      mutations: [
        {
          target: CHARACTER,
          path: ["entities", "summon:2"],
          before: ABSENT,
          after: present({ ordinal: 2 }),
        },
        {
          target: CHARACTER,
          path: ["nextEntityOrdinal"],
          before: present(2),
          after: present(3),
        },
      ],
    });
    const secondCommitted = applied(commit(firstCommitted.world, second));
    const secondUndone = applied(
      reduceActionJournal(
        secondCommitted.world,
        {
          kind: "undo",
          action: second,
          expectedGeneration: 1,
          documents: currentDocuments(secondCommitted.world, second),
        },
        []
      )
    );
    const bothUndone = applied(
      reduceActionJournal(
        secondUndone.world,
        {
          kind: "undo",
          action: first,
          expectedGeneration: 1,
          documents: currentDocuments(secondUndone.world, first),
        },
        []
      )
    );
    expect(dataAt(bothUndone.world, ["nextEntityOrdinal"])).toBe(3);

    const firstRedone = applied(
      reduceActionJournal(
        bothUndone.world,
        {
          kind: "redo",
          action: first,
          expectedGeneration: 2,
          documents: currentDocuments(bothUndone.world, first),
        },
        []
      )
    );
    const bothRedone = applied(
      reduceActionJournal(
        firstRedone.world,
        {
          kind: "redo",
          action: second,
          expectedGeneration: 2,
          documents: currentDocuments(firstRedone.world, second),
        },
        []
      )
    );
    expect(dataAt(bothRedone.world, ["nextEntityOrdinal"])).toBe(3);
    expect(dataAt(bothRedone.world, ["entities", "summon:1"])).toEqual({
      ordinal: 1,
    });
    expect(dataAt(bothRedone.world, ["entities", "summon:2"])).toEqual({
      ordinal: 2,
    });
  });

  it.each([
    ["missing before", ABSENT, present(1)],
    ["missing after", present(0), ABSENT],
    ["negative", present(-1), present(1)],
    ["negative zero", present(-0), present(1)],
    ["fractional", present(0), present(1.5)],
    ["unsafe", present(0), present(Number.MAX_SAFE_INTEGER + 1)],
    ["equal", present(1), present(1)],
    ["decreasing", present(2), present(1)],
  ] as const)(
    "rejects a %s high-water mutation as an invalid action",
    (_, before, after) => {
      const initial = localWorld({ nextEntityOrdinal: 1 });
      const draft = actionDraft(initial, {
        mutations: [{ target: CHARACTER, path: ["nextEntityOrdinal"], before, after }],
      });
      expect(commit(initial, draft)).toMatchObject({
        reason: "invalid-action",
        status: "rejected",
      });
    }
  );

  it("keeps the current timeline generation reversible", () => {
    const initial = localWorld({ timeline: { epoch: 2 } });
    const draft = actionDraft(initial, {
      mutations: [
        {
          target: CHARACTER,
          path: ["timeline", "epoch"],
          before: present(2),
          after: present(3),
        },
      ],
    });
    const committed = applied(commit(initial, draft));
    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    );
    expect(dataAt(undone.world, ["timeline", "epoch"])).toBe(2);
  });

  it("commits, undoes and redoes through one parity boundary", () => {
    const initial = localWorld();
    const draft = actionDraft(initial);
    const committed = applied(commit(initial, draft));
    expect(documentFor(committed.world, CHARACTER).data.hp).toBe(7);
    expect(journalOf(committed.world)).toMatchObject({ revision: 1 });
    expect(
      journalOf(committed.world).actions.map(({ generation }) => generation)
    ).toEqual([1]);

    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    );
    expect(documentFor(undone.world, CHARACTER).data.hp).toBe(10);
    expect(journalOf(undone.world).revision).toBe(2);
    expect(journalOf(undone.world).actions[0]?.generation).toBe(2);

    const redo = {
      kind: "redo",
      action: draft,
      expectedGeneration: 2,
      documents: currentDocuments(undone.world, draft),
    } as const;
    const redone = applied(reduceActionJournal(undone.world, redo, []));
    expect(documentFor(redone.world, CHARACTER).data.hp).toBe(7);
    expect(journalOf(redone.world).revision).toBe(3);
    expect(journalOf(redone.world).actions[0]?.generation).toBe(3);
    expect(reduceActionJournal(redone.world, redo, []).status).toBe("already-applied");
  });

  it("distinguishes exact duplicate retries, collisions and later generations", () => {
    const initial = localWorld({});
    const original = actionDraft(initial, {
      mutations: [
        {
          target: CHARACTER,
          path: ["payload"],
          before: ABSENT,
          after: present({ a: 1, b: 2 }),
        },
      ],
    });
    const committed = applied(commit(initial, original));
    const reordered = actionDraft(initial, {
      mutations: [
        {
          target: CHARACTER,
          path: ["payload"],
          before: ABSENT,
          after: present({ b: 2, a: 1 }),
        },
      ],
    });
    expect(commit(committed.world, reordered).status).toBe("already-applied");

    const collision = actionDraft(initial, {
      mutations: [
        {
          target: CHARACTER,
          path: ["payload"],
          before: ABSENT,
          after: present({ a: 3 }),
        },
      ],
    });
    expect(commit(committed.world, collision)).toMatchObject({
      status: "rejected",
      reason: "action-collision",
    });

    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: original,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, original),
        },
        []
      )
    );
    expect(
      reduceActionJournal(
        undone.world,
        {
          kind: "undo",
          action: original,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, original),
        },
        []
      ).status
    ).toBe("already-applied");
    expect(commit(undone.world, original)).toMatchObject({
      status: "rejected",
      reason: "generation-conflict",
    });
    expect(
      reduceActionJournal(
        undone.world,
        {
          kind: "undo",
          action: collision,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, original),
        },
        []
      )
    ).toMatchObject({ status: "rejected", reason: "action-collision" });
  });

  it.each([
    ["undo", 2],
    ["redo", 1],
    ["undo", 0],
  ] as const)(
    "rejects a %s request with impossible generation %i",
    (kind, generation) => {
      const world = localWorld();
      const missing = actionDraft(world, { id: "missing" });
      expect(
        reduceActionJournal(
          world,
          {
            kind,
            action: missing,
            expectedGeneration: generation,
            documents: currentDocuments(world, missing),
          },
          []
        )
      ).toMatchObject({ status: "rejected", reason: "invalid-transition" });
    }
  );

  it("only reverses the parity boundary and atomically cuts redo on a new commit", () => {
    const initial = localWorld({ hp: 10 });
    const firstDraft = actionDraft(initial, {
      id: "a",
      mutations: [
        { target: CHARACTER, path: ["hp"], before: present(10), after: present(9) },
      ],
    });
    const first = applied(commit(initial, firstDraft));
    const secondDraft = actionDraft(first.world, {
      id: "b",
      mutations: [
        { target: CHARACTER, path: ["hp"], before: present(9), after: present(8) },
      ],
    });
    const second = applied(commit(first.world, secondDraft));
    expect(
      reduceActionJournal(
        second.world,
        {
          kind: "undo",
          action: firstDraft,
          expectedGeneration: 1,
          documents: currentDocuments(second.world, firstDraft),
        },
        []
      )
    ).toMatchObject({ status: "rejected", reason: "branch-conflict" });

    const undone = applied(
      reduceActionJournal(
        second.world,
        {
          kind: "undo",
          action: secondDraft,
          expectedGeneration: 1,
          documents: currentDocuments(second.world, secondDraft),
        },
        []
      )
    );
    const branch = actionDraft(undone.world, {
      id: "c",
      mutations: [
        { target: CHARACTER, path: ["hp"], before: present(9), after: present(6) },
      ],
    });
    const branched = applied(commit(undone.world, branch));
    expect(journalOf(branched.world).actions.map(({ id }) => id)).toEqual(["a", "c"]);
    expect(documentFor(branched.world, CHARACTER).data.hp).toBe(6);
    expect(
      reduceActionJournal(
        branched.world,
        {
          kind: "redo",
          action: secondDraft,
          expectedGeneration: 2,
          documents: currentDocuments(branched.world, secondDraft),
        },
        []
      )
    ).toMatchObject({ status: "rejected", reason: "action-not-found" });
  });

  it("fences new undo and redo applications with current exact document revisions", () => {
    const initial = localWorld();
    const draft = actionDraft(initial);
    const committed = applied(commit(initial, draft));
    expect(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(initial, draft),
        },
        []
      )
    ).toMatchObject({ status: "rejected", reason: "document-conflict" });
    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    );
    expect(
      reduceActionJournal(
        undone.world,
        {
          kind: "redo",
          action: draft,
          expectedGeneration: 2,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    ).toMatchObject({ status: "rejected", reason: "document-conflict" });
  });

  it("evicts only the oldest applied action and gives evicted retries a stale-CAS rejection", () => {
    let world = localWorld({ count: 0 });
    let firstDraft: JournalActionDraft | undefined;
    let lastEvicted: readonly string[] = [];
    for (let index = 0; index <= ACTION_JOURNAL_MAX_ACTIONS; index += 1) {
      const draft = actionDraft(world, {
        id: `action:${index}`,
        mutations: [
          {
            target: CHARACTER,
            path: ["count"],
            before: present(index),
            after: present(index + 1),
          },
        ],
      });
      firstDraft ??= draft;
      const result = applied(commit(world, draft));
      world = result.world;
      lastEvicted = result.evictedActionIds;
    }
    expect(journalOf(world).actions).toHaveLength(ACTION_JOURNAL_MAX_ACTIONS);
    expect(journalOf(world).actions[0]?.id).toBe("action:1");
    expect(lastEvicted).toEqual(["action:0"]);
    if (!firstDraft) throw new Error("Missing first draft");
    expect(commit(world, firstDraft)).toMatchObject({
      status: "rejected",
      reason: "document-conflict",
    });
  });

  it("rejects a single oversized action before changing material", () => {
    const world = localWorld({});
    const huge = "x".repeat(270_000);
    const result = commit(
      world,
      actionDraft(world, {
        mutations: [
          { target: CHARACTER, path: ["huge"], before: ABSENT, after: present(huge) },
        ],
      })
    );
    expect(result).toMatchObject({ status: "rejected", reason: "journal-overflow" });
    expect(result.world).toBe(world);
  });

  it("uses presence-aware values so null round-trips without becoming absence", () => {
    const initial = localWorld({});
    const draft = actionDraft(initial, {
      mutations: [
        { target: CHARACTER, path: ["nullable"], before: ABSENT, after: present(null) },
      ],
    });
    const committed = applied(commit(initial, draft));
    expect(documentFor(committed.world, CHARACTER).data).toHaveProperty("nullable", null);
    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    );
    expect(Object.hasOwn(documentFor(undone.world, CHARACTER).data, "nullable")).toBe(
      false
    );

    const wrong = actionDraft(initial, {
      id: "wrong-null",
      mutations: [
        {
          target: CHARACTER,
          path: ["nullable"],
          before: present(null),
          after: present(1),
        },
      ],
    });
    expect(commit(initial, wrong)).toMatchObject({
      status: "rejected",
      reason: "mutation-conflict",
    });
  });

  it("checks commit-redo facts on commit and redo but never requires them for undo", () => {
    const fact: ActionFactGuard = {
      owner: TABLE_AUTHORITY,
      address: ["inventory", "focus", "definition"],
      expected: present("focus-item"),
      lifecycle: "commit-redo",
    };
    const resolved: ResolvedActionFact[] = [
      { owner: TABLE_AUTHORITY, address: fact.address, actual: fact.expected },
    ];
    const initial = localWorld({ focus: { charges: 1 } });
    const draft = actionDraft(initial, {
      facts: [fact],
      mutations: [
        {
          target: CHARACTER,
          path: ["focus"],
          before: present({ charges: 1 }),
          after: ABSENT,
        },
      ],
    });
    expect(commit(initial, draft)).toMatchObject({
      reason: "fact-conflict",
      status: "rejected",
    });
    const committed = applied(commit(initial, draft, resolved));
    expect(documentFor(committed.world, CHARACTER).data).not.toHaveProperty("focus");

    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    );
    expect(documentFor(undone.world, CHARACTER).data.focus).toEqual({ charges: 1 });

    const redo = {
      kind: "redo",
      action: draft,
      expectedGeneration: 2,
      documents: currentDocuments(undone.world, draft),
    } as const;
    expect(reduceActionJournal(undone.world, redo, [])).toMatchObject({
      reason: "fact-conflict",
      status: "rejected",
    });
    expect(
      reduceActionJournal(undone.world, redo, [
        {
          owner: TABLE_AUTHORITY,
          address: fact.address,
          actual: present("other-item"),
        },
      ])
    ).toMatchObject({ reason: "fact-conflict", status: "rejected" });

    const redone = applied(reduceActionJournal(undone.world, redo, resolved));
    expect(documentFor(redone.world, CHARACTER).data).not.toHaveProperty("focus");
  });

  it("checks definition snapshots only on commit and requires the exact redo subset", () => {
    const definition: ActionFactGuard = {
      owner: ACTOR,
      address: ["resource-definition", "focus"],
      expected: present({ capacity: 1, id: "focus" }),
      lifecycle: "commit",
    };
    const maximum: ActionFactGuard = {
      owner: ACTOR,
      address: ["hit-point-maximum"],
      expected: present(10),
      lifecycle: "commit-redo",
    };
    const definitionResolved: ResolvedActionFact = {
      owner: definition.owner,
      address: definition.address,
      actual: definition.expected,
    };
    const maximumResolved: ResolvedActionFact = {
      owner: maximum.owner,
      address: maximum.address,
      actual: maximum.expected,
    };
    const initial = localWorld();
    const draft = actionDraft(initial, { facts: [definition, maximum] });
    const committed = applied(
      commit(
        initial,
        draft,
        [maximumResolved, definitionResolved].sort((left, right) =>
          JSON.stringify(left.address).localeCompare(JSON.stringify(right.address))
        )
      )
    );
    const undone = applied(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    );
    const redo = {
      kind: "redo",
      action: draft,
      expectedGeneration: 2,
      documents: currentDocuments(undone.world, draft),
    } as const;

    expect(
      reduceActionJournal(undone.world, redo, [
        maximumResolved,
        { ...definitionResolved, actual: present({ capacity: 2, id: "focus" }) },
      ])
    ).toMatchObject({ reason: "fact-conflict", status: "rejected" });
    expect(
      reduceActionJournal(undone.world, redo, [
        { ...maximumResolved, actual: present(11) },
      ])
    ).toMatchObject({ reason: "fact-conflict", status: "rejected" });

    const redone = applied(reduceActionJournal(undone.world, redo, [maximumResolved]));
    expect(documentFor(redone.world, CHARACTER).data.hp).toBe(7);
  });

  it("conforms fact guards exactly, including lifecycle, without retaining input aliases", () => {
    const input = {
      owner: structuredClone(ACTOR),
      address: ["hit-point-maximum"],
      expected: present(10),
      lifecycle: "commit-redo",
    };
    const conformed = conformActionFactGuard(input);
    expect(conformed).toEqual(input);
    expect(conformed).not.toBe(input);
    expect(conformed?.owner).not.toBe(input.owner);
    Reflect.set(input.owner, "entityId", "changed");
    if (conformed === null || !("entityId" in conformed.owner)) {
      throw new Error("conformed owner fixture");
    }
    expect(conformed.owner.entityId).toBe("self");

    const missingLifecycle = {
      owner: input.owner,
      address: input.address,
      expected: input.expected,
    };
    expect(conformActionFactGuard(missingLifecycle)).toBeNull();
    expect(conformActionFactGuard({ ...input, lifecycle: "redo" })).toBeNull();
    expect(conformActionFactGuard({ ...input, future: true })).toBeNull();
  });

  it("conforms exact material-authority fact owners and gives table and environment distinct identities", () => {
    const input: ActionFactGuard = {
      address: ["mechanics-definition", "hazard"],
      expected: present("snapshot"),
      lifecycle: "commit",
      owner: structuredClone(TABLE_AUTHORITY),
    };
    const conformed = conformActionFactGuard(input);
    expect(conformed).toEqual(input);
    expect(conformed?.owner).not.toBe(input.owner);
    expect(journalActorRefKey(TABLE_AUTHORITY)).not.toBe(
      journalActorRefKey(ENVIRONMENT_AUTHORITY)
    );
    expect(
      journalActorRefKey({
        material: CHARACTER,
        kind: "material-authority",
        authority: "table",
      })
    ).toBe(journalActorRefKey(TABLE_AUTHORITY));

    expect(
      conformActionFactGuard({
        ...input,
        owner: { ...TABLE_AUTHORITY, authority: "system" },
      })
    ).toBeNull();
    expect(
      conformActionFactGuard({
        ...input,
        owner: { ...TABLE_AUTHORITY, invented: true },
      })
    ).toBeNull();
    const inherited = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      TABLE_AUTHORITY
    );
    expect(conformActionFactGuard({ ...input, owner: inherited })).toBeNull();
  });

  it("requires every material-authority fact owner document in the guarded world", () => {
    const initial = localWorld();
    const missing: ActionFactGuard = {
      address: ["mechanics-definition", "hazard"],
      expected: present("snapshot"),
      lifecycle: "commit",
      owner: { ...TABLE_AUTHORITY, material: SHARED },
    };
    const missingDraft = actionDraft(initial, { facts: [missing] });
    expect(isJournalAction({ ...missingDraft, generation: 1 })).toBe(false);
    expect(
      commit(initial, missingDraft, [
        { actual: missing.expected, address: missing.address, owner: missing.owner },
      ])
    ).toMatchObject({ reason: "invalid-transition", status: "rejected" });

    const presentGuard = { ...missing, owner: TABLE_AUTHORITY };
    const presentDraft = actionDraft(initial, { facts: [presentGuard] });
    expect(
      commit(initial, presentDraft, [
        {
          actual: presentGuard.expected,
          address: presentGuard.address,
          owner: presentGuard.owner,
        },
      ]).status
    ).toBe("applied");
  });

  it("applies a shared multi-document action all-or-nothing and increments each touched revision once", () => {
    const initial = sharedWorld();
    const mutations: ActionMutation[] = [
      {
        target: CHARACTER,
        path: ["slot"],
        before: present(1),
        after: present(0),
      },
      {
        target: SHARED,
        path: ["monster", "hp"],
        before: present(8),
        after: present(3),
      },
    ];
    const draft = actionDraft(initial, {
      id: "shared",
      mutations,
      observed: [SHARED, CHARACTER],
    });
    const committed = applied(commit(initial, draft));
    expect(documentFor(committed.world, CHARACTER).data.slot).toBe(0);
    expect(documentFor(committed.world, SHARED).data.monster).toEqual({ hp: 3 });
    expect(documentFor(committed.world, CHARACTER).journal).toMatchObject({
      epoch: 11,
      revision: 6,
      actions: [],
    });
    expect(documentFor(committed.world, SHARED).journal.revision).toBe(4);
    expect(documentFor(committed.world, SHARED).journal.actions).toHaveLength(1);

    const stale = actionDraft(initial, {
      id: "stale-multi",
      observed: [SHARED, CHARACTER],
      mutations: [
        { target: CHARACTER, path: ["slot"], before: present(99), after: present(0) },
        {
          target: SHARED,
          path: ["monster", "hp"],
          before: present(8),
          after: present(3),
        },
      ],
    });
    const rejected = commit(initial, stale);
    expect(rejected).toMatchObject({ status: "rejected", reason: "mutation-conflict" });
    expect(rejected.world).toBe(initial);
    expect(documentFor(initial, SHARED).data.monster).toEqual({ hp: 8 });
    expect(documentFor(initial, CHARACTER).data.slot).toBe(1);
  });

  it("preserves a non-scope character journal while advancing its material revision", () => {
    const local = localWorld();
    const localDraft = actionDraft(local, { id: "local-before-shared" });
    const localCommitted = applied(commit(local, localDraft));
    const initial = sharedWorld();
    const withLocalHistory: ActionJournalWorld = {
      ...initial,
      documents: initial.documents.map((document) =>
        document.material.kind === "character-play"
          ? { ...document, journal: journalOf(localCommitted.world) }
          : document
      ),
    };
    const sharedDraft = actionDraft(withLocalHistory, {
      id: "shared-after-local",
      observed: [SHARED, CHARACTER],
      mutations: [
        { target: CHARACTER, path: ["slot"], before: present(1), after: present(0) },
      ],
    });
    const committed = applied(commit(withLocalHistory, sharedDraft));
    const character = documentFor(committed.world, CHARACTER);
    expect(character.journal.actions).toEqual(journalOf(localCommitted.world).actions);
    expect(character.journal.revision).toBe(journalOf(localCommitted.world).revision + 1);
  });

  it("does not require documents referenced only by unrelated historical actions", () => {
    const initial = sharedWorld();
    const historicalDraft = actionDraft(initial, {
      id: "historical-character-write",
      observed: [SHARED, CHARACTER],
      mutations: [
        { target: CHARACTER, path: ["slot"], before: present(1), after: present(0) },
      ],
    });
    const historical = applied(commit(initial, historicalDraft));
    const sharedOnlyWorld: ActionJournalWorld = {
      scope: SHARED,
      documents: [documentFor(historical.world, SHARED)],
    };
    expect(isActionJournalWorld(sharedOnlyWorld)).toBe(true);

    const next = actionDraft(sharedOnlyWorld, {
      id: "later-shared-only-write",
      actor: { material: SHARED, entityId: "shared-actor", ordinal: 1 },
      mutations: [
        {
          target: SHARED,
          path: ["round"],
          before: present(1),
          after: present(2),
        },
      ],
    });
    const committed = applied(commit(sharedOnlyWorld, next));
    expect(documentFor(committed.world, SHARED).data.round).toBe(2);
    expect(journalOf(committed.world).actions.map(({ id }) => id)).toEqual([
      "historical-character-write",
      "later-shared-only-write",
    ]);
  });

  it("journals hazards and table declarations without fabricating a combatant", () => {
    const initial = sharedWorld();
    for (const authority of ["environment", "table"] as const) {
      const current = authority === "environment" ? initial : sharedWorld();
      const draft = actionDraft(current, {
        id: `authority:${authority}`,
        actor: { kind: "material-authority", material: SHARED, authority },
        mutations: [
          {
            target: SHARED,
            path: ["round"],
            before: present(1),
            after: present(2),
          },
        ],
      });
      const committed = applied(commit(current, draft));
      expect(journalOf(committed.world).actions[0]?.actor).toEqual(draft.actor);
    }
  });

  it("requires an exact, observed material for non-creature authorities", () => {
    const world = localWorld();
    const base = actionDraft(world);
    for (const actor of [
      { kind: "material-authority", material: SHARED, authority: "environment" },
      { kind: "material-authority", material: CHARACTER, authority: "system" },
      { material: SHARED, entityId: "shared-actor" },
      { material: SHARED, entityId: "self" },
      { material: CHARACTER, entityId: "self", ordinal: 1 },
      {
        kind: "material-authority",
        material: CHARACTER,
        authority: "table",
        invented: true,
      },
    ]) {
      expect(isJournalAction({ ...base, actor, generation: 1 })).toBe(false);
    }
  });

  it("uses participant revision on commit, participant epoch on every replay", () => {
    const initial = sharedWorld();
    const draft = actionDraft(initial, {
      id: "participant",
      observed: [SHARED, CHARACTER],
      mutations: [
        { target: CHARACTER, path: ["hp"], before: present(10), after: present(7) },
      ],
    });
    const changedParticipant: ActionJournalWorld = {
      ...initial,
      documents: initial.documents.map((document) =>
        document.material.kind === "character-play"
          ? { ...document, journal: { ...document.journal, revision: 6 } }
          : document
      ),
    };
    expect(commit(changedParticipant, draft)).toMatchObject({
      status: "rejected",
      reason: "document-conflict",
    });

    const committed = applied(commit(initial, draft));
    expect(
      reduceActionJournal(
        committed.world,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft).slice(1),
        },
        []
      )
    ).toMatchObject({ status: "rejected", reason: "document-conflict" });
    const disjointParticipantEdit: ActionJournalWorld = {
      ...committed.world,
      documents: committed.world.documents.map((document) =>
        document.material.kind === "character-play"
          ? {
              ...document,
              journal: { ...document.journal, revision: 7 },
              data: { ...document.data, note: "unrelated" },
            }
          : document
      ),
    };
    expect(
      reduceActionJournal(
        disjointParticipantEdit,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(committed.world, draft),
        },
        []
      )
    ).toMatchObject({ status: "rejected", reason: "document-conflict" });
    const undone = applied(
      reduceActionJournal(
        disjointParticipantEdit,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(disjointParticipantEdit, draft),
        },
        []
      )
    );
    expect(documentFor(undone.world, CHARACTER).journal.revision).toBe(8);
    expect(documentFor(undone.world, CHARACTER).data).toMatchObject({
      hp: 10,
      note: "unrelated",
    });

    const wrongEpoch: ActionJournalWorld = {
      ...committed.world,
      documents: committed.world.documents.map((document) =>
        document.material.kind === "character-play"
          ? { ...document, journal: { epoch: 12, revision: 7, actions: [] } }
          : document
      ),
    };
    expect(
      reduceActionJournal(
        wrongEpoch,
        {
          kind: "undo",
          action: draft,
          expectedGeneration: 1,
          documents: currentDocuments(wrongEpoch, draft),
        },
        []
      )
    ).toMatchObject({ status: "rejected", reason: "document-conflict" });
  });

  it("serializes concurrent disjoint commits with exact scope CAS", () => {
    const initial = localWorld({ a: 0, b: 0 });
    const a = actionDraft(initial, {
      id: "a",
      mutations: [
        { target: CHARACTER, path: ["a"], before: present(0), after: present(1) },
      ],
    });
    const b = actionDraft(initial, {
      id: "b",
      mutations: [
        { target: CHARACTER, path: ["b"], before: present(0), after: present(1) },
      ],
    });
    const committedA = applied(commit(initial, a));
    expect(commit(committedA.world, b)).toMatchObject({
      status: "rejected",
      reason: "document-conflict",
    });
    const replannedB = actionDraft(committedA.world, {
      id: "b",
      mutations: [
        { target: CHARACTER, path: ["b"], before: present(0), after: present(1) },
      ],
    });
    const committedB = applied(commit(committedA.world, replannedB));
    expect(documentFor(committedB.world, CHARACTER).data).toMatchObject({ a: 1, b: 1 });
  });

  it("resets to a fresh epoch, clears history, preserves material and rejects queued old-epoch work", () => {
    const initial = localWorld({ hp: 10 }, emptyJournal(4, 7));
    const queued = actionDraft(initial, {
      id: "queued-offline",
      mutations: [
        { target: CHARACTER, path: ["hp"], before: present(10), after: present(9) },
      ],
    });
    const reset = resetActionJournal(initial, { epoch: 4, expectedRevision: 7 });
    if (reset.status === "rejected") throw new Error(reset.reason);
    expect(journalOf(reset.world)).toEqual({ epoch: 5, revision: 8, actions: [] });
    expect(documentFor(reset.world, CHARACTER).data.hp).toBe(10);
    expect(
      resetActionJournal(reset.world, { epoch: 4, expectedRevision: 7 }).status
    ).toBe("already-applied");
    expect(
      reduceActionJournal(reset.world, { kind: "commit", action: queued }, [])
    ).toMatchObject({ status: "rejected", reason: "document-conflict" });
  });

  it("rejects non-plain, unknown, sparse, cyclic, unsorted and overlapping persisted shapes", () => {
    const world = localWorld();
    const draft = actionDraft(world);
    const action: JournalAction = { ...draft, generation: 1 };
    expect(isActionJournal({ epoch: -0, revision: 0, actions: [] })).toBe(false);
    expect(
      isActionJournal({ epoch: 1, revision: 0, actions: [action], future: true })
    ).toBe(false);

    const wrongPrototype = Object.assign(
      Object.create({ inherited: true }) as object,
      action
    );
    expect(isJournalAction(wrongPrototype)).toBe(false);

    const sparse = new Array<JournalAction>(1);
    expect(isActionJournal({ epoch: 1, revision: 0, actions: sparse })).toBe(false);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(
      isJournalAction({
        ...action,
        mutations: [
          {
            target: CHARACTER,
            path: ["hp"],
            before: present(10),
            after: { present: true, value: cyclic },
          },
        ],
      })
    ).toBe(false);

    const unsorted: JournalAction = {
      ...action,
      mutations: [
        { target: CHARACTER, path: ["z"], before: ABSENT, after: present(1) },
        { target: CHARACTER, path: ["a"], before: ABSENT, after: present(1) },
      ],
    };
    expect(isJournalAction(unsorted)).toBe(false);

    const overlapping: JournalAction = {
      ...action,
      mutations: [
        {
          target: CHARACTER,
          path: ["nested"],
          before: present({ hp: 10 }),
          after: present({ hp: 9 }),
        },
        {
          target: CHARACTER,
          path: ["nested", "hp"],
          before: present(10),
          after: present(9),
        },
      ],
    };
    expect(isJournalAction(overlapping)).toBe(false);

    for (const root of ["schema", "buildRevision", "epoch", "revision", "actions"]) {
      expect(
        isJournalAction({
          ...action,
          mutations: [
            { target: CHARACTER, path: [root], before: ABSENT, after: present(1) },
          ],
        })
      ).toBe(false);
    }
    expect(
      isActionJournalWorld({
        scope: CHARACTER,
        documents: [{ material: CHARACTER, journal: emptyJournal(), data: null }],
      })
    ).toBe(false);
  });
});
