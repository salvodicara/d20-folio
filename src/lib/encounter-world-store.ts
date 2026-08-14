/**
 * The encounter/adversary world seam: the campaign's live encounter becomes a
 * canonical shared-combat `SharedMaterialState`, so the SAME deterministic
 * runtime that serves solo character play serves DM-run adversaries.
 *
 * OWNERSHIP MODEL (the seam contract):
 * - The campaign encounter document (`campaign.encounter`) OWNS adversary
 *   state and the table's turn model. Its legacy monster fields (hp trio,
 *   conditions, initiative, order, pointer) remain the fields every
 *   still-legacy surface reads and writes.
 * - The optional `encounter.world` field carries what ONLY the engine owns:
 *   the action journal, mechanic occurrences (condition facts with their
 *   end rules), entity/occurrence ordinal allocators, turn economies and the
 *   material timeline. It is persisted in the SAME document, through the SAME
 *   debounced campaign writer (write topology unchanged).
 * - `encounterWorldState` is a one-way READ-TIME projection: it re-proves the
 *   persisted engine layer fail-closed (an unparseable `world` field REJECTS
 *   — never a silent re-derive that would drop live condition lifetimes) and
 *   OVERLAYS the encounter-doc-owned facts (membership, vitals, AC/max,
 *   round/turn pointer) on top, then re-parses to prove the composed state.
 *   Legacy writes therefore can never diverge from the world: the world
 *   adopts them on the next derivation.
 * - Commits route back through the owner: an engine action against an
 *   adversary reduces the canonical journal (CAS-guarded by the journal's
 *   epoch/revision like every other material root); the feature-side command
 *   boundary (`features/campaigns/encounter-world-command.ts`) then MIRRORS
 *   the world-owned adversary facts onto the exact legacy fields
 *   (hp/temp/conditions + the combat chronicle beat) so both stay in step in
 *   one write (the rollout-bridge doctrine of `mechanics-world-store`).
 *
 * COMPOSITION SCOPE (v1): the assembled world holds the shared document
 * alone, so the canonical encounter lists ADVERSARY participants only. The
 * canonical phase is "turns" exactly while the legacy pointer rests on an
 * adversary with a typed initiative; any other pointer (a PC's turn, or a
 * roll-less adversary) projects the between-turns "initiative" posture, where
 * the kernel's own 6-seconds-per-turn timeline law carries turn-anchored
 * lifetimes. Composing the party's character documents (clock leases via the
 * kernel's start-encounter boundary) is the next chunk of this epic.
 *
 * PURE: no React, no Firebase, no catalogue import — `srdId`s stay references
 * on the derived templates, resolved by render-layer consumers as today.
 */

import { materialRefKey, reduceActionJournal } from "@/lib/action-journal";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  createEmptySharedMaterialState,
  parseSharedMaterialState,
} from "@/lib/material-state";
import { planMechanicsWorldAction } from "@/lib/mechanics-action";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import {
  advanceMechanicsBoundary,
  beginMechanicsBoundary,
  beginMechanicsCausalState,
  completeMechanicsBoundaryCheckpoint,
} from "@/lib/mechanics-world";
import {
  createBetweenTurnsEconomyState,
  createTurnEconomyState,
} from "@/lib/turn-economy";
import type {
  ActionJournalWorld,
  JournalActionDraft,
  ResolvedActionFact,
} from "@/types/action-journal";
import type {
  EncounterMonster,
  EncounterState as LegacyEncounterState,
} from "@/types/campaign";
import type {
  CreatureMaterialEntity,
  EncounterParticipant,
  EncounterState,
  MaterialEntity,
  SharedMaterialState,
} from "@/types/material-state";
import type { MechanicOccurrence } from "@/types/mechanic-occurrence";
import type { MechanicsAuthorityDefinition } from "@/types/mechanics-authority";
import type { MechanicsCoordinationResult } from "@/types/mechanics-coordinator";
import type {
  EntityRef,
  MaterialEntityRef,
  SharedMaterialRef,
} from "@/types/mechanics-reference";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsWorld } from "@/types/mechanics-world";

/** The canonical shared-combat material of one campaign's encounter table. */
export function encounterMaterialRef(campaignId: string): SharedMaterialRef {
  return { campaignId, kind: "shared-combat" };
}

/** The canonical entity address of one adversary row (`monster-N`). */
export function adversaryEntityRef(
  campaignId: string,
  monsterId: string,
  ordinal: number
): MaterialEntityRef {
  return {
    entityId: monsterId,
    material: encounterMaterialRef(campaignId),
    ordinal,
  };
}

/** The deterministic entity ordinal minted from the legacy `monster-N` id. */
function monsterOrdinal(monsterId: string): number | null {
  const match = /^monster-([1-9]\d*)$/.exec(monsterId);
  const ordinal = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  return Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

/**
 * Split a DM-typed initiative TOTAL into the canonical (raw d20 roll, entity
 * initiative-bonus) pair losslessly: roll = clamp(total, 1, 20) and the bonus
 * carries the remainder, so roll + bonus reproduces the typed total exactly
 * and the participant's roll stays inside the canonical 1..20 domain.
 */
function initiativeSplit(total: number | null): {
  bonus: number | null;
  roll: number | null;
} {
  if (total === null || !Number.isSafeInteger(total)) {
    return { bonus: null, roll: null };
  }
  const roll = Math.max(1, Math.min(20, total));
  const bonus = total - roll;
  return { bonus: bonus === 0 ? null : bonus, roll };
}

/**
 * The custom-definition chassis for a hand-typed NPC with no `srdId`: the
 * legacy row carries only name/AC/max-HP/type, so the remaining REQUIRED
 * definition fields take the neutral improv-NPC baseline (commoner chassis:
 * scores 10, Medium, 30 ft., PB 2). The engine consults none of them in this
 * seam (AC/max ride the entity overrides; monster d20 rolls are table-entered
 * per the physical-roll protocol); they exist to satisfy the closed
 * definition shape until the encounter model carries typed statlines.
 */
function adversaryTemplate(
  monster: EncounterMonster
): CreatureMaterialEntity["template"] {
  const srdId = monster.srdId?.trim();
  if (srdId) {
    return { creatureTypeOverride: null, kind: "catalogue-monster", monsterId: srdId };
  }
  return {
    definition: {
      abilityScores: { CHA: 10, CON: 10, DEX: 10, INT: 10, STR: 10, WIS: 10 },
      armorClass: Math.max(0, Math.round(monster.ac)),
      creatureType: monster.creatureType ?? "humanoid",
      hitPointMaximum: Math.max(1, monster.hp.max),
      name: monster.name,
      proficiencyBonus: 2,
      savingThrowBonuses: {},
      size: "Medium",
      speedFt: 30,
    },
    kind: "custom",
  };
}

/** The adversary rows of the legacy encounter document, in insertion order. */
export function legacyMonsters(encounter: LegacyEncounterState): EncounterMonster[] {
  return encounter.combatants.filter(
    (combatant): combatant is EncounterMonster => combatant.kind === "monster"
  );
}

function adversaryEntity(
  monster: EncounterMonster,
  ordinal: number,
  persisted: MaterialEntity | undefined
): CreatureMaterialEntity {
  const current = Math.max(0, Math.min(monster.hp.current, monster.hp.max));
  const carried = persisted?.kind === "creature" ? persisted : null;
  return {
    availability: "present",
    controller: carried?.controller ?? null,
    exhaustion: carried?.exhaustion ?? 0,
    kind: "creature",
    label: monster.name,
    ordinal,
    overrides: {
      armorClass: Math.max(0, Math.round(monster.ac)),
      hitPointMaximum: Math.max(1, monster.hp.max),
      initiativeBonus: initiativeSplit(monster.initiative).bonus,
      speedFt: carried?.overrides.speedFt ?? null,
    },
    ownerOccurrence: null,
    resources: carried?.resources ?? {},
    template: adversaryTemplate(monster),
    vitals: {
      hitPoints: {
        current,
        temporary: { current: Math.max(0, monster.hp.temp), sourceOccurrence: null },
      },
      // Encounter adversaries do not model death saves: 0 HP is dead (the
      // same law the compiler applies to non-character damage targets).
      zeroHitPoints: current > 0 ? null : { kind: "dead" },
    },
  };
}

function economyTurnId(round: number | "pending", ordinal: number): string {
  return `turn:1:${round}:${ordinal}`;
}

function betweenTurnsEconomy(ordinal: number) {
  const economy = createBetweenTurnsEconomyState(economyTurnId("pending", ordinal));
  if (!economy) throw new TypeError("Invalid encounter economy identity");
  return structuredClone(economy);
}

function ownTurnEconomy(round: number, ordinal: number) {
  const economy = createTurnEconomyState(economyTurnId(round, ordinal));
  if (!economy) throw new TypeError("Invalid encounter economy identity");
  return structuredClone(economy);
}

/** An occurrence references a dropped entity when it targets one or ends on its turns. */
function occurrenceReferencesDroppedEntity(
  occurrence: MechanicOccurrence,
  material: SharedMaterialRef,
  droppedEntityIds: ReadonlySet<string>
): boolean {
  const key = materialRefKey(material);
  const matches = (ref: EntityRef): boolean =>
    materialRefKey(ref.material) === key && droppedEntityIds.has(ref.entityId);
  if ("target" in occurrence && matches(occurrence.target)) return true;
  if (
    occurrence.kind === "standing" &&
    occurrence.fact.kind === "target-mark" &&
    matches(occurrence.fact.marked)
  ) {
    return true;
  }
  return occurrence.endRules.some(
    (rule) =>
      (rule.kind === "turn-boundary" || rule.kind === "rest-completed") &&
      matches(rule.combatant)
  );
}

/**
 * The removal sweep: dropping an adversary row drops every occurrence that
 * references it — target, target-mark, or a turn/rest end rule — and then, to
 * a fixpoint, every effect whose parent root left and every occurrence whose
 * occurrence-anchored end rule now dangles (the kernel's own cleanup law,
 * applied at the derivation boundary).
 */
function sweepDroppedEntityOccurrences(
  occurrences: Readonly<Record<string, MechanicOccurrence>>,
  material: SharedMaterialRef,
  droppedEntityIds: ReadonlySet<string>
): Record<string, MechanicOccurrence> {
  const kept: Record<string, MechanicOccurrence> = {};
  for (const [occurrenceId, occurrence] of Object.entries(occurrences)) {
    if (!occurrenceReferencesDroppedEntity(occurrence, material, droppedEntityIds)) {
      kept[occurrenceId] = occurrence;
    }
  }
  for (;;) {
    const dangling = Object.entries(kept).filter(
      ([, occurrence]) =>
        (occurrence.kind !== "program" &&
          !(occurrence.parentId in kept) &&
          occurrence.parentId in occurrences) ||
        occurrence.endRules.some(
          (rule) =>
            (rule.kind === "occurrence-end" || rule.kind === "program-phase-end") &&
            !(rule.occurrenceId in kept) &&
            rule.occurrenceId in occurrences
        )
    );
    if (dangling.length === 0) return kept;
    for (const [occurrenceId] of dangling) {
      Reflect.deleteProperty(kept, occurrenceId);
    }
  }
}

/**
 * Project the campaign encounter document into one canonical shared material
 * state: engine-owned layers from the persisted `world` field (fail-closed),
 * encounter-doc-owned facts overlaid on top, the result re-proved by
 * `parseSharedMaterialState`. Returns null when the persisted engine layer is
 * corrupt or the overlay cannot compose a valid world (drift rejects).
 */
export function encounterWorldState(
  encounter: LegacyEncounterState,
  campaignId: string
): Readonly<SharedMaterialState> | null {
  const material = encounterMaterialRef(campaignId);
  let persisted: Readonly<SharedMaterialState> | null = null;
  if (encounter.world !== undefined) {
    const parsed = parseSharedMaterialState(encounter.world, material);
    if (!parsed.ok) return null;
    persisted = parsed.value;
  }
  const base = persisted ?? createEmptySharedMaterialState();
  const monsters = legacyMonsters(encounter);

  // Entities: one creature per legacy adversary row (ordinals continue the
  // persisted generation so live occurrence references stay valid), plus any
  // engine-owned entities (summons hold an `ownerOccurrence`). A derivation-
  // owned entity whose legacy row was removed is dropped with every effect
  // occurrence that references it (the removal sweep).
  const entities: Record<string, MaterialEntity> = {};
  const monsterIds = new Set(monsters.map(({ id }) => id));
  for (const [entityId, entity] of Object.entries(base.entities)) {
    if (entity.ownerOccurrence !== null) {
      entities[entityId] = structuredClone(entity);
    }
  }
  let nextEntityOrdinal = Math.max(base.nextEntityOrdinal, encounter.nextMonsterOrdinal);
  for (const monster of monsters) {
    const carried = base.entities[monster.id];
    const ordinal = carried?.ordinal ?? monsterOrdinal(monster.id);
    if (ordinal === null) return null;
    entities[monster.id] = adversaryEntity(monster, ordinal, carried);
    nextEntityOrdinal = Math.max(nextEntityOrdinal, ordinal + 1);
  }

  const droppedEntityIds = new Set(
    Object.keys(base.entities).filter((entityId) => !(entityId in entities))
  );
  const occurrences = structuredClone(
    sweepDroppedEntityOccurrences(base.occurrences, material, droppedEntityIds)
  );

  // The canonical encounter: adversary participants only (v1 composition
  // scope). "turns" exactly while the legacy pointer rests on a rolled
  // adversary; every other pointer projects the "initiative" posture and the
  // kernel's 6s/turn timeline law carries turn-anchored lifetimes.
  const currentMonster =
    encounter.currentCombatantId !== null &&
    monsterIds.has(encounter.currentCombatantId) &&
    initiativeSplit(
      monsters.find(({ id }) => id === encounter.currentCombatantId)?.initiative ?? null
    ).roll !== null
      ? encounter.currentCombatantId
      : null;
  const carriedEncounter =
    base.encounter !== null &&
    base.encounter.currentCombatantId === currentMonster &&
    base.encounter.round === encounter.round
      ? base.encounter
      : null;
  const participants: Record<string, EncounterParticipant> = {};
  let nextCombatantOrdinal = 1;
  for (const monster of monsters) {
    const entity = entities[monster.id];
    if (!entity) return null;
    const { roll } = initiativeSplit(monster.initiative);
    const isCurrent = currentMonster === monster.id;
    const carried = carriedEncounter?.participants[monster.id];
    // The participant ordinal reuses the never-recycled entity ordinal, so a
    // minted turn-economy identity can never collide with a carried one after
    // rows are removed and added across derivations.
    participants[monster.id] = {
      combatant: adversaryEntityRef(campaignId, monster.id, entity.ordinal),
      economy: carried
        ? structuredClone(carried.economy)
        : isCurrent
          ? ownTurnEconomy(encounter.round, entity.ordinal)
          : betweenTurnsEconomy(entity.ordinal),
      initiativeRoll: roll,
      ordinal: entity.ordinal,
      skipped: currentMonster !== null && roll === null,
    };
    nextCombatantOrdinal = Math.max(nextCombatantOrdinal, entity.ordinal + 1);
  }
  const order =
    currentMonster === null
      ? []
      : (encounter.order ?? []).filter(
          (id) => monsterIds.has(id) && participants[id]?.skipped === false
        );
  if (currentMonster !== null && !order.includes(currentMonster)) return null;
  const projectedEncounter: EncounterState | null =
    monsters.length === 0
      ? null
      : {
          currentCombatantId: currentMonster,
          epoch: 1,
          nextCombatantOrdinal,
          order,
          participants:
            currentMonster === null
              ? Object.fromEntries(
                  Object.entries(participants).map(([id, participant]) => [
                    id,
                    { ...participant, skipped: false },
                  ])
                )
              : participants,
          phase: currentMonster === null ? "initiative" : "turns",
          round: encounter.round,
        };

  const candidate: SharedMaterialState = {
    actions: structuredClone(base.actions),
    encounter: projectedEncounter,
    entities,
    epoch: base.epoch,
    nextEncounterEpoch: Math.max(base.nextEncounterEpoch, 2),
    nextEntityOrdinal,
    nextOccurrenceOrdinal: base.nextOccurrenceOrdinal,
    occurrences,
    revision: base.revision,
    schema: base.schema,
    timeline: structuredClone(base.timeline),
  };
  const proved = parseSharedMaterialState(candidate, material);
  return proved.ok ? proved.value : null;
}

// ─── Engine capabilities for table-booked adversary effects ────────────────

const BOOKED_AMOUNT_BINDING = "booked-amount";
const BOOKED_TURNS_BINDING = "booked-turns";

function conformedProgram(value: unknown) {
  const program = conformMechanicsProgram(value);
  if (!program) throw new TypeError("Invalid encounter seam program");
  return program;
}

/**
 * The closed system program for one table-entered LANDED damage total booked
 * onto an adversary. The amount is post-table-resolution (the table already
 * applied defenses and dice), so no adjustment layer applies by construction:
 * the derived world holds no adversary damage-defense standings. The damage
 * type is inert bookkeeping in this seam (no derived defenses select on it);
 * "force" is the neutral carrier. The terminal end-program step keeps the
 * root from accreting in the persisted world.
 */
function bookedDamageProgram() {
  return conformedProgram({
    id: "adversary-booked-damage",
    phases: [
      {
        inputs: [],
        phaseId: "resolve",
        steps: [
          {
            delivery: "automatic",
            kind: "damage",
            parts: [
              {
                amount: {
                  expression: { bindingId: BOOKED_AMOUNT_BINDING, kind: "binding" },
                  kind: "integer",
                },
                damageType: "force",
                partId: "booked",
              },
            ],
            stepId: "book-damage",
            target: { kind: "role", role: "target" },
            traits: [],
            when: null,
          },
          { kind: "end-program", stepId: "finish", when: null },
        ],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  });
}

/**
 * The closed system program for one table-entered healing total booked onto a
 * LIVING adversary. The kernel's healing law applies unchanged: current HP
 * rises by the booked amount, clamped at the effective maximum (no overheal),
 * temporary hit points untouched, and a dead creature rejects (`healCreature`
 * — the command boundary degrades the revive tap to the legacy arithmetic
 * instead of ever reaching that rejection).
 */
function bookedHealProgram() {
  return conformedProgram({
    id: "adversary-booked-heal",
    phases: [
      {
        inputs: [],
        phaseId: "resolve",
        steps: [
          {
            amount: {
              expression: { bindingId: BOOKED_AMOUNT_BINDING, kind: "binding" },
              kind: "integer",
            },
            kind: "heal",
            stepId: "book-heal",
            target: { kind: "role", role: "target" },
            when: null,
          },
          { kind: "end-program", stepId: "finish", when: null },
        ],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  });
}

/**
 * The closed system program for one table-booked adversary condition with a
 * turn-boundary lifetime: the condition fact ends at the target's own turn
 * boundary `offsetTurns` turns out (or its 6s/turn timeline equivalent while
 * no adversary turn order runs). The root shares the same lifetime so it
 * never outlives its condition.
 */
function bookedConditionProgram(conditionId: string, phase: "end" | "start") {
  const lifetime = {
    combatant: "target",
    kind: "turn-boundary",
    offsetTurns: { bindingId: BOOKED_TURNS_BINDING, kind: "binding" },
    phase,
  } as const;
  return conformedProgram({
    id: `adversary-booked-condition-${conditionId}-${phase}`,
    lifetime: [lifetime],
    phases: [
      {
        inputs: [],
        phaseId: "resolve",
        steps: [
          {
            conditionId,
            kind: "condition",
            lifetime,
            operation: "apply",
            stepId: "book-condition",
            target: { kind: "role", role: "target" },
            when: null,
          },
        ],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  });
}

export interface AdversaryActionCapability {
  readonly authority: Readonly<MechanicsProgramAuthorityReceipt>;
}

/**
 * Close one seam program into an executable authority anchored on the
 * adversary: the table books facts ONTO the creature, so every role resolves
 * to it (damage-taken triggers observe the correct combatant) and the
 * installation owner is the creature the shared material already proves.
 */
function adversaryCapability(
  program: ReturnType<typeof conformedProgram>,
  adversary: MaterialEntityRef,
  staticBindings: Readonly<Record<string, number>>
): AdversaryActionCapability | null {
  const capability = {
    capabilityId: program.id,
    definition: {
      catalogueKind: "class-feature" as const,
      entityId: program.id,
      kind: "catalogue" as const,
      mechanicsRevision: canonicalFingerprint({ program }),
    },
    kind: "program" as const,
  };
  const authority = conformMechanicsProgramAuthorityReceipt({
    anchors: {
      activator: adversary,
      caster: adversary,
      owner: adversary,
      source: adversary,
      target: adversary,
    },
    installation: {
      capability,
      generation: 1,
      installationId: `${program.id}.${adversary.entityId}`,
      owner: adversary,
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program,
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: adversary },
    staticBindings,
  });
  return authority ? { authority } : null;
}

/** The booked-damage authority for one adversary and one landed total. */
export function adversaryDamageCapability(
  adversary: MaterialEntityRef,
  amount: number
): AdversaryActionCapability | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return adversaryCapability(bookedDamageProgram(), adversary, {
    [BOOKED_AMOUNT_BINDING]: amount,
  });
}

/** The booked-heal authority for one adversary and one healing total. */
export function adversaryHealCapability(
  adversary: MaterialEntityRef,
  amount: number
): AdversaryActionCapability | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return adversaryCapability(bookedHealProgram(), adversary, {
    [BOOKED_AMOUNT_BINDING]: amount,
  });
}

/** The booked-condition authority for one adversary, condition and lifetime. */
export function adversaryConditionCapability(
  adversary: MaterialEntityRef,
  conditionId: string,
  lifetime: { readonly phase: "end" | "start"; readonly turns: number }
): AdversaryActionCapability | null {
  if (!Number.isSafeInteger(lifetime.turns) || lifetime.turns < 1) return null;
  return adversaryCapability(
    bookedConditionProgram(conditionId, lifetime.phase),
    adversary,
    { [BOOKED_TURNS_BINDING]: lifetime.turns }
  );
}

/** The coordinator's authority-snapshot entry for one seam capability. */
function adversaryAuthorityDefinition(
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

/** Run one seam capability to its fixed point over the derived shared world. */
export function runAdversaryAction(
  campaignId: string,
  world: Readonly<SharedMaterialState>,
  capability: Readonly<AdversaryActionCapability>,
  actionId: string
): Readonly<MechanicsCoordinationResult> | null {
  const material = encounterMaterialRef(campaignId);
  const state = beginMechanicsCausalState({
    documents: [{ kind: "shared", material, state: world }],
    scope: material,
  });
  if (!state.ok) return null;
  return runMechanicsCausalAction({
    answers: [],
    authoritySnapshot: {
      definitions: [adversaryAuthorityDefinition(capability.authority)],
    },
    facts: [],
    frameAnswers: [],
    intent: {
      actionId,
      factGuards: [],
      frame: {
        authority: capability.authority,
        invocation: {
          installation: capability.authority.installation,
          kind: "installed-capability",
        },
        rootReceipt: {
          kind: "create",
          materialEpoch: world.epoch,
          next: { execution: 1, phaseId: "resolve", triggerEventId: null },
          root: {
            occurrence: {
              material,
              occurrenceId: `booked-${world.nextOccurrenceOrdinal}`,
            },
            ordinal: world.nextOccurrenceOrdinal,
          },
        },
        trigger: { kind: "invocation" },
      },
    },
    responses: [],
    state: state.value,
    turnEconomy: [],
  });
}

// ─── The canonical journal commit over the shared material root ────────────

function journalWorldFor(
  material: Readonly<SharedMaterialRef>,
  world: Readonly<SharedMaterialState>
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
    `${JSON.stringify(fact.owner)} ${JSON.stringify(fact.address)}`;
  return [...facts].sort((left, right) =>
    key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0
  );
}

/**
 * Commit one planned action through the canonical journal reducer over the
 * shared material root (the same CAS discipline as `commitCharacterAction`).
 */
export function commitEncounterWorldAction(
  campaignId: string,
  world: Readonly<SharedMaterialState>,
  action: Readonly<JournalActionDraft>,
  facts: readonly Readonly<ResolvedActionFact>[]
): Readonly<SharedMaterialState> | null {
  const material = encounterMaterialRef(campaignId);
  const result = reduceActionJournal(
    journalWorldFor(material, world),
    { action, kind: "commit" },
    sortedResolvedFacts(facts)
  );
  if (result.status !== "applied" && result.status !== "already-applied") return null;
  const nextDocument = result.world.documents[0];
  if (!nextDocument) return null;
  const reparsed = parseSharedMaterialState(
    {
      ...nextDocument.data,
      actions: nextDocument.journal.actions,
      epoch: nextDocument.journal.epoch,
      revision: nextDocument.journal.revision,
    },
    material
  );
  return reparsed.ok ? reparsed.value : null;
}

/**
 * Plan the canonical `complete-turn` boundary over the derived shared world as
 * one committable journal action: fire the kernel's own boundary machinery
 * (the current canonical adversary's turn ends — its end wave latches and
 * finalizes every due turn-anchored lifetime), then compile the before→after
 * world diff through `planMechanicsWorldAction` under the table's own
 * material-authority actor. Returns null when no canonical turn is running or
 * the boundary rejects (the caller degrades: the legacy pointer still steps
 * and booked lifetimes STAND — fail-closed never expires anything early).
 *
 * Each checkpoint is accepted unchanged: the v1 seam installs no reaction
 * capabilities on the shared material, so every checkpoint's audience is
 * empty by construction and plain acceptance is exactly the coordinator's
 * drive (`runBoundary` with nothing to deliver).
 */
export function planAdversaryTurnBoundary(
  campaignId: string,
  world: Readonly<SharedMaterialState>,
  actionId: string
): Readonly<JournalActionDraft> | null {
  const material = encounterMaterialRef(campaignId);
  const value: MechanicsWorld = {
    documents: [{ kind: "shared", material, state: world }],
    scope: material,
  };
  let result = beginMechanicsBoundary(value, {
    excludeCurrent: null,
    kind: "complete-turn",
    material,
  });
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
 * Exactly reverse one committed adversary action (generation 1 → 2) through
 * the same canonical journal reducer — the shared-root twin of
 * `undoCharacterAction`. Returns the re-proved reverted state, or null when
 * the action is unknown/already undone or the reducer rejects (a later
 * conflicting action), which the command boundary treats as its degradation.
 */
export function undoEncounterWorldAction(
  campaignId: string,
  world: Readonly<SharedMaterialState>,
  actionId: string
): Readonly<SharedMaterialState> | null {
  const material = encounterMaterialRef(campaignId);
  const committed = world.actions.find(
    (action) => action.id === actionId && action.generation % 2 === 1
  );
  if (!committed) return null;
  const { generation, ...body } = committed;
  const result = reduceActionJournal(
    journalWorldFor(material, world),
    {
      action: body,
      documents: [{ epoch: world.epoch, material, revision: world.revision }],
      expectedGeneration: generation,
      kind: "undo",
    },
    []
  );
  if (result.status !== "applied" && result.status !== "already-applied") return null;
  const nextDocument = result.world.documents[0];
  if (!nextDocument) return null;
  const reparsed = parseSharedMaterialState(
    {
      ...nextDocument.data,
      actions: nextDocument.journal.actions,
      epoch: nextDocument.journal.epoch,
      revision: nextDocument.journal.revision,
    },
    material
  );
  return reparsed.ok ? reparsed.value : null;
}

/** Active engine condition ids on one shared entity, for the legacy mirror. */
export function engineConditionIds(
  world: Readonly<SharedMaterialState>,
  entityId: string
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const occurrence of Object.values(world.occurrences)) {
    if (
      occurrence.kind === "condition" &&
      occurrence.ending === null &&
      occurrence.target.material.kind === "shared-combat" &&
      occurrence.target.entityId === entityId
    ) {
      ids.add(occurrence.conditionId);
    }
  }
  return ids;
}
