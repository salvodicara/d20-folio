/**
 * The INCOMING-DAMAGE REACTION runtime (solo play).
 *
 * When table-entered damage lands on the character, an eligible damage
 * reaction (Uncanny Dodge, Interpose Shield) can adjust it BEFORE it
 * finalizes — and the kernel wants that adjustment INSIDE the damaging causal
 * action itself (the compiler's `incoming-damage-adjustment` is
 * conformance-locked to `damage-taken` phases). This module realizes that
 * shape without any world surgery: the reaction's transcribed program (an
 * invocation phase that claims the round's Reaction + a `damage-taken` phase
 * carrying the adjustment) is COMPOSED with the entered hit — the entered
 * damage parts become one `damage` step appended to the invocation phase — so
 * one causal action runs: the reaction is declared, the hit lands, the
 * program's own reactive phase fires on the emitted `damage-taken` event and
 * compensates exactly, the spent reaction ends, and the whole exchange
 * commits as ONE journal action (one exact undo).
 *
 * Eligibility is honest and narrow: only reactions whose program needs NO
 * answers anywhere (Uncanny Dodge's halving, Interpose Shield's negation).
 * A damage reaction that rolls dice (Deflect Attacks' 1d10 + DEX + level)
 * transcribes through the same family but stays with its legacy card until
 * the prompt collects entered rolls — a documented leftover, never a silent
 * gap. The trigger's attack/save-delivered fact is AFFIRMED by the player's
 * pick, exactly like the legacy reaction card's click.
 *
 * Known model boundary (documented, kernel-owned): the kernel applies the
 * full entered damage and then heals back the reduction inside the same
 * action. A hit that would only transiently cross 0 HP before the reduction
 * therefore passes through the world's 0-HP machinery; the final state
 * matches the RAW outcome, but concentration held by the ENGINE could break
 * on the transient zero. The store-level seam avoids offering the engine
 * path at 0 HP; the transient-crossing edge is accepted and pinned here.
 */

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { totalLevel } from "@/lib/classes";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import {
  transcribeFeatureAction,
  TRANSCRIPTION_BINDINGS,
} from "@/lib/mechanics-transcription";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import {
  boundaryCommitFacts,
  characterMaterialRef,
  characterSelfRef,
  characterTrackerSeeds,
  characterTurnEconomy,
  characterWorldState,
  commitCharacterAction,
  engineSelfDamage,
  mechanicsAuthorityDefinition,
  planSoloEncounterStart,
  resolveFeatureActionRuntime,
  undoCharacterAction,
  type CharacterActionCommit,
} from "@/lib/mechanics-world-store";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import type { DamageInstance } from "@/lib/damage-intake";
import type { SrdActionDef } from "@/data/types";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { DamageDelivery, DamageType } from "@/types/damage";
import type { CharacterMaterialState } from "@/types/material-state";
import type { EntityRef } from "@/types/mechanics-reference";
import type { MechanicsProgram } from "@/types/mechanics-program-authoring";
import type { ReactionTrigger } from "@/data/types";

/** One offerable damage reaction: the resolved action, its transcribed
 * program, and the identities every mirror keys by. */
export interface DamageReactionOption {
  readonly action: Readonly<SrdActionDef>;
  /** The damage deliveries the reaction's adjustment selector admits — the
   *  prompt offers the option only for a matching entry kind. */
  readonly deliveries: readonly DamageDelivery[];
  readonly featureId: string;
  readonly ordinal: number;
  readonly program: Readonly<MechanicsProgram>;
  /** The legacy resolved-action ROW id (`<featureId>-<actionId|type>`) — the
   *  reaction-economy mirror (`combatStore.useReaction`) keys by it. */
  readonly rowId: string;
  /** The structured reaction-trigger token, for the localized trigger line. */
  readonly trigger: ReactionTrigger | undefined;
}

/** The damage-taken phase carrying the reaction's adjustment, if any. */
function adjustmentPhase(program: Readonly<MechanicsProgram>) {
  return program.phases.find(
    (phase) =>
      phase.trigger.kind === "damage-taken" &&
      phase.steps.some((step) => step.kind === "incoming-damage-adjustment")
  );
}

/**
 * Every damage reaction the character can fire from the damage-entry prompt:
 * feature/feat-granted `type: "reaction"` actions whose transcription yields
 * a program with a `damage-taken` adjustment phase AND no inputs anywhere
 * (the composed causal action must run answer-free). The scan mirrors the
 * PlayTab dispatch seam exactly (override merge, owning-class scaling level),
 * so the two can never resolve a different action.
 */
export function characterDamageReactionOptions(
  doc: Readonly<CharacterDoc>
): readonly DamageReactionOption[] {
  const options: DamageReactionOption[] = [];
  for (const ref of doc.character.features) {
    if ("custom" in ref) continue;
    const source = getSrdFeatureSource(ref.srdId);
    const actions = source?.mechanics?.actions;
    if (!source || !actions) continue;
    const featureId = "id" in source ? source.id : ref.srdId;
    for (const [ordinal, authored] of actions.entries()) {
      if (authored.type !== "reaction") continue;
      const override =
        ref.actionOverrides?.find(
          (candidate) => candidate.id !== undefined && candidate.id === authored.id
        ) ?? ref.actionOverrides?.[ordinal];
      const merged = { ...authored, ...override } as SrdActionDef;
      const owningClass =
        "class" in source
          ? doc.character.classes.find((entry) => entry.classId === source.class)
          : undefined;
      const scalingLevel = owningClass?.level ?? totalLevel(doc.character);
      const runtime = resolveFeatureActionRuntime(doc, featureId, merged, {
        scalingLevel,
      });
      const transcription = transcribeFeatureAction(
        featureId,
        runtime.action,
        ordinal,
        runtime.context
      );
      const program = transcription.program;
      if (!program) continue;
      const reactive = adjustmentPhase(program);
      if (!reactive) continue;
      // Answer-free constraint: a reaction whose program demands any input
      // (Deflect Attacks' entered 1d10) stays with its legacy card until the
      // prompt collects rolls — an honest leftover, never a silent gap.
      if (program.phases.some((phase) => phase.inputs.length > 0)) continue;
      const adjustment = reactive.steps.find(
        (step): step is Extract<typeof step, { kind: "incoming-damage-adjustment" }> =>
          step.kind === "incoming-damage-adjustment"
      );
      options.push({
        action: runtime.action,
        deliveries: adjustment?.selector.deliveries ?? [],
        featureId,
        ordinal,
        program,
        rowId: `${featureId}-${runtime.action.id ?? runtime.action.type}`,
        trigger: runtime.action.trigger,
      });
    }
  }
  return options;
}

/** One entered damage part, post-defense (the intake seam resolves defenses
 * BEFORE the prompt — the kernel receives the net numbers). */
export interface EnteredDamagePart {
  readonly amount: number;
  readonly damageType: DamageType;
}

/**
 * One parked damage entry awaiting the player's reaction decision — ephemeral
 * store state (never persisted): the entry gesture either commits WITH a
 * picked reaction (one kernel causal action) or falls through to the plain
 * legacy damage path on skip.
 */
export interface PendingDamageReactionPrompt {
  /** The doc the entry was made against — a prompt never survives a switch. */
  readonly characterId: string;
  readonly crit: boolean;
  readonly id: string;
  /** Post-defense typed parts for the kernel (untyped table damage carries
   *  the generic weapon-hit default type — see the entry seam's note). */
  readonly netParts: readonly EnteredDamagePart[];
  readonly netTotal: number;
  /** Offerable reaction row ids; the commit recomputes the option from the
   *  LIVE doc by row id, never from a stale captured object. */
  readonly optionRowIds: readonly string[];
  /** The ORIGINAL entered parts (pre-defense) — the skip path re-dispatches
   *  them through the ordinary entry engine. */
  readonly parts: readonly DamageInstance[];
  readonly rawTotal: number;
}

/**
 * Compose the table-entered hit AROUND the reaction program: the entered
 * parts become one `damage` step appended to the invocation phase (after the
 * reaction claim), so the program's own `damage-taken` phase fires on that
 * step's emission within the same causal action — the coordinator dispatches
 * the reactive audience BEFORE compiling the invocation's remaining steps.
 *
 * The single-use end MOVES: the canonical reaction program ends itself from
 * its own `damage-taken` phase (`end-program` in "deflect" — the honest
 * standalone shape), but a root end REQUESTED from a dispatched subscriber
 * frame rejects the causal end wave (kernel-proven: the pop with end
 * requests fails `invalid-end-wave`). Composing therefore strips the
 * reactive phase's `end-program` and appends the SAME end to the invocation
 * tail — it compiles after the reactive audience has fired, so the exchange
 * still ends the spent reaction inside the one causal action and nothing
 * lingers armed. Fail-closed through full program conformance.
 */
export function composeDamageEntryProgram(
  reaction: Readonly<MechanicsProgram>,
  delivery: DamageDelivery,
  parts: readonly EnteredDamagePart[]
): Readonly<MechanicsProgram> | null {
  if (
    parts.length === 0 ||
    parts.some((part) => !Number.isSafeInteger(part.amount) || part.amount <= 0)
  ) {
    return null;
  }
  const value = structuredClone(reaction) as unknown as {
    id: string;
    phases: { steps: { kind: string }[]; trigger: { kind: string } }[];
  };
  const invocation = value.phases.find((phase) => phase.trigger.kind === "invocation");
  if (!invocation) return null;
  for (const phase of value.phases) {
    if (phase.trigger.kind === "damage-taken") {
      phase.steps = phase.steps.filter((step) => step.kind !== "end-program");
    }
  }
  invocation.steps.push(
    {
      delivery,
      kind: "damage",
      parts: parts.map((part, index) => ({
        amount: {
          expression: { kind: "fixed", value: part.amount },
          kind: "integer",
        },
        damageType: part.damageType,
        partId: `entered-${index + 1}`,
      })),
      stepId: "entered-hit",
      target: { kind: "role", role: "caster" },
      traits: [],
      when: null,
    } as unknown as { kind: string },
    { kind: "end-program", stepId: "reaction-spent", when: null } as unknown as {
      kind: string;
    }
  );
  return conformMechanicsProgram({ ...value, id: `${reaction.id}:entered-hit` });
}

const MAX_HP_ADDRESS = ["hit-point-maximum"] as const;

function maxHpFact(self: Readonly<EntityRef>, maxHp: number) {
  return {
    address: [...MAX_HP_ADDRESS],
    expected: { present: true, value: maxHp },
    lifecycle: "commit-redo",
    owner: self,
  } as const;
}

export interface DamageEntryCommit {
  readonly actionId: string;
  readonly session: Readonly<SessionState>;
  readonly world: Readonly<CharacterMaterialState>;
}

export interface DamageReactionRunResult {
  /** The one-way lazy solo-encounter start (apply FIRST; never undone —
   *  a crossed engine boundary is a fact, the solo-loop doctrine). */
  readonly encounterStart: DamageEntryCommit | null;
  /** The one causal action: claim + entered hit + compensating adjustment. */
  readonly reaction: DamageEntryCommit;
  /** The entered (pre-reaction) total. */
  readonly fullDamage: number;
  /** The damage that actually landed after the reaction (current + temp). */
  readonly takenDamage: number;
}

/**
 * Run one entered hit WITH the picked reaction through the kernel: ensure the
 * solo world encounter (the reaction claim commits against its economy
 * ledger — started lazily exactly like the solo turn loop), compose the
 * entered-hit program, run the one causal action answer-free, and commit it
 * through the canonical journal. Null on any rejection — the caller degrades
 * to the plain legacy damage path, never a dead end.
 */
export function runDamageReactionEntry(
  doc: Readonly<CharacterDoc>,
  uid: string,
  option: Readonly<DamageReactionOption>,
  parts: readonly EnteredDamagePart[],
  round: number
): DamageReactionRunResult | null {
  let liveDoc = doc;
  let world = characterWorldState(
    liveDoc,
    uid,
    liveDoc.character.hp.max,
    {},
    characterTrackerSeeds(liveDoc)
  );
  if (!world) return null;

  let encounterStart: DamageEntryCommit | null = null;
  if (world.encounter?.phase !== "turns") {
    if (world.encounter !== null) return null;
    const startId = `damage-reaction-combat-start:${canonicalFingerprint({
      revision: world.revision,
      round,
    })}`;
    const start = planSoloEncounterStart(
      liveDoc,
      uid,
      world,
      Math.max(1, round),
      startId,
      null
    );
    if (!start) return null;
    const committed = commitCharacterAction(
      liveDoc,
      uid,
      world,
      start,
      boundaryCommitFacts(start)
    );
    if (!committed) return null;
    encounterStart = {
      actionId: startId,
      session: committed.session,
      world: committed.world,
    };
    liveDoc = { ...liveDoc, session: committed.session };
    world = committed.world;
  }

  const delivery = option.deliveries[0] ?? "attack";
  const program = composeDamageEntryProgram(option.program, delivery, parts);
  if (!program) return null;

  const self = characterSelfRef(liveDoc, uid);
  const capability = {
    capabilityId: program.id,
    definition: {
      catalogueKind: "class-feature",
      entityId: option.featureId,
      kind: "catalogue",
      mechanicsRevision: canonicalFingerprint({ program }),
    },
    kind: "program",
  } as const;
  const authority = conformMechanicsProgramAuthorityReceipt({
    anchors: { activator: self, caster: self, owner: self, source: self, target: self },
    installation: {
      capability,
      generation: 1,
      installationId: program.id,
      owner: self,
    },
    schema: 1,
    snapshot: { grantGroups: {}, program, ref: capability, resources: {}, schema: 1 },
    source: { capability, kind: "capability", owner: self },
    staticBindings: {
      // The offered options are answer-free and binding-free today; the two
      // canonical bindings are still supplied so a future bonus-bearing
      // reaction fails visibly in tests, never at the table.
      [TRANSCRIPTION_BINDINGS.featureBonus]: 0,
      [TRANSCRIPTION_BINDINGS.saveDc]: 8,
    },
  });
  if (!authority) return null;

  const material = characterMaterialRef(liveDoc, uid);
  const begun = beginMechanicsCausalState({
    documents: [{ kind: "character", material, state: world }],
    scope: material,
  });
  if (!begun.ok) return null;
  const actionId = `damage-reaction:${option.rowId}:${canonicalFingerprint({
    parts,
    revision: world.revision,
  })}`;
  const outcome = runMechanicsCausalAction({
    answers: [],
    authoritySnapshot: { definitions: [mechanicsAuthorityDefinition(authority)] },
    facts: [maxHpFact(self, liveDoc.character.hp.max)],
    frameAnswers: [],
    intent: {
      actionId,
      factGuards: [],
      frame: {
        authority,
        invocation: {
          installation: authority.installation,
          kind: "installed-capability",
        },
        rootReceipt: {
          kind: "create",
          materialEpoch: world.epoch,
          next: { execution: 1, phaseId: "resolve", triggerEventId: null },
          root: {
            occurrence: {
              material,
              occurrenceId: `${option.rowId}-${world.nextOccurrenceOrdinal}`,
            },
            ordinal: world.nextOccurrenceOrdinal,
          },
        },
        trigger: { kind: "invocation" },
      },
    },
    responses: [],
    state: begun.value,
    turnEconomy: characterTurnEconomy(liveDoc, uid),
  });
  if (outcome.status !== "complete" || !outcome.action) return null;
  const committed = commitCharacterAction(
    liveDoc,
    uid,
    world,
    outcome.action,
    outcome.action.guards.facts.map((fact) => ({
      actual: fact.expected,
      address: fact.address,
      owner: fact.owner,
    }))
  );
  if (!committed) return null;
  return {
    encounterStart,
    fullDamage: parts.reduce((total, part) => total + part.amount, 0),
    reaction: { actionId, session: committed.session, world: committed.world },
    takenDamage: engineSelfDamage(world, committed.world),
  };
}

/**
 * Exactly reverse one committed damage-reaction action against the CURRENT
 * persisted doc (journal generation reverse — HP and the reaction claim
 * restore in the same motion). Null when the world no longer matches.
 */
export function undoDamageReactionEntry(
  doc: Readonly<CharacterDoc>,
  uid: string,
  actionId: string
): CharacterActionCommit | null {
  const world = characterWorldState(
    doc,
    uid,
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (!world) return null;
  return undoCharacterAction(doc, uid, world, actionId);
}
