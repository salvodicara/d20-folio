/**
 * rest-world-boundary: SHORT and LONG RESTS on the canonical mechanics runtime
 * (the rest twin of `solo-world-turn`'s boundary drive).
 *
 * A confirmed rest plans ONE journal action over the character's persisted
 * world by chaining the kernel's own table boundaries: `end-encounter` when a
 * local solo encounter is still running (a rest always returns combat to
 * baseline), `advance-time` for the rest's RAW duration (1 hour short, 8 hours
 * long, so timed lifetimes lapse exactly), then `complete-rest`, which
 * allocates the timeline's next boundary ordinal and emits the
 * `rest-completed` evidence on the character's timeline clock, ending every
 * due "until you finish a short/long rest" lifetime through its own end rule.
 * On top of the boundary result the rest's RESOURCE RECOVERIES execute as
 * world transitions computed from the SAME resolvers the legacy path reads
 * (`resolveTrackers` cadence rows, `getShortRestRecoveries`, the slot
 * derivation, the exhaustion-recovery grants), so the engine and the sheet can
 * never disagree: pool full/fixed restores, pact and standard slot restores,
 * hp to the effective max (long) or by the player's ENTERED hit-dice roll
 * (short, the recorded observation the modal already collects, golden rule
 * 21), exhaustion -1 (-2 with Self-Restoration) on long / Tireless on short,
 * temp hp + death saves cleared on long, Heroic Inspiration on long
 * (Resourceful), the Bardic Inspiration die released (its 1-hour maximum
 * duration is always exhausted). A long rest additionally requests the end of
 * every engine concentration occurrence (sleep is incapacitation, RAW). The
 * commit rides the canonical journal (`commitCharacterAction`), so pools,
 * slots, hp, exhaustion, ended conditions and released concentration mirror
 * onto the legacy session in the same write.
 *
 * FAIL-CLOSED, ONE-WAY (the encounter seam's degradation discipline): the
 * engine PLANS FIRST, before any legacy mutation; a world that fails to parse
 * or a boundary/commit that rejects degrades to the legacy store
 * `shortRest`/`longRest` alone, exactly the pre-cutover behavior, and nothing
 * engine-side moves (booked lifetimes STAND, nothing ever expires early). On
 * the engine path the legacy recovery functions do NOT run: every recovery
 * target is computed from the PRE-REST session counters (the rest is the
 * rollout bridge's RECONCILIATION point, so legacy-only pip spends and damage
 * taps are never resurrected from a stale world value) and adopted into the
 * world; the commit's mirror re-asserts the reconciled facts, and
 * `restFinalizedSession` reproduces the legacy-only session bookkeeping the
 * world does not own yet (tracker-entry canonical shape, active-state keys,
 * effect timers, equipment charges via the shared `equipmentAfterLongRest`
 * law, hit dice spent, death saves, the event log, the combat-state persist,
 * the undo fence) with the exact legacy laws, so a legacy read cannot tell
 * which path ran (docs/ARCHITECTURE.md, "The persisted mechanics world + the
 * cutover rollout bridge").
 *
 * Deliberately NOT here: typed item resources (`session.itemResources`).
 * Their short/long-rest recoveries commit through the item seam's own exact
 * boundary (`prepareItemResourceBoundary`) in the same confirm flow, with its
 * existing entered-roll collection UX; dawn/dusk stay distinct day-phase
 * boundaries and are never conflated with a rest.
 */

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { canCharacterRest } from "@/lib/character-status";
import { activeKeysForConcentration, effectiveMaxHp } from "@/lib/aggregate-character";
import { evaluateGrants } from "@/lib/grants";
import { planMechanicsWorldAction } from "@/lib/mechanics-action";
import { selectActiveMechanicsEffects } from "@/lib/mechanics-program-effects";
import {
  advanceMechanicsBoundary,
  beginMechanicsBoundaryFromCausalState,
  beginMechanicsCausalState,
  completeMechanicsBoundaryCheckpoint,
  finalizeMechanicsCausalEndWave,
  finalizeMechanicsCausalMaterialCleanup,
  rebaseMechanicsCausalState,
} from "@/lib/mechanics-world";
import {
  boundaryCommitFacts,
  characterMaterialRef,
  characterSelfRef,
  characterTrackerSeeds,
  characterWorldState,
  commitCharacterAction,
} from "@/lib/mechanics-world-store";
import { deriveSpellSlots } from "@/lib/multiclass-slots";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import {
  equipmentAfterLongRest,
  gainsHeroicInspirationOnLongRest,
  getShortRestExhaustionRecovery,
  getShortRestRecoveries,
  resolveActiveStatesEndingOnRest,
  resolveTrackers,
} from "@/lib/smart-tracker";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { JournalActionDraft } from "@/types/action-journal";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { ExhaustionLevel } from "@/types/condition";
import type { CharacterMaterialState } from "@/types/material-state";
import type {
  MechanicsBoundaryCommand,
  MechanicsCausalState,
  MechanicsWorld,
} from "@/types/mechanics-world";

export type RestWorldKind = "short" | "long";

/** How the confirmed rest actually executed. */
export type RestWorldOutcome = "engine" | "legacy";

/** Table-entered facts the legacy UI already collected for this rest. */
export interface RestWorldEntries {
  /**
   * The short rest's hit-dice heal: the player's entered roll plus the CON
   * bonus per die, exactly as the modal's `HealRollEntry` resolved it. The
   * recorded observation for the one rolled rest recovery the engine models;
   * the app never fabricates a die total (golden rule 21).
   */
  readonly healedHp?: number;
}

/** 2024 RAW minimum rest durations, advanced on the character's timeline. */
const REST_SECONDS: Readonly<Record<RestWorldKind, number>> = {
  long: 28_800,
  short: 3_600,
};

const MAX_BOUNDARY_CHECKPOINTS = 64;
const MAX_END_WAVES = 16;

function characterWorldValue(
  doc: Readonly<CharacterDoc>,
  uid: string,
  state: Readonly<CharacterMaterialState>
): MechanicsWorld {
  const material = characterMaterialRef(doc, uid);
  return { documents: [{ kind: "character", material, state }], scope: material };
}

/**
 * Drive one table boundary over the causal state to completion. Each
 * checkpoint is accepted unchanged: no transcribed program subscribes a phase
 * to boundary events today, so every checkpoint audience is empty by
 * construction and plain acceptance is exactly the coordinator's drive; the
 * latched end waves still finalize every due lifetime (the identical loop as
 * the solo-turn and adversary boundary planners). Null when the boundary
 * rejects; the caller degrades fail-closed.
 */
function driveBoundary(
  state: Readonly<MechanicsCausalState>,
  command: Readonly<MechanicsBoundaryCommand>
): Readonly<MechanicsCausalState> | null {
  let result = beginMechanicsBoundaryFromCausalState(state, command);
  let remaining = MAX_BOUNDARY_CHECKPOINTS;
  while (result.status === "checkpoint" && remaining > 0) {
    const completion = completeMechanicsBoundaryCheckpoint(
      result.continuation,
      result.checkpoint.state
    );
    if (!completion) return null;
    result = advanceMechanicsBoundary(result.continuation, completion);
    remaining -= 1;
  }
  return result.status === "complete" && result.outcome === "applied"
    ? result.state
    : null;
}

function clampedExhaustion(value: number): ExhaustionLevel {
  return Math.min(6, Math.max(0, value)) as ExhaustionLevel;
}

/**
 * The ONE per-tracker recovery law, computed over the PRE-REST session
 * counters (the table-visible truth): every AFFECTED tracker id maps to its
 * post-rest `used`. Short rest: exactly the `getShortRestRecoveries` rows
 * ("all" to 0, a fixed amount subtracted, floored at 0). Long rest: every row
 * except `recovery: "manual"` / `autoRecover: false` (never fabricate a table
 * event), with `longRestRecovery` partial restores; an untracked session
 * entry with no live row is fully recovered, the legacy wipe. Shared by the
 * world recovery (cell targets) and the session finalizer (entry shapes), so
 * the two representations converge on identical numbers by construction.
 */
function recoveredTrackerUsed(
  doc: Readonly<CharacterDoc>,
  kind: RestWorldKind,
  rows: ReadonlyMap<
    string,
    { autoRecover?: false; longRestRecovery?: number; recovery: string }
  >
): Map<string, number> {
  const used = (id: string) => doc.session.trackers[id]?.used ?? 0;
  const recovered = new Map<string, number>();
  if (kind === "short") {
    for (const [id, amount] of getShortRestRecoveries(doc)) {
      recovered.set(
        id,
        amount === "all" ? 0 : Math.max(0, used(id) - Math.max(0, amount))
      );
    }
    return recovered;
  }
  for (const [id, row] of rows) {
    if (row.recovery === "manual" || row.autoRecover === false) continue;
    recovered.set(
      id,
      row.longRestRecovery !== undefined
        ? Math.max(0, used(id) - row.longRestRecovery)
        : 0
    );
  }
  // Stale session entries with no live tracker row: the legacy long rest
  // wipes them wholesale.
  for (const id of Object.keys(doc.session.trackers)) {
    if (!rows.has(id) && !recovered.has(id)) recovered.set(id, 0);
  }
  return recovered;
}

/**
 * The post-rest world state: every recovery the engine models, applied to the
 * post-boundary snapshot with the SAME numbers the legacy rest computes from
 * the PRE-REST session (one law per fact). The rest boundary is also the
 * RECONCILIATION point of the rollout bridge: legacy-only writes (hp damage
 * taps, exhaustion steps, tracker pip spends) do not reach the persisted
 * world, so the recovered vitals, exhaustion and affected pool cells are
 * REBASED on the table-visible session truth here rather than on a possibly
 * stale world value; after the commit both representations agree exactly.
 * Pure; the returned candidate is re-proved by the causal rebase.
 */
function recoveredCharacterState(
  doc: Readonly<CharacterDoc>,
  kind: RestWorldKind,
  state: Readonly<CharacterMaterialState>,
  healedHp: number
): CharacterMaterialState {
  const next = structuredClone(state) as CharacterMaterialState;
  const rows = new Map(resolveTrackers(doc).map((row) => [row.id, row] as const));
  const recovered = recoveredTrackerUsed(doc, kind, rows);

  for (const [poolId, cell] of Object.entries(next.resources.pools)) {
    if (cell.kind !== "count") continue;
    const row = rows.get(poolId);
    const newUsed = recovered.get(poolId);
    if (!row || newUsed === undefined) continue;
    next.resources.pools[poolId] = {
      ...cell,
      current: Math.max(0, row.total - newUsed),
    };
  }

  // Pact Magic returns on BOTH rests; standard slots only on a long rest. The
  // totals come from the same derivation that seeded the cells.
  const slots = deriveSpellSlots(doc.character.classes);
  const pact = slots.find((slot) => slot.pactMagic);
  const pactCell = next.resources.pactSpellSlot;
  if (pactCell && pact) {
    next.resources.pactSpellSlot = {
      ...pactCell,
      current: Math.max(pactCell.current, pact.total),
    };
  }

  if (kind === "long") {
    for (const slot of slots) {
      if (slot.pactMagic) continue;
      const cell = next.resources.standardSpellSlots[String(slot.level)];
      if (cell) {
        next.resources.standardSpellSlots[String(slot.level)] = {
          ...cell,
          current: slot.total,
        };
      }
    }
    // Long rest: hp to the EFFECTIVE max (stored base + hp-flat boons + Aid),
    // temp hp gone, death saves reset. Exhaustion drops 1 plus any
    // `exhaustion-recovery` grant (Monk Self-Restoration removes 2), from the
    // SESSION level (the table truth). Human's Resourceful lights Heroic
    // Inspiration; it never clears one already held.
    next.vitals = {
      hitPoints: {
        current: effectiveMaxHp(doc.character, doc.session),
        temporary: { current: 0, sourceOccurrence: null },
      },
      zeroHitPoints: null,
    };
    const removed =
      1 +
      evaluateGrants(resolveAllGrantSources(doc.character, doc.session.itemResources))
        .exhaustionRecoveryBonus;
    next.exhaustion = clampedExhaustion(doc.session.exhaustion - removed);
    next.heroicInspiration =
      doc.session.inspiration || gainsHeroicInspirationOnLongRest(doc);
  } else {
    // Short rest: hp rebases on the session value plus the entered hit-dice
    // heal, clamped to the effective max (the modal's exact formula); temp hp
    // adopts the session value; Tireless exhaustion recovery from the session
    // level. A rest requires at least 1 HP, so no death state survives.
    const sessionHp = Math.max(0, doc.session.hp.current);
    const sessionTemp = Math.max(0, doc.session.hp.temp);
    next.vitals = {
      hitPoints: {
        current:
          healedHp > 0
            ? Math.min(sessionHp + healedHp, effectiveMaxHp(doc.character, doc.session))
            : sessionHp,
        temporary: {
          current: sessionTemp,
          sourceOccurrence:
            state.vitals.hitPoints.temporary.current === sessionTemp
              ? state.vitals.hitPoints.temporary.sourceOccurrence
              : null,
        },
      },
      zeroHitPoints: null,
    };
    next.exhaustion = clampedExhaustion(
      doc.session.exhaustion - getShortRestExhaustionRecovery(doc)
    );
    next.heroicInspiration = doc.session.inspiration;
  }
  // Either rest outlasts a held Bardic Inspiration die's 1-hour maximum.
  next.bardicInspirationDie = null;
  return next;
}

/**
 * Plan the whole rest as ONE committable journal action over the character's
 * world: the boundary chain (end-encounter when a solo encounter lingers,
 * advance-time, complete-rest), the recovery transitions, the long rest's
 * concentration end requests, and the finalize/cleanup drain, compiled into a
 * table-authority diff by `planMechanicsWorldAction`. Null on ANY rejection;
 * the caller degrades fail-closed to the legacy path.
 */
export function planWorldRest(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>,
  kind: RestWorldKind,
  entered: RestWorldEntries = {}
): Readonly<JournalActionDraft> | null {
  const material = characterMaterialRef(doc, uid);
  const value = characterWorldValue(doc, uid, world);
  const begun = beginMechanicsCausalState(value);
  if (!begun.ok) return null;
  let state: Readonly<MechanicsCausalState> | null = begun.value;

  // A rest always returns combat to baseline: a lingering LOCAL solo
  // encounter ends through the kernel's own boundary first, so
  // encounter-anchored lifetimes rebind before time advances.
  if (world.encounter !== null) {
    state = driveBoundary(state, { kind: "end-encounter", material });
    if (!state) return null;
  }
  const clock = structuredClone(world.clockBinding.timeline);
  state = driveBoundary(state, {
    clock,
    elapsedSeconds: REST_SECONDS[kind],
    kind: "advance-time",
  });
  if (!state) return null;
  state = driveBoundary(state, {
    input: { clock, combatant: characterSelfRef(doc, uid), rest: kind },
    kind: "complete-rest",
  });
  if (!state) return null;

  const document = state.world.documents[0];
  if (document?.kind !== "character") return null;
  const recovered = recoveredCharacterState(
    doc,
    kind,
    document.state,
    Math.max(0, entered.healedHp ?? 0)
  );
  // Sleep is incapacitation (RAW): a long rest ends every engine
  // concentration occurrence through an explicit end request; dependents
  // cascade through the kernel's own end machinery.
  const endRequests =
    kind === "long"
      ? selectActiveMechanicsEffects(state.world, { kind: "concentration" })
      : [];
  const rebased = rebaseMechanicsCausalState(
    characterWorldValue(doc, uid, recovered),
    state,
    [],
    endRequests
  );
  if (!rebased.ok) return null;
  state = rebased.value;
  for (
    let remaining = MAX_END_WAVES;
    state.context.endWave !== null && remaining > 0;
    remaining -= 1
  ) {
    const finalized = finalizeMechanicsCausalEndWave(state);
    if (!finalized.ok) return null;
    state = finalized.value;
  }
  if (state.context.endWave !== null) return null;
  const cleaned = finalizeMechanicsCausalMaterialCleanup(state);
  if (!cleaned.ok) return null;

  const planned = planMechanicsWorldAction(value, cleaned.value.world, {
    actor: { authority: "table", kind: "material-authority", material },
    facts: [],
    id: `rest:${kind}:${canonicalFingerprint({
      healedHp: Math.max(0, entered.healedHp ?? 0),
      rest: kind,
      revision: world.revision,
    })}`,
  });
  return planned.status === "planned" ? planned.action : null;
}

function omitKeys<T>(
  record: Record<string, T> | undefined,
  keys: ReadonlySet<string>
): Record<string, T> | undefined {
  if (!record || keys.size === 0) return record;
  const kept = Object.entries(record).filter(([key]) => !keys.has(key));
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/**
 * The mirrored commit plus the legacy-only session bookkeeping the world does
 * not own yet, shaped EXACTLY as the legacy store rest shapes it (same laws,
 * same omissions), so a legacy read cannot tell which path ran. The mirror
 * already re-asserted hp, temp, exhaustion, ended condition chips and
 * released concentration from the world the plan REBASED on the session
 * truth; this finalizer rebuilds the tracker entries from the PRE-REST
 * session through the SAME shared recovery law the world cells adopted
 * (recovered entries omitted, partial entries `{ used }` with recorded rolls
 * dropped, manual entries untouched), wipes the slot usage map the legacy
 * way, ends the rest-terminated active states, and applies the long rest's
 * legacy-only field set.
 */
function restFinalizedSession(
  doc: Readonly<CharacterDoc>,
  mirrored: Readonly<SessionState>,
  kind: RestWorldKind
): SessionState {
  const rows = new Map(resolveTrackers(doc).map((row) => [row.id, row] as const));
  const endedActiveKeys = new Set(resolveActiveStatesEndingOnRest(doc, kind));
  // Rebuilt from the PRE-REST session counters through the one shared law
  // (never from the mirror's deltas, which assume world/session lockstep a
  // legacy pip spend can break), so the entries match the legacy rest exactly.
  const recovered = recoveredTrackerUsed(doc, kind, rows);
  const trackers: SessionState["trackers"] = {};
  for (const [id, data] of Object.entries(doc.session.trackers)) {
    const newUsed = recovered.get(id);
    if (newUsed === undefined) {
      trackers[id] = data;
      continue;
    }
    if (newUsed > 0) trackers[id] = { used: newUsed };
  }
  return {
    ...mirrored,
    trackers,
    // Long rest restores every slot (the legacy wholesale wipe, pact included);
    // a short rest returns only Pact Magic (drop the pact usage keys).
    spellSlots:
      kind === "long"
        ? {}
        : Object.fromEntries(
            Object.entries(mirrored.spellSlots).filter(
              ([key]) => !key.startsWith("pact-")
            )
          ),
    activeFeatures: (mirrored.activeFeatures ?? []).filter(
      (key) => !endedActiveKeys.has(key)
    ),
    activeSpellCastLevels: omitKeys(mirrored.activeSpellCastLevels, endedActiveKeys),
    effectTimers: omitKeys(mirrored.effectTimers, endedActiveKeys),
    effectBoundaries: omitKeys(mirrored.effectBoundaries, endedActiveKeys),
    // Either rest outlasts a held Bardic Inspiration die's 1-hour maximum.
    bardicInspirationDie: "",
    ...(kind === "long"
      ? {
          hitDice: { used: 0 },
          concentration: "",
          concentrationCastLevel: undefined,
          concentrationConditions: undefined,
          inspiration: mirrored.inspiration || gainsHeroicInspirationOnLongRest(doc),
          deathSucc: 0,
          deathFail: 0,
        }
      : {}),
  };
}

/**
 * The RestModal's one confirm seam: tear down concentration exactly where the
 * legacy rest does (through the ONE public teardown action), plan the
 * canonical rest over the persisted world, commit it, and finalize the
 * session as the mirror plus the legacy-only bookkeeping. The legacy
 * `shortRest`/`longRest` store recoveries survive ONLY inside the
 * degradation; on the engine path every recovery executes as a world
 * transition and the finalizer reproduces the exact legacy session shape.
 *
 * DEGRADATION (fail-closed, one-way, the encounter seam's discipline): no
 * character, no authenticated owner, readonly, a rest-ineligible character, a
 * world that fails its fail-closed parse, a rejected boundary/plan, or a
 * rejected commit all leave the engine world untouched and run the legacy
 * store rest alone, exactly the pre-cutover behavior (a torn-down
 * concentration stays down; the legacy rest's own teardown is a no-op).
 */
export function restThroughWorld(
  kind: RestWorldKind,
  entered: RestWorldEntries = {}
): RestWorldOutcome {
  const store = useCharacterStore.getState();
  const before = store.character;
  const uid = useAuthStore.getState().user?.uid;
  const legacyRest = kind === "short" ? store.shortRest : store.longRest;
  if (
    !before ||
    uid === undefined ||
    store.readonly ||
    !canCharacterRest(before.status, before.session)
  ) {
    legacyRest();
    return "legacy";
  }
  // Concentration teardown FIRST, exactly as the legacy rest orders it, so
  // the rest baseline (effective max hp, exhaustion grants, ended active
  // keys) is computed on the post-teardown character. Long rest: sleep always
  // ends it. Short rest: only when a concentration-held active state ends
  // with this rest (the legacy shortRest's exact condition).
  if (kind === "long") {
    if (before.session.concentration) {
      store.setConcentration("", { silent: true, undoable: false });
    }
  } else {
    const initiallyEnded = new Set(resolveActiveStatesEndingOnRest(before, "short"));
    const concentrationKeys = before.session.concentration
      ? activeKeysForConcentration(
          before.character,
          before.session,
          before.session.concentration
        )
      : [];
    if (concentrationKeys.some((key) => initiallyEnded.has(key))) {
      store.setConcentration("", { silent: true, undoable: false });
    }
  }
  const doc = useCharacterStore.getState().character;
  if (!doc) return "legacy";
  const world = characterWorldState(
    doc,
    uid,
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  const action = world ? planWorldRest(doc, uid, world, kind, entered) : null;
  if (!world || !action) {
    legacyRest();
    return "legacy";
  }
  const committed = commitCharacterAction(
    doc,
    uid,
    world,
    action,
    boundaryCommitFacts(action)
  );
  if (!committed) {
    legacyRest();
    return "legacy";
  }
  useCharacterStore.setState({
    character: {
      ...doc,
      ...(kind === "long"
        ? {
            character: {
              ...doc.character,
              equipment: equipmentAfterLongRest(doc.character.equipment),
            },
          }
        : {}),
      session: restFinalizedSession(doc, committed.session, kind),
    },
    // A long rest resolves any queued Concentration prompts with the spell.
    ...(kind === "long" ? { combatPendingConcentrationSaves: [] } : {}),
  });
  const live = useCharacterStore.getState();
  // Events-as-data: a rest is a story beat; persist the whole resulting
  // combat state; and FENCE the undo stack, since the rest rewrote the whole
  // resource baseline (the same closing motions as the legacy rest).
  live.logEvent({ kind: "rest", restKind: kind });
  live.persistPlayState();
  useUndoStore.getState().clear();
  return "engine";
}
