/**
 * combat-state-codec — the PURE, Firebase-free DECODER for the per-character
 * `combat/state` subdoc.
 *
 * Extracted VERBATIM from `combat-state-io.ts` (which imports `firebase/firestore`)
 * so every reader of the stored shape uses ONE parser: the app through
 * `combat-state-io.ts`, which re-exports this module unchanged, and the one-off
 * admin migrations, which cannot import Firebase at all. Shape tolerance still lives
 * at the read edge — a present document must carry the complete combat core AND its
 * v1 `playState`, and a malformed/partial one is never reinterpreted as a valid 0-HP
 * character.
 *
 * Behaviour is unchanged by the move; see `combat-state-io.ts` for the write seam,
 * the offline-first contract, and why the rules validate authorization only.
 */
import type { CombatState, PendingConcentrationSave } from "@/types/combat-state";
import { normalizeConcentrationRef } from "@/lib/concentration";
import { conformActiveCombatEffects } from "@/lib/combat-effect-io";
import { parseCombatOutcomeReceipt } from "@/lib/combat-outcomes";
import { parsePersistedPlayStateV1 } from "@/lib/session-state-codec";

const STRICT_V1_FIELDS = [
  "activeEffects",
  "pendingConcentrationSaves",
  "turnEconomy",
  "appliedEncounterEffects",
  "recentActions",
] as const;

/**
 * Every top-level key `combatStateWriteData` (combat-state-io.ts) emits — the closed
 * world of the `combat/state` document. A stored key outside this list is ignored by
 * the reader and shed by the next full overwrite; the codec-loss audit
 * (`scripts/lib/codec-loss-audit.ts`) reports it as loss.
 */
export const KNOWN_COMBAT_STATE_KEYS: readonly string[] = [
  "hp",
  "conditions",
  "bardicInspirationDie",
  "heroicInspiration",
  "initiativeRoll",
  "deathSaves",
  "round",
  "recentActions",
  "activeEffects",
  "appliedEncounterEffects",
  "turnEconomy",
  "pendingConcentrationSaves",
  "playState",
  "updatedAt",
];

/**
 * Keys a stored `combat/state` may still carry from deleted writers — the retired
 * per-encounter `initiativeEpoch` stamp and the effect-program runtime's ledgers. The
 * reader ignores them fail-safe and the next full overwrite sheds them; the codec-loss
 * audit classifies their drop as `conformed`, never as loss.
 */
export const SHED_COMBAT_STATE_KEYS: readonly string[] = [
  "initiativeEpoch",
  "actionRevision",
  "actionHead",
  "actionLifecycles",
  "effectLifecycles",
  "effectOps",
];

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

export type CombatStateParseResult =
  | { ok: true; state: CombatState }
  | {
      ok: false;
      reason: "invalid-combat-state" | "invalid-v1-play-state";
    };

/**
 * Defensively parse a stored `combat/state` doc — the SOLE play owner. A present
 * document must carry the complete combat core AND a valid v1 `playState`; malformed,
 * partial or play-state-less documents are never reinterpreted as a valid 0-HP
 * character.
 */
export function parseCombatState(data: unknown): CombatStateParseResult {
  return parseStoredCombatState(data, false);
}

/**
 * The PRE-CUTOVER read: a stored child that carries only the legacy combat core with no
 * `playState` is still accepted (the parent `state` was the session then). Used ONLY by
 * `scripts/migrate-character-parents.ts`.
 *
 * P3 deletion: this dies with that migration script. No app path may call it.
 */
export function parseLegacyCombatChild(data: unknown): CombatStateParseResult {
  return parseStoredCombatState(data, true);
}

function parseStoredCombatState(
  data: unknown,
  allowMissingPlayState: boolean
): CombatStateParseResult {
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
    allowMissingPlayState && data.playState === undefined
      ? null
      : parsePersistedPlayStateV1(data.playState);
  if (playState && !playState.ok) {
    return { ok: false, reason: "invalid-v1-play-state" };
  }
  if (
    playState?.ok &&
    STRICT_V1_FIELDS.some((key) => !presentFieldIsPlainJson(data, key))
  ) {
    return { ok: false, reason: "invalid-combat-state" };
  }
  // `SHED_COMBAT_STATE_KEYS` (the deleted effect-program runtime's ledgers, the
  // retired `initiativeEpoch` stamp) are ignored here fail-safe and shed by the next
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
  return { ok: true, state };
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
