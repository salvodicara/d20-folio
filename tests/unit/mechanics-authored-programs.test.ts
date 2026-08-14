import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { TRANSCRIPTION_BINDINGS, transcribeSpell } from "@/lib/mechanics-transcription";
import { beginMechanicsCausalState, parseMechanicsWorld } from "@/lib/mechanics-world";
import type {
  MechanicsAuthorityDefinition,
  MechanicsAuthoritySnapshot,
} from "@/types/mechanics-authority";
import type { MechanicsAnswer } from "@/types/mechanics-program";
import type { MechanicsProgram } from "@/types/mechanics-program-authoring";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsCausalState, MechanicsWorld } from "@/types/mechanics-world";

/**
 * The hand-authored `mechanicsProgram` corpus: every legacy-effect-program
 * spell that carries a canonical-format program must transcribe verbatim into
 * an executable program, and two representative shapes run end-to-end through
 * the live causal protocol — the armed-smite double pulse (Searing Smite) and
 * the register-accumulator detonation (Delayed Blast Fireball).
 */

const AUTHORED_SPELL_IDS = [
  "contagion",
  "delayed-blast-fireball",
  "dragons-breath",
  "ensnaring-strike",
  "melfs-acid-arrow",
  "phantasmal-force",
  "phantasmal-killer",
  "prismatic-spray",
  "prismatic-wall",
  "searing-smite",
  "spike-growth",
  "storm-of-vengeance",
  "vitriolic-sphere",
  "weird",
] as const;

const HERO = {
  characterId: "hero",
  kind: "character-play",
  uid: "user",
} as const;
const SELF = { entityId: "self", material: HERO } as const;
const ROOT = {
  occurrence: { material: HERO, occurrenceId: "root-1" },
  ordinal: 1,
} as const;
const MAX_HP_FACT = {
  address: ["hit-point-maximum"],
  expected: { present: true, value: 60 },
  lifecycle: "commit-redo",
  owner: SELF,
} as const;

function authorityReceipt(
  program: MechanicsProgram,
  staticBindings: Readonly<Record<string, number>>
): MechanicsProgramAuthorityReceipt {
  const capability = {
    capabilityId: program.id,
    definition: {
      catalogueKind: "spell",
      entityId: program.id,
      kind: "catalogue",
      mechanicsRevision: canonicalFingerprint({ program }),
    },
    kind: "program",
  } as const;
  const installation = {
    capability,
    generation: 1,
    installationId: `installation.${program.id}`,
    owner: SELF,
  } as const;
  return {
    anchors: {
      activator: SELF,
      caster: SELF,
      owner: SELF,
      source: SELF,
      target: SELF,
    },
    installation,
    schema: 1,
    snapshot: {
      grantGroups: {},
      program,
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: SELF },
    staticBindings,
  };
}

function authoritySnapshot(
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): MechanicsAuthoritySnapshot {
  const definition: MechanicsAuthorityDefinition = {
    actorSpec: { kind: "role", role: "owner" },
    anchors: authority.anchors,
    definitionGuards: [
      {
        address: mechanicsDefinitionFactAddress(authority.snapshot.ref.definition),
        expected: {
          present: true,
          value: mechanicsCapabilitySnapshotFingerprint(authority.snapshot),
        },
        lifecycle: "commit",
        owner: authority.installation.owner,
      },
    ],
    installation: authority.installation,
    installationGuards: [],
    owner: authority.installation.owner,
    snapshot: authority.snapshot,
    source: authority.source,
    staticBindings: authority.staticBindings,
  };
  return {
    definitions: [
      {
        ...definition,
        installationGuards: [
          {
            address: mechanicsInstallationFactAddress(authority.installation),
            expected: {
              present: true,
              value: mechanicsAuthorityDefinitionFingerprint(definition),
            },
            lifecycle: "commit",
            owner: authority.installation.owner,
          },
        ],
      },
    ],
  };
}

function worldWithSlots(slotLevel: number): MechanicsWorld {
  const base = createEmptyCharacterMaterialState(5, HERO, {
    hitPoints: {
      current: 60,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  });
  const parsed = parseMechanicsWorld({
    documents: [
      {
        kind: "character",
        material: HERO,
        state: {
          ...base,
          resources: {
            ...base.resources,
            standardSpellSlots: {
              [String(slotLevel)]: {
                capacity: { base: { kind: "unbounded" }, override: null },
                current: 2,
                disabled: false,
                kind: "count",
              },
            },
          },
        },
      },
    ],
    scope: HERO,
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

function slotFacts(slotLevel: number) {
  return [
    {
      address: [
        "resource-definition",
        "resources",
        "standardSpellSlots",
        String(slotLevel),
      ],
      expected: {
        present: true,
        value: {
          bindings: {},
          spec: {
            capacity: { kind: "unbounded" },
            id: "standard-spell-slot",
            initial: { kind: "empty" },
            kind: "count",
            recoveries: [],
          },
        },
      },
      lifecycle: "commit",
      owner: SELF,
    } as const,
  ];
}

function trailIds(value: unknown): string[] {
  return [
    ...new Set(
      [...JSON.stringify(value).matchAll(/"trailId":"([^"]+)"/g)].map(
        (match) => match[1] ?? ""
      )
    ),
  ];
}

function heroState(state: Readonly<MechanicsCausalState>) {
  const document = state.world.documents[0];
  if (!document || document.kind !== "character") throw new Error("state fixture");
  return document.state;
}

interface DriveScript {
  /** One face list per d20 requirement in arrival order. */
  readonly d20Faces: readonly (readonly number[])[];
  readonly diceFace: number;
  readonly slotLevel: number | null;
  readonly targets: number;
}

/** Answer needs-answer demands until the action completes; record dice trails. */
function drive(
  run: (
    answers: readonly MechanicsAnswer[]
  ) => ReturnType<typeof runMechanicsCausalAction>,
  script: DriveScript
) {
  const answers: MechanicsAnswer[] = [];
  const demandedDiceTrails: number[] = [];
  let d20RequirementIndex = 0;
  let outcome = run(answers);
  for (
    let remaining = 12;
    outcome.status === "needs-answer" && remaining > 0;
    remaining -= 1
  ) {
    const requirement = outcome.requirement;
    if (!requirement) throw new Error("missing requirement");
    if (requirement.kind === "resource" && script.slotLevel !== null) {
      answers.push({
        inputId: requirement.inputId,
        kind: "resource",
        resource: {
          character: HERO,
          kind: "standard-spell-slot",
          level: script.slotLevel,
        },
      });
    } else if (requirement.kind === "entities") {
      answers.push({
        inputId: requirement.inputId,
        kind: "entities",
        targets: Array.from({ length: script.targets }, () => SELF),
      });
    } else if (requirement.kind === "d20") {
      const faces = script.d20Faces[d20RequirementIndex] ?? [];
      d20RequirementIndex += 1;
      answers.push({
        inputId: requirement.inputId,
        kind: "d20",
        requests: requirement.requests.map(({ identity, review }, index) => ({
          identity,
          observation: {
            d20: {
              aggregates: [],
              trails: trailIds(review).map((trailId) => ({
                initialFace: faces[index] ?? 1,
                steps: [],
                trailId,
              })),
            },
            enteredModifiers: [],
            tableOverride: null,
          },
          payments: [],
        })),
      });
    } else if (requirement.kind === "dice") {
      for (const request of requirement.requests) {
        demandedDiceTrails.push(trailIds(request.roll).length);
      }
      answers.push({
        inputId: requirement.inputId,
        kind: "dice",
        requests: requirement.requests.map(({ identity, roll }) => ({
          identity,
          observation: {
            aggregates: [],
            trails: trailIds(roll).map((trailId) => ({
              initialFace: script.diceFace,
              steps: [],
              trailId,
            })),
          },
          payments: [],
        })),
      });
    } else {
      throw new Error(`unexpected requirement: ${requirement.kind}`);
    }
    outcome = run(answers);
  }
  if (outcome.status === "rejected") throw new Error(JSON.stringify(outcome));
  expect(outcome.status).toBe("complete");
  if (outcome.status !== "complete") throw new Error("incomplete");
  return { causal: outcome.state, demandedDiceTrails, state: heroState(outcome.state) };
}

/** Cast one authored spell fresh through the live invocation protocol. */
function castAuthored(
  spellId: string,
  slotLevel: number,
  bindings: Readonly<Record<string, number>>,
  script: Omit<DriveScript, "slotLevel">
) {
  const spell = spells.find((entry) => entry.id === spellId);
  if (!spell) throw new Error(`${spellId} fixture`);
  const transcription = transcribeSpell(spell);
  if (!transcription.program) {
    throw new Error(`${spellId} program: ${JSON.stringify(transcription.clauses)}`);
  }
  const authority = authorityReceipt(transcription.program, bindings);
  const facts = [MAX_HP_FACT, ...slotFacts(slotLevel)] as const;
  const begun = beginMechanicsCausalState(worldWithSlots(slotLevel));
  if (!begun.ok) throw new Error(begun.reason);
  const initial = begun.value;
  const outcome = drive(
    (answers) =>
      runMechanicsCausalAction({
        answers,
        authoritySnapshot: authoritySnapshot(authority),
        facts,
        frameAnswers: [],
        intent: {
          actionId: `cast-${spellId}`,
          factGuards: [],
          frame: {
            authority,
            invocation: {
              installation: authority.installation,
              kind: "installed-capability",
            },
            rootReceipt: {
              kind: "create",
              materialEpoch: 0,
              next: { execution: 1, phaseId: "resolve", triggerEventId: null },
              root: ROOT,
            },
            trigger: { kind: "invocation" },
          },
        },
        responses: [],
        state: initial,
        turnEconomy: [],
      }),
    { ...script, slotLevel }
  );
  return { authority, facts, ...outcome };
}

interface PulsePlan {
  readonly actionId: string;
  readonly eventId: string;
  readonly execution: number;
  readonly phaseId: string;
  readonly priorTriggerEventId: string | null;
  readonly script: Omit<DriveScript, "slotLevel">;
}

/** Advance one root-pulse phase execution against the threaded causal state. */
function advancePulse(
  cast: {
    readonly authority: MechanicsProgramAuthorityReceipt;
    readonly causal: Readonly<MechanicsCausalState>;
    readonly facts: readonly unknown[];
  },
  plan: PulsePlan
) {
  const triggerEventId = `${plan.eventId}.${plan.execution + 1}`;
  return drive(
    (answers) =>
      runMechanicsCausalAction({
        answers,
        authoritySnapshot: authoritySnapshot(cast.authority),
        facts: cast.facts as never,
        frameAnswers: [],
        intent: {
          actionId: plan.actionId,
          factGuards: [],
          frame: {
            authority: cast.authority,
            invocation: { kind: "program-root", occurrence: ROOT },
            rootReceipt: {
              expected: {
                execution: plan.execution,
                phaseId: plan.phaseId,
                triggerEventId: plan.priorTriggerEventId,
              },
              kind: "advance",
              next: {
                execution: plan.execution + 1,
                phaseId: plan.phaseId,
                triggerEventId,
              },
              root: ROOT,
            },
            trigger: { eventId: plan.eventId, kind: "root-pulse", triggerEventId },
          },
        },
        responses: [],
        state: cast.causal,
        turnEconomy: [],
      }),
    { ...plan.script, slotLevel: null }
  );
}

function programRoot(state: ReturnType<typeof heroState>) {
  const root = Object.values(state.occurrences).find(
    (occurrence) => occurrence.kind === "program"
  );
  if (root?.kind !== "program") throw new Error("missing program root");
  return root;
}

describe("authored mechanics programs", () => {
  it("transcribes every hand-authored program into an executable program", () => {
    for (const spellId of AUTHORED_SPELL_IDS) {
      const spell = spells.find((entry) => entry.id === spellId);
      expect(spell, spellId).toBeDefined();
      if (!spell) continue;
      expect(spell.mechanicsProgram, spellId).toBeDefined();
      const transcription = transcribeSpell(spell);
      expect(transcription.program, spellId).not.toBeNull();
      expect(transcription.program?.id, spellId).toBe(`spell:${spellId}`);
      expect(
        transcription.clauses.filter((clause) => clause.status === "unsupported"),
        spellId
      ).toEqual([]);
    }
  });

  it(
    "searing-smite: cast arms, the strike burns, the save series ends it",
    {
      timeout: 30000,
    },
    () => {
      const cast = castAuthored(
        "searing-smite",
        1,
        { [TRANSCRIPTION_BINDINGS.saveDc]: 15 },
        { d20Faces: [], diceFace: 3, targets: 0 }
      );
      // The cast pays the slot and arms the smite; both pulses sit at zero.
      expect(cast.state.resources.standardSpellSlots["1"]?.current).toBe(1);
      expect(cast.state.vitals.hitPoints.current).toBe(60);
      const armed = programRoot(cast.state);
      expect(armed.registers["cast-level"]).toBe(1);
      expect(armed.phaseState["strike"]).toMatchObject({ execution: 0 });
      expect(armed.phaseState["pulse"]).toMatchObject({ execution: 0 });
      expect(
        Object.values(cast.state.occurrences).filter(
          (occurrence) => occurrence.kind === "standing"
        )
      ).toHaveLength(1);

      // The landed weapon attack: 1d6 fire at face 3 and the burning standing.
      const strike = advancePulse(cast, {
        actionId: "searing-smite-strike",
        eventId: "strike",
        execution: 0,
        phaseId: "strike",
        priorTriggerEventId: null,
        script: { d20Faces: [], diceFace: 3, targets: 1 },
      });
      expect(strike.demandedDiceTrails).toEqual([1]);
      expect(strike.state.vitals.hitPoints.current).toBe(57);
      expect(
        Object.values(strike.state.occurrences).filter(
          (occurrence) => occurrence.kind === "standing"
        )
      ).toHaveLength(2);

      // Burn pulse one: save 3 vs DC 15 fails, another 1d6 fire lands.
      const failedSave = advancePulse(
        { ...cast, causal: strike.causal },
        {
          actionId: "searing-smite-pulse-1",
          eventId: "pulse",
          execution: 0,
          phaseId: "pulse",
          priorTriggerEventId: null,
          script: { d20Faces: [[3]], diceFace: 3, targets: 1 },
        }
      );
      expect(failedSave.state.vitals.hitPoints.current).toBe(54);
      expect(programRoot(failedSave.state).phaseState["pulse"]).toMatchObject({
        execution: 1,
        lastTriggerEventId: "pulse.1",
      });

      // Burn pulse two: save 18 succeeds — no damage, the program ends whole.
      const savedThrough = advancePulse(
        { ...cast, causal: failedSave.causal },
        {
          actionId: "searing-smite-pulse-2",
          eventId: "pulse",
          execution: 1,
          phaseId: "pulse",
          priorTriggerEventId: "pulse.1",
          script: { d20Faces: [[18]], diceFace: 3, targets: 1 },
        }
      );
      expect(savedThrough.state.vitals.hitPoints.current).toBe(54);
      expect(savedThrough.state.occurrences).toEqual({});
    }
  );

  it(
    "delayed-blast-fireball: two accrued beams detonate as (12+2)d6",
    {
      timeout: 30000,
    },
    () => {
      const cast = castAuthored(
        "delayed-blast-fireball",
        7,
        { [TRANSCRIPTION_BINDINGS.saveDc]: 15 },
        { d20Faces: [], diceFace: 3, targets: 0 }
      );
      // The cast pays the slot, holds concentration and plants the base 12 dice.
      expect(cast.state.resources.standardSpellSlots["7"]?.current).toBe(1);
      expect(cast.state.vitals.hitPoints.current).toBe(60);
      expect(programRoot(cast.state).registers["beam-accumulator"]).toBe(12);
      expect(
        Object.values(cast.state.occurrences).some(
          (occurrence) => occurrence.kind === "concentration"
        )
      ).toBe(true);

      // Two caster turn-ends accrue one die each.
      const firstAccrual = advancePulse(cast, {
        actionId: "delayed-blast-accrue-1",
        eventId: "accrue",
        execution: 0,
        phaseId: "accrue",
        priorTriggerEventId: null,
        script: { d20Faces: [], diceFace: 3, targets: 0 },
      });
      const secondAccrual = advancePulse(
        { ...cast, causal: firstAccrual.causal },
        {
          actionId: "delayed-blast-accrue-2",
          eventId: "accrue",
          execution: 1,
          phaseId: "accrue",
          priorTriggerEventId: "accrue.1",
          script: { d20Faces: [], diceFace: 3, targets: 0 },
        }
      );
      expect(programRoot(secondAccrual.state).registers["beam-accumulator"]).toBe(14);
      expect(programRoot(secondAccrual.state).phaseState["accrue"]).toMatchObject({
        execution: 2,
        lastTriggerEventId: "accrue.2",
      });

      // The detonation: a failed save eats the full (12+2)d6 at face 3 = 42.
      const detonation = advancePulse(
        { ...cast, causal: secondAccrual.causal },
        {
          actionId: "delayed-blast-detonate",
          eventId: "detonate",
          execution: 0,
          phaseId: "detonate",
          priorTriggerEventId: null,
          script: { d20Faces: [[3]], diceFace: 3, targets: 1 },
        }
      );
      expect(detonation.demandedDiceTrails).toEqual([14]);
      expect(detonation.state.vitals.hitPoints.current).toBe(18);
      // The terminal end-program consumed the root and its concentration.
      expect(detonation.state.occurrences).toEqual({});
    }
  );
});
