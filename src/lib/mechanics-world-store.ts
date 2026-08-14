/**
 * The character-owned mechanics world: one persisted `CharacterMaterialState`
 * per character (`session.world`), initialized once from the legacy session
 * facts and thereafter the sole owner of every fact the engine models.
 *
 * Rollout bridge (deleted with the final document migration of this epic):
 * while a legacy surface still reads a session field the world also owns, the
 * commit mirrors that exact field write-through so the two can never diverge.
 */

import { spellIndex } from "@/data/spells";
import { concentrationValue } from "@/lib/concentration";
import { reduceActionJournal } from "@/lib/action-journal";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { slotUsageKey } from "@/lib/cast-options";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import {
  createEmptyCharacterMaterialState,
  parseCharacterMaterialState,
} from "@/lib/material-state";
import { planMechanicsWorldAction } from "@/lib/mechanics-action";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import {
  transcribeFeatureAction,
  transcribeSpell,
  transcribeWeaponAttack,
  TRANSCRIPTION_BINDINGS,
  type SpellTranscription,
  type WeaponAttackProfile,
} from "@/lib/mechanics-transcription";
import {
  advanceMechanicsBoundary,
  beginMechanicsBoundary,
  beginMechanicsCausalState,
  completeMechanicsBoundaryCheckpoint,
  finalizeMechanicsCausalEndWave,
  rebaseMechanicsCausalState,
} from "@/lib/mechanics-world";
import { applySlotMaxOverrides, deriveSpellSlots } from "@/lib/multiclass-slots";
import {
  attacksPerActionForCharacter,
  effectiveWalkingSpeedFt,
  resolveActions,
  resolveTrackers as resolveActionsTrackerRows,
} from "@/lib/smart-tracker";
import { conformTurnEconomyProjection } from "@/lib/turn-economy";
import type {
  ActionFactGuard,
  ActionJournalWorld,
  JournalActionDraft,
  ResolvedActionFact,
} from "@/types/action-journal";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsAuthorityDefinition } from "@/types/mechanics-authority";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  CharacterMaterialRef,
  EntityRef,
  OccurrenceGenerationRef,
} from "@/types/mechanics-reference";
import type { MechanicsBoundaryCommand, MechanicsWorld } from "@/types/mechanics-world";
import type { ProgramOccurrence } from "@/types/mechanic-occurrence";
import type { TurnEconomyProjection } from "@/types/turn-economy";

export function characterMaterialRef(
  doc: { readonly id: string },
  uid: string
): CharacterMaterialRef {
  return { characterId: doc.id, kind: "character-play", uid };
}

export function characterSelfRef(doc: { readonly id: string }, uid: string): EntityRef {
  return { entityId: "self", material: characterMaterialRef(doc, uid) };
}

/**
 * Close one capability receipt into the self-witnessing authority definition
 * the coordinator verifies (definition + installation guards fingerprinting
 * the snapshot and the definition itself). The ONE shape every engine dispatch
 * surface and proof shares, so a surface can never wire a capability with a
 * differently-guarded authority.
 */
export function mechanicsAuthorityDefinition(
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): MechanicsAuthorityDefinition {
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
  };
}

function countCell(current: number) {
  return {
    capacity: { base: { kind: "unbounded" as const }, override: null },
    current: Math.max(0, current),
    disabled: false,
    kind: "count" as const,
  };
}

/**
 * The character's legacy tracker counters as world-pool seeds, from the ONE
 * tracker resolver every rail/rest surface reads (`resolveTrackers`). Passed
 * into {@link characterWorldState}, which seeds each pool EXACTLY ONCE — an
 * already-persisted pool is world truth and is never reseeded.
 */
export function characterTrackerSeeds(
  doc: Readonly<CharacterDoc>
): Readonly<Record<string, { total: number; used: number }>> {
  return Object.fromEntries(
    resolveActionsTrackerRows(doc).map((tracker) => [
      tracker.id,
      { total: tracker.total, used: tracker.used },
    ])
  );
}

/**
 * The character's live mechanics world. A persisted world is re-proved
 * fail-closed; a document that has never carried one derives it exactly once
 * from the legacy session facts the world supersedes.
 */
export function characterWorldState(
  doc: Readonly<CharacterDoc>,
  uid: string,
  maxHp: number,
  slotMaxOverrides: Readonly<Record<string, number>> = {},
  trackerSeeds: Readonly<Record<string, { total: number; used: number }>> = {}
): Readonly<CharacterMaterialState> | null {
  const material = characterMaterialRef(doc, uid);
  if (doc.session.world !== undefined) {
    const persisted = parseCharacterMaterialState(doc.session.world, material);
    if (!persisted.ok) return null;
    // Incremental tracker migration: a pool the world has never seen seeds
    // exactly once from the legacy counters at read time (one-way, additive —
    // an existing pool is world truth and is never reseeded). The next commit
    // persists the migrated pool with the action that first paid from it.
    const missing = Object.entries(trackerSeeds).filter(
      ([trackerId]) => persisted.value.resources.pools[trackerId] === undefined
    );
    if (missing.length === 0) return persisted.value;
    const reseeded = parseCharacterMaterialState(
      {
        ...structuredClone(persisted.value),
        resources: {
          ...structuredClone(persisted.value.resources),
          pools: {
            ...structuredClone(persisted.value.resources.pools),
            ...Object.fromEntries(
              missing.map(([trackerId, seed]) => [
                trackerId,
                countCell(Math.max(0, seed.total - seed.used)),
              ])
            ),
          },
        },
      },
      material
    );
    return reseeded.ok ? reseeded.value : null;
  }

  const session = doc.session;
  const current = Math.max(0, Math.min(session.hp.current, maxHp));
  const base = createEmptyCharacterMaterialState(0, material, {
    hitPoints: {
      current,
      temporary: { current: Math.max(0, session.hp.temp), sourceOccurrence: null },
    },
    zeroHitPoints:
      current > 0
        ? null
        : {
            failures: Math.min(3, Math.max(0, session.deathFail)),
            kind: "dying" as const,
            successes: Math.min(3, Math.max(0, session.deathSucc)),
          },
  });
  const slots = applySlotMaxOverrides(
    deriveSpellSlots(doc.character.classes),
    slotMaxOverrides
  );
  const pact = slots.find((slot) => slot.pactMagic);
  const seed = {
    ...structuredClone(base),
    exhaustion: Math.min(6, Math.max(0, session.exhaustion)),
    heroicInspiration: session.inspiration,
    resources: {
      ...structuredClone(base.resources),
      currency: Object.fromEntries(
        (["pp", "gp", "ep", "sp", "cp"] as const).map((denomination) => [
          denomination,
          countCell(session.currency[denomination]),
        ])
      ) as CharacterMaterialState["resources"]["currency"],
      pactSpellSlot: pact
        ? {
            cell: countCell(
              pact.total - (session.spellSlots[slotUsageKey(pact)]?.used ?? 0)
            ),
            level: pact.level,
          }
        : null,
      pools: Object.fromEntries(
        Object.entries(trackerSeeds).map(([trackerId, seed]) => [
          trackerId,
          countCell(Math.max(0, seed.total - seed.used)),
        ])
      ),
      standardSpellSlots: Object.fromEntries(
        slots.flatMap((slot) =>
          slot.pactMagic
            ? []
            : [
                [
                  String(slot.level),
                  countCell(
                    slot.total - (session.spellSlots[slotUsageKey(slot)]?.used ?? 0)
                  ),
                ],
              ]
        )
      ),
    },
  };
  const parsed = parseCharacterMaterialState(seed, material);
  return parsed.ok ? parsed.value : null;
}

// ─── The solo combat loop's canonical turn machinery ────────────────────────

/** The one participant id of the character's own solo encounter. */
export const SOLO_PARTICIPANT_ID = "self";

/**
 * The character's CURRENT turn-economy capability projection, derived from the
 * same build/session seams every legacy combat surface reads (attacks per
 * Attack action, effective walking Speed, condition-gated incapacitation), so
 * the kernel's turn claims and the sheet can never disagree. Null when the
 * derivation does not conform (fail-closed: a turn-claim step then rejects
 * with `turn-economy-projection` missing rather than guessing).
 */
export function characterTurnEconomyProjection(
  doc: Readonly<CharacterDoc>
): Readonly<TurnEconomyProjection> | null {
  const conditions = resolveConditionEffects(
    effectiveSessionConditions(doc.session)
  ).blockedSlots;
  const speedFt = Math.max(
    0,
    doc.character.speedOverride ?? effectiveWalkingSpeedFt(doc)
  );
  return conformTurnEconomyProjection({
    actions: { extraSlots: [], override: null },
    attacks: {
      options: [],
      perAttackAction: {
        base: Math.max(1, attacksPerActionForCharacter(doc)),
        override: null,
      },
    },
    bonusActions: {
      dualWielder: false,
      limit: { base: 1, override: null },
      requirements: [],
    },
    freeInteractions: { limit: { base: 1, override: null } },
    // Only the incapacitated family blocks the Reaction slot, so that gate is
    // the exact projection-level incapacitation signal.
    incapacitated: conditions.has("reaction"),
    movement: {
      costPerFoot: { base: 1, override: null },
      modes: [{ mode: "walk", speedFt: { base: speedFt, override: null } }],
      requirements: [],
    },
    reactions: { limit: { base: 1, override: null }, requirements: [] },
  });
}

/**
 * The coordinator's `turnEconomy` entries for a character-owned dispatch: the
 * character itself as the one combatant, carrying the live projection. Empty
 * when the projection cannot conform, so a turn-claiming program fails closed
 * instead of claiming against a guessed capability set.
 */
export function characterTurnEconomy(
  doc: Readonly<CharacterDoc>,
  uid: string
): readonly Readonly<{
  combatant: EntityRef;
  projection: TurnEconomyProjection;
}>[] {
  const projection = characterTurnEconomyProjection(doc);
  return projection ? [{ combatant: characterSelfRef(doc, uid), projection }] : [];
}

function characterWorldValue(
  material: Readonly<CharacterMaterialRef>,
  world: Readonly<CharacterMaterialState>
): MechanicsWorld {
  return {
    documents: [{ kind: "character", material, state: world }],
    scope: material,
  };
}

/**
 * Drive one table boundary over the character's own world to completion and
 * plan it as one committable journal action — the character-material twin of
 * the encounter seam's `planAdversaryTurnBoundary`. Each checkpoint is
 * accepted unchanged: no transcribed program subscribes a phase to boundary
 * events today, so every checkpoint audience is empty by construction and
 * plain acceptance is exactly the coordinator's drive; the latched end waves
 * still finalize every due lifetime. Returns null when the boundary rejects —
 * the caller degrades fail-closed (the legacy tracker still steps and booked
 * lifetimes STAND; nothing ever expires early).
 */
function planCharacterBoundary(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>,
  command: Readonly<MechanicsBoundaryCommand>,
  actionId: string
): Readonly<JournalActionDraft> | null {
  const material = characterMaterialRef(doc, uid);
  const value = characterWorldValue(material, world);
  let result = beginMechanicsBoundary(value, command);
  let remaining = 64;
  while (result.status === "checkpoint" && remaining > 0) {
    const completion = completeMechanicsBoundaryCheckpoint(
      result.continuation,
      result.checkpoint.state
    );
    if (!completion) return null;
    result = advanceMechanicsBoundary(result.continuation, completion);
    remaining -= 1;
  }
  if (result.status !== "complete" || result.outcome !== "applied") return null;
  const planned = planMechanicsWorldAction(value, result.state.world, {
    actor: { authority: "table", kind: "material-authority", material },
    facts: [],
    id: actionId,
  });
  return planned.status === "planned" ? planned.action : null;
}

/**
 * Start the SOLO encounter on the character's own material: one participant
 * (the character itself), phase "turns", its own turn already running at
 * `round`. From here every turn-anchored lifetime freezes to an EXACT
 * turn-boundary end rule (instead of the out-of-combat 6-seconds-per-turn
 * timeline law), and kernel turn claims can commit against the participant's
 * economy ledger. `initiativeRoll` is the tracker's entered RAW d20 when the
 * player typed one; a lone participant needs no ordering, so an absent or
 * out-of-range entry seeds the neutral 10 (the turns phase requires a rolled
 * value). Null when a solo encounter is already running, the character's
 * clocks are campaign-leased, or the boundary rejects.
 */
export function planSoloEncounterStart(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>,
  round: number,
  actionId: string,
  initiativeRoll: number | null = null
): Readonly<JournalActionDraft> | null {
  if (world.encounter !== null || !Number.isSafeInteger(round) || round < 1) {
    return null;
  }
  const rolled =
    initiativeRoll !== null &&
    Number.isSafeInteger(initiativeRoll) &&
    initiativeRoll >= 1 &&
    initiativeRoll <= 20
      ? initiativeRoll
      : 10;
  return planCharacterBoundary(
    doc,
    uid,
    world,
    {
      kind: "start-encounter",
      material: characterMaterialRef(doc, uid),
      seed: {
        currentCombatantId: SOLO_PARTICIPANT_ID,
        nextCombatantOrdinal: 2,
        order: [SOLO_PARTICIPANT_ID],
        participants: {
          [SOLO_PARTICIPANT_ID]: {
            combatant: characterSelfRef(doc, uid),
            initiativeRoll: rolled,
            ordinal: 1,
            skipped: false,
          },
        },
        phase: "turns",
        round,
      },
    },
    actionId
  );
}

/**
 * Complete the character's own SOLO turn through the kernel's `complete-turn`
 * boundary: the end wave latches and finalizes every due turn-anchored
 * lifetime (end-of-turn expiries), the single-participant order wraps — the
 * round advances and six seconds pass — and the same participant's next turn
 * starts with a FRESH own-turn economy (per-turn claims reset exactly).
 * Null when no solo turn is running or the boundary rejects (fail-closed:
 * the legacy round still advances and booked lifetimes stand).
 */
export function planSoloTurnBoundary(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>,
  actionId: string
): Readonly<JournalActionDraft> | null {
  if (world.encounter?.phase !== "turns") return null;
  return planCharacterBoundary(
    doc,
    uid,
    world,
    {
      excludeCurrent: null,
      kind: "complete-turn",
      material: characterMaterialRef(doc, uid),
    },
    actionId
  );
}

/**
 * End the SOLO encounter on the character's own material (the tracker's End
 * Combat): the kernel clears the local encounter and rebinds every
 * encounter-anchored lifetime through its own combat-end machinery. Null when
 * no solo encounter is running or the boundary rejects.
 */
export function planSoloEncounterEnd(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>,
  actionId: string
): Readonly<JournalActionDraft> | null {
  if (world.encounter === null) return null;
  return planCharacterBoundary(
    doc,
    uid,
    world,
    { kind: "end-encounter", material: characterMaterialRef(doc, uid) },
    actionId
  );
}

/** Resolve a planned boundary action's own guards as its commit facts. */
export function boundaryCommitFacts(
  action: Readonly<JournalActionDraft>
): readonly Readonly<ResolvedActionFact>[] {
  return action.guards.facts.map((fact) => ({
    actual: fact.expected,
    address: fact.address,
    owner: fact.owner,
  }));
}

export interface CharacterCastCapability {
  readonly authority: Readonly<MechanicsProgramAuthorityReceipt>;
  readonly facts: readonly Readonly<ActionFactGuard>[];
  readonly transcription: SpellTranscription;
}

/** Build-derived numbers a transcribed spell program binds at cast time. */
export interface CharacterCastDerived {
  readonly attackBonus: number;
  readonly castingModifier: number;
  readonly characterLevel: number;
  readonly maxHp: number;
  readonly saveDc: number;
  /**
   * The chosen target's armor class, when the surface knows it (entity
   * override, catalogue stat, or table-entered). Attack programs cannot
   * review without it — the kernel stays catalogue-agnostic by doctrine.
   */
  readonly targetArmorClass?: number;
}

/**
 * The executable authority for one spell the character can cast: the
 * transcribed program closed into a capability snapshot, anchored on the
 * caster, with the build-derived numbers as static bindings and the
 * build-derived maximum hit points as a caller-guarded fact.
 */
export function characterSpellCapability(
  doc: Readonly<CharacterDoc>,
  uid: string,
  spellId: string,
  derived: Readonly<CharacterCastDerived>
): CharacterCastCapability | null {
  const spell = spellIndex.get(spellId);
  if (!spell) return null;
  const transcription = transcribeSpell(spell);
  if (!transcription.program) return null;
  const self = characterSelfRef(doc, uid);
  const saveDc = derived.saveDc;
  const capability = {
    capabilityId: transcription.program.id,
    definition: {
      catalogueKind: "spell" as const,
      entityId: spell.id,
      kind: "catalogue" as const,
      mechanicsRevision: canonicalFingerprint({ program: transcription.program }),
    },
    kind: "program" as const,
  };
  const authority = conformMechanicsProgramAuthorityReceipt({
    anchors: { activator: self, caster: self, owner: self, source: self, target: self },
    installation: {
      capability,
      generation: 1,
      installationId: `spell.${spell.id}`,
      owner: self,
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: transcription.program,
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: self },
    staticBindings: {
      [TRANSCRIPTION_BINDINGS.attackBonus]: derived.attackBonus,
      [TRANSCRIPTION_BINDINGS.castingModifier]: derived.castingModifier,
      [TRANSCRIPTION_BINDINGS.characterLevel]: derived.characterLevel,
      [TRANSCRIPTION_BINDINGS.saveDc]: saveDc,
      ...(derived.targetArmorClass !== undefined
        ? { [TRANSCRIPTION_BINDINGS.targetArmorClass]: derived.targetArmorClass }
        : {}),
    },
  });
  if (!authority) return null;
  const facts: ActionFactGuard[] = [
    {
      address: ["hit-point-maximum"],
      expected: { present: true, value: derived.maxHp },
      lifecycle: "commit-redo",
      owner: self,
    },
  ];
  return { authority, facts, transcription };
}

/**
 * The executable authority for one feature-granted action (Second Wind): the
 * transcribed program closed on the caster with the caller-resolved flat term
 * bound, plus the pool resource-definition fact for its tracker payment.
 */
export function characterFeatureActionCapability(
  doc: Readonly<CharacterDoc>,
  uid: string,
  featureId: string,
  action: Readonly<import("@/data/types").SrdActionDef>,
  ordinal: number,
  derived: Readonly<{
    /** Spell-attack bonus, for the rare `attackType` action (bound only then). */
    attackBonus?: number;
    /** Resolved level/ability-scaled die count for the action's attack dice. */
    attackDiceCount?: number;
    featureBonus: number;
    maxHp: number;
    saveDc: number;
    /** Table-entered target armor class, for `attackType` actions. */
    targetArmorClass?: number;
  }>,
  feature: Readonly<import("@/lib/mechanics-transcription").FeatureActionContext> = {}
): CharacterCastCapability | null {
  const paymentTracker =
    action.costTracker ??
    action.costTrackerOverride ??
    (action.maintainsActiveKey === undefined ? feature.trackerId : undefined);
  const transcription = transcribeFeatureAction(featureId, action, ordinal, feature);
  if (!transcription.program) return null;
  const self = characterSelfRef(doc, uid);
  const capability = {
    capabilityId: transcription.program.id,
    definition: {
      catalogueKind: "class-feature" as const,
      entityId: featureId,
      kind: "catalogue" as const,
      mechanicsRevision: canonicalFingerprint({ program: transcription.program }),
    },
    kind: "program" as const,
  };
  const authority = conformMechanicsProgramAuthorityReceipt({
    anchors: { activator: self, caster: self, owner: self, source: self, target: self },
    installation: {
      capability,
      generation: 1,
      installationId: transcription.program.id,
      owner: self,
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: transcription.program,
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: self },
    staticBindings: {
      [TRANSCRIPTION_BINDINGS.featureBonus]: derived.featureBonus,
      [TRANSCRIPTION_BINDINGS.saveDc]: derived.saveDc,
      ...(derived.attackBonus !== undefined
        ? { [TRANSCRIPTION_BINDINGS.attackBonus]: derived.attackBonus }
        : {}),
      ...(derived.attackDiceCount !== undefined
        ? { [TRANSCRIPTION_BINDINGS.attackDiceCount]: derived.attackDiceCount }
        : {}),
      ...(derived.targetArmorClass !== undefined
        ? { [TRANSCRIPTION_BINDINGS.targetArmorClass]: derived.targetArmorClass }
        : {}),
    },
  });
  if (!authority) return null;
  const facts: ActionFactGuard[] = [
    {
      address: ["hit-point-maximum"],
      expected: { present: true, value: derived.maxHp },
      lifecycle: "commit-redo",
      owner: self,
    },
    ...(paymentTracker !== undefined
      ? [
          {
            address: [
              "resource-definition",
              "resources",
              "pools",
              paymentTracker,
            ] as const,
            expected: {
              present: true,
              value: {
                bindings: {},
                spec: {
                  capacity: { kind: "unbounded" as const },
                  id: paymentTracker,
                  initial: { kind: "empty" as const },
                  kind: "count" as const,
                  recoveries: [],
                },
              },
            },
            lifecycle: "commit" as const,
            owner: self,
          },
        ]
      : []),
  ];
  return {
    authority,
    facts,
    transcription: {
      clauses: transcription.clauses,
      entityId: featureId,
      program: transcription.program,
    },
  };
}

/**
 * The executable authority for one of the character's weapon attack rows. The
 * attack bonus, damage formula, crit threshold and mastery numbers come from
 * the SAME resolved action row every combat surface renders (`resolveActions`
 * — breakdown-derived to-hit, folded damage modifier, `masteryNumbers`), so
 * the engine can never disagree with the sheet. The target's armor class stays
 * the table-entered binding, exactly like a transcribed attack spell.
 */
export function characterWeaponAttackCapability(
  doc: Readonly<CharacterDoc>,
  uid: string,
  weaponActionId: string,
  derived: Readonly<{ maxHp: number; targetArmorClass?: number }>
): CharacterCastCapability | null {
  const row = resolveActions(doc).find(
    (candidate) => candidate.id === weaponActionId && candidate.source === "weapon"
  );
  if (!row || row.summary.attackBonus === undefined || row.summary.damage === undefined) {
    return null;
  }
  const summary = row.summary;
  const profile: WeaponAttackProfile = {
    actionId: row.id,
    attackBonus: summary.attackBonus ?? 0,
    ...(summary.critRange !== undefined ? { critThreshold: summary.critRange } : {}),
    damage: summary.damage ?? "",
    damageType: summary.damageType ?? "bludgeoning",
    ...(summary.masteryDetail?.grazeDamage !== undefined
      ? { grazeDamage: summary.masteryDetail.grazeDamage }
      : {}),
    ...(summary.weaponMastery !== undefined ? { mastery: summary.weaponMastery } : {}),
    ...(summary.masteryDetail?.toppleDc !== undefined
      ? { toppleDc: summary.masteryDetail.toppleDc }
      : {}),
    ...(summary.versatileDamage !== undefined
      ? { versatileDamage: summary.versatileDamage }
      : {}),
  };
  const transcription = transcribeWeaponAttack(profile);
  if (!transcription.program) return null;
  const self = characterSelfRef(doc, uid);
  const capability = {
    capabilityId: transcription.program.id,
    definition: {
      catalogueKind: "weapon" as const,
      entityId: row.weaponId ?? row.id,
      kind: "catalogue" as const,
      mechanicsRevision: canonicalFingerprint({ program: transcription.program }),
    },
    kind: "program" as const,
  };
  const authority = conformMechanicsProgramAuthorityReceipt({
    anchors: { activator: self, caster: self, owner: self, source: self, target: self },
    installation: {
      capability,
      generation: 1,
      installationId: transcription.program.id,
      owner: self,
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: transcription.program,
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: self },
    staticBindings: {
      ...(derived.targetArmorClass !== undefined
        ? { [TRANSCRIPTION_BINDINGS.targetArmorClass]: derived.targetArmorClass }
        : {}),
    },
  });
  if (!authority) return null;
  const facts: ActionFactGuard[] = [
    {
      address: ["hit-point-maximum"],
      expected: { present: true, value: derived.maxHp },
      lifecycle: "commit-redo",
      owner: self,
    },
  ];
  return {
    authority,
    facts,
    transcription: {
      clauses: transcription.clauses,
      entityId: row.id,
      program: transcription.program,
    },
  };
}

/** One resource-definition guard for every standard slot level the world holds. */
export function characterSlotDefinitionFacts(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>
): readonly Readonly<ActionFactGuard>[] {
  const self = characterSelfRef(doc, uid);
  const spec = (level: string) => ({
    bindings: {},
    spec: {
      capacity: { kind: "unbounded" as const },
      id: `standard-spell-slot-${level}`,
      initial: { kind: "empty" as const },
      kind: "count" as const,
      recoveries: [],
    },
  });
  return Object.keys(world.resources.standardSpellSlots).map((level) => ({
    address: ["resource-definition", "resources", "standardSpellSlots", level],
    expected: { present: true, value: structuredClone(spec(level)) },
    lifecycle: "commit",
    owner: self,
  }));
}

export interface CharacterActionCommit {
  readonly session: Readonly<SessionState>;
  readonly world: Readonly<CharacterMaterialState>;
}

/**
 * Commit one planned action through the canonical journal reducer and mirror
 * the world-owned facts every still-legacy surface reads (rollout bridge).
 */
function journalWorldFor(
  material: Readonly<CharacterMaterialRef>,
  world: Readonly<CharacterMaterialState>
): ActionJournalWorld {
  const { actions, epoch, revision, ...data } = world;
  return {
    documents: [
      {
        data: data as unknown as Record<string, never>,
        journal: { actions, epoch, revision },
        material,
      },
    ],
    scope: material,
  };
}

function sortedResolvedFacts(
  facts: readonly Readonly<ResolvedActionFact>[]
): readonly Readonly<ResolvedActionFact>[] {
  const key = (fact: Readonly<ResolvedActionFact>) =>
    `${JSON.stringify(fact.owner)}\u0000${JSON.stringify(fact.address)}`;
  return [...facts].sort((left, right) =>
    key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0
  );
}

export function commitCharacterAction(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>,
  action: Readonly<JournalActionDraft>,
  facts: readonly Readonly<ResolvedActionFact>[]
): CharacterActionCommit | null {
  const material = characterMaterialRef(doc, uid);
  const journalWorld = journalWorldFor(material, world);
  const result = reduceActionJournal(
    journalWorld,
    { action, kind: "commit" },
    sortedResolvedFacts(facts)
  );
  if (result.status !== "applied" && result.status !== "already-applied") {
    return null;
  }
  const nextDocument = result.world.documents[0];
  if (!nextDocument) return null;
  const reparsed = parseCharacterMaterialState(
    {
      ...nextDocument.data,
      actions: nextDocument.journal.actions,
      epoch: nextDocument.journal.epoch,
      revision: nextDocument.journal.revision,
    },
    material
  );
  if (!reparsed.ok) return null;
  const next = reparsed.value;

  return mirroredCommit(doc, world, next);
}

/** The world's LIVE engine concentration: the owning program root's exact
 * generation ref (the end-request target — ending the root cascades to the
 * concentration effect and every standing it sourced) plus the catalogue
 * spell it holds, when the root's capability is a catalogue spell. */
export interface EngineConcentrationHandle {
  readonly root: Readonly<OccurrenceGenerationRef>;
  readonly spellId: string | null;
}

export function engineConcentrationHandle(
  world: Readonly<CharacterMaterialState>
): EngineConcentrationHandle | null {
  for (const occurrence of Object.values(world.occurrences)) {
    if (occurrence.kind !== "concentration" || occurrence.ending !== null) continue;
    const rootRef = occurrence.origin.root;
    const root = world.occurrences[rootRef.occurrence.occurrenceId];
    if (root?.kind !== "program" || root.ordinal !== rootRef.ordinal) continue;
    const definition = root.authority.snapshot.ref.definition;
    return {
      root: structuredClone(rootRef),
      spellId:
        definition.kind === "catalogue" && definition.catalogueKind === "spell"
          ? definition.entityId
          : null,
    };
  }
  return null;
}

/** The catalogue spell held by the world's active engine concentration, if any. */
function engineConcentrationSpell(
  world: Readonly<CharacterMaterialState>
): string | null {
  return engineConcentrationHandle(world)?.spellId ?? null;
}

/**
 * The owning uid a persisted `session.world` value carries in its own clock
 * binding — the fail-closed narrow read that lets a Firebase-free store seam
 * (the legacy concentration teardown) address the world without an auth read.
 * Null when the value is not a character-play world.
 */
export function persistedWorldUid(world: unknown): string | null {
  if (typeof world !== "object" || world === null) return null;
  const binding = (world as { clockBinding?: unknown }).clockBinding;
  if (typeof binding !== "object" || binding === null) return null;
  const timeline = (binding as { timeline?: unknown }).timeline;
  if (typeof timeline !== "object" || timeline === null) return null;
  const material = (timeline as { material?: unknown }).material;
  if (typeof material !== "object" || material === null) return null;
  const ref = material as { kind?: unknown; uid?: unknown };
  return ref.kind === "character-play" && typeof ref.uid === "string" && ref.uid !== ""
    ? ref.uid
    : null;
}

/**
 * Plan the CANONICAL end of the engine-held concentration: one causal end
 * request over the owning program root, driven through the kernel's end-wave
 * machinery (dependents — the concentration effect and every standing the
 * source carries — end in the same wave; cascades finalize to quiescence),
 * planned as one committable journal action. The commit's mirror then clears
 * `session.concentration` in the same motion, so neither the world nor the
 * session holds the spell afterwards. Plain wave acceptance is exactly the
 * coordinator's drive here for the same reason `planCharacterBoundary` accepts
 * checkpoints unchanged: no transcribed program subscribes to source-ending
 * events today, so every audience is empty by construction. Null when the
 * world holds no live engine concentration or the kernel rejects — the caller
 * degrades fail-closed (the legacy teardown still runs; the transitions-only
 * mirror guard keeps the field from resurrecting).
 */
export function planEngineConcentrationEnd(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>,
  actionId: string
): Readonly<JournalActionDraft> | null {
  const handle = engineConcentrationHandle(world);
  if (!handle) return null;
  const material = characterMaterialRef(doc, uid);
  const value = characterWorldValue(material, world);
  const begun = beginMechanicsCausalState(value);
  if (!begun.ok) return null;
  const requested = rebaseMechanicsCausalState(
    begun.value.world,
    begun.value,
    [],
    [handle.root]
  );
  if (!requested.ok) return null;
  let state = requested.value;
  let remaining = 16;
  while (state.context.endWave !== null && remaining > 0) {
    const finalized = finalizeMechanicsCausalEndWave(state);
    if (!finalized.ok) return null;
    state = finalized.value;
    remaining -= 1;
  }
  if (state.context.endWave !== null) return null;
  const planned = planMechanicsWorldAction(value, state.world, {
    actor: { authority: "table", kind: "material-authority", material },
    facts: [],
    id: actionId,
  });
  return planned.status === "planned" ? planned.action : null;
}

/** The LIVE condition ids the world holds on this character itself. */
function selfConditionIds(
  state: Readonly<CharacterMaterialState>,
  characterId: string
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const occurrence of Object.values(state.occurrences)) {
    if (occurrence.kind !== "condition" || occurrence.ending !== null) continue;
    const target = occurrence.target;
    if (
      target.entityId === "self" &&
      target.material.kind === "character-play" &&
      target.material.characterId === characterId
    ) {
      ids.add(occurrence.conditionId);
    }
  }
  return ids;
}

/** Mirror the world-owned facts onto the legacy session bridge fields. */
function mirroredCommit(
  doc: Readonly<CharacterDoc>,
  world: Readonly<CharacterMaterialState>,
  next: Readonly<CharacterMaterialState>
): CharacterActionCommit {
  const usedSlots: SessionState["spellSlots"] = { ...doc.session.spellSlots };
  for (const [level, cell] of Object.entries(next.resources.standardSpellSlots)) {
    const before = world.resources.standardSpellSlots[level];
    if (!before || before.current === cell.current) continue;
    const key = slotUsageKey({ level: Number(level), pactMagic: false });
    const used = doc.session.spellSlots[key]?.used ?? 0;
    usedSlots[key] = { used: Math.max(0, used + (before.current - cell.current)) };
  }
  const trackers: SessionState["trackers"] = { ...doc.session.trackers };
  for (const [poolId, cell] of Object.entries(next.resources.pools)) {
    const beforeCell = world.resources.pools[poolId];
    if (
      cell.kind !== "count" ||
      beforeCell?.kind !== "count" ||
      beforeCell.current === cell.current
    ) {
      continue;
    }
    const used = doc.session.trackers[poolId]?.used ?? 0;
    trackers[poolId] = {
      ...doc.session.trackers[poolId],
      used: Math.max(0, used + (beforeCell.current - cell.current)),
    };
  }
  // Concentration mirror: only ENGINE TRANSITIONS move the legacy field — an
  // engine start/swap stamps the spell, an engine release clears the field
  // only when it still shows the released spell, and a commit that leaves the
  // engine concentration UNCHANGED never touches it (so a legacy-held swap to
  // another spell while an engine occurrence lives can never be resurrected
  // by an unrelated later commit).
  const concentrationBefore = engineConcentrationSpell(world);
  const concentrationAfter = engineConcentrationSpell(next);
  const concentration =
    concentrationAfter !== null
      ? concentrationAfter !== concentrationBefore
        ? concentrationValue(concentrationAfter)
        : doc.session.concentration
      : concentrationBefore !== null &&
          doc.session.concentration === concentrationValue(concentrationBefore)
        ? ""
        : doc.session.concentration;
  // Condition mirror: only ENGINE transitions on the character ITSELF move the
  // legacy chips — a self-condition the engine applies lights its chip, an
  // engine end/cure clears it, and a manually-chipped condition the world has
  // never owned is untouched (its cure is the dispatching flow's mirror).
  const conditionsBefore = selfConditionIds(world, doc.id);
  const conditionsAfter = selfConditionIds(next, doc.id);
  const conditionsRemoved = [...conditionsBefore].filter(
    (id) => !conditionsAfter.has(id)
  );
  const conditionsAdded = [...conditionsAfter].filter(
    (id) => !conditionsBefore.has(id) && !doc.session.conditions.includes(id)
  );
  const conditions =
    conditionsAdded.length > 0 || conditionsRemoved.length > 0
      ? [
          ...doc.session.conditions.filter((id) => !conditionsRemoved.includes(id)),
          ...conditionsAdded,
        ]
      : doc.session.conditions;
  const session: SessionState = {
    ...doc.session,
    concentration,
    conditions,
    trackers,
    hp: {
      ...doc.session.hp,
      current: next.vitals.hitPoints.current,
      temp: next.vitals.hitPoints.temporary.current,
    },
    exhaustion: next.exhaustion,
    spellSlots: usedSlots,
    world: next,
  };
  return { session, world: next };
}

/**
 * Exactly reverse one committed action (generation 1 → 2) through the same
 * canonical reducer, mirroring the world-owned facts back onto the legacy
 * session fields the rollout bridge still serves.
 */
export function undoCharacterAction(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>,
  actionId: string
): CharacterActionCommit | null {
  const material = characterMaterialRef(doc, uid);
  const committed = world.actions.find(
    (action) => action.id === actionId && action.generation % 2 === 1
  );
  if (!committed) return null;
  const { generation, ...body } = committed;
  const journalWorld = journalWorldFor(material, world);
  const result = reduceActionJournal(
    journalWorld,
    {
      action: body,
      documents: [{ epoch: world.epoch, material, revision: world.revision }],
      expectedGeneration: generation,
      kind: "undo",
    },
    []
  );
  if (result.status !== "applied" && result.status !== "already-applied") {
    return null;
  }
  const nextDocument = result.world.documents[0];
  if (!nextDocument) return null;
  const reparsed = parseCharacterMaterialState(
    {
      ...nextDocument.data,
      actions: nextDocument.journal.actions,
      epoch: nextDocument.journal.epoch,
      revision: nextDocument.journal.revision,
    },
    material
  );
  if (!reparsed.ok) return null;
  return mirroredCommit(doc, world, reparsed.value);
}

/** One armed pulse phase of one active engine program root. */
export interface EnginePulseRef {
  readonly eventId: string;
  readonly execution: number;
  readonly lastTriggerEventId: string | null;
  readonly occurrenceId: string;
  readonly phaseId: string;
  /** The catalogue spell id when the root's capability is a catalogue spell. */
  readonly spellId: string | null;
}

function programRoots(
  world: Readonly<CharacterMaterialState>
): readonly (readonly [string, Readonly<ProgramOccurrence>])[] {
  return Object.entries(world.occurrences).flatMap(([occurrenceId, occurrence]) =>
    occurrence.kind === "program" && occurrence.ending === null
      ? [[occurrenceId, occurrence] as const]
      : []
  );
}

/** Every armed root-pulse phase in the character's persisted engine world. */
export function activeEnginePulses(
  world: Readonly<CharacterMaterialState> | null
): readonly EnginePulseRef[] {
  if (!world) return [];
  return programRoots(world).flatMap(([occurrenceId, root]) => {
    const program = root.authority.snapshot.program;
    if (!program) return [];
    const definition = root.authority.snapshot.ref.definition;
    const spellId =
      definition.kind === "catalogue" && definition.catalogueKind === "spell"
        ? definition.entityId
        : null;
    return program.phases.flatMap((phase) => {
      if (phase.trigger.kind !== "root-pulse") return [];
      const state = root.phaseState[phase.phaseId];
      if (!state) return [];
      return [
        {
          eventId: phase.trigger.eventId,
          execution: state.execution,
          lastTriggerEventId: state.lastTriggerEventId,
          occurrenceId,
          phaseId: phase.phaseId,
          spellId,
        },
      ];
    });
  });
}
