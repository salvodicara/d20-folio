import { describe, expect, it } from "vitest";

import {
  journalActorRefKey,
  materialRefKey,
  reduceActionJournal,
} from "@/lib/action-journal";
import {
  createEmptyCharacterMaterialState,
  createEmptySharedMaterialState,
} from "@/lib/material-state";
import { planMechanicsWorldAction } from "@/lib/mechanics-action";
import { parseMechanicsWorld } from "@/lib/mechanics-world";
import type {
  ActionFactGuard,
  ActionJournalWorld,
  JournalActorRef,
  JsonValue,
} from "@/types/action-journal";
import type { MaterialRef } from "@/types/mechanics-reference";
import type { MechanicsWorld } from "@/types/mechanics-world";

const CHARACTER = {
  kind: "character-play",
  uid: "user-1",
  characterId: "character-1",
} as const satisfies MaterialRef;
const SHARED = {
  kind: "shared-combat",
  campaignId: "campaign-1",
} as const satisfies MaterialRef;
const ACTOR = {
  material: CHARACTER,
  entityId: "self",
} as const satisfies JournalActorRef;

function livingVitals(current: number) {
  return {
    hitPoints: {
      current,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  } as const;
}

function parsed(value: unknown): MechanicsWorld {
  const result = parseMechanicsWorld(value);
  if (!result.ok) throw new Error(`Invalid mechanics-world fixture: ${result.reason}`);
  return result.value;
}

function localWorld(): MechanicsWorld {
  const state = structuredClone(
    createEmptyCharacterMaterialState(4, CHARACTER, livingVitals(10))
  );
  return parsed({
    scope: CHARACTER,
    documents: [{ kind: "character", material: CHARACTER, state }],
  });
}

function sharedWorld(): MechanicsWorld {
  const shared = createEmptySharedMaterialState();
  const character = structuredClone(
    createEmptyCharacterMaterialState(4, CHARACTER, livingVitals(10))
  );
  const documents = [
    { kind: "shared" as const, material: SHARED, state: shared },
    { kind: "character" as const, material: CHARACTER, state: character },
  ].sort((left, right) =>
    materialRefKey(left.material).localeCompare(materialRefKey(right.material))
  );
  return parsed({ scope: SHARED, documents });
}

function toJournalWorld(world: MechanicsWorld): ActionJournalWorld {
  return {
    scope: world.scope,
    documents: world.documents.map(({ material, state }) => {
      const { actions, epoch, revision } = state;
      const data = structuredClone(state) as unknown as Record<string, JsonValue>;
      for (const key of ["actions", "buildRevision", "epoch", "revision", "schema"]) {
        Reflect.deleteProperty(data, key);
      }
      return {
        material,
        journal: { actions, epoch, revision },
        data,
      };
    }),
  };
}

function planned(
  result: ReturnType<typeof planMechanicsWorldAction>
): Extract<typeof result, { status: "planned" }> {
  if (result.status !== "planned") {
    throw new Error(`Expected plan, got ${JSON.stringify(result)}`);
  }
  return result;
}

describe("mechanics world to ActionJournal adapter", () => {
  it("compiles a local simulation into exact leaf mutations and lets the journal commit it", () => {
    const before = localWorld();
    const after = structuredClone(before);
    const document = after.documents[0];
    if (!document || document.kind !== "character") throw new Error("fixture");
    Reflect.set(document.state.vitals.hitPoints, "current", 3);
    Reflect.set(document.state, "heroicInspiration", true);

    const result = planned(
      planMechanicsWorldAction(before, after, { id: "damage:1", actor: ACTOR })
    );
    expect(result.action.mutations).toEqual([
      {
        target: CHARACTER,
        path: ["heroicInspiration"],
        before: { present: true, value: false },
        after: { present: true, value: true },
      },
      {
        target: CHARACTER,
        path: ["vitals", "hitPoints", "current"],
        before: { present: true, value: 10 },
        after: { present: true, value: 3 },
      },
    ]);
    expect(result.action.guards.documents).toEqual([
      { material: CHARACTER, epoch: 0, revision: 0 },
    ]);

    const committed = reduceActionJournal(
      toJournalWorld(before),
      { kind: "commit", action: result.action },
      []
    );
    expect(committed.status).toBe("applied");
    if (committed.status !== "applied") return;
    expect(committed.world.documents[0]?.data).toMatchObject({
      heroicInspiration: true,
      vitals: { hitPoints: { current: 3 } },
    });
    expect(committed.world.documents[0]?.journal).toMatchObject({ revision: 1 });
  });

  it("guards every observed world document while mutating several atomically", () => {
    const before = sharedWorld();
    const after = structuredClone(before);
    for (const document of after.documents) {
      if (document.kind === "character") {
        Reflect.set(document.state.vitals.hitPoints, "current", 8);
      } else document.state.timeline.elapsedSeconds = 6;
    }
    const actor = {
      kind: "material-authority",
      material: SHARED,
      authority: "environment",
    } as const satisfies JournalActorRef;
    const result = planned(
      planMechanicsWorldAction(before, after, { id: "hazard:1", actor })
    );

    expect(result.action.guards.documents).toHaveLength(2);
    expect(
      result.action.mutations.map(({ target, path }) => [target.kind, path])
    ).toEqual([
      ["shared-combat", ["timeline", "elapsedSeconds"]],
      ["character-play", ["vitals", "hitPoints", "current"]],
    ]);
    expect(
      reduceActionJournal(
        toJournalWorld(before),
        { kind: "commit", action: result.action },
        []
      ).status
    ).toBe("applied");
  });

  it("keeps ActionJournal as the only owner of protected fields and revisions", () => {
    const before = localWorld();
    const protectedChange = structuredClone(before);
    const document = protectedChange.documents[0];
    if (!document) throw new Error("fixture");
    Reflect.set(document.state, "revision", 1);
    expect(
      planMechanicsWorldAction(before, protectedChange, {
        id: "invalid:revision",
        actor: ACTOR,
      })
    ).toEqual({ status: "rejected", reason: "protected-change" });

    const buildChange = structuredClone(before);
    const buildDocument = buildChange.documents[0];
    if (!buildDocument || buildDocument.kind !== "character") {
      throw new Error("fixture");
    }
    Reflect.set(buildDocument.state, "buildRevision", 5);
    expect(
      planMechanicsWorldAction(before, buildChange, {
        id: "invalid:build",
        actor: ACTOR,
      })
    ).toEqual({ status: "rejected", reason: "protected-change" });

    expect(
      planMechanicsWorldAction(before, structuredClone(before), {
        id: "nothing",
        actor: ACTOR,
      })
    ).toEqual({ status: "no-change" });
  });

  it("rejects a different physical world, an invalid actor, or an invalid journal scope", () => {
    const before = localWorld();
    const different = sharedWorld();
    expect(
      planMechanicsWorldAction(before, different, { id: "wrong-world", actor: ACTOR })
    ).toEqual({ status: "rejected", reason: "world-mismatch" });

    const changed = structuredClone(before);
    const document = changed.documents[0];
    if (!document || document.kind !== "character") throw new Error("fixture");
    Reflect.set(document.state.vitals.hitPoints, "current", 9);
    expect(
      planMechanicsWorldAction(before, changed, {
        id: "",
        actor: ACTOR,
      })
    ).toEqual({ status: "rejected", reason: "invalid-action" });

    const secondShared = {
      kind: "shared-combat",
      campaignId: "campaign-2",
    } as const satisfies MaterialRef;
    const invalidScope = parsed({
      scope: SHARED,
      documents: [
        {
          kind: "shared",
          material: secondShared,
          state: createEmptySharedMaterialState(),
        },
        {
          kind: "shared",
          material: SHARED,
          state: createEmptySharedMaterialState(),
        },
      ].sort((left, right) =>
        materialRefKey(left.material).localeCompare(materialRefKey(right.material))
      ),
    });
    const invalidAfter = structuredClone(invalidScope);
    const firstDocument = invalidAfter.documents[0];
    if (!firstDocument) throw new Error("fixture");
    firstDocument.state.timeline.elapsedSeconds = 1;
    expect(
      planMechanicsWorldAction(invalidScope, invalidAfter, {
        id: "invalid-scope",
        actor: {
          kind: "material-authority",
          material: SHARED,
          authority: "table",
        },
      })
    ).toEqual({ status: "rejected", reason: "invalid-scope" });
  });

  it("sorts facts by owner and address and rejects one identity with two lifecycles", () => {
    const before = localWorld();
    const after = structuredClone(before);
    const document = after.documents[0];
    if (!document || document.kind !== "character") throw new Error("fixture");
    Reflect.set(document.state.vitals.hitPoints, "current", 9);
    const maximum: ActionFactGuard = {
      address: ["hit-point-maximum"],
      expected: { present: true, value: 10 },
      lifecycle: "commit-redo",
      owner: ACTOR,
    };
    const definition: ActionFactGuard = {
      address: ["resource-definition", "focus"],
      expected: { present: true, value: "focus" },
      lifecycle: "commit",
      owner: ACTOR,
    };

    const inputFacts = [definition, maximum] as const;
    const plannedFacts = planned(
      planMechanicsWorldAction(before, after, {
        id: "facts:sorted",
        actor: ACTOR,
        facts: inputFacts,
      })
    );
    expect(plannedFacts.action.guards.facts).toEqual([maximum, definition]);
    expect(plannedFacts.action.guards.facts).not.toBe(inputFacts);

    expect(
      planMechanicsWorldAction(before, after, {
        id: "facts:duplicate-lifecycle",
        actor: ACTOR,
        facts: [maximum, { ...maximum, lifecycle: "commit" }],
      })
    ).toEqual({ status: "rejected", reason: "invalid-action" });
  });

  it("sorts table and environment facts as distinct authority identities", () => {
    const before = localWorld();
    const after = structuredClone(before);
    const document = after.documents[0];
    if (!document || document.kind !== "character") throw new Error("fixture");
    Reflect.set(document.state.vitals.hitPoints, "current", 9);
    const table: ActionFactGuard = {
      address: ["mechanics-definition", "hazard"],
      expected: { present: true, value: "table-snapshot" },
      lifecycle: "commit",
      owner: { authority: "table", kind: "material-authority", material: CHARACTER },
    };
    const environment: ActionFactGuard = {
      ...table,
      expected: { present: true, value: "environment-snapshot" },
      owner: {
        authority: "environment",
        kind: "material-authority",
        material: CHARACTER,
      },
    };
    const expected = [table, environment].sort((left, right) =>
      `${journalActorRefKey(left.owner)}\u0000${JSON.stringify(left.address)}`.localeCompare(
        `${journalActorRefKey(right.owner)}\u0000${JSON.stringify(right.address)}`
      )
    );

    const result = planned(
      planMechanicsWorldAction(before, after, {
        actor: ACTOR,
        facts: [table, environment],
        id: "facts:material-authorities",
      })
    );
    expect(result.action.guards.facts).toEqual(expected);

    expect(
      planMechanicsWorldAction(before, after, {
        actor: ACTOR,
        facts: [
          {
            ...table,
            /* Deliberately re-homes the owner onto a material with no
               document so the plan must reject it. */
            owner: { ...table.owner, material: SHARED } as typeof table.owner,
          },
        ],
        id: "facts:missing-authority-document",
      })
    ).toEqual({ reason: "invalid-action", status: "rejected" });
  });
});
