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
import {
  ACTION_ECONOMY_CATEGORIES,
  TURN_TRIGGER_EVENTS as TRIGGER_EVENTS,
} from "@/data/types";
import { diagnosticsLog } from "@/lib/diagnostics/logger";

/** The economy categories the saved turn's reader keeps (the type's own list). */
export const TURN_ECONOMY_CATEGORIES: ReadonlyArray<
  (typeof ACTION_ECONOMY_CATEGORIES)[number]
> = Object.freeze([...ACTION_ECONOMY_CATEGORIES]);
/** The turn events the saved turn's reader keeps (the type's own list). */
export const TURN_TRIGGER_EVENTS: ReadonlyArray<(typeof TRIGGER_EVENTS)[number]> =
  Object.freeze([...TRIGGER_EVENTS]);

const STRICT_V1_FIELDS = [
  "activeEffects",
  "pendingConcentrationSaves",
  "turnEconomy",
  "appliedEncounterEffects",
] as const;

/** Whether a stored value is one of a closed list's members. */
function isOneOf<T extends string>(list: ReadonlyArray<T>, value: unknown): value is T {
  return (list as ReadonlyArray<unknown>).includes(value);
}

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
      /** Which check refused it: `<step>:<field>` (keys only, never a value), for
       *  diagnostics such as the v0.26 compatibility survey. */
      where: string;
    };

/**
 * Defensively parse a stored `combat/state` doc — the SOLE play owner. A present
 * document must carry the complete combat core AND a valid v1 `playState`; malformed,
 * partial or play-state-less documents are never reinterpreted as a valid 0-HP
 * character.
 */
/**
 * The form the strict reader requires a stored v1 field to have (its own parse): a
 * stored value that differs from it refuses the whole document. For diagnostics, to
 * name the keys where a refused field differs.
 */
export function canonicalCombatField(
  key: (typeof STRICT_V1_FIELDS)[number],
  value: unknown
): unknown {
  if (key === "activeEffects") return conformActiveCombatEffects(value);
  if (key === "pendingConcentrationSaves") return parsePendingConcentrationSaves(value);
  if (key === "turnEconomy") return parseTurnEconomy(value);
  return parseAppliedEncounterEffects(value);
}

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
    const field = !isRecord(data) ? "(root)" : !isRecord(data.hp) ? "hp" : "deathSaves";
    return { ok: false, reason: "invalid-combat-state", where: `core:${field}` };
  }
  const hp = data.hp;
  const ds = data.deathSaves;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const finite = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
  const coreFault = (
    [
      ["hp.current", !finite(hp.current)],
      ["hp.temp", !finite(hp.temp)],
      [
        "conditions",
        !Array.isArray(data.conditions) ||
          !data.conditions.every((condition) => typeof condition === "string"),
      ],
      ["initiativeRoll", !(data.initiativeRoll === null || finite(data.initiativeRoll))],
      ["deathSaves.successes", !finite(ds.successes)],
      ["deathSaves.failures", !finite(ds.failures)],
      ["round", data.round !== undefined && !finite(data.round)],
      [
        "bardicInspirationDie",
        data.bardicInspirationDie !== undefined &&
          typeof data.bardicInspirationDie !== "string",
      ],
      [
        "heroicInspiration",
        data.heroicInspiration !== undefined &&
          typeof data.heroicInspiration !== "boolean",
      ],
    ] as const
  ).find(([, bad]) => bad)?.[0];
  if (coreFault || !Array.isArray(data.conditions)) {
    return {
      ok: false,
      reason: "invalid-combat-state",
      where: `core:${coreFault ?? "conditions"}`,
    };
  }
  const playState =
    allowMissingPlayState && data.playState === undefined
      ? null
      : parsePersistedPlayStateV1(data.playState);
  if (playState && !playState.ok) {
    return {
      ok: false,
      reason: "invalid-v1-play-state",
      where: `play-state:${playState.reason}`,
    };
  }
  const notPlain = playState?.ok
    ? STRICT_V1_FIELDS.find((key) => !presentFieldIsPlainJson(data, key))
    : undefined;
  if (notPlain) {
    return { ok: false, reason: "invalid-combat-state", where: `plain-json:${notPlain}` };
  }
  // Stored subdocs written by the deleted effect-program runtime may still carry
  // `actionRevision` / `actionHead` / `actionLifecycles` / `effectLifecycles`,
  // and a branch-era `effectOps` mirror ledger existed briefly with no
  // production writer; the `recentActions` declared-attack ring lost its last
  // writer with the combat resolver. All are ignored here fail-safe and shed by
  // the next full-overwrite write.
  const applied = parseAppliedEncounterEffects(data.appliedEncounterEffects);
  const turnEconomy = parseTurnEconomy(data.turnEconomy);
  const activeEffects = conformActiveCombatEffects(data.activeEffects);
  const pendingConcentrationSaves = parsePendingConcentrationSaves(
    data.pendingConcentrationSaves
  );
  const notCanonical = !playState?.ok
    ? undefined
    : !presentFieldIsCanonical(data, "activeEffects", activeEffects)
      ? "canonical:activeEffects"
      : new Set(activeEffects.map(({ id }) => id)).size !== activeEffects.length
        ? "duplicate-ids:activeEffects"
        : !presentFieldIsCanonical(
              data,
              "pendingConcentrationSaves",
              pendingConcentrationSaves
            )
          ? "canonical:pendingConcentrationSaves"
          : !presentFieldIsCanonical(
                withoutUnknownTurnValues(data),
                "turnEconomy",
                turnEconomy
              )
            ? "canonical:turnEconomy"
            : !presentFieldIsCanonical(data, "appliedEncounterEffects", applied)
              ? "canonical:appliedEncounterEffects"
              : undefined;
  if (notCanonical) {
    return { ok: false, reason: "invalid-combat-state", where: notCanonical };
  }
  const state: CombatState = {
    // `coreFault` above proved these numeric and the conditions a string list.
    hp: { current: hp.current as number, temp: hp.temp as number },
    conditions: data.conditions as string[],
    ...(typeof data.bardicInspirationDie === "string"
      ? { bardicInspirationDie: data.bardicInspirationDie }
      : {}),
    ...(typeof data.heroicInspiration === "boolean"
      ? { heroicInspiration: data.heroicInspiration }
      : {}),
    initiativeRoll: data.initiativeRoll as number | null,
    deathSaves: { successes: ds.successes as number, failures: ds.failures as number },
    // Absence-safe: a subdoc written before `round` moved here (or a fresh one) reads as
    // round 1 — a natural default, never a permanent read-shim (rule 10).
    round: num(data.round, 1),
    ...(data.soloFightStarted === true ? { soloFightStarted: true } : {}),
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

const SLOTS = ["action", "bonus", "free"] as const;
const reportedUnknownTurnValues = new Set<string>();

/**
 * The stored document with the turn values this build doesn't know taken out: an
 * economy category or a turn event a newer build wrote. The reader drops exactly
 * these, so the canonical check must not refuse the sheet for them (#1158); every
 * other difference still refuses it. Each dropped path is logged once per page load,
 * by key only.
 */
function withoutUnknownTurnValues(
  data: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  const turn = data.turnEconomy;
  if (!isRecord(turn) || !isRecord(turn.selected)) return data;
  const dropped: string[] = [];
  const selected: Record<string, unknown> = { ...turn.selected };
  for (const slot of SLOTS) {
    const rows = selected[slot];
    if (!Array.isArray(rows)) continue;
    selected[slot] = rows.map((row: unknown, index) => {
      if (!isRecord(row)) return row;
      const { economyCategory, triggerEvents, ...rest } = row;
      const kept: Record<string, unknown> = { ...rest };
      const unknownCategory =
        typeof economyCategory === "string" &&
        !isOneOf(TURN_ECONOMY_CATEGORIES, economyCategory);
      if (unknownCategory) dropped.push(`selected.${slot}[${index}].economyCategory`);
      else if (economyCategory !== undefined) kept.economyCategory = economyCategory;
      if (Array.isArray(triggerEvents)) {
        const known = triggerEvents.filter(
          (event: unknown) =>
            typeof event !== "string" || isOneOf(TURN_TRIGGER_EVENTS, event)
        );
        if (known.length < triggerEvents.length) {
          dropped.push(`selected.${slot}[${index}].triggerEvents`);
        }
        if (known.length > 0 || known.length === triggerEvents.length) {
          kept.triggerEvents = known;
        }
      } else if (triggerEvents !== undefined) {
        kept.triggerEvents = triggerEvents;
      }
      return kept;
    });
  }
  if (dropped.length === 0) return data;
  for (const path of dropped) {
    if (reportedUnknownTurnValues.has(path)) continue;
    reportedUnknownTurnValues.add(path);
    console.warn(`[combat-state] dropped unknown turn value: ${path}`);
    diagnosticsLog("warn", "combat-state.unknown-turn-value", { path });
  }
  return { ...data, turnEconomy: { ...turn, selected } };
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
          const economyCategory = isOneOf(TURN_ECONOMY_CATEGORIES, action.economyCategory)
            ? action.economyCategory
            : undefined;
          const triggerEvents = Array.isArray(action.triggerEvents)
            ? action.triggerEvents.filter((event: unknown) =>
                isOneOf(TURN_TRIGGER_EVENTS, event)
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
    // Added in v0.26 (#755): kept only when stored. A v0.25 turn economy has no such
    // key, and its parse must equal it, or the whole combat state is refused.
    ...(row.extraMovementFt !== undefined
      ? { extraMovementFt: number(row.extraMovementFt) }
      : {}),
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
