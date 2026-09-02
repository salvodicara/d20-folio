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
import { doc, onSnapshot, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEV_BYPASS_AUTH as IMPORTED_DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import {
  readDevDocument,
  subscribeDevDocument,
  updateDevDocument,
  writeDevDocument,
} from "@/lib/dev-document-store";
import type {
  CombatState,
  PendingConcentrationSave,
  PersistedTurnEconomy,
} from "@/types/combat-state";
import { normalizeConcentrationRef } from "@/lib/concentration";
import { conformActiveCombatEffects } from "@/lib/combat-effect-io";
import { parseCombatOutcomeReceipt } from "@/lib/combat-outcomes";
import { parsePersistedPlayStateV1 } from "@/lib/session-state-codec";
import { diagnosticsLog } from "@/lib/diagnostics";

const DEV_COMBAT_COLLECTION = "combat-state";
const STRICT_V1_FIELDS = [
  "activeEffects",
  "pendingConcentrationSaves",
  "turnEconomy",
  "appliedEncounterEffects",
  "recentActions",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainJson(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const valid =
    Object.getOwnPropertySymbols(value).length === 0 &&
    (Array.isArray(value)
      ? Object.getPrototypeOf(value) === Array.prototype &&
        Object.keys(descriptors).length === value.length + 1 &&
        Object.hasOwn(descriptors, "length") &&
        Array.from(
          { length: value.length },
          (_, index) => descriptors[String(index)]
        ).every(
          (descriptor) =>
            descriptor !== undefined &&
            descriptor.enumerable &&
            "value" in descriptor &&
            isPlainJson(descriptor.value, ancestors)
        )
      : (Object.getPrototypeOf(value) === Object.prototype ||
          Object.getPrototypeOf(value) === null) &&
        Object.entries(descriptors).every(
          ([key, descriptor]) =>
            key.length > 0 &&
            descriptor.enumerable &&
            "value" in descriptor &&
            isPlainJson(descriptor.value, ancestors)
        ));
  ancestors.delete(value);
  return valid;
}

function sameJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJson(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && sameJson(left[key], right[key])
    )
  );
}

function presentFieldIsCanonical(
  data: Readonly<Record<string, unknown>>,
  key: string,
  parsed: unknown
): boolean {
  return (
    !Object.hasOwn(data, key) || (parsed !== undefined && sameJson(data[key], parsed))
  );
}

function presentFieldIsPlainJson(
  data: Readonly<Record<string, unknown>>,
  key: string
): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(data, key);
  return (
    descriptor === undefined ||
    (descriptor.enumerable === true &&
      "value" in descriptor &&
      isPlainJson(descriptor.value))
  );
}

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

/** The dev replica stores the same canonical optional collection, without a
 * Firestore timestamp sentinel. */
function combatStateForDevWrite(state: CombatState): CombatState {
  const { updatedAt: _updatedAt, ...canonical } = combatStateWriteData(state);
  void _updatedAt;
  return canonical as unknown as CombatState;
}

/** The COMPLETE persisted shape, stamped server-side. One source so the two write
 *  paths can't drift. */
export function combatStateWriteData(state: CombatState): Record<string, unknown> {
  const playState =
    state.playState === undefined ? null : parsePersistedPlayStateV1(state.playState);
  if (playState && !playState.ok) {
    throw new TypeError(`Invalid combat play state: ${playState.reason}`);
  }
  return {
    hp: { current: state.hp.current, temp: state.hp.temp },
    conditions: state.conditions,
    bardicInspirationDie: state.bardicInspirationDie ?? "",
    ...(state.heroicInspiration !== undefined
      ? { heroicInspiration: state.heroicInspiration }
      : {}),
    initiativeRoll: state.initiativeRoll,
    deathSaves: {
      successes: state.deathSaves.successes,
      failures: state.deathSaves.failures,
    },
    round: state.round,
    recentActions: state.recentActions,
    ...(state.activeEffects?.length ? { activeEffects: state.activeEffects } : {}),
    ...(state.appliedEncounterEffects
      ? { appliedEncounterEffects: state.appliedEncounterEffects }
      : {}),
    ...(state.turnEconomy ? { turnEconomy: state.turnEconomy } : {}),
    ...(state.pendingConcentrationSaves?.length
      ? { pendingConcentrationSaves: state.pendingConcentrationSaves }
      : {}),
    ...(playState?.ok ? { playState: playState.value } : {}),
    updatedAt: serverTimestamp(),
  };
}

export type CombatStateParseResult =
  | { ok: true; ownership: "legacy" | "v1"; state: CombatState }
  | {
      ok: false;
      reason: "invalid-combat-state" | "invalid-v1-play-state";
    };

/**
 * Defensively parse a stored combat-state doc. A present document must carry the
 * complete legacy combat core; malformed/partial documents are never reinterpreted
 * as a valid 0-HP character.
 */
export function parseCombatState(data: unknown): CombatStateParseResult {
  if (!isRecord(data) || !isRecord(data.hp) || !isRecord(data.deathSaves)) {
    return { ok: false, reason: "invalid-combat-state" };
  }
  const hp = data.hp;
  const ds = data.deathSaves;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  if (
    typeof hp.current !== "number" ||
    !Number.isFinite(hp.current) ||
    typeof hp.temp !== "number" ||
    !Number.isFinite(hp.temp) ||
    !Array.isArray(data.conditions) ||
    !data.conditions.every((condition) => typeof condition === "string") ||
    !(
      data.initiativeRoll === null ||
      (typeof data.initiativeRoll === "number" && Number.isFinite(data.initiativeRoll))
    ) ||
    typeof ds.successes !== "number" ||
    !Number.isFinite(ds.successes) ||
    typeof ds.failures !== "number" ||
    !Number.isFinite(ds.failures) ||
    (data.round !== undefined &&
      (typeof data.round !== "number" || !Number.isFinite(data.round))) ||
    (data.bardicInspirationDie !== undefined &&
      typeof data.bardicInspirationDie !== "string") ||
    (data.heroicInspiration !== undefined && typeof data.heroicInspiration !== "boolean")
  ) {
    return { ok: false, reason: "invalid-combat-state" };
  }
  const playState =
    data.playState === undefined ? null : parsePersistedPlayStateV1(data.playState);
  if (playState && !playState.ok) {
    return { ok: false, reason: "invalid-v1-play-state" };
  }
  if (
    playState?.ok &&
    STRICT_V1_FIELDS.some((key) => !presentFieldIsPlainJson(data, key))
  ) {
    return { ok: false, reason: "invalid-combat-state" };
  }
  // Stored subdocs written by the deleted effect-program runtime may still carry
  // `actionRevision` / `actionHead` / `actionLifecycles` / `effectLifecycles`,
  // and a branch-era `effectOps` mirror ledger existed briefly with no
  // production writer. All are ignored here fail-safe and shed by the next
  // full-overwrite write.
  const applied = parseAppliedEncounterEffects(data.appliedEncounterEffects);
  const turnEconomy = parseTurnEconomy(data.turnEconomy);
  const activeEffects = conformActiveCombatEffects(data.activeEffects);
  const pendingConcentrationSaves = parsePendingConcentrationSaves(
    data.pendingConcentrationSaves
  );
  const recentActions = parseRecentActions(data.recentActions);
  if (
    playState?.ok &&
    (!presentFieldIsCanonical(data, "activeEffects", activeEffects) ||
      new Set(activeEffects.map(({ id }) => id)).size !== activeEffects.length ||
      !presentFieldIsCanonical(
        data,
        "pendingConcentrationSaves",
        pendingConcentrationSaves
      ) ||
      !presentFieldIsCanonical(data, "turnEconomy", turnEconomy) ||
      !presentFieldIsCanonical(data, "appliedEncounterEffects", applied) ||
      !presentFieldIsCanonical(data, "recentActions", recentActions))
  ) {
    return { ok: false, reason: "invalid-combat-state" };
  }
  const state: CombatState = {
    hp: { current: hp.current, temp: hp.temp },
    conditions: data.conditions,
    ...(typeof data.bardicInspirationDie === "string"
      ? { bardicInspirationDie: data.bardicInspirationDie }
      : {}),
    ...(typeof data.heroicInspiration === "boolean"
      ? { heroicInspiration: data.heroicInspiration }
      : {}),
    initiativeRoll: data.initiativeRoll,
    deathSaves: { successes: ds.successes, failures: ds.failures },
    // Absence-safe: a subdoc written before `round` moved here (or a fresh one) reads as
    // round 1 — a natural default, never a permanent read-shim (rule 10).
    round: num(data.round, 1),
    recentActions,
    ...(activeEffects.length ? { activeEffects } : {}),
    ...(applied ? { appliedEncounterEffects: applied } : {}),
    ...(turnEconomy ? { turnEconomy } : {}),
    ...(pendingConcentrationSaves.length ? { pendingConcentrationSaves } : {}),
    ...(playState?.ok ? { playState: playState.value } : {}),
  };
  return { ok: true, ownership: playState ? "v1" : "legacy", state };
}

function parsedCombatState(data: unknown): CombatState {
  const result = parseCombatState(data);
  if (!result.ok) throw new TypeError(`Invalid combat state: ${result.reason}`);
  return result.state;
}

function parsePendingConcentrationSaves(value: unknown): PendingConcentrationSave[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const pending: PendingConcentrationSave[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const row = candidate as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      row.id.length === 0 ||
      ids.has(row.id) ||
      typeof row.spell !== "string" ||
      !/^(?:custom:.+|[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(row.spell) ||
      typeof row.damage !== "number" ||
      !Number.isSafeInteger(row.damage) ||
      row.damage <= 0 ||
      typeof row.difficultyClass !== "number" ||
      !Number.isSafeInteger(row.difficultyClass)
    ) {
      continue;
    }
    const expectedDifficultyClass = Math.min(
      30,
      Math.max(10, Math.floor(row.damage / 2))
    );
    if (row.difficultyClass !== expectedDifficultyClass) continue;
    ids.add(row.id);
    pending.push({
      id: row.id,
      spell: normalizeConcentrationRef(row.spell),
      damage: row.damage,
      difficultyClass: row.difficultyClass,
    });
  }
  return pending;
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
          if (typeof action.id !== "string" || action.id.length === 0 || !name) return [];
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
                (event): event is "attack" | "bonus-extend" =>
                  event === "attack" || event === "bonus-extend"
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
              ...(typeof action.outcomeOccurrenceId === "string" &&
              action.outcomeOccurrenceId.length > 0
                ? { outcomeOccurrenceId: action.outcomeOccurrenceId }
                : {}),
            },
          ];
        })
      : [];
  const number = (candidate: unknown): number =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.max(0, candidate)
      : 0;
  const reactionUsed = row.reactionUsed === true;
  const reactionUsedId =
    reactionUsed &&
    typeof row.reactionUsedId === "string" &&
    row.reactionUsedId.length > 0
      ? row.reactionUsedId
      : null;
  const parsedSelected = {
    action: parseActions(selected.action, "action"),
    bonus: parseActions(selected.bonus, "bonus"),
    free: parseActions(selected.free, "free"),
  };
  const attackSwings: NonNullable<CombatState["turnEconomy"]>["attackSwings"] =
    Array.isArray(row.attackSwings)
      ? row.attackSwings.flatMap((candidate) => {
          if (typeof candidate !== "object" || candidate === null) return [];
          const swing = candidate as Record<string, unknown>;
          if (typeof swing.actionId !== "string" || swing.actionId.length === 0)
            return [];
          return [
            {
              actionId: swing.actionId,
              ...(typeof swing.outcomeOccurrenceId === "string" &&
              swing.outcomeOccurrenceId.length > 0
                ? { outcomeOccurrenceId: swing.outcomeOccurrenceId }
                : {}),
            },
          ];
        })
      : [];
  const reactionOutcomeOccurrenceId =
    reactionUsedId &&
    typeof row.reactionOutcomeOccurrenceId === "string" &&
    row.reactionOutcomeOccurrenceId.length > 0
      ? row.reactionOutcomeOccurrenceId
      : null;
  const occurrenceOwners = new Map<string, string>();
  for (const action of Object.values(parsedSelected).flat()) {
    if (action.outcomeOccurrenceId)
      occurrenceOwners.set(action.outcomeOccurrenceId, action.id);
  }
  for (const swing of attackSwings) {
    if (swing.outcomeOccurrenceId)
      occurrenceOwners.set(swing.outcomeOccurrenceId, swing.actionId);
  }
  if (reactionUsedId && reactionOutcomeOccurrenceId) {
    occurrenceOwners.set(reactionOutcomeOccurrenceId, reactionUsedId);
  }
  const seenReceiptIds = new Set<string>();
  const outcomeReceipts = Array.isArray(row.outcomeReceipts)
    ? row.outcomeReceipts.flatMap((candidate) => {
        const receipt = parseCombatOutcomeReceipt(candidate);
        if (
          !receipt ||
          seenReceiptIds.has(receipt.id) ||
          occurrenceOwners.get(receipt.occurrenceId) !== receipt.actionId
        ) {
          return [];
        }
        seenReceiptIds.add(receipt.id);
        return [receipt];
      })
    : [];
  const spellSlotCastsThisTurn = Math.min(
    1,
    Math.floor(number(row.spellSlotCastsThisTurn))
  );
  const spellSlotCastTurnKey =
    spellSlotCastsThisTurn > 0
      ? typeof row.spellSlotCastTurnKey === "string" &&
        row.spellSlotCastTurnKey.length > 0
        ? row.spellSlotCastTurnKey
        : row.key
      : null;
  return {
    key: row.key,
    selected: parsedSelected,
    attacksUsed: Math.min(number(row.attacksUsed), attackSwings.length),
    attackSwings,
    outcomeReceipts,
    outcomeOrdinal: Math.floor(number(row.outcomeOrdinal)),
    reactionUsed,
    reactionUsedId,
    reactionOutcomeOccurrenceId,
    movementUsedFt: number(row.movementUsedFt),
    dashesThisTurn: number(row.dashesThisTurn),
    spellSlotCastsThisTurn,
    spellSlotCastTurnKey,
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
    return subscribeDevDocument<Record<string, unknown>>(
      DEV_COMBAT_COLLECTION,
      devCombatId(uid, charId),
      (state) => {
        if (!state) {
          cb(null, { hasPendingWrites: false });
          return;
        }
        const parsed = parseCombatState(state);
        if (!parsed.ok) {
          diagnosticsLog("error", "combat-state.invalid", { reason: parsed.reason });
          onError?.(new TypeError(`Invalid combat state: ${parsed.reason}`));
          return;
        }
        cb(parsed.state, { hasPendingWrites: false });
      }
    );
  }
  return onSnapshot(
    combatStateRef(uid, charId),
    (snap) => {
      // `hasPendingWrites` distinguishes a LOCAL optimistic echo (true) from a
      // SERVER-originated update (false) — the own-sheet undo stack's remote fence
      // reads it so a snapshot-leg undo never clobbers another writer's edit.
      if (!snap.exists()) {
        cb(null, { hasPendingWrites: snap.metadata.hasPendingWrites });
        return;
      }
      const parsed = parseCombatState(snap.data());
      if (!parsed.ok) {
        diagnosticsLog("error", "combat-state.invalid", { reason: parsed.reason });
        onError?.(new TypeError(`Invalid combat state: ${parsed.reason}`));
        return;
      }
      cb(parsed.state, { hasPendingWrites: snap.metadata.hasPendingWrites });
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
    writeDevDocument(
      DEV_COMBAT_COLLECTION,
      devCombatId(uid, charId),
      combatStateForDevWrite(state)
    );
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
    combatStateForDevWrite(fallback),
    (current) =>
      combatStateForDevWrite(
        update(parsedCombatState(current as unknown as Record<string, unknown>))
      )
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
    const current = readDevDocument<Record<string, unknown>>(DEV_COMBAT_COLLECTION, id);
    if (current) {
      writeDevDocument(
        DEV_COMBAT_COLLECTION,
        id,
        combatStateForDevWrite({ ...parsedCombatState(current), round, turnEconomy })
      );
    }
    return;
  }
  // Update-only: a partial turn payload must never CREATE a malformed play owner
  // (historically `setDoc(..., {merge:true})` could synthesize a 0-HP document).
  await updateDoc(combatStateRef(uid, charId), {
    round,
    turnEconomy,
    updatedAt: serverTimestamp(),
  });
}
