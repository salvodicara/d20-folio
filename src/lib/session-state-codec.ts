/**
 * Pure, SRD-free codec for the compact play-session map shared by the portable
 * character envelope and the versioned combat/play-state owner.
 */
import type { LogEntry, SessionState } from "@/types/character";
import type { AbilityCode } from "@/data/types";
import { normalizeStoredConcentration } from "@/lib/concentration";
import { FAMILIAR_CREATURE_TYPES, type FamiliarCreatureType } from "@/lib/familiar-ids";
import { normalizeItemResources, parseItemResources } from "@/lib/item-resources";
import { sanitizeSession } from "@/lib/sanitize-session";

type CompactTrackerState = number | { used?: number; rolls: Array<number | null> };
type Coin = keyof SessionState["currency"];

/** Typed form of the portable envelope's compact `state` map. */
export interface CompactSessionState extends Record<string, unknown> {
  hp?: { current?: number; temp?: number };
  usedHitDice?: number;
  trackers?: Record<string, CompactTrackerState>;
  itemResources?: NonNullable<SessionState["itemResources"]>;
  usedSlots?: Record<string, CompactTrackerState>;
  currency?: Partial<Record<Coin, number>>;
  concentration?: SessionState["concentration"];
  concentrationCastLevel?: number;
  initiative?: string;
  conditions?: string[];
  concentrationConditions?: ReadonlyArray<string>;
  hiddenDc?: number;
  deathSucc?: number;
  deathFail?: number;
  inspiration?: true;
  bardicInspirationDie?: string;
  exhaustion?: number;
  sessionDefenses?: SessionState["sessionDefenses"];
  pinnedActions?: string[];
  unpinnedActions?: string[];
  notes?: string;
  log?: LogEntry[];
  activeFeatures?: string[];
  activeSpellCastLevels?: NonNullable<SessionState["activeSpellCastLevels"]>;
  effectTimers?: NonNullable<SessionState["effectTimers"]>;
  effectBoundaries?: NonNullable<SessionState["effectBoundaries"]>;
  grantBundleChoices?: NonNullable<SessionState["grantBundleChoices"]>;
  companionHp?: NonNullable<SessionState["companionHp"]>;
  companionVariant?: NonNullable<SessionState["companionVariant"]>;
  familiar?: NonNullable<SessionState["familiar"]>;
  manifestedWeaponOverrides?: NonNullable<SessionState["manifestedWeaponOverrides"]>;
  pactWeaponConfig?: NonNullable<SessionState["pactWeaponConfig"]>;
  pactWeaponRiderTypes?: NonNullable<SessionState["pactWeaponRiderTypes"]>;
  polymorphForm?: NonNullable<SessionState["polymorphForm"]>;
}

const COMBAT_STATE_KEYS = [
  "hp",
  "initiative",
  "conditions",
  "deathSucc",
  "deathFail",
  "inspiration",
  "bardicInspirationDie",
] as const satisfies ReadonlyArray<keyof CompactSessionState>;

const COMBAT_STATE_KEY_SET: ReadonlySet<string> = new Set(COMBAT_STATE_KEYS);

/** Compact play facts owned by `combat/state`; top-level combat facts are omitted. */
export type CompactPlayState = Omit<
  CompactSessionState,
  (typeof COMBAT_STATE_KEYS)[number]
>;

export interface PersistedPlayStateV1 {
  version: 1;
  state: CompactPlayState;
}

export type PersistedPlayStateParseResult =
  | {
      ok: true;
      value: PersistedPlayStateV1;
      session: SessionState;
    }
  | {
      ok: false;
      reason: "invalid-play-state" | "unsupported-play-state-version";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

function isFamiliarCreatureType(value: unknown): value is FamiliarCreatureType {
  return (
    typeof value === "string" &&
    (FAMILIAR_CREATURE_TYPES as readonly string[]).includes(value)
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function recordedRolls(value: unknown): Array<number | null> {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).map((roll) =>
    roll === null || (typeof roll === "number" && Number.isFinite(roll)) ? roll : null
  );
}

/** Keep ordinary counters compact while preserving optional table-recorded rolls. */
function flattenUsed(map: unknown): Record<string, CompactTrackerState> {
  const out: Record<string, CompactTrackerState> = {};
  if (!isRecord(map)) return out;
  for (const [key, value] of Object.entries(map)) {
    const used = isRecord(value) && typeof value.used === "number" ? value.used : 0;
    const rolls = recordedRolls(isRecord(value) ? value.rolls : undefined);
    if (rolls.some((roll) => typeof roll === "number")) {
      out[key] = { ...(used > 0 ? { used } : {}), rolls };
    } else if (used > 0) {
      out[key] = used;
    }
  }
  return out;
}

/** Expand compact numeric counters and additive recorded-roll entries. */
function expandUsed(
  map: unknown
): Record<string, { used: number; rolls?: Array<number | null> }> {
  const out: Record<string, { used: number; rolls?: Array<number | null> }> = {};
  if (!isRecord(map)) return out;
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === "number") out[key] = { used: value };
    else if (isRecord(value) && Array.isArray(value.rolls)) {
      out[key] = {
        used: numOr(value.used, 0),
        rolls: recordedRolls(value.rolls),
      };
    }
  }
  return out;
}

const COIN_KEYS = ["pp", "gp", "ep", "sp", "cp"] as const;

function logToState(entry: LogEntry): LogEntry {
  return { event: entry.event, ts: entry.ts, id: entry.id };
}

/** Reshape a sanitized session into the minimal, non-default-only `state`. */
export function sessionToState(session: SessionState): CompactSessionState {
  const state: CompactSessionState = {};

  const hp: NonNullable<CompactSessionState["hp"]> = {};
  if (session.hp.current !== 0) hp.current = session.hp.current;
  if (session.hp.temp !== 0) hp.temp = session.hp.temp;
  if (Object.keys(hp).length > 0) state.hp = hp;

  if (session.hitDice.used !== 0) state.usedHitDice = session.hitDice.used;

  const trackers = flattenUsed(session.trackers);
  if (Object.keys(trackers).length > 0) state.trackers = trackers;

  const parsedItemResources = parseItemResources(session.itemResources);
  if (!parsedItemResources.ok) {
    throw new TypeError("Cannot serialize malformed item resource state");
  }
  if (Object.keys(parsedItemResources.value).length > 0) {
    state.itemResources = parsedItemResources.value;
  }

  const usedSlots = flattenUsed(session.spellSlots);
  if (Object.keys(usedSlots).length > 0) state.usedSlots = usedSlots;

  const currency: NonNullable<CompactSessionState["currency"]> = {};
  for (const coin of COIN_KEYS) {
    if (session.currency[coin] !== 0) currency[coin] = session.currency[coin];
  }
  if (Object.keys(currency).length > 0) state.currency = currency;

  if (session.concentration !== "") state.concentration = session.concentration;
  if (session.concentration !== "" && session.concentrationCastLevel !== undefined) {
    state.concentrationCastLevel = session.concentrationCastLevel;
  }
  if (session.initiative !== "") state.initiative = session.initiative;
  if (session.conditions.length > 0) state.conditions = session.conditions;
  if (session.concentrationConditions?.length) {
    state.concentrationConditions = session.concentrationConditions;
  }
  if (typeof session.hiddenDc === "number") state.hiddenDc = session.hiddenDc;
  if (session.deathSucc !== 0) state.deathSucc = session.deathSucc;
  if (session.deathFail !== 0) state.deathFail = session.deathFail;
  if (session.inspiration) state.inspiration = true;
  if (session.exhaustion !== 0) state.exhaustion = session.exhaustion;
  if (isNonEmptyRecord(session.sessionDefenses)) {
    state.sessionDefenses = session.sessionDefenses;
  }
  if (session.pinnedActions.length > 0) state.pinnedActions = session.pinnedActions;
  if (session.unpinnedActions && session.unpinnedActions.length > 0) {
    state.unpinnedActions = session.unpinnedActions;
  }
  if (session.notes !== "") state.notes = session.notes;
  if (session.logEntries.length > 0) {
    state.log = session.logEntries.map(logToState);
  }

  if (isNonEmptyArray(session.activeFeatures)) {
    state.activeFeatures = session.activeFeatures;
  }
  if (isNonEmptyRecord(session.activeSpellCastLevels)) {
    state.activeSpellCastLevels = session.activeSpellCastLevels;
  }
  if (isNonEmptyRecord(session.effectTimers)) state.effectTimers = session.effectTimers;
  if (isNonEmptyRecord(session.effectBoundaries)) {
    state.effectBoundaries = session.effectBoundaries;
  }
  if (isNonEmptyRecord(session.grantBundleChoices)) {
    state.grantBundleChoices = session.grantBundleChoices;
  }
  if (isNonEmptyRecord(session.companionHp)) state.companionHp = session.companionHp;
  if (isNonEmptyRecord(session.companionVariant)) {
    state.companionVariant = session.companionVariant;
  }
  if (session.familiar) state.familiar = session.familiar;
  if (isNonEmptyRecord(session.manifestedWeaponOverrides)) {
    state.manifestedWeaponOverrides = session.manifestedWeaponOverrides;
  }
  if (isNonEmptyRecord(session.pactWeaponConfig)) {
    state.pactWeaponConfig = session.pactWeaponConfig;
  }
  if (isNonEmptyRecord(session.pactWeaponRiderTypes)) {
    state.pactWeaponRiderTypes = session.pactWeaponRiderTypes;
  }
  if (session.polymorphForm) state.polymorphForm = session.polymorphForm;
  if (isNonEmptyString(session.bardicInspirationDie)) {
    state.bardicInspirationDie = session.bardicInspirationDie;
  }

  return state;
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "string")) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

function parseSessionDefenses(value: unknown): SessionState["sessionDefenses"] {
  if (!isRecord(value)) return undefined;
  const defenses: NonNullable<SessionState["sessionDefenses"]> = {};
  for (const key of [
    "resistance",
    "immunity",
    "vulnerability",
    "conditionImmunity",
  ] as const) {
    if (Array.isArray(value[key])) defenses[key] = stringArray(value[key]);
  }
  return Object.keys(defenses).length > 0 ? defenses : undefined;
}

function parseCompanionHp(value: unknown): SessionState["companionHp"] {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).flatMap(([key, candidate]) =>
    isRecord(candidate) &&
    typeof candidate.current === "number" &&
    Number.isFinite(candidate.current)
      ? [[key, { current: candidate.current }] as const]
      : []
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseManifestedWeaponOverrides(
  value: unknown
): SessionState["manifestedWeaponOverrides"] {
  if (!isRecord(value)) return undefined;
  const result: NonNullable<SessionState["manifestedWeaponOverrides"]> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue;
    const override: NonNullable<SessionState["manifestedWeaponOverrides"]>[string] = {};
    if (
      candidate.attackBonus === null ||
      (typeof candidate.attackBonus === "number" &&
        Number.isFinite(candidate.attackBonus))
    ) {
      override.attackBonus = candidate.attackBonus;
    }
    if (candidate.damage === null || typeof candidate.damage === "string") {
      override.damage = candidate.damage;
    }
    result[key] = override;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parsePactWeaponConfig(value: unknown): SessionState["pactWeaponConfig"] {
  if (!isRecord(value)) return undefined;
  const result: NonNullable<SessionState["pactWeaponConfig"]> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue;
    const config: NonNullable<SessionState["pactWeaponConfig"]>[string] = {};
    for (const field of ["weaponName", "damageDie", "baseDamageType"] as const) {
      if (typeof candidate[field] === "string") config[field] = candidate[field];
    }
    if (
      candidate.chosenDamageType === null ||
      typeof candidate.chosenDamageType === "string"
    ) {
      config.chosenDamageType = candidate.chosenDamageType;
    }
    if (
      candidate.attackBonus === null ||
      (typeof candidate.attackBonus === "number" &&
        Number.isFinite(candidate.attackBonus))
    ) {
      config.attackBonus = candidate.attackBonus;
    }
    if (candidate.damage === null || typeof candidate.damage === "string") {
      config.damage = candidate.damage;
    }
    result[key] = config;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parsePactWeaponRiderTypes(value: unknown): SessionState["pactWeaponRiderTypes"] {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | null] =>
      entry[1] === null || typeof entry[1] === "string"
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parsePolymorphForm(value: unknown): SessionState["polymorphForm"] {
  if (!isRecord(value) || !isRecord(value.prior)) return undefined;
  const prior = value.prior;
  const abilityScores = prior.abilityScores;
  const nullableNumber = (candidate: unknown): candidate is number | null =>
    candidate === null || (typeof candidate === "number" && Number.isFinite(candidate));
  if (
    typeof value.beastId !== "string" ||
    typeof value.spellId !== "string" ||
    !nullableNumber(prior.acOverride) ||
    !nullableNumber(prior.speedOverride) ||
    !isRecord(prior.speedOverrides) ||
    !Object.values(prior.speedOverrides).every(nullableNumber) ||
    !isRecord(abilityScores) ||
    !(["STR", "DEX", "CON", "INT", "WIS", "CHA"] as AbilityCode[]).every(
      (ability) =>
        typeof abilityScores[ability] === "number" &&
        Number.isFinite(abilityScores[ability])
    ) ||
    typeof prior.tempHp !== "number" ||
    !Number.isFinite(prior.tempHp)
  ) {
    return undefined;
  }
  return {
    beastId: value.beastId,
    spellId: value.spellId,
    prior: {
      acOverride: prior.acOverride,
      speedOverride: prior.speedOverride,
      speedOverrides: prior.speedOverrides as Record<string, number | null>,
      abilityScores: abilityScores as Record<AbilityCode, number>,
      tempHp: prior.tempHp,
    },
  };
}

/** Reverse {@link sessionToState}: a compact map to the partial the sanitizer completes. */
export function stateToSession(state: Record<string, unknown>): Partial<SessionState> {
  const session: Partial<SessionState> = {};
  const hp = isRecord(state.hp) ? state.hp : {};
  session.hp = {
    current: numOr(hp.current, 0),
    temp: numOr(hp.temp, 0),
  };
  session.hitDice = { used: numOr(state.usedHitDice, 0) };
  session.trackers = expandUsed(state.trackers);
  session.itemResources = normalizeItemResources(state.itemResources);
  session.spellSlots = expandUsed(state.usedSlots);
  const currency = isRecord(state.currency) ? state.currency : {};
  session.currency = {
    pp: numOr(currency.pp, 0),
    gp: numOr(currency.gp, 0),
    ep: numOr(currency.ep, 0),
    sp: numOr(currency.sp, 0),
    cp: numOr(currency.cp, 0),
  };
  session.concentration = normalizeStoredConcentration(state.concentration);
  if (
    session.concentration &&
    typeof state.concentrationCastLevel === "number" &&
    Number.isFinite(state.concentrationCastLevel) &&
    state.concentrationCastLevel > 0
  ) {
    session.concentrationCastLevel = Math.round(state.concentrationCastLevel);
  }
  session.initiative = asString(state.initiative);
  session.conditions = stringArray(state.conditions);
  if (Array.isArray(state.concentrationConditions)) {
    session.concentrationConditions = stringArray(state.concentrationConditions);
  }
  if (typeof state.hiddenDc === "number") session.hiddenDc = state.hiddenDc;
  session.deathSucc = numOr(state.deathSucc, 0);
  session.deathFail = numOr(state.deathFail, 0);
  session.inspiration = state.inspiration === true;
  session.exhaustion = numOr(state.exhaustion, 0);
  session.sessionDefenses = parseSessionDefenses(state.sessionDefenses);
  session.pinnedActions = stringArray(state.pinnedActions);
  if (Array.isArray(state.unpinnedActions)) {
    session.unpinnedActions = stringArray(state.unpinnedActions);
  }
  session.notes = asString(state.notes);
  if (Array.isArray(state.log)) {
    session.logEntries = state.log.filter(isRecord) as unknown as LogEntry[];
  }
  session.grantBundleChoices = parseStringRecord(state.grantBundleChoices);
  if (Array.isArray(state.activeFeatures)) {
    session.activeFeatures = stringArray(state.activeFeatures);
  }
  if (isRecord(state.activeSpellCastLevels)) {
    session.activeSpellCastLevels = Object.fromEntries(
      Object.entries(state.activeSpellCastLevels).flatMap(([key, value]) =>
        typeof value === "number" && Number.isFinite(value) && value > 0
          ? [[key, Math.round(value)]]
          : []
      )
    );
  }
  if (isRecord(state.effectTimers)) {
    const timers: NonNullable<SessionState["effectTimers"]> = {};
    for (const [key, value] of Object.entries(state.effectTimers)) {
      if (
        isRecord(value) &&
        typeof value.roundsLeft === "number" &&
        Number.isFinite(value.roundsLeft)
      ) {
        timers[key] = { roundsLeft: value.roundsLeft };
      }
    }
    if (Object.keys(timers).length > 0) session.effectTimers = timers;
  }
  if (isRecord(state.effectBoundaries)) {
    const boundaries: NonNullable<SessionState["effectBoundaries"]> = {};
    for (const [key, value] of Object.entries(state.effectBoundaries)) {
      if (
        isRecord(value) &&
        typeof value.round === "number" &&
        Number.isFinite(value.round) &&
        value.round >= 1 &&
        (value.phase === "turn-start" || value.phase === "turn-end")
      ) {
        boundaries[key] = { round: Math.round(value.round), phase: value.phase };
      }
    }
    if (Object.keys(boundaries).length > 0) session.effectBoundaries = boundaries;
  }
  session.companionHp = parseCompanionHp(state.companionHp);
  session.companionVariant = parseStringRecord(state.companionVariant);
  if (
    isRecord(state.familiar) &&
    typeof state.familiar.monsterId === "string" &&
    isFamiliarCreatureType(state.familiar.creatureType)
  ) {
    session.familiar = {
      monsterId: state.familiar.monsterId,
      creatureType: state.familiar.creatureType,
      ...(state.familiar.dismissed === true ? { dismissed: true } : {}),
    };
  }
  session.manifestedWeaponOverrides = parseManifestedWeaponOverrides(
    state.manifestedWeaponOverrides
  );
  session.pactWeaponConfig = parsePactWeaponConfig(state.pactWeaponConfig);
  session.pactWeaponRiderTypes = parsePactWeaponRiderTypes(state.pactWeaponRiderTypes);
  session.polymorphForm = parsePolymorphForm(state.polymorphForm);
  if (isNonEmptyString(state.bardicInspirationDie)) {
    session.bardicInspirationDie = state.bardicInspirationDie;
  }
  return session;
}

/** Serialize only the play facts that do not already have a top-level combat owner. */
export function sessionToPlayStateV1(session: SessionState): PersistedPlayStateV1 {
  const state: CompactPlayState = Object.fromEntries(
    Object.entries(sessionToState(session)).filter(
      ([key]) => !COMBAT_STATE_KEY_SET.has(key)
    )
  );
  return { version: 1, state };
}

function isPlainJson(value: unknown, stack = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || stack.has(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value) as unknown;
  if (
    prototype !== Object.prototype &&
    prototype !== Array.prototype &&
    prototype !== null
  ) {
    return false;
  }
  stack.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    stack.delete(value);
    return false;
  }
  const keys = Object.keys(descriptors);
  if (
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor)
    )
  ) {
    stack.delete(value);
    return false;
  }
  if (Array.isArray(value)) {
    if (keys.some((key) => key !== "length" && !/^(?:0|[1-9]\d*)$/.test(key))) {
      stack.delete(value);
      return false;
    }
    if (
      keys.length !== value.length + 1 ||
      Array.from({ length: value.length }, (_, index) => index).some(
        (index) => !Object.hasOwn(value, index)
      )
    ) {
      stack.delete(value);
      return false;
    }
  }
  const valid = Object.entries(descriptors).every(([key, descriptor]) =>
    key === "length" ? true : isPlainJson(descriptor.value, stack)
  );
  stack.delete(value);
  return valid;
}

function jsonEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEquals(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && jsonEquals(left[key], right[key])
    )
  );
}

/** Strict decoder for the new v1 play owner. Legacy portable-state tolerance stays separate. */
export function parsePersistedPlayStateV1(value: unknown): PersistedPlayStateParseResult {
  if (!isPlainJson(value) || !isRecord(value)) {
    return { ok: false, reason: "invalid-play-state" };
  }
  if (value.version !== 1) {
    return { ok: false, reason: "unsupported-play-state-version" };
  }
  if (
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "state") ||
    !isRecord(value.state) ||
    Object.keys(value.state).some((key) => COMBAT_STATE_KEY_SET.has(key))
  ) {
    return { ok: false, reason: "invalid-play-state" };
  }
  const session = sanitizeSession(stateToSession(value.state));
  const canonical = sessionToPlayStateV1(session);
  return jsonEquals(value, canonical)
    ? { ok: true, value: canonical, session }
    : { ok: false, reason: "invalid-play-state" };
}
