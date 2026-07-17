/**
 * global-combat-context — the LIGHT seam for the shell-level combat status: a tiny
 * Zustand store + the read hooks, with NO engine/campaign imports (only erased TYPE
 * imports), so the always-eager chrome that READS it (the topbar pip) stays out of the
 * campaign+engine bundle. The HEAVY producer ({@link GlobalCombatMount} in
 * `global-combat.tsx`) is lazy-loaded and pushes its computed status in here.
 *
 * It publishes TWO shapes from one computation (golden rule 6 — single source):
 *   • {@link GlobalCombat} — the SHEET's view of the viewer's OWN PC fight (round / turn /
 *     whose-turn + the live encounter view), read by the cockpit turn meter + in-combat
 *     chip. Unchanged shape, so those surfaces never branch on the multi-encounter model.
 *   • {@link PipModel} — the topbar pip's labelled-switch model (spec §5): EVERY active
 *     encounter the viewer is in (PC or PC-less DM), each pre-reduced to one
 *     {@link PipState}, plus the displayed (primary) one. The pip renders purely off this.
 */

import { create } from "zustand";
import type { EncounterView } from "@/features/campaigns/encounter-view";
import type { ViewerEncounter } from "@/features/campaigns/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

/** The live combat status of THIS USER (resolved from the auth UID, not any open sheet),
 *  or `null` when they are in no running encounter (the common case). */
export interface GlobalCombat {
  campaignId: string;
  encounter: EncounterState;
  view: EncounterView;
  /** This player's combatant id (`pc-<uid>`). */
  myId: string;
  /** This player's character id (the PC reference on the encounter doc) — the roll-commit
   *  write target, resolved from the UID, NOT from any open sheet. */
  characterId: string;
  /** The encounter hasn't begun turns yet (gathering initiative). */
  gathering: boolean;
  /** It is this player's turn. */
  isMyTurn: boolean;
  /** This player's engine initiative BONUS (override-first) — the roll-to-total widget
   *  adds the typed d20 to it. Sourced from the live view row (the UID's PC), not the
   *  open sheet. */
  initiativeBonus: number;
  /** This player's raw d20 ROLL off the campaign's `encounterInit` table (`null` =
   *  un-rolled) — the value the roll-to-total widget displays/edits. */
  initiativeRoll: number | null;
  round: number;
}

/**
 * The four player-facing pip phases (spec §0.4), reduced ONCE by the producer so the pip
 * renders a trivial lookup (no per-render branching). Colour carries the state — never a
 * sentence beyond the one middle word the pip writes:
 *   • `needs-roll` — viewer hasn't rolled THIS fight (loud red, pulsing). Only the live
 *     (primary) encounter can resolve this; secondary chooser rows never read red.
 *   • `your-turn` — the pointer is on the viewer's PC (gold, pulsing).
 *   • `actor-turn` — someone else acts ({@link PipEntry.actorName}; quiet).
 *   • `gathering` — pre-Begin, rolling (quiet).
 */
export type PipState = "needs-roll" | "your-turn" | "actor-turn" | "gathering";

/** One active encounter in the pip model — a {@link ViewerEncounter} reduced to its
 *  display {@link PipState} (the chooser lists these; the primary one drives the pill). */
export interface PipEntry {
  campaignId: string;
  campaignName: string;
  role: "pc" | "dm";
  state: PipState;
  round: number;
  /** The viewer's hero name — the contextual switch destination + chooser row label;
   *  `null` for a DM-without-a-PC (one-way → group, never a hero flip). */
  heroName: string | null;
  /** The sheet-link target for the contextual switch; `null` for a DM-without-a-PC. */
  characterId: string | null;
  /** The current actor's name for `actor-turn`; `null` otherwise / when hidden. */
  actorName: string | null;
}

/** The topbar pip's whole model: every active encounter + which one is displayed. */
export interface PipModel {
  entries: PipEntry[];
  /** The displayed encounter's `campaignId` — the local pin if it's still active, else
   *  the most-recently-started (max epoch). Always one of `entries`. */
  primaryId: string;
}

/**
 * A player's OWN End-Turn hand-off that is still IN FLIGHT — the pointer they optimistically
 * advanced FROM (their own `pc-<uid>`), the encounter it belongs to, and the round/epoch at
 * the moment they pressed. The shell producer keeps the turn optimistically advanced while
 * the live read still shows this exact triple, so a lagging listener can never republish the
 * pre-advance "your turn" frame during the `advanceEncounterTurn` round-trip. Cleared the
 * instant the real read reflects the advance (or the write fails). See
 * {@link "@/features/campaigns/combat-reconcile"}.
 */
export interface PendingTurn {
  campaignId: string;
  epoch: number;
  /** The combatant id the pointer was on when End Turn was pressed (`pc-<uid>`). */
  fromId: string;
  /** The encounter round at that moment (guards a later wrap back onto this same PC). */
  fromRound: number;
}

/**
 * OPTIMISTIC OVERLAY — the snappiness seam (the pip's "no echo lag" fix). Prefer the
 * locally-open campaign (`open`, from the optimistic `campaignStore`) over its
 * Firestore-synced twin in `synced` (the shell `subscribeToSharedCampaigns` list), so the
 * pip reflects the viewer's OWN encounter edits (start / end / begin-turns) in the SAME
 * render tick they happen — NOT ~2 s later when the autosave-debounced `updateDoc` finally
 * fires the shared-campaigns listener.
 *
 * Correctness is preserved (still the synced doc, still last-write-wins): while the hub is
 * open BOTH listeners (`subscribeToCampaign` → `campaignStore` and `subscribeToSharedCampaigns`
 * → the pip) are live `onSnapshot`s on the SAME doc, so a REMOTE write reaches the optimistic
 * copy no later than the synced list — the overlay can only be EQUAL-or-FRESHER, never staler.
 * The lone divergence is the viewer's own un-echoed local write (exactly the lag we cut); the
 * echo reconciles both to the identical value. On navigate-away the subscription flushes the
 * pending write then resets `campaignStore` to `null`, so the overlay is inert off the hub.
 *
 * Pure: replaces the matching id in place (no dup); appends `open` only if the synced list
 * hasn't echoed the membership yet (a just-created campaign), so the pip never lists it twice.
 */
export function overlayOpenCampaign(
  synced: ReadonlyArray<CampaignDoc>,
  open: CampaignDoc | null
): CampaignDoc[] {
  if (!open) return [...synced];
  const merged = synced.map((c) => (c.id === open.id ? open : c));
  // Append only when the synced list hasn't echoed the membership yet (a just-created
  // campaign) — the `.map` above already replaced it in place otherwise (no dup).
  return synced.some((c) => c.id === open.id) ? merged : [...merged, open];
}

/**
 * The displayed (primary) encounter's `campaignId`: the local pin when it's still active
 * (spec §5 A-sticky — the pin sticks until the viewer switches), else the
 * most-recently-started fight (max `epoch`, ties keep input order). `null` when the viewer
 * is in none. Pure — the producer feeds it the pin + the live encounters.
 */
export function pickPrimaryCampaignId(
  encounters: ReadonlyArray<ViewerEncounter>,
  pin: string | null
): string | null {
  if (encounters.length === 0) return null;
  if (pin && encounters.some((e) => e.campaignId === pin)) return pin;
  return encounters.reduce((a, b) => (b.epoch > a.epoch ? b : a)).campaignId;
}

/** Reduce one {@link ViewerEncounter} to its display {@link PipState}. `e.notRolled` is a
 *  PURE derivation off the campaign doc's `encounterInit` table (per entry, so a pin
 *  switch can never re-point another row, and there is no subdoc round-trip / loading
 *  window). A DM-without-a-PC never rolls or owns a turn → only the quiet two. */
function pipState(e: ViewerEncounter): PipState {
  if (e.role === "pc" && e.notRolled) return "needs-roll";
  if (e.isMyTurn) return "your-turn";
  if (e.gathering) return "gathering";
  return "actor-turn";
}

/**
 * Build the topbar pip model from every active encounter the viewer is in. Rows are sorted
 * most-recently-started first (the chooser order); the displayed `primaryId` is whichever
 * {@link pickPrimaryCampaignId} chose (pin or most-recent). Each entry's roll-state is its
 * own pure doc derivation (`e.notRolled`), so each chooser row reflects ITS OWN roll-state
 * and a pin switch never mutates another row. `null` when there are no encounters. Pure.
 */
export function buildPipModel(
  encounters: ReadonlyArray<ViewerEncounter>,
  primaryId: string
): PipModel | null {
  if (encounters.length === 0) return null;
  const entries: PipEntry[] = [...encounters]
    .sort((a, b) => b.epoch - a.epoch)
    .map((e) => ({
      campaignId: e.campaignId,
      campaignName: e.campaignName,
      role: e.role,
      state: pipState(e),
      round: e.round,
      heroName: e.heroName,
      characterId: e.characterId,
      actorName: e.actorName,
    }));
  return { entries, primaryId };
}

/**
 * A per-turn-entry identity for the viewer's OWN turn — `campaignId:round` while it's the
 * viewer's turn, else `null`. The turn-start toast fires once when this CHANGES to a new
 * non-null key (the pointer landed on a fresh turn), so a re-render with the same key never
 * re-fires. Pure.
 */
export function turnStartKey(status: GlobalCombat | null): string | null {
  return status?.isMyTurn ? `${status.campaignId}:${status.round}` : null;
}

/**
 * Whether the gentle "it's your turn" toast should fire (spec §5). `prev === undefined` is
 * the FIRST observation — prime silently (never toast on mount / reload while already on
 * your turn). Otherwise fire only when the key moved to a new non-null turn. Pure.
 */
export function shouldToastTurnStart(
  prev: string | null | undefined,
  next: string | null
): boolean {
  if (prev === undefined) return false;
  return next !== null && next !== prev;
}

interface CombatStatusStore {
  status: GlobalCombat | null;
  pip: PipModel | null;
  /** The player's own End-Turn hand-off that is still in flight (or `null`). Set by the
   *  sheet's End Turn; read by the producer's reconcile so a lagging listener can't
   *  regress the optimistic advance. See {@link PendingTurn}. */
  pendingTurn: PendingTurn | null;
  set: (status: GlobalCombat | null, pip: PipModel | null) => void;
  setPendingTurn: (pending: PendingTurn) => void;
  clearPendingTurn: () => void;
}

/** The lifted combat status. The lazy {@link GlobalCombatMount} is the sole writer of
 *  `status`/`pip`; the pip + sheet region read it through {@link useGlobalCombat} /
 *  {@link usePipCombat}. `pendingTurn` is written by the sheet's End Turn and cleared by
 *  the producer once the advance lands. */
export const useCombatStatusStore = create<CombatStatusStore>((set) => ({
  status: null,
  pip: null,
  pendingTurn: null,
  set: (status, pip) => set({ status, pip }),
  setPendingTurn: (pending) => set({ pendingTurn: pending }),
  clearPendingTurn: () => set({ pendingTurn: null }),
}));

/** The live combat status of this user's OWN PC fight (or `null` when not in one) — the
 *  cockpit turn meter + in-combat chip source. */
export function useGlobalCombat(): GlobalCombat | null {
  return useCombatStatusStore((s) => s.status);
}

/** The topbar pip's model (or `null` when the viewer is in no active encounter). */
export function usePipCombat(): PipModel | null {
  return useCombatStatusStore((s) => s.pip);
}

const PIN_KEY = "d20-combat-pin";

interface PinStore {
  /** The campaign the viewer pinned in the multi-encounter chooser, or `null` (default to
   *  the most-recent). A LOCAL UI pref — persisted to `localStorage`, NOT a synced fact
   *  (spec §5). */
  pin: string | null;
  setPin: (campaignId: string | null) => void;
}

/** The local (non-synced) pinned-encounter preference. Read by the producer to choose the
 *  primary; written by the pip's chooser. Survives reload via `localStorage`. */
export const usePinStore = create<PinStore>((set) => ({
  pin: typeof localStorage !== "undefined" ? localStorage.getItem(PIN_KEY) : null,
  setPin: (campaignId) => {
    if (typeof localStorage !== "undefined") {
      if (campaignId) localStorage.setItem(PIN_KEY, campaignId);
      else localStorage.removeItem(PIN_KEY);
    }
    set({ pin: campaignId });
  },
}));
