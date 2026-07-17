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
 * token. We lift only the ARITHMETIC + clamp discipline (golden rule 20): every token
 * HP edit clamps to `[0, maxHp]`, so an invalid HP is unreachable by construction. NO
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

// ─── Seeding from member references ─────────────────────────────────────────

/** The per-member seed for a PC combatant — a PURE REFERENCE (the attached character
 *  id; the uid is the record key). NO statline copy: every displayed stat is read live
 *  from the member's char doc + `combat/state` subdoc at render time. */
export interface EncounterPcSeed {
  /** The attached character's id (the live-read key + sheet cross-reference). */
  characterId: string;
}

/** Integer-clamp a value into `[0, max]` (golden rule 20 — every token HP edit). */
function clampHp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
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

/** The lowest unused `monster-<n>` id, derived from the existing combatants so the
 *  id is deterministic + collision-free without any RNG (golden rule / no dice). */
function nextMonsterId(combatants: ReadonlyArray<EncounterCombatant>): string {
  let max = 0;
  for (const c of combatants) {
    const m = /^monster-(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `monster-${max + 1}`;
}

/** A DM-typed monster/NPC group to add to the encounter. */
export interface MonsterInput {
  /** User content — the monster/NPC name the DM types. */
  name: string;
  ac: number;
  maxHp: number;
  /** How many identical tokens (Goblin ×3); coerced to ≥ 1. */
  count: number;
  /** Typed initiative for the group; `null` = blank. */
  initiative: number | null;
  /** Optional DM free-text notes (omitted/empty → no `notes` field is stored). */
  notes?: string;
}

/**
 * Append a monster group — `count` tokens each seeded at full `maxHp` over the
 * shared ceiling. `count` is floored to 1 and `maxHp` to 0 so the group is always
 * well-formed. Round / turn are untouched.
 */
export function addMonster(state: EncounterState, input: MonsterInput): EncounterState {
  const count = Math.max(1, Math.floor(input.count));
  const maxHp = Math.max(0, Math.round(input.maxHp));
  const notes = input.notes?.trim();
  const monster: EncounterMonster = {
    kind: "monster",
    id: nextMonsterId(state.combatants),
    name: input.name,
    ac: input.ac,
    initiative: input.initiative === null ? null : Math.round(input.initiative),
    conditions: [],
    maxHp,
    tokens: Array.from({ length: count }, () => maxHp),
    // Only store `notes` when non-empty — keep the doc minimal (no empty-string field).
    ...(notes ? { notes } : {}),
  };
  const combatants = [...state.combatants, monster];
  // REINFORCEMENT auto-join: once the order is FROZEN (turns have begun), a monster added
  // mid-combat must enter the turn order or it would never act — append its id so it is
  // never orphaned. (The feature layer may re-freeze to slot it by initiative; correctness
  // over auto-slot polish here.) Before turns begin (no/empty order) the order is set fresh
  // at Begin-turns, so it is left untouched.
  if (state.order && state.order.length > 0) {
    return { ...state, combatants, order: [...state.order, monster.id] };
  }
  return { ...state, combatants };
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
  return { ...state, combatants, order, currentCombatantId, round };
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

// ─── Per-combatant edits ────────────────────────────────────────────────────

/** Map the combatant with `id`, returning a NEW state (or the same when no match). */
function mapCombatant(
  state: EncounterState,
  id: string,
  fn: (c: EncounterCombatant) => EncounterCombatant
): EncounterState {
  const index = state.combatants.findIndex((c) => c.id === id);
  if (index < 0) return state;
  const combatants = state.combatants.map((c, i) => (i === index ? fn(c) : c));
  return { ...state, combatants };
}

/** Set (or clear) a MONSTER's typed initiative. Integer-rounded; `null` clears. A PC
 *  is a no-op — its initiative is read live from the player's `combat/state` subdoc. */
export function setInitiative(
  state: EncounterState,
  id: string,
  value: number | null
): EncounterState {
  return mapCombatant(state, id, (c) =>
    c.kind === "pc" ? c : { ...c, initiative: value === null ? null : Math.round(value) }
  );
}

/** Apply a signed HP delta (damage negative, heal positive) to one MONSTER token,
 *  clamped to `[0, maxHp]`. A PC is a no-op — its HP lives in the `combat/state`
 *  subdoc (the player/DM multi-writer edit lands in a later chunk). */
export function applyHp(
  state: EncounterState,
  id: string,
  tokenIndex: number,
  delta: number
): EncounterState {
  return mapCombatant(state, id, (c) =>
    c.kind === "pc"
      ? c
      : {
          ...c,
          tokens: setToken(
            c.tokens,
            tokenIndex,
            c.tokens[tokenIndex] ?? 0,
            delta,
            c.maxHp
          ),
        }
  );
}

/** Set one MONSTER token's HP to an absolute value, clamped to `[0, maxHp]`. A PC is a
 *  no-op (live HP lives in the subdoc). */
export function setHp(
  state: EncounterState,
  id: string,
  tokenIndex: number,
  value: number
): EncounterState {
  return mapCombatant(state, id, (c) =>
    c.kind === "pc"
      ? c
      : { ...c, tokens: setToken(c.tokens, tokenIndex, value, 0, c.maxHp) }
  );
}

/** Immutably write `clampHp(base + delta, max)` into `tokens[index]` (out-of-range
 *  index is a no-op — returns the same array). */
function setToken(
  tokens: ReadonlyArray<number>,
  index: number,
  base: number,
  delta: number,
  max: number
): number[] {
  if (index < 0 || index >= tokens.length) return [...tokens];
  return tokens.map((t, i) => (i === index ? clampHp(base + delta, max) : t));
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

/** The ids of fully-defeated MONSTERS (every token at 0) — the combatants `advanceTurn`
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
 * DEAD-MONSTER SKIP (RAW): a monster whose every token is dead is skipped — combat
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
 * Whether a MONSTER is fully defeated — every token dead (0 HP). PC down-state is
 * computed live in the view selector from the player's `combat/state` HP, so it is
 * not handled here.
 */
export function isDown(monster: EncounterMonster): boolean {
  return monster.tokens.every((t) => t === 0);
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
      "id" | "name" | "dmUid" | "memberDetails" | "encounter" | "encounterInit"
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
