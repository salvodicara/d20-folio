/**
 * combat-state-io — Firestore IO for the per-character `combat/state` subdoc.
 *
 * The combat-mutable slice (HP / conditions / held dice / initiative / death saves) is persisted
 * to `users/{uid}/characters/{charId}/combat/state` instead of the parent character
 * doc, so the cockpit sheet AND the in-hub encounter row read+write ONE document and
 * stay aligned by construction. See `src/types/combat-state.ts`.
 *
 * Thin + always-eager-safe: a tiny JSON subdoc, no lazy codec, no SRD. The pure
 * model + conversions live in `src/lib/combat-state.ts`; THIS module is the only
 * combat-state seam that touches `firebase/firestore`.
 *
 * OFFLINE-FIRST WRITES. Every mutation persists through {@link writeCombatState} — a plain
 * `setDoc` (OVERWRITE, no `merge`) of the FULL CombatState. `setDoc` is
 * offline-queueable: Firestore durably records it in the local cache and replays it on
 * reconnect, so a damage / heal / condition / death-save taken OFFLINE is never lost. (The
 * prior `runTransaction` read-modify-write REQUIRED a live server round-trip and REJECTED
 * offline — the swallowed rejection silently dropped the edit; that is the bug this module
 * removes.) OVERWRITE, not `merge`: the payload is ALWAYS the complete state, so there is
 * nothing to merge onto, and the overwrite sheds stray/legacy keys (e.g. the retired
 * `initiativeEpoch`) as a side effect. The rules validate ONLY AUTHORIZATION on this
 * subdoc — never the shape (the old `isValidCombatState` field-lock rejected every combat
 * write whenever the deployed rules lagged the client payload by one field — the
 * "initiative never saves" outage; see `firestore.rules`); {@link parseCombatState}
 * reads defensively, so shape tolerance lives at the read edge.
 *
 * The subdoc is MULTI-WRITER (owner, campaign DM/admin, and current table members — the
 * authority derives LIVE from the campaign doc via the parent char's
 * `attachedCampaignId`, never a stored grant). Manual owner/DM corrections still use the
 * full offline-queueable writer and are whole-object last-write-wins. A reviewed action
 * against a peer does NOT use that path: `campaign-io.applyDeclaredCombatEffects` fresh-
 * reads and transactionally merges only HP/temp/conditions/held-die/death-save fields. Therefore
 * the acting device must be online to commit the shared action, but the target client does
 * not need to be online and an unrelated field cannot be clobbered.
 *
 * The op helpers ({@link applyHpDelta} / {@link tickDeathSave} / {@link setCombatCondition}
 * / {@link setCombatTempHp}) are conveniences for the writers that hold the CURRENT state
 * as a value (the DM encounter row): they reduce that `base` (seeding
 * {@link defaultCombatState} when the subdoc is absent) and persist the result. The
 * cockpit store persists its already-reduced optimistic state directly through
 * {@link writeCombatState} (no double-reduce). INITIATIVE in a campaign encounter is NOT
 * written here — it lives in the campaign's `encounterInit` table
 * (`campaign-io.setEncounterInitiative`, the initiative SSOT); the subdoc's
 * `initiativeRoll` is the SOLO cockpit roll, persisted by the store like the round.
 *
 * `devBypassEnabled()` routes the SAME document contract through the versioned local
 * replica (`dev-document-store`): optimistic echoes, reload survival, and cross-tab
 * snapshots stay testable without touching Firebase.
 */
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEV_BYPASS_AUTH as IMPORTED_DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import {
  readDevDocument,
  subscribeDevDocument,
  updateDevDocument,
  writeDevDocument,
} from "@/lib/dev-document-store";
import {
  defaultCombatState,
  reduceCondition,
  reduceDeathSave,
  reduceHpDelta,
  setTempAbsolute,
} from "@/lib/combat-state";
import type { CombatState, PersistedTurnEconomy } from "@/types/combat-state";

const DEV_COMBAT_COLLECTION = "combat-state";

// Tests can still mock the canonical flag; production receives a compile-time false
// and therefore does not ship the local replica used only by auth-bypass previews.
function devBypassEnabled(): boolean {
  return import.meta.env.PROD ? false : IMPORTED_DEV_BYPASS_AUTH;
}

function devCombatId(uid: string, charId: string): string {
  return `${uid}/${charId}`;
}

/** Ref to the per-character combat-state subdoc. */
export function combatStateRef(uid: string, charId: string) {
  return doc(db, "users", uid, "characters", charId, "combat", "state");
}

/** The COMPLETE persisted shape, stamped server-side. One source so the two write
 *  paths can't drift. */
export function combatStateWriteData(state: CombatState): Record<string, unknown> {
  return {
    hp: { current: state.hp.current, temp: state.hp.temp },
    conditions: state.conditions,
    bardicInspirationDie: state.bardicInspirationDie ?? "",
    initiativeRoll: state.initiativeRoll,
    deathSaves: {
      successes: state.deathSaves.successes,
      failures: state.deathSaves.failures,
    },
    round: state.round,
    recentActions: state.recentActions,
    ...(state.appliedEncounterEffects
      ? { appliedEncounterEffects: state.appliedEncounterEffects }
      : {}),
    ...(state.turnEconomy ? { turnEconomy: state.turnEconomy } : {}),
    updatedAt: serverTimestamp(),
  };
}

/** Defensively parse a stored combat-state doc (our own write, but never trust IO). */
export function parseCombatState(data: Record<string, unknown>): CombatState {
  const hp = (typeof data.hp === "object" && data.hp !== null ? data.hp : {}) as Record<
    string,
    unknown
  >;
  const ds = (
    typeof data.deathSaves === "object" && data.deathSaves !== null ? data.deathSaves : {}
  ) as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const applied = parseAppliedEncounterEffects(data.appliedEncounterEffects);
  const turnEconomy = parseTurnEconomy(data.turnEconomy);
  return {
    hp: { current: num(hp.current, 0), temp: num(hp.temp, 0) },
    conditions: Array.isArray(data.conditions)
      ? data.conditions.filter((c): c is string => typeof c === "string")
      : [],
    ...(typeof data.bardicInspirationDie === "string"
      ? { bardicInspirationDie: data.bardicInspirationDie }
      : {}),
    initiativeRoll: typeof data.initiativeRoll === "number" ? data.initiativeRoll : null,
    deathSaves: { successes: num(ds.successes, 0), failures: num(ds.failures, 0) },
    // Absence-safe: a subdoc written before `round` moved here (or a fresh one) reads as
    // round 1 — a natural default, never a permanent read-shim (rule 10).
    round: num(data.round, 1),
    recentActions: parseRecentActions(data.recentActions),
    ...(applied ? { appliedEncounterEffects: applied } : {}),
    ...(turnEconomy ? { turnEconomy } : {}),
  };
}

function parseTurnEconomy(value: unknown): CombatState["turnEconomy"] {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.key !== "string" || row.key.length === 0) return undefined;
  const selected =
    typeof row.selected === "object" && row.selected !== null
      ? (row.selected as Record<string, unknown>)
      : {};
  const parseActions = (
    value: unknown,
    slot: "action" | "bonus" | "free"
  ): NonNullable<CombatState["turnEconomy"]>["selected"][typeof slot] =>
    Array.isArray(value)
      ? value.flatMap((candidate) => {
          if (typeof candidate !== "object" || candidate === null) return [];
          const action = candidate as Record<string, unknown>;
          const name = parseLocText(action.name);
          if (typeof action.id !== "string" || !name) return [];
          const economyCategory =
            action.economyCategory === "attack" ||
            action.economyCategory === "dash" ||
            action.economyCategory === "disengage" ||
            action.economyCategory === "hide" ||
            action.economyCategory === "utilize"
              ? action.economyCategory
              : undefined;
          const triggerEvents = Array.isArray(action.triggerEvents)
            ? action.triggerEvents.filter(
                (event): event is "attack" => event === "attack"
              )
            : [];
          return [
            {
              id: action.id,
              name,
              slot,
              ...(action.isAttackGroup === true ? { isAttackGroup: true } : {}),
              ...(economyCategory ? { economyCategory } : {}),
              ...(triggerEvents.length ? { triggerEvents } : {}),
            },
          ];
        })
      : [];
  const number = (candidate: unknown): number =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.max(0, candidate)
      : 0;
  return {
    key: row.key,
    selected: {
      action: parseActions(selected.action, "action"),
      bonus: parseActions(selected.bonus, "bonus"),
      free: parseActions(selected.free, "free"),
    },
    attacksUsed: number(row.attacksUsed),
    attackSwingIds: Array.isArray(row.attackSwingIds)
      ? row.attackSwingIds.filter((id): id is string => typeof id === "string")
      : [],
    reactionUsed: row.reactionUsed === true,
    reactionUsedId: typeof row.reactionUsedId === "string" ? row.reactionUsedId : null,
    movementUsedFt: number(row.movementUsedFt),
    dashesThisTurn: number(row.dashesThisTurn),
    spellSlotCastsThisTurn: number(row.spellSlotCastsThisTurn),
    damageTakenThisRound: row.damageTakenThisRound === true,
    nextAttackAdvantage: row.nextAttackAdvantage === true,
    movementLocked: row.movementLocked === true,
  };
}

function parseAppliedEncounterEffects(
  value: unknown
): CombatState["appliedEncounterEffects"] {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.epoch !== "number" || !Number.isFinite(row.epoch)) return undefined;
  const ids = Array.isArray(row.ids)
    ? row.ids.filter((id): id is string => typeof id === "string")
    : [];
  return { epoch: row.epoch, ids };
}

/** Defensively parse the `recentActions` ring (ids + numbers only; drop any malformed
 *  entry so a stray/legacy shape can never crash the DM's correlation read). */
function parseRecentActions(value: unknown): CombatState["recentActions"] {
  if (!Array.isArray(value)) return [];
  const out: CombatState["recentActions"] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const a = raw as Record<string, unknown>;
    const outcome = a.outcome === "hit" || a.outcome === "miss" ? a.outcome : null;
    const targetIds = Array.isArray(a.targetIds)
      ? a.targetIds.filter((t): t is string => typeof t === "string")
      : [];
    if (typeof a.id !== "string" || outcome === null || targetIds.length === 0) continue;
    // The multi-instance drop bound (Magic Missile 3, …) — carried only when a valid
    // count > 1; a single-target swing (absent / ≤ 1) stays unbounded-single (omitted).
    const instances =
      typeof a.instances === "number" && Number.isFinite(a.instances) && a.instances > 1
        ? Math.floor(a.instances)
        : undefined;
    // S13 — an area save-for-half declaration (Fireball class); reconcile logs a
    // resisted target positively rather than omitting it.
    const save = a.save === true ? true : undefined;
    // S13 — the action's applied-condition rider ids (Topple → prone, a spell rider):
    // string ids only, malformed dropped.
    const riders = Array.isArray(a.riders)
      ? a.riders.filter((r): r is string => typeof r === "string")
      : [];
    const action = parseLocText(a.action);
    out.push({
      id: a.id,
      targetIds,
      outcome,
      round: typeof a.round === "number" && Number.isFinite(a.round) ? a.round : 1,
      ...(action ? { action } : {}),
      ...(instances !== undefined ? { instances } : {}),
      ...(save !== undefined ? { save } : {}),
      ...(riders.length > 0 ? { riders } : {}),
    });
  }
  return out;
}

/** Minimal defensive reader for the JSON-plain localizable action reference. */
function parseLocText(value: unknown): import("@/lib/loc-text").LocText | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.custom === "string") return { custom: row.custom };
  if (typeof row.ui === "string") return { ui: row.ui };
  if (typeof row.srd === "object" && row.srd !== null) {
    const srd = row.srd as Record<string, unknown>;
    if (
      typeof srd.kind === "string" &&
      typeof srd.key === "string" &&
      typeof srd.field === "string"
    )
      return { srd } as import("@/lib/loc-text").LocText;
  }
  if (typeof row.lit === "object" && row.lit !== null) {
    const lit = row.lit as Record<string, unknown>;
    const { en, it } = lit;
    if (typeof en === "string" && typeof it === "string") return { lit: { en, it } };
  }
  return undefined;
}

/**
 * Subscribe to the live `combat/state` subdoc. `cb(null)` when the doc is ABSENT
 * (a fresh / not-yet-migrated character) — the caller defaults to full HP. Returns
 * an unsubscribe. Dev bypass uses the local document replica.
 */
export function subscribeCombatState(
  uid: string,
  charId: string,
  cb: (state: CombatState | null, meta: { hasPendingWrites: boolean }) => void,
  onError?: (err: Error) => void
): () => void {
  if (devBypassEnabled()) {
    return subscribeDevDocument<CombatState>(
      DEV_COMBAT_COLLECTION,
      devCombatId(uid, charId),
      (state) => cb(state, { hasPendingWrites: false })
    );
  }
  return onSnapshot(
    combatStateRef(uid, charId),
    (snap) => {
      // `hasPendingWrites` distinguishes a LOCAL optimistic echo (true) from a
      // SERVER-originated update (false) — the own-sheet undo stack's remote fence
      // reads it so a snapshot-leg undo never clobbers another writer's edit.
      cb(snap.exists() ? parseCombatState(snap.data()) : null, {
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
    },
    (err) => onError?.(err)
  );
}

/**
 * Persist the combat-state subdoc (last-write-wins OVERWRITE — creates the doc if
 * absent, drops any stray/legacy key). Dev bypass writes the equivalent local document;
 * production stamps `updatedAt` server-side.
 */
export async function writeCombatState(
  uid: string,
  charId: string,
  state: CombatState
): Promise<void> {
  if (devBypassEnabled()) {
    writeDevDocument(DEV_COMBAT_COLLECTION, devCombatId(uid, charId), state);
    return;
  }
  // OVERWRITE (not merge): `combatStateWriteData` ALWAYS emits the COMPLETE CombatState,
  // so there is nothing to merge onto; the overwrite also sheds stray/legacy keys (an
  // old-schema field, a half-run migration residue) on every write. Still
  // offline-queueable (`setDoc` durably caches + replays).
  await setDoc(combatStateRef(uid, charId), combatStateWriteData(state));
}

/**
 * Fresh-read mutation for the auth-bypass replica. Campaign transactions use this
 * instead of reducing a dialog snapshot, so local previews exercise the same
 * no-stale-write contract as Firestore.
 */
export function updateDevCombatState(
  uid: string,
  charId: string,
  fallback: CombatState,
  update: (current: CombatState) => CombatState
): CombatState {
  if (!devBypassEnabled()) throw new Error("Dev combat-state update outside auth bypass");
  return updateDevDocument(
    DEV_COMBAT_COLLECTION,
    devCombatId(uid, charId),
    fallback,
    update
  );
}

/**
 * Persist the high-frequency turn budget without replacing peer-owned combat fields.
 * A merge write remains offline-queueable while limiting its last-write-wins surface to
 * `round + turnEconomy`, so a navigation/action update cannot resurrect HP or conditions
 * that another participant just changed through the campaign transaction.
 */
export async function writeCombatTurnEconomy(
  uid: string,
  charId: string,
  round: number,
  turnEconomy: PersistedTurnEconomy
): Promise<void> {
  if (devBypassEnabled()) {
    const id = devCombatId(uid, charId);
    const current = readDevDocument<CombatState>(DEV_COMBAT_COLLECTION, id);
    if (current) {
      writeDevDocument(DEV_COMBAT_COLLECTION, id, { ...current, round, turnEconomy });
    }
    return;
  }
  await setDoc(
    combatStateRef(uid, charId),
    { round, turnEconomy, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * The base a `base`-reducing op helper starts from: the caller's CURRENT
 * {@link CombatState} for this PC (its live subscription value), or, when the subdoc is
 * ABSENT (`null` — a fresh / not-yet-migrated PC), the full-HP {@link defaultCombatState}
 * at `effectiveMaxHp` — so the FIRST offline write of any op lands a rules-valid full
 * shape at the right HP ceiling (never a partial create, never a synthetic 0-HP seed).
 */
function baseOrDefault(base: CombatState | null, effectiveMaxHp: number): CombatState {
  return base ?? defaultCombatState(effectiveMaxHp);
}

/**
 * Apply an HP DELTA (damage / heal) over the caller's live `base` and persist the whole
 * result — offline-safe (`setDoc` overwrite, durably queued). `effectiveMaxHp` clamps healing
 * and seeds the absent-doc default. A no-op under DEV_BYPASS. Used by writers that hold the
 * current state as a value (the DM encounter row / topbar pip); the cockpit store persists
 * its own optimistic reduction via {@link writeCombatState}.
 */
export function applyHpDelta(
  uid: string,
  charId: string,
  base: CombatState | null,
  op: { kind: "damage" | "heal"; amount: number },
  effectiveMaxHp: number
): Promise<void> {
  return writeCombatState(
    uid,
    charId,
    reduceHpDelta(baseOrDefault(base, effectiveMaxHp), op, effectiveMaxHp)
  );
}

/** Tick a death save over `base` (NESTED `deathSaves`, capped `[0, 3]`) and persist. */
export function tickDeathSave(
  uid: string,
  charId: string,
  base: CombatState | null,
  outcome: "success" | "failure",
  effectiveMaxHp: number
): Promise<void> {
  return writeCombatState(
    uid,
    charId,
    reduceDeathSave(baseOrDefault(base, effectiveMaxHp), outcome)
  );
}

/** Add / remove a condition id over `base` (idempotent) and persist the result. */
export function setCombatCondition(
  uid: string,
  charId: string,
  base: CombatState | null,
  op: { kind: "add" | "remove"; conditionId: string },
  effectiveMaxHp: number
): Promise<void> {
  return writeCombatState(
    uid,
    charId,
    reduceCondition(baseOrDefault(base, effectiveMaxHp), op)
  );
}

/** Set temp HP to an exact value over `base` (floors at 0, leaves current) and persist. */
export function setCombatTempHp(
  uid: string,
  charId: string,
  base: CombatState | null,
  temp: number,
  effectiveMaxHp: number
): Promise<void> {
  return writeCombatState(
    uid,
    charId,
    setTempAbsolute(baseOrDefault(base, effectiveMaxHp), temp)
  );
}
