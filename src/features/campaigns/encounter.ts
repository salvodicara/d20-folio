/**
 * encounter — PURE reducers + selectors for the in-hub group-initiative tracker.
 *
 * The world-layer counterpart to the cockpit's single-hero combat model, generalized
 * to the WHOLE table. Every function here is a TOTAL, IMMUTABLE transition over an
 * {@link EncounterState} — no React, no store, NO Firebase (this module rides the
 * pure-module + architecture-direction guards). The hub UI calls these and the
 * campaign store persists the result through the SAME debounced campaign writer.
 *
 * SINGLE SOURCE OF TRUTH (golden rule 6): a PC combatant is a PURE REFERENCE — its
 * statline is NOT copied here. The reducers in this module only own MONSTER state
 * (the genuine encounter-owned facts) + the turn pointer + the table membership. PC
 * HP / conditions / initiative come LIVE from the player's `combat/state` subdoc, so
 * the PC-editing reducers are intentionally MONSTER-ONLY (a PC branch is a no-op; the
 * player/DM multi-writer editing of live PC state lands in a later chunk).
 *
 * Why reimplement the monster HP math instead of reusing `useHpControls`: that hook is
 * hard-coupled to the single-hero `useCharacterStore`, so it cannot drive an arbitrary
 * creature. We lift only the ARITHMETIC + clamp discipline (golden rule 20): every
 * monster HP edit clamps to `[0, hp.max]`, so an invalid HP is unreachable. NO
 * dice anywhere — initiative is TYPED by the DM (golden rule / constitution 2.2).
 *
 * IDs only (golden rule 7): `conditions` holds stable condition IDs; the only
 * free string is a monster's user-typed name.
 */

import type {
  CampaignDoc,
  EncounterState,
  EncounterCombatant,
  EncounterPc,
  EncounterMonster,
} from "@/types/campaign";
import type { CreatureType } from "@/data/types";
import type { PortraitCrop } from "@/types/character";
import type { CombatDefenseSnapshot } from "@/types/campaign";

// ─── Seeding from member references ─────────────────────────────────────────

/** The per-member seed for a PC combatant — a PURE REFERENCE (the attached character
 *  id; the uid is the record key). NO statline copy: every displayed stat is read live
 *  from the member's char doc + `combat/state` subdoc at render time. */
export interface EncounterPcSeed {
  /** The attached character's id (the live-read key + sheet cross-reference). */
  characterId: string;
}

/** Integer-clamp a value into `[0, max]` (golden rule 20). */
function clampHp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

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
      typeof value.heroicInspiration !== "boolean")
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

/** Strict encounter boundary. It returns the original current-model value and never
 * repairs, expands or rewrites persisted combatants. */
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
  return value as unknown as EncounterState;
}

/** Build a PC combatant REFERENCE — uid + character id only (no statline copy). */
function pcCombatant(memberUid: string, seed: EncounterPcSeed): EncounterPc {
  return {
    kind: "pc",
    id: `pc-${memberUid}`,
    memberUid,
    characterId: seed.characterId,
  };
}

/**
 * Start a fresh encounter, seeding one PC REFERENCE per uid in `uidsInOrder` from its
 * entry in `seeds`. A uid with no entry is skipped (a member who hasn't attached a
 * character). Round 1; the current turn is `null` — the "GATHERING INITIATIVE" phase:
 * players roll, then the DM presses "Begin turns" ({@link beginEncounterTurns}) to point
 * the turn at the top of the live-sorted order. Insertion order follows `uidsInOrder`.
 *
 * `epoch` is the per-encounter identity stamp (a monotonic `Date.now()` from the caller —
 * kept a PARAMETER so this stays a pure, deterministic, testable transition): the pip's
 * most-recent default + the debounced writer's same-fight guard. Roll invalidation is NOT
 * its job anymore — the DM's start write resets the campaign's `encounterInit` table to
 * `{}` atomically (`persistStartEncounter`), so a fresh fight begins with nobody rolled.
 */
export function startEncounter(
  seeds: Readonly<Record<string, EncounterPcSeed>>,
  uidsInOrder: ReadonlyArray<string>,
  epoch: number
): EncounterState {
  const combatants: EncounterCombatant[] = [];
  for (const uid of uidsInOrder) {
    const seed = seeds[uid];
    if (seed) combatants.push(pcCombatant(uid, seed));
  }
  return {
    combatants,
    nextMonsterOrdinal: 1,
    round: 1,
    currentCombatantId: null,
    epoch,
    status: "active",
  };
}

/**
 * FREEZE the turn order onto the encounter doc: set `order` to `orderedIds` (the caller's
 * full live-sorted order INCLUDING hidden), filtered to the combatant ids that actually
 * exist (a stale id — a combatant removed since the sort — is dropped so the frozen order
 * never carries a dangling pointer). Does NOT move `currentCombatantId` — purely records
 * the sequence turns will follow. The single writer of the FROZEN ORDER home; structural
 * (DM/admin only via the debounced encounter writer). Pure; the input is not mutated.
 */
export function freezeOrder(
  state: EncounterState,
  orderedIds: ReadonlyArray<string>
): EncounterState {
  const ids = new Set(state.combatants.map((c) => c.id));
  return { ...state, order: orderedIds.filter((id) => ids.has(id)) };
}

/**
 * Leave the "gathering initiative" phase: FREEZE the live turn order onto the doc
 * ({@link freezeOrder}) and point the current turn at its TOP (`order[0]`, the
 * highest-initiative combatant — the caller supplies the full live-sorted order INCLUDING
 * hidden). From here `advanceTurn`/`prevTurn` step the FROZEN order, identical for every
 * surface. Round stays 1. Tolerant + idempotent: a no-op (same reference) when the turn is
 * already set (re-press never re-freezes a running fight) or the order is empty (nothing
 * to begin — stays in the gathering phase, order left unset).
 */
export function beginEncounterTurns(
  state: EncounterState,
  orderedIds: ReadonlyArray<string>
): EncounterState {
  if (state.currentCombatantId !== null) return state;
  const frozen = freezeOrder(state, orderedIds);
  const first = frozen.order?.[0];
  if (first === undefined) return state;
  return { ...frozen, currentCombatantId: first };
}

// ─── Adding / removing combatants ───────────────────────────────────────────

/** A DM-typed monster/NPC batch to add to the encounter. */
export interface MonsterInput {
  /** User content — the monster/NPC name the DM types. */
  name: string;
  ac: number;
  maxHp: number;
  /** How many independent creatures to create; coerced to ≥ 1. */
  count: number;
  /** Typed initiative seeded onto each creature; `null` = blank. */
  initiative: number | null;
  /** Which side this creature fights for. Omission denotes an enemy. */
  side?: "ally" | "enemy";
  /** Optional DM free-text notes (omitted/empty → no `notes` field is stored). */
  notes?: string;
  /** Optional bestiary reference — set by the picker; omitted → no field stored. */
  srdId?: string;
  /** Optional per-creature XP (SRD Step 3) — the picker seeds `monsterXp(statblock)`, the
   *  custom form seeds `xpForCr(chosen CR)`; omitted (unknown) → no field stored, the
   *  group renders as un-costed. A harmless `xp: 0` IS stored (existence, not truthiness). */
  xp?: number;
  /** Creature type (2024 identity noun) — the monster's identity type. */
  creatureType?: CreatureType;
  /** A saved custom monster's portrait to copy onto the combatant. Database monsters
   * resolve canonical art from `srdId` at render time and leave these fields absent. */
  portraitUrl?: string;
  portraitCrop?: PortraitCrop;
  /** Bestiary/custom defense defaults copied onto each targetable creature. */
  defenses?: CombatDefenseSnapshot;
}

/** Disambiguated instance label without mutating the DM-authored base name. */
export function monsterInstanceName(monster: EncounterMonster): string {
  return monster.groupSize && monster.groupSize > 1 && monster.groupIndex
    ? `${monster.name} ${monster.groupIndex}`
    : monster.name;
}

/**
 * Append `count` independent creatures, each seeded with one scalar full-HP record.
 * IDs consume consecutive deterministic ordinals; group metadata is presentation-only.
 */
export function addMonster(state: EncounterState, input: MonsterInput): EncounterState {
  const name = input.name.trim();
  if (!name) return state;
  const count = Number.isFinite(input.count) ? Math.max(1, Math.floor(input.count)) : 1;
  const maxHp = Number.isFinite(input.maxHp) ? Math.max(0, Math.round(input.maxHp)) : 0;
  const notes = input.notes?.trim();
  const srdId = input.srdId?.trim();
  const firstOrdinal = state.nextMonsterOrdinal;
  const groupId = `monster-${firstOrdinal}`;
  const base: Omit<EncounterMonster, "id"> = {
    kind: "monster",
    ...(input.side === "ally" ? { side: "ally" as const } : {}),
    name,
    ac: Number.isFinite(input.ac) ? Math.max(0, Math.round(input.ac)) : 0,
    initiative:
      input.initiative === null || !Number.isFinite(input.initiative)
        ? null
        : Math.round(input.initiative),
    conditions: [],
    hp: { current: maxHp, temp: 0, max: maxHp },
    // Only store `notes`/`srdId`/`xp` when meaningful — keep the doc minimal (no
    // empty-string field, `stripUndefined`-independent). The `xp` guard is
    // EXISTENCE-based (`!= null` + finite + `≥ 0`), never truthy: a genuine harmless
    // `xp: 0` (a CR-0 statblock) is a real costed value and MUST be written, so it
    // renders costed, not un-costed.
    ...(notes ? { notes } : {}),
    ...(srdId ? { srdId } : {}),
    ...(input.xp != null && Number.isFinite(input.xp) && input.xp >= 0
      ? { xp: Math.round(input.xp) }
      : {}),
    // Identity + art (Part B) — copied onto the encounter doc so every viewer reads
    // the same portrait beside the hero portraits. Only stored when meaningful
    // (no empty-string field; `stripUndefined`-independent).
    ...(input.creatureType ? { creatureType: input.creatureType } : {}),
    ...(input.portraitUrl ? { portraitUrl: input.portraitUrl } : {}),
    ...(input.portraitUrl && input.portraitCrop
      ? { portraitCrop: input.portraitCrop }
      : {}),
    ...(input.defenses ? { defenses: input.defenses } : {}),
  };
  const monsters: EncounterMonster[] = Array.from({ length: count }, (_, index) => ({
    ...base,
    id: `monster-${firstOrdinal + index}`,
    ...(count > 1 ? { groupId, groupIndex: index + 1, groupSize: count } : {}),
  }));
  const combatants = [...state.combatants, ...monsters];
  // REINFORCEMENT auto-join: once the order is FROZEN (turns have begun), a monster added
  // mid-combat must enter the turn order or it would never act — append its id so it is
  // never orphaned. (The feature layer may re-freeze to slot it by initiative; correctness
  // over auto-slot polish here.) Before turns begin (no/empty order) the order is set fresh
  // at Begin-turns, so it is left untouched.
  if (state.order && state.order.length > 0) {
    return {
      ...state,
      combatants,
      nextMonsterOrdinal: firstOrdinal + count,
      order: [...state.order, ...monsters.map((m) => m.id)],
    };
  }
  return { ...state, combatants, nextMonsterOrdinal: firstOrdinal + count };
}

/**
 * Remove a combatant by id, splicing it out of BOTH the membership list AND the FROZEN
 * `order` (so a removed id never lingers as a dangling turn-order entry). When the removed
 * combatant WAS the current turn, the pointer repoints to the survivor that inherits its
 * slot in the frozen order (or the first, then insertion order, then `null` when the table
 * empties) — never a dangling id. When that repoint WRAPS past the end of the frozen order
 * (the removed combatant was the last slot), the round increments, mirroring
 * {@link advanceTurn}'s own last→first step — otherwise the round counter under-counts.
 */
export function removeCombatant(state: EncounterState, id: string): EncounterState {
  if (!state.combatants.some((c) => c.id === id)) return state;
  const combatants = state.combatants.filter((c) => c.id !== id);
  const prevOrder = state.order ?? [];
  const removedOrderIndex = prevOrder.indexOf(id);
  const order = prevOrder.filter((oid) => oid !== id);
  let currentCombatantId = state.currentCombatantId;
  let round = state.round;
  if (currentCombatantId === id) {
    // A wrap happened when the removed slot's index no longer exists in the (shorter)
    // spliced order but a survivor remains to wrap to — i.e. the removed combatant was
    // in the LAST slot, same as advanceTurn stepping past the end.
    if (removedOrderIndex >= 0 && removedOrderIndex >= order.length && order.length > 0) {
      round += 1;
    }
    // The element now at the removed slot in the spliced order is the "next" combatant;
    // wrap to the first, fall back to insertion order, then null when nothing remains.
    currentCombatantId =
      removedOrderIndex >= 0
        ? (order[removedOrderIndex] ?? order[0] ?? combatants[0]?.id ?? null)
        : (combatants[0]?.id ?? null);
  }
  const initiativeSwaps = state.initiativeSwaps?.filter(
    (swap) => swap.sourceId !== id && swap.targetId !== id
  );
  const next: EncounterState = {
    ...state,
    combatants,
    order,
    currentCombatantId,
    round,
  };
  if (initiativeSwaps?.length) next.initiativeSwaps = initiativeSwaps;
  else delete next.initiativeSwaps;
  return next;
}

/** Set (or clear) the DM-only `hidden` ambush flag on a combatant. */
export function setHidden(
  state: EncounterState,
  id: string,
  hidden: boolean
): EncounterState {
  return mapCombatant(state, id, (c) => ({ ...c, hidden }));
}

/** Set (or clear) a MONSTER's `revealed` flag — when set, players read its EXACT HP
 *  instead of the concealed band (CARD-5). A PC is a no-op (a PC always sees its own
 *  exact HP; there is nothing to reveal). */
export function setRevealed(
  state: EncounterState,
  id: string,
  revealed: boolean
): EncounterState {
  return mapCombatant(state, id, (c) => (c.kind === "pc" ? c : { ...c, revealed }));
}

/** Reclassify an NPC at the table without rebuilding it. Allegiance is always a DM
 * override and never inferred from creature type. */
export function setMonsterSide(
  state: EncounterState,
  id: string,
  side: "ally" | "enemy"
): EncounterState {
  return mapCombatant(state, id, (combatant) => {
    if (combatant.kind === "pc") return combatant;
    if (side === "ally") return { ...combatant, side };
    const enemy = { ...combatant };
    delete enemy.side;
    return enemy;
  });
}

// ─── Per-combatant edits ────────────────────────────────────────────────────

/** Map the combatant with `id`, returning a NEW state (or the same when no match). */
function mapCombatant(
  state: EncounterState,
  id: string,
  fn: (c: EncounterCombatant) => EncounterCombatant
): EncounterState {
  const index = state.combatants.findIndex((c) => c.id === id);
  if (index < 0) return state;
  const current = state.combatants[index];
  if (!current) return state;
  const changed = fn(current);
  if (changed === current) return state;
  const combatants = state.combatants.map((c, i) => (i === index ? changed : c));
  return { ...state, combatants };
}

/** Set (or clear) a MONSTER's typed initiative. Integer-rounded; `null` clears. A PC
 *  is a no-op — its initiative is read live from the player's `combat/state` subdoc. */
export function setInitiative(
  state: EncounterState,
  id: string,
  value: number | null
): EncounterState {
  if (value !== null && !Number.isFinite(value)) return state;
  return mapCombatant(state, id, (c) =>
    c.kind === "pc" ? c : { ...c, initiative: value === null ? null : Math.round(value) }
  );
}

/** Record or replace one Alert holder's willing-ally Initiative Swap. The encounter
 * stores the table decision, never copied initiative totals; the view reapplies it over
 * current live rolls until the order freezes. Invalid/self pairs are tolerant no-ops. */
export function setInitiativeSwap(
  state: EncounterState,
  sourceId: string,
  targetId: string
): EncounterState {
  if (sourceId === targetId) return state;
  const source = state.combatants.find((combatant) => combatant.id === sourceId);
  const target = state.combatants.find((combatant) => combatant.id === targetId);
  if (
    source?.kind !== "pc" ||
    !target ||
    (target.kind !== "pc" && target.side !== "ally")
  ) {
    return state;
  }
  const previous = state.initiativeSwaps ?? [];
  const current = previous.find((swap) => swap.sourceId === sourceId);
  if (current?.targetId === targetId) return state;
  return {
    ...state,
    initiativeSwaps: [
      ...previous.filter((swap) => swap.sourceId !== sourceId),
      { sourceId, targetId },
    ],
  };
}

/** Remove one Alert holder's pending Initiative Swap. */
export function clearInitiativeSwap(
  state: EncounterState,
  sourceId: string
): EncounterState {
  const previous = state.initiativeSwaps ?? [];
  const initiativeSwaps = previous.filter((swap) => swap.sourceId !== sourceId);
  if (initiativeSwaps.length === previous.length) return state;
  const next: EncounterState = { ...state, initiativeSwaps };
  if (initiativeSwaps.length === 0) delete next.initiativeSwaps;
  return next;
}

/** Rename a MONSTER (the one free user string — golden rule 7). Whitespace-only
 *  is a no-op (a combatant name is never empty — the non-empty invariant holds by
 *  construction). A PC is a no-op (its name lives on its character doc). */
export function setMonsterName(
  state: EncounterState,
  id: string,
  name: string
): EncounterState {
  const trimmed = name.trim();
  if (trimmed === "") return state;
  return mapCombatant(state, id, (c) => (c.kind === "pc" ? c : { ...c, name: trimmed }));
}

/** Set a MONSTER's XP (SRD Step 3) — the lair toggle (§D.5) routes through
 *  this to rewrite the cost between the base and `xpInLair` prints. Clamped to a
 *  non-negative integer (`Math.max(0, Math.round(xp))`). A PC is a no-op (a PC has no
 *  XP cost — its threat is its class levels, counted on the budget side). */
export function setMonsterXp(
  state: EncounterState,
  id: string,
  xp: number
): EncounterState {
  if (!Number.isFinite(xp)) return state;
  return mapCombatant(state, id, (c) =>
    c.kind === "pc" ? c : { ...c, xp: Math.max(0, Math.round(xp)) }
  );
}

/** Apply a signed HP delta (damage negative, heal positive) to one MONSTER,
 *  clamped to `[0, hp.max]`. A PC is a no-op — its HP lives in the `combat/state`
 *  subdoc (the player/DM multi-writer edit lands in a later chunk). */
export function applyHp(
  state: EncounterState,
  id: string,
  delta: number
): EncounterState {
  if (!Number.isFinite(delta)) return state;
  return mapCombatant(state, id, (c) => {
    if (c.kind === "pc") return c;
    const current = clampHp(c.hp.current + delta, c.hp.max);
    return current === c.hp.current ? c : { ...c, hp: { ...c.hp, current } };
  });
}

/** Set one MONSTER's HP to an absolute value, clamped to `[0, hp.max]`. A PC is a
 *  no-op (live HP lives in the subdoc). */
export function setHp(state: EncounterState, id: string, value: number): EncounterState {
  if (!Number.isFinite(value)) return state;
  return mapCombatant(state, id, (c) => {
    if (c.kind === "pc") return c;
    const current = clampHp(value, c.hp.max);
    return current === c.hp.current ? c : { ...c, hp: { ...c.hp, current } };
  });
}

/** Set a monster instance's Temporary HP. Values are finite, integral and non-negative;
 * PCs remain authoritative in their combat-state subdocument and are a no-op here. */
export function setMonsterTempHp(
  state: EncounterState,
  id: string,
  value: number
): EncounterState {
  if (!Number.isFinite(value)) return state;
  const next = Math.max(0, Math.round(value));
  return mapCombatant(state, id, (combatant) => {
    if (combatant.kind === "pc") return combatant;
    if (combatant.hp.temp === next) return combatant;
    return { ...combatant, hp: { ...combatant.hp, temp: next } };
  });
}

/** Toggle a condition ID on a MONSTER — add if absent, remove if present (deduped).
 *  A PC is a no-op (its conditions live in the `combat/state` subdoc). Condition IDs
 *  only, never localized names (golden rule 7). */
export function toggleCondition(
  state: EncounterState,
  id: string,
  conditionId: string
): EncounterState {
  return mapCombatant(state, id, (c) =>
    c.kind === "pc"
      ? c
      : {
          ...c,
          conditions: c.conditions.includes(conditionId)
            ? c.conditions.filter((x) => x !== conditionId)
            : [...c.conditions, conditionId],
        }
  );
}

/** Set a condition on a MONSTER to an explicit state. Unlike the UI-facing toggle this
 * is idempotent, so a Firestore transaction retry can never invert the requested result.
 * A PC remains a no-op because its conditions live in its combat-state subdocument. */
export function setMonsterCondition(
  state: EncounterState,
  id: string,
  conditionId: string,
  active: boolean
): EncounterState {
  return mapCombatant(state, id, (c) => {
    if (c.kind === "pc") return c;
    const present = c.conditions.includes(conditionId);
    if (present === active) return c;
    return {
      ...c,
      conditions: active
        ? [...c.conditions, conditionId]
        : c.conditions.filter((value) => value !== conditionId),
    };
  });
}

/** Set a MONSTER's DM free-text notes. Whitespace-only clears the field (kept minimal —
 *  no empty-string field stored). A PC is a no-op (monsters own this state). */
export function setMonsterNotes(
  state: EncounterState,
  id: string,
  notes: string
): EncounterState {
  return mapCombatant(state, id, (c) => {
    if (c.kind === "pc") return c;
    const next: EncounterMonster = { ...c, notes };
    if (next.notes?.trim() === "") delete next.notes;
    return next;
  });
}

/** Set or clear the held Bardic Inspiration die on an encounter-owned creature. */
export function setMonsterBardicInspirationDie(
  state: EncounterState,
  id: string,
  die: string
): EncounterState {
  return mapCombatant(state, id, (combatant) => {
    if (combatant.kind === "pc") return combatant;
    if ((combatant.bardicInspirationDie ?? "") === die) return combatant;
    const next: EncounterMonster = { ...combatant, bardicInspirationDie: die };
    if (!die) delete next.bardicInspirationDie;
    return next;
  });
}

/** Set or clear Heroic Inspiration on an encounter-owned creature. */
export function setMonsterHeroicInspiration(
  state: EncounterState,
  id: string,
  held: boolean
): EncounterState {
  return mapCombatant(state, id, (combatant) => {
    if (combatant.kind === "pc") return combatant;
    if ((combatant.heroicInspiration ?? false) === held) return combatant;
    const next: EncounterMonster = { ...combatant, heroicInspiration: held };
    if (!held) delete next.heroicInspiration;
    return next;
  });
}

// ─── Turn order ─────────────────────────────────────────────────────────────

/**
 * Sort any `{ id, initiative }` items into turn order: initiative DESCENDING, with
 * blank (`null`) initiatives LAST, and a TOTAL, deterministic tiebreak on `id` for
 * equal/both-null pairs — so the order is fully stable render-to-render (never
 * dependent on V8 sort stability, never the random Firestore key-iteration order the
 * caller feeds in). The engine never rolls a tiebreak; the id tiebreak is purely
 * deterministic, and the DM resolves a genuine initiative tie by re-typing a value.
 * Pure; the input is not mutated. Generic because PC initiative is now read LIVE (the
 * caller assembles each combatant's `{ id, initiative }` — PC from its `combat/state`
 * subdoc, monster from the encounter doc — then orders them here).
 */
export function sortByInitiative<T extends { id: string; initiative: number | null }>(
  items: ReadonlyArray<T>
): T[] {
  return [...items].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return a.id.localeCompare(b.id);
    if (a.initiative === null) return 1; // blanks sink to the bottom
    if (b.initiative === null) return -1;
    if (a.initiative !== b.initiative) return b.initiative - a.initiative; // higher first
    return a.id.localeCompare(b.id); // equal initiative → deterministic id tiebreak
  });
}

/** Apply Alert swaps in declaration order to an already-sorted list of combatant ids.
 * A stale pair is ignored; sequential swaps remain deterministic when several Alert
 * holders use the feature in the same encounter. Pure; never mutates the input. */
export function applyInitiativeSwaps(
  orderedIds: ReadonlyArray<string>,
  swaps: ReadonlyArray<{ sourceId: string; targetId: string }> | undefined
): string[] {
  const next = [...orderedIds];
  for (const swap of swaps ?? []) {
    const source = next.indexOf(swap.sourceId);
    const target = next.indexOf(swap.targetId);
    if (source < 0 || target < 0 || source === target) continue;
    const sourceId = next[source];
    const targetId = next[target];
    if (sourceId === undefined || targetId === undefined) continue;
    next[source] = targetId;
    next[target] = sourceId;
  }
  return next;
}

/** The ids of defeated MONSTERS (0 HP) — the combatants `advanceTurn`
 *  skips. A PC is NEVER included (a downed PC still takes turns for death saves), so the
 *  skip can never pass over a player. */
function deadMonsterIds(state: EncounterState): ReadonlySet<string> {
  const dead = new Set<string>();
  for (const c of state.combatants) {
    if (c.kind === "monster" && isDown(c)) dead.add(c.id);
  }
  return dead;
}

/**
 * Advance the current-turn pointer one step along the FROZEN `order` (read from the doc —
 * NOT a caller-supplied live sort, so every surface steps the IDENTICAL sequence). Past
 * the last id the round increments and the turn wraps to the first. No-op when the order
 * is empty (turns not begun). An id-based step (never a sort index), so a live PC
 * initiative change can't silently re-target the current turn.
 *
 * DEAD-MONSTER SKIP (RAW): a monster at 0 HP is skipped — combat
 * doesn't pause on a corpse. A PC is NEVER skipped ({@link deadMonsterIds} holds only
 * monsters), so a downed player still takes their turn to roll death saves. The scan is
 * bounded by `order.length`, so an all-dead-monster table (no live target) self-limits to
 * a tolerant no-op instead of looping forever.
 */
export function advanceTurn(state: EncounterState): EncounterState {
  const order = state.order ?? [];
  if (order.length === 0) return state;
  const dead = deadMonsterIds(state);
  let idx =
    state.currentCombatantId === null ? -1 : order.indexOf(state.currentCombatantId);
  let round = state.round;
  for (let i = 0; i < order.length; i++) {
    const raw = idx + 1;
    if (raw >= order.length) round += 1; // wrapped past the last → next round
    idx = raw % order.length;
    const nextId = order[idx];
    if (nextId !== undefined && !dead.has(nextId)) {
      return { ...state, currentCombatantId: nextId, round };
    }
  }
  return state; // every candidate was a defeated monster — no live target (no-op)
}

/**
 * Step the current-turn pointer back one place along the FROZEN `order` (read from the
 * doc). From the first id it wraps to the last and decrements the round (floored at 1).
 * No-op when the order is empty. The DM's correction tool — unlike {@link advanceTurn} it
 * does NOT auto-skip dead monsters (stepping back is a deliberate manual rewind).
 */
export function prevTurn(state: EncounterState): EncounterState {
  const order = state.order ?? [];
  if (order.length === 0) return state;
  const idx =
    state.currentCombatantId === null ? 0 : order.indexOf(state.currentCombatantId);
  const wrap = idx <= 0;
  const prevId = wrap ? order[order.length - 1] : order[idx - 1];
  if (prevId === undefined) return state; // unreachable: the index is bounds-checked
  return wrap
    ? { ...state, currentCombatantId: prevId, round: Math.max(1, state.round - 1) }
    : { ...state, currentCombatantId: prevId };
}

/**
 * DM DRAG-TO-REORDER — move `movedId` to the slot immediately BEFORE `beforeId` in the
 * FROZEN `order` (or to the END when `beforeId` is `null`). The DM owns every order change
 * once turns have begun (the player's initiative is LOCKED — spec §3); this is the single
 * reducer behind both the pointer-drag drop and the keyboard up/down reorder. Pure; the
 * input is not mutated.
 *
 * `currentCombatantId` is PINNED — reordering never changes WHOSE turn it is, only the
 * sequence the remaining turns follow (the advance still steps the frozen array). A no-op
 * (same reference) when the order isn't frozen, either id is absent from it, or the move is
 * a self-drop, so an out-of-date drag can never corrupt the order or drop a combatant.
 */
export function reorderCombatant(
  state: EncounterState,
  movedId: string,
  beforeId: string | null
): EncounterState {
  const order = state.order;
  if (!order || !order.includes(movedId)) return state;
  if (beforeId !== null && !order.includes(beforeId)) return state;
  if (movedId === beforeId) return state;
  const without = order.filter((id) => id !== movedId);
  const at = beforeId === null ? without.length : without.indexOf(beforeId);
  const next = [...without.slice(0, at), movedId, ...without.slice(at)];
  // A no-op move (dropped onto its own current slot) returns the same reference.
  if (next.every((id, i) => id === order[i])) return state;
  return { ...state, order: next };
}

/** End the encounter — clears the campaign's `encounter` field. */
export function endEncounter(): null {
  return null;
}

/**
 * THE ONE INITIATIVE READ GATE (golden rule 6) — a member's raw d20 roll for the
 * CURRENT encounter, off the campaign's `encounterInit` table (`uid → raw roll`), or
 * `null` when they haven't rolled this fight (absent key / absent table / a corrupt
 * non-finite value). Every surface that shows or sorts a PC's initiative derives its
 * roll through THIS accessor — the party card, the pip, the cockpit turn meter, the
 * encounter view — so "has this PC rolled?" can never diverge per surface. Pure.
 */
export function encounterRollFor(
  encounterInit: Readonly<Record<string, number>> | undefined,
  uid: string
): number | null {
  const roll = encounterInit?.[uid];
  return typeof roll === "number" && Number.isFinite(roll) ? Math.round(roll) : null;
}

// ─── Status helpers ─────────────────────────────────────────────────────────

/**
 * Whether a MONSTER is defeated (0 HP). PC down-state is
 * computed live in the view selector from the player's `combat/state` HP, so it is
 * not handled here.
 */
export function isDown(monster: EncounterMonster): boolean {
  return monster.hp.current === 0;
}

/**
 * The id of the campaign whose ACTIVE encounter currently includes `characterId`
 * as a PC combatant, or `null` when the character is in no running encounter.
 *
 * The cheapest CORRECT "in combat?" signal for a character: a PC combatant is a
 * PURE REFERENCE carrying `characterId` directly on the campaign doc, so membership
 * is a trivial scan — NO live PC read, NO view merge (buildEncounterView). A
 * character is attached to at most one campaign (the membership invariant), so at
 * most one match exists; the first is returned. Pass the uid-scoped campaign list
 * (`listSharedCampaigns`) — this stays a pure total function (rides the pure-module
 * guard; no React / store / Firebase). `id` + `encounter` are the only fields read.
 */
export function pcEncounterCampaignId(
  campaigns: ReadonlyArray<Pick<CampaignDoc, "id" | "encounter">>,
  characterId: string
): string | null {
  for (const campaign of campaigns) {
    const inEncounter = campaign.encounter?.combatants.some(
      (c) => c.kind === "pc" && c.characterId === characterId
    );
    if (inEncounter) return campaign.id;
  }
  return null;
}

/**
 * Like {@link pcEncounterCampaignId}, but keyed on the VIEWER'S `uid` rather than an
 * OPEN character id: the id of the campaign whose active encounter includes a PC
 * combatant OWNED BY `uid` (`kind === "pc" && memberUid === uid`), or `null`.
 *
 * This is what the shell-level combat pip ({@link "@/features/campaigns/global-combat"})
 * resolves from, so it lights wherever the user is — the campaign hub, the compendium,
 * anywhere — with NO character sheet open (the open-sheet store is empty off the
 * cockpit). A DM read-only viewing a teammate's sheet still resolves to THEIR OWN
 * encounter. Same pure-total contract as {@link pcEncounterCampaignId}; first match wins
 * (one-character-per-campaign membership invariant); `id` + `encounter` are the only
 * fields read.
 */
export function uidEncounterCampaignId(
  campaigns: ReadonlyArray<Pick<CampaignDoc, "id" | "encounter">>,
  uid: string
): string | null {
  for (const campaign of campaigns) {
    const inEncounter = campaign.encounter?.combatants.some(
      (c) => c.kind === "pc" && c.memberUid === uid
    );
    if (inEncounter) return campaign.id;
  }
  return null;
}

/**
 * One ACTIVE encounter the viewer takes part in — the doc-derived facts the topbar
 * combat pip ({@link "@/app/shell/CombatPip"}) needs, ALL from the cheap
 * shared-campaigns query alone: the campaign doc now carries the `encounterInit` roll
 * table (the initiative SSOT), so even "has THIS viewer rolled?" is a pure doc
 * derivation — no per-encounter subdoc listeners, no loading-window heuristics (the
 * deleted `useViewerRollStates` machinery). IDs / user content only (golden rule 7):
 * no localized UI strings — `campaignName` / `heroName` / `actorName` are user
 * content, never translated.
 */
export interface ViewerEncounter {
  campaignId: string;
  /** The campaign's name — for the multi-encounter chooser row. */
  campaignName: string;
  /** How the viewer is in this fight: a PC combatant, or the DM/admin with no PC
   *  ({@link viewerActiveEncounters} gives a PC-less DM a one-way jump). */
  role: "pc" | "dm";
  /** The viewer's PC combatant id (`pc-<uid>`); `null` for a DM-without-a-PC. */
  myCombatantId: string | null;
  /** The viewer's attached character id (the sheet-link target); `null` for a DM. */
  characterId: string | null;
  /** The viewer's hero name (the contextual switch destination + chooser row);
   *  `null` for a DM-without-a-PC. */
  heroName: string | null;
  round: number;
  /** The per-encounter stamp — the most-recently-started fight (max epoch) is the
   *  pip's default when the viewer is in several at once (spec §5 A-sticky). */
  epoch: number;
  /** No turn pointer yet — players are still rolling (`currentCombatantId === null`). */
  gathering: boolean;
  /** The viewer's PC hasn't rolled THIS fight (no `encounterInit` entry). Always
   *  `false` for a DM-without-a-PC (nothing to roll). */
  notRolled: boolean;
  /** The turn pointer is on the viewer's own PC (`false` for a DM-without-a-PC). */
  isMyTurn: boolean;
  /** The current actor's name (PC hero or monster) for the quiet "{actor}'s turn"
   *  label, or `null` when gathering / unknown / a hidden ambush a non-DM can't see. */
  actorName: string | null;
}

/**
 * The current actor's display name for `campaign`'s running encounter — the monster's
 * typed name, or a PC actor's hero name (off the denormalized member snapshot, the SAME
 * name the party cards show). `null` when nothing is pointed at (gathering), the pointer
 * dangles, or the actor is a HIDDEN ambush monster a non-DM viewer must not see. Pure.
 */
function resolveActorName(
  campaign: Pick<CampaignDoc, "memberDetails" | "encounter">,
  viewerIsDm: boolean
): string | null {
  const enc = campaign.encounter;
  if (!enc || enc.currentCombatantId === null) return null;
  const current = enc.combatants.find((c) => c.id === enc.currentCombatantId);
  if (!current) return null;
  if (current.kind === "monster") {
    if (current.hidden && !viewerIsDm) return null; // ambush — never reveal to a player
    return current.name;
  }
  const member = campaign.memberDetails[current.memberUid];
  return member?.character?.name ?? member?.displayName ?? null;
}

/**
 * EVERY active encounter the viewer takes part in (spec §5 — the A-sticky multi case):
 * one {@link ViewerEncounter} per campaign whose running encounter either (a) holds a PC
 * combatant owned by `uid`, OR (b) the viewer is the DM (`dmUid === uid`) or a global
 * `isAdmin`, so a PC-less DM still gets a one-way jump. A plain member with no PC and no
 * DM/admin standing gets nothing. Pure total function over the uid-scoped shared-campaigns
 * list (the SAME cheap query the pip already holds — no live subdoc read); ordering follows
 * the input (the producer sorts by `epoch` for the default). A character belongs to at most
 * one campaign, so each campaign yields at most one entry.
 */
export function viewerActiveEncounters(
  campaigns: ReadonlyArray<
    Pick<
      CampaignDoc,
      | "id"
      | "name"
      | "dmUid"
      | "memberDetails"
      | "encounter"
      | "encounterInit"
      | "encounterSkipped"
    >
  >,
  uid: string,
  isAdmin: boolean
): ViewerEncounter[] {
  const out: ViewerEncounter[] = [];
  for (const campaign of campaigns) {
    const enc = campaign.encounter;
    if (!enc) continue;
    const myPc = enc.combatants.find(
      (c): c is EncounterPc => c.kind === "pc" && c.memberUid === uid
    );
    const viewerIsDm = campaign.dmUid === uid || isAdmin;
    if (myPc && campaign.encounterSkipped?.[uid]) continue;
    if (!myPc && !viewerIsDm) continue;
    out.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      role: myPc ? "pc" : "dm",
      myCombatantId: myPc?.id ?? null,
      characterId: myPc?.characterId ?? null,
      heroName: myPc ? (campaign.memberDetails[uid]?.character?.name ?? null) : null,
      round: enc.round,
      epoch: enc.epoch,
      gathering: enc.currentCombatantId === null,
      notRolled: !!myPc && encounterRollFor(campaign.encounterInit, uid) === null,
      isMyTurn: myPc ? enc.currentCombatantId === myPc.id : false,
      actorName: resolveActorName(campaign, viewerIsDm),
    });
  }
  return out;
}

/**
 * Like {@link pcEncounterCampaignId}, but also returns the encounter SNAPSHOT (as of
 * the membership read) — the cockpit's in-combat status region needs the round + the
 * current turn + this PC's reference id, not just the campaign id. Pure total
 * function over the same uid-scoped `listSharedCampaigns` list; the first match wins
 * (one-campaign-per-character invariant). `null` when the character is in no running
 * encounter. The sheet then upgrades to a LIVE campaign subscription on a positive hit.
 */
export function pcEncounter(
  campaigns: ReadonlyArray<Pick<CampaignDoc, "id" | "encounter">>,
  characterId: string
): { campaignId: string; encounter: EncounterState } | null {
  for (const campaign of campaigns) {
    const encounter = campaign.encounter;
    if (
      encounter &&
      encounter.combatants.some((c) => c.kind === "pc" && c.characterId === characterId)
    ) {
      return { campaignId: campaign.id, encounter };
    }
  }
  return null;
}
