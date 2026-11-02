/**
 * FROZEN copy of the encounter reader shipped in v0.25.0 (live 9bb9a60c):
 * `parseEncounterState` from src/features/campaigns/encounter.ts and the checks it uses,
 * verbatim except for the exports. Never edit it to match today's code: it exists so a
 * test can prove what a client still running v0.25.0 does with a fight a newer one wrote.
 */
import type {
  EncounterState,
  EncounterCombatant,
  EncounterPc,
  EncounterMonster,
} from "@/types/campaign";
import { isMonsterSpeedFt } from "@/lib/monster-speed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const PC_COMBATANT_KEYS = new Set(["kind", "id", "memberUid", "characterId", "hidden"]);

const MONSTER_COMBATANT_KEYS = new Set([
  "kind",
  "id",
  "hidden",
  "side",
  "name",
  "srdId",
  "ac",
  "speed",
  "initiative",
  "conditions",
  "hp",
  "groupId",
  "groupIndex",
  "groupSize",
  "revealed",
  "notes",
  "xp",
  "creatureType",
  "portraitUrl",
  "portraitCrop",
  "defenses",
  "bardicInspirationDie",
  "heroicInspiration",
  "spent",
]);

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function isPortraitCrop(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length === 4 &&
    finiteNumber(value.x) &&
    finiteNumber(value.y) &&
    finiteNumber(value.width) &&
    finiteNumber(value.height)
  );
}

function isEncounterPc(value: Record<string, unknown>): boolean {
  return (
    value.kind === "pc" &&
    hasOnlyKeys(value, PC_COMBATANT_KEYS) &&
    nonEmptyString(value.memberUid) &&
    value.id === `pc-${value.memberUid}` &&
    nonEmptyString(value.characterId) &&
    (value.hidden === undefined || typeof value.hidden === "boolean")
  );
}

function isSpentUses(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, count]) => key !== "" && safeInteger(count) && count >= 1
    )
  );
}

function isEncounterMonster(value: Record<string, unknown>): boolean {
  const hp = value.hp;
  if (
    value.kind !== "monster" ||
    !hasOnlyKeys(value, MONSTER_COMBATANT_KEYS) ||
    !nonEmptyString(value.id) ||
    !/^monster-[1-9]\d*$/.test(value.id) ||
    !nonEmptyString(value.name) ||
    !finiteNumber(value.ac) ||
    !(value.initiative === null || Number.isSafeInteger(value.initiative)) ||
    !Array.isArray(value.conditions) ||
    !value.conditions.every(nonEmptyString) ||
    new Set(value.conditions).size !== value.conditions.length ||
    !isRecord(hp) ||
    Object.keys(hp).length !== 3 ||
    !Object.hasOwn(hp, "current") ||
    !Object.hasOwn(hp, "temp") ||
    !Object.hasOwn(hp, "max") ||
    !safeInteger(hp.current) ||
    !safeInteger(hp.temp) ||
    !safeInteger(hp.max) ||
    hp.current > hp.max
  ) {
    return false;
  }
  if (
    (value.hidden !== undefined && typeof value.hidden !== "boolean") ||
    (value.side !== undefined && value.side !== "ally" && value.side !== "enemy") ||
    (value.srdId !== undefined && !nonEmptyString(value.srdId)) ||
    (value.speed !== undefined && !isMonsterSpeedFt(value.speed)) ||
    (value.revealed !== undefined && typeof value.revealed !== "boolean") ||
    (value.notes !== undefined && !nonEmptyString(value.notes)) ||
    (value.xp !== undefined && !safeInteger(value.xp)) ||
    (value.creatureType !== undefined && !nonEmptyString(value.creatureType)) ||
    (value.portraitUrl !== undefined && !nonEmptyString(value.portraitUrl)) ||
    (value.portraitCrop !== undefined && !isPortraitCrop(value.portraitCrop)) ||
    (value.defenses !== undefined && !isRecord(value.defenses)) ||
    (value.bardicInspirationDie !== undefined &&
      !nonEmptyString(value.bardicInspirationDie)) ||
    (value.heroicInspiration !== undefined &&
      typeof value.heroicInspiration !== "boolean") ||
    (value.spent !== undefined && !isSpentUses(value.spent))
  ) {
    return false;
  }
  const groupValues = [value.groupId, value.groupIndex, value.groupSize];
  const grouped = groupValues.every((entry) => entry !== undefined);
  if (!grouped && groupValues.some((entry) => entry !== undefined)) return false;
  return (
    !grouped ||
    (nonEmptyString(value.groupId) &&
      /^monster-[1-9]\d*$/.test(value.groupId) &&
      safeInteger(value.groupIndex, 1) &&
      safeInteger(value.groupSize, 2) &&
      value.groupIndex <= value.groupSize)
  );
}

/** Round 1's second turns: shape only. A stale id (a combatant removed since Begin
 *  turns) is fine — `firstRoundSlots` drops it. */
function validExtraTurns(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (turn) =>
        isRecord(turn) &&
        nonEmptyString(turn.id) &&
        (turn.beforeId === null || nonEmptyString(turn.beforeId)) &&
        (turn.started === undefined || typeof turn.started === "boolean")
    )
  );
}

/** Strict encounter boundary. It returns the original current-model value and never
 * repairs, expands or rewrites persisted combatants. The one exception is the
 * member-writable `extraTurns`: a malformed value reads as absent instead of throwing. */
export function parseEncounterState(value: unknown): EncounterState {
  if (
    !isRecord(value) ||
    !Array.isArray(value.combatants) ||
    !safeInteger(value.nextMonsterOrdinal, 1) ||
    !safeInteger(value.round, 1) ||
    !(value.currentCombatantId === null || nonEmptyString(value.currentCombatantId)) ||
    !safeInteger(value.epoch) ||
    value.status !== "active"
  ) {
    throw new TypeError("Invalid encounter state");
  }
  const combatants: EncounterCombatant[] = [];
  const ids = new Set<string>();
  let highestMonsterOrdinal = 0;
  for (const candidate of value.combatants) {
    if (!isRecord(candidate)) throw new TypeError("Invalid encounter combatant");
    const combatant: EncounterCombatant | null =
      candidate.kind === "pc"
        ? isEncounterPc(candidate)
          ? (candidate as unknown as EncounterPc)
          : null
        : isEncounterMonster(candidate)
          ? (candidate as unknown as EncounterMonster)
          : null;
    if (!combatant || ids.has(combatant.id)) {
      throw new TypeError("Invalid encounter combatant");
    }
    ids.add(combatant.id);
    combatants.push(combatant);
    if (combatant.kind === "monster") {
      highestMonsterOrdinal = Math.max(
        highestMonsterOrdinal,
        Number(combatant.id.slice("monster-".length))
      );
    }
  }
  if (value.nextMonsterOrdinal <= highestMonsterOrdinal) {
    throw new TypeError("Invalid encounter monster identity allocator");
  }
  if (value.currentCombatantId !== null && !ids.has(value.currentCombatantId)) {
    throw new TypeError("Invalid encounter turn pointer");
  }
  if (value.order !== undefined) {
    if (
      !Array.isArray(value.order) ||
      !value.order.every((id): id is string => nonEmptyString(id) && ids.has(id)) ||
      new Set(value.order).size !== value.order.length
    ) {
      throw new TypeError("Invalid encounter turn order");
    }
  }
  if (value.initiativeSwaps !== undefined) {
    if (
      !Array.isArray(value.initiativeSwaps) ||
      !value.initiativeSwaps.every(
        (swap) =>
          isRecord(swap) &&
          Object.keys(swap).length === 2 &&
          nonEmptyString(swap.sourceId) &&
          nonEmptyString(swap.targetId) &&
          swap.sourceId !== swap.targetId &&
          ids.has(swap.sourceId) &&
          ids.has(swap.targetId)
      )
    ) {
      throw new TypeError("Invalid encounter initiative swap");
    }
  }
  if (value.extraTurns !== undefined && !validExtraTurns(value.extraTurns)) {
    // A member may write this field (turn advance), so a malformed value must never
    // break the fight for the whole table: it reads as absent (the plain order).
    const rest: Record<string, unknown> = { ...value };
    delete rest.extraTurns;
    return rest as unknown as EncounterState;
  }
  return value as unknown as EncounterState;
}
