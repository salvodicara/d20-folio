import { describe, expect, it } from "vitest";

import { materialRefKey } from "@/lib/action-journal";
import { projectResolvedEntityConditions } from "@/lib/condition-projection";
import { addOccurrence } from "@/lib/mechanic-occurrences";
import {
  createEmptyCharacterMaterialState,
  createEmptySharedMaterialState,
} from "@/lib/material-state";
import type { CharacterMaterialState, SharedMaterialState } from "@/types/material-state";
import type { NewMechanicOccurrence } from "@/types/mechanic-occurrence";
import type {
  CharacterMaterialRef,
  EntityRef,
  SharedMaterialRef,
} from "@/types/mechanics-reference";
import type { MechanicsDocument, MechanicsWorld } from "@/types/mechanics-world";
import type { CreatureVitals } from "@/types/vitals";

const HERO = {
  characterId: "hero-character",
  kind: "character-play",
  uid: "hero-user",
} as const satisfies CharacterMaterialRef;
const CAMPAIGN = {
  campaignId: "campaign-one",
  kind: "shared-combat",
} as const satisfies SharedMaterialRef;
const HERO_REF = { entityId: "self", material: HERO } as const satisfies EntityRef;

type NewProgramOccurrence = Extract<NewMechanicOccurrence, { kind: "program" }>;
type NewConditionOccurrence = Extract<NewMechanicOccurrence, { kind: "condition" }>;

function vitals(zeroHitPoints: CreatureVitals["zeroHitPoints"] = null): CreatureVitals {
  return {
    hitPoints: {
      current: zeroHitPoints === null ? 10 : 0,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints,
  };
}

function authoredProgram(
  id: string
): NewProgramOccurrence["authority"]["snapshot"]["program"] {
  return {
    id,
    phases: [
      {
        inputs: [],
        phaseId: "invoke",
        steps: [],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  };
}

function authority(target: EntityRef = HERO_REF): NewProgramOccurrence["authority"] {
  const definition = {
    catalogueKind: "spell",
    entityId: "spell.hold-person",
    kind: "catalogue",
    mechanicsRevision: `sha256:${"0".repeat(64)}`,
  } as const;
  const capability = {
    capabilityId: "primary",
    definition,
    kind: "program",
  } as const;
  return {
    anchors: {
      activator: HERO_REF,
      caster: HERO_REF,
      owner: HERO_REF,
      source: HERO_REF,
      target,
    },
    installation: {
      capability,
      generation: 1,
      installationId: "installation-1",
      owner: HERO_REF,
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: authoredProgram(capability.capabilityId),
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: HERO_REF },
    staticBindings: {},
  };
}

function program(
  receipt: NewProgramOccurrence["authority"] = authority()
): NewProgramOccurrence {
  return {
    authority: receipt,
    endRules: [],
    kind: "program",
    phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
    registers: {},
  };
}

function condition(
  conditionId: NewConditionOccurrence["conditionId"],
  target: EntityRef = HERO_REF,
  parentId = "root"
): NewConditionOccurrence {
  return { conditionId, endRules: [], kind: "condition", parentId, target };
}

function character(currentVitals = vitals()): CharacterMaterialState {
  return structuredClone(createEmptyCharacterMaterialState(1, HERO, currentVitals));
}

function shared(): SharedMaterialState {
  return structuredClone(createEmptySharedMaterialState());
}

function withCondition<State extends CharacterMaterialState | SharedMaterialState>(
  state: State,
  occurrenceId: string,
  conditionId: NewConditionOccurrence["conditionId"]
): State {
  const rootId = `${occurrenceId}-root`;
  const root = addOccurrence(
    {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: state.occurrences,
    },
    rootId,
    program()
  );
  const child = addOccurrence(
    root,
    occurrenceId,
    condition(conditionId, HERO_REF, rootId)
  );
  return { ...state, ...child };
}

function world(
  hero: CharacterMaterialState,
  campaign: SharedMaterialState
): MechanicsWorld {
  const documents: MechanicsDocument[] = [
    { kind: "character", material: HERO, state: hero },
    { kind: "shared", material: CAMPAIGN, state: campaign },
  ];
  documents.sort((left, right) =>
    materialRefKey(left.material).localeCompare(materialRefKey(right.material))
  );
  return { documents, scope: CAMPAIGN };
}

describe("world condition projection", () => {
  it("collects child effects across documents and strips duplicate provenance", () => {
    const hero = withCondition(character(), "same-id", "paralyzed");
    const campaign = withCondition(shared(), "same-id", "stunned");

    const result = projectResolvedEntityConditions(world(hero, campaign), HERO_REF);

    expect(result?.projection.instances).toHaveLength(2);
    expect(result?.projection.instances.every(({ source }) => source === null)).toBe(
      true
    );
    expect(result?.projection.effective.map(({ conditionId }) => conditionId)).toEqual([
      "incapacitated",
      "paralyzed",
      "stunned",
    ]);
    expect(result?.incapacitated).toBe(true);
    expect(result?.breaksConcentration).toBe(true);
    const identities = result?.projection.instances.map(({ identity }) => identity);
    expect(identities).toContainEqual({
      kind: "occurrence",
      ref: { material: HERO, occurrenceId: "same-id" },
    });
    expect(identities).toContainEqual({
      kind: "occurrence",
      ref: { material: CAMPAIGN, occurrenceId: "same-id" },
    });
  });

  it("does not project targetless program roots as conditions", () => {
    const hero = character();
    const rooted = addOccurrence(
      {
        nextOccurrenceOrdinal: hero.nextOccurrenceOrdinal,
        occurrences: hero.occurrences,
      },
      "root-only",
      program(authority())
    );

    const result = projectResolvedEntityConditions(
      world({ ...hero, ...rooted }, shared()),
      HERO_REF
    );

    expect(result?.projection.instances).toEqual([]);
  });

  it("derives zero-HP Unconscious once and retains independent Prone identity", () => {
    const hero = withCondition(
      character(vitals({ failures: 1, kind: "dying", successes: 0 })),
      "already-prone",
      "prone"
    );

    const result = projectResolvedEntityConditions(world(hero, shared()), HERO_REF);

    expect(result?.unconsciousDerivedFromZeroHitPoints).toBe(true);
    expect(result?.projection.instances).toHaveLength(2);
    expect(result?.projection.effective.map(({ conditionId }) => conditionId)).toEqual([
      "incapacitated",
      "prone",
      "unconscious",
    ]);
    expect(
      result?.projection.instances.filter(
        ({ identity }) => identity.kind === "zero-hit-points"
      )
    ).toHaveLength(1);
    expect(Object.keys(hero.occurrences)).toEqual([
      "already-prone-root",
      "already-prone",
    ]);
  });

  it("does not invent Unconscious for a dead creature", () => {
    const result = projectResolvedEntityConditions(
      world(character(vitals({ kind: "dead" })), shared()),
      HERO_REF
    );

    expect(result?.unconsciousDerivedFromZeroHitPoints).toBe(false);
    expect(result?.projection.instances).toEqual([]);
    expect(result?.incapacitated).toBe(false);
    expect(result?.breaksConcentration).toBe(true);
  });

  it("rejects Exhaustion in the effect occurrence dialect", () => {
    const root = addOccurrence(
      { nextOccurrenceOrdinal: 1, occurrences: {} },
      "root",
      program()
    );
    expect(() =>
      addOccurrence(root, "legacy-exhaustion", {
        ...condition("prone"),
        conditionId: "exhaustion",
      } as never)
    ).toThrow("Invalid occurrence insertion");
  });
});
