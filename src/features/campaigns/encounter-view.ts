/**
 * encounter-view — the PURE view selector that composes the encounter STRUCTURE (the
 * campaign doc) with each PC's LIVE state (assembled by the caller from the player's
 * character doc + `combat/state` subdoc) into a single sorted, render-ready combatant
 * list. NOTHING is persisted back — there is NO denormalized copy of a PC fact (golden
 * rule 6, single source of truth).
 *
 * This lives in `features/campaigns` (not `src/lib`) by the architecture-direction
 * guard: it composes the engine helpers ({@link sortByInitiative}, {@link isDown}) but
 * the cross-aggregate live-read/merge is feature logic, never engine. Still PURE — no
 * React, no store, no Firebase; the caller passes the already-merged live facts in.
 *
 * IDs only (golden rule 7): condition ids, race id, class breakdown — the
 * localized labels are resolved at the React render edge.
 */

import {
  addMonster,
  freezeOrder,
  isDown,
  sortByInitiative,
  type MonsterInput,
} from "@/features/campaigns/encounter";
import type { EncounterState } from "@/types/campaign";
import type { ClassEntry, PortraitCrop } from "@/types/character";
import type { RaceId } from "@/types/ids";

/**
 * The LIVE facts for one PC, assembled by the caller from the member's character doc
 * (name · AC · max HP · race · classes · portrait) + their `combat/state` subdoc
 * (current/temp HP · conditions · initiative) — see `applyCombatToSession` +
 * `derivePartyMemberStats`. NEVER read from the encounter doc (which holds only the
 * reference).
 */
export interface PcLive {
  name: string;
  ac: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  conditions: string[];
  initiative: number | null;
  /** The engine initiative BONUS (override-first); the pip's roll widget adds the typed
   *  d20 to it. */
  initiativeBonus: number;
  /** The raw stored d20 ROLL (epoch-gated; `null` = un-rolled for this fight) — what the
   *  roll-to-total widget displays/edits, distinct from `initiative` (the total). */
  initiativeRoll: number | null;
  raceId: RaceId | undefined;
  classes: ClassEntry[] | undefined;
  portraitUrl: string | null;
  portraitCrop: PortraitCrop | null;
}

/** One render-ready combatant row — a flat, localized-at-the-edge view-model. PC rows
 *  are assembled from the live merge; monster rows come straight off the encounter doc. */
export interface EncounterCombatantView {
  id: string;
  kind: "pc" | "monster";
  name: string;
  ac: number;
  initiative: number | null;
  /** PC: the engine initiative bonus (the pip's roll widget adds the d20 to it). Monster:
   *  undefined (a monster's initiative is entered directly, not rolled-to-total). */
  initiativeBonus?: number;
  /** PC: the raw stored d20 roll (epoch-gated; what the roll-to-total widget edits).
   *  Monster: undefined. */
  initiativeRoll?: number | null;
  conditions: string[];
  /** PC: live current HP. Monster: summed token HP. */
  currentHp: number;
  /** PC: effective max HP. Monster: `maxHp × tokenCount`. */
  maxHp: number;
  /** PC: live temp HP. Monster: 0 (temp HP is a PC concept). */
  tempHp: number;
  /** Fully down/defeated (PC at 0 HP; monster all tokens dead). */
  down: boolean;
  /** The DM-only ambush flag (always false in a non-DM view — those rows are filtered). */
  hidden: boolean;
  // ── PC identity (present on `kind === "pc"`) ──
  memberUid?: string;
  characterId?: string;
  raceId?: RaceId;
  classes?: ClassEntry[];
  portraitUrl?: string | null;
  portraitCrop?: PortraitCrop | null;
  // ── Monster state (present on `kind === "monster"`) ──
  tokens?: number[];
}

export interface EncounterView {
  /** VISIBLE combatants in live turn order (initiative DESC, blanks last, stable for
   *  ties); hidden ambush combatants are filtered out for a non-DM viewer. */
  rows: EncounterCombatantView[];
  /**
   * The FULL live turn order as combatant ids INCLUDING hidden combatants — what every
   * turn-advance steps over (hidden is a DISPLAY filter, never a turn-order filter, so a
   * staged ambush still takes its turn). Pass THIS (not `rows.map(id)`) to
   * `advanceEncounterTurn` / `beginEncounterTurns` so the DM and a player step the
   * identical order regardless of who can SEE which row.
   */
  turnOrderIds: string[];
  /** The stable id whose turn it is (highlight the matching visible row), or null. */
  currentId: string | null;
}

/**
 * Build the live encounter view-model.
 *
 * @param encounter   the campaign-doc structure (PC references + monster state + the
 *                    stable `currentCombatantId`).
 * @param pcLiveById  the merged live facts per PC combatant id (`pc-<uid>`); a missing
 *                    entry (the member's doc is still loading) yields a quiet
 *                    placeholder row so ordering stays total.
 * @param viewerIsDm  when false, `hidden` combatants are filtered out (ambush).
 */
export function buildEncounterView(
  encounter: EncounterState,
  pcLiveById: Readonly<Record<string, PcLive | undefined>>,
  viewerIsDm: boolean
): EncounterView {
  // Build EVERY combatant row (hidden included) so the turn order spans the full table;
  // the display list is filtered afterwards. Hidden is a display filter, not a turn filter.
  const allRows: EncounterCombatantView[] = [];
  for (const c of encounter.combatants) {
    if (c.kind === "pc") {
      const live = pcLiveById[c.id];
      allRows.push({
        id: c.id,
        kind: "pc",
        name: live?.name ?? "",
        ac: live?.ac ?? 0,
        initiative: live?.initiative ?? null,
        initiativeBonus: live?.initiativeBonus ?? 0,
        initiativeRoll: live?.initiativeRoll ?? null,
        conditions: live?.conditions ?? [],
        currentHp: live?.currentHp ?? 0,
        maxHp: live?.maxHp ?? 0,
        tempHp: live?.tempHp ?? 0,
        down: (live?.maxHp ?? 0) > 0 && (live?.currentHp ?? 0) === 0,
        hidden: c.hidden ?? false,
        memberUid: c.memberUid,
        characterId: c.characterId,
        raceId: live?.raceId,
        classes: live?.classes,
        portraitUrl: live?.portraitUrl ?? null,
        portraitCrop: live?.portraitCrop ?? null,
      });
    } else {
      const currentHp = c.tokens.reduce((sum, hp) => sum + hp, 0);
      allRows.push({
        id: c.id,
        kind: "monster",
        name: c.name,
        ac: c.ac,
        initiative: c.initiative,
        conditions: c.conditions,
        currentHp,
        maxHp: c.maxHp * c.tokens.length,
        tempHp: 0,
        down: isDown(c),
        hidden: c.hidden ?? false,
        tokens: c.tokens,
      });
    }
  }

  const byId = new Map(allRows.map((r) => [r.id, r]));

  // TURN ORDER = the FROZEN `order` once turns have begun, else the LIVE initiative sort.
  //
  // Before Begin-turns (gathering, `order` unset) the list is a LIVE PREVIEW that re-sorts
  // as players roll (spec §3). Once Begin-turns FREEZES the order, the display follows THAT
  // frozen sequence — NOT a live re-sort — so a player's locked initiative can never silently
  // reshuffle the table ("20 but sitting 3rd"), and the DM's drag-to-reorder ({@link
  // "@/features/campaigns/encounter".reorderCombatant}) is reflected immediately. A combatant
  // missing from the frozen order (a freshly-added reinforcement not yet re-slotted) is
  // appended in its live-sorted position so it is never dropped from the view.
  const liveSorted = sortByInitiative(
    allRows.map((r) => ({ id: r.id, initiative: r.initiative }))
  ).map((o) => o.id);
  const frozen = encounter.order;
  const orderedIds =
    frozen && frozen.length > 0
      ? [
          ...frozen.filter((id) => byId.has(id)),
          ...liveSorted.filter((id) => !frozen.includes(id)),
        ]
      : liveSorted;
  const sortedRows = orderedIds
    .map((id) => byId.get(id))
    .filter((r): r is EncounterCombatantView => r !== undefined);

  // `turnOrderIds` is the FULL order (every combatant); the displayed `rows` drop hidden
  // ambush combatants for a non-DM viewer — but the turn still steps over them.
  return {
    rows: viewerIsDm ? sortedRows : sortedRows.filter((r) => !r.hidden),
    turnOrderIds: sortedRows.map((r) => r.id),
    currentId: encounter.currentCombatantId,
  };
}

/**
 * REINFORCEMENT AUTO-SLOT (RAW) — add a monster and, when turns have ALREADY begun (the
 * order is frozen), slot the newcomer INTO the frozen order at its typed-initiative rank
 * instead of merely tacking it on the end. `currentCombatantId` is pinned (re-freezing never
 * moves the pointer), so the fight continues uninterrupted and the new monster simply takes
 * its turn when the order reaches it.
 *
 * This is a FEATURE-layer concern, not a pure reducer: the slot depends on every existing
 * combatant's LIVE initiative (PC rolls live in their `combat/state` subdoc, surfaced in
 * `pcLiveById`), which the engine never sees — so {@link addMonster} alone can only APPEND
 * (the never-orphaned safety net). Here we INSERT the newcomer ahead of the first combatant
 * it OUTRANKS (higher initiative first, blanks last) and otherwise PRESERVE the existing
 * sequence — so a prior DM drag-to-reorder is kept, not clobbered by a full re-sort. Before
 * Begin-turns (no/empty order) it is a plain add — Begin sorts the table fresh.
 */
export function addReinforcement(
  encounter: EncounterState,
  input: MonsterInput,
  pcLiveById: Readonly<Record<string, PcLive | undefined>>
): EncounterState {
  const added = addMonster(encounter, input);
  const order = encounter.order;
  if (!order || order.length === 0) return added;
  // The newcomer is the last combatant addMonster appended.
  const newcomer = added.combatants[added.combatants.length - 1];
  if (!newcomer || newcomer.kind !== "monster") return added;
  const newInit = newcomer.initiative;
  const initOf = (id: string): number | null => {
    const live = pcLiveById[id];
    if (live) return live.initiative;
    const c = added.combatants.find((x) => x.id === id);
    return c && c.kind === "monster" ? c.initiative : null;
  };
  // Insert ahead of the first existing entry the newcomer OUTRANKS (a non-blank beats a
  // blank; otherwise a strictly-higher initiative wins) — equal/lower keeps the newcomer
  // after them, so a tie is stable and a prior manual reorder is preserved.
  const outranks = (a: number | null, b: number | null): boolean =>
    a !== null && (b === null || a > b);
  let at = order.length;
  for (let i = 0; i < order.length; i++) {
    if (outranks(newInit, initOf(order[i] ?? ""))) {
      at = i;
      break;
    }
  }
  const next = [...order.slice(0, at), newcomer.id, ...order.slice(at)];
  return freezeOrder(added, next);
}
