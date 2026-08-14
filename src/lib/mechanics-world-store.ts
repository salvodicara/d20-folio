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
import {
  createEmptyCharacterMaterialState,
  parseCharacterMaterialState,
} from "@/lib/material-state";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import {
  transcribeSpell,
  TRANSCRIPTION_BINDINGS,
  type SpellTranscription,
} from "@/lib/mechanics-transcription";
import { applySlotMaxOverrides, deriveSpellSlots } from "@/lib/multiclass-slots";
import type {
  ActionFactGuard,
  ActionJournalWorld,
  JournalActionDraft,
  ResolvedActionFact,
} from "@/types/action-journal";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { CharacterMaterialRef, EntityRef } from "@/types/mechanics-reference";

export function characterMaterialRef(
  doc: { readonly id: string },
  uid: string
): CharacterMaterialRef {
  return { characterId: doc.id, kind: "character-play", uid };
}

export function characterSelfRef(doc: { readonly id: string }, uid: string): EntityRef {
  return { entityId: "self", material: characterMaterialRef(doc, uid) };
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
 * The character's live mechanics world. A persisted world is re-proved
 * fail-closed; a document that has never carried one derives it exactly once
 * from the legacy session facts the world supersedes.
 */
export function characterWorldState(
  doc: Readonly<CharacterDoc>,
  uid: string,
  maxHp: number,
  slotMaxOverrides: Readonly<Record<string, number>> = {}
): Readonly<CharacterMaterialState> | null {
  const material = characterMaterialRef(doc, uid);
  if (doc.session.world !== undefined) {
    const persisted = parseCharacterMaterialState(doc.session.world, material);
    return persisted.ok ? persisted.value : null;
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

/** The catalogue spell held by the world's active engine concentration, if any. */
function engineConcentrationSpell(
  world: Readonly<CharacterMaterialState>
): string | null {
  for (const occurrence of Object.values(world.occurrences)) {
    if (occurrence.kind !== "concentration") continue;
    const root = world.occurrences[occurrence.origin.root.occurrence.occurrenceId];
    if (root?.kind !== "program") continue;
    const definition = root.authority.snapshot.ref.definition;
    if (definition.kind === "catalogue" && definition.catalogueKind === "spell") {
      return definition.entityId;
    }
  }
  return null;
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
  // Concentration mirror: only ENGINE transitions move the legacy field —
  // a legacy-held concentration is never clobbered, and an engine release
  // clears the field only when the engine had set it.
  const concentrationBefore = engineConcentrationSpell(world);
  const concentrationAfter = engineConcentrationSpell(next);
  const concentration =
    concentrationAfter !== null
      ? concentrationValue(concentrationAfter)
      : concentrationBefore !== null &&
          doc.session.concentration === concentrationValue(concentrationBefore)
        ? ""
        : doc.session.concentration;
  const session: SessionState = {
    ...doc.session,
    concentration,
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
