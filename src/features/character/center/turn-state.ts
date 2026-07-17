/**
 * useTurnState — the ONE seam every combat surface reads "round / whose-turn / end-turn"
 * through, so the sheet and the campaign encounter can NEVER disagree by construction.
 *
 * THE DISEASE IT CURES (the owner's live "round 6, 7, 8…" bug): the sheet's End Turn ran
 * the SOLO cockpit path — it bumped a PRIVATE `combatStore.round` and fired a "Round N
 * started" toast — and never advanced the campaign encounter, so the shared encounter doc
 * stayed at round 1 while the sheet's private counter climbed. There were two turn engines
 * that never talked.
 *
 * Now there is ONE. In an active campaign encounter this seam resolves round / whose-turn
 * from the SHARED encounter doc (via the shell-level {@link useGlobalCombat} status), and
 * `endTurn()` IS {@link "@/features/campaigns/campaign-io".advanceEncounterTurn} — the EXACT
 * same transaction the encounter's Next button calls. Solo (no encounter), it resolves from
 * the local `combatStore.round` and `endTurn()` bumps that local round. Every surface reads
 * round/turn through THIS hook; the UI never branches on mode (golden rule 6).
 *
 * FIREBASE-FREE static graph (the cockpit posture): this module statically imports only
 * LIGHT stores (the global-combat status + combat store + the Firebase-free character store,
 * read for the open-sheet scoping) — never `authStore`/`campaign-io`/`firebase`. The advancing
 * player's uid is derived from the status's own `myId` (`pc-<uid>`)
 * rather than read from `authStore` (which type-imports `firebase/auth`), and the advance
 * side-effect ({@link advanceSharedTurn}) reaches `campaign-io` through a DYNAMIC import — so
 * a unit test rendering a turn surface never transitively pulls Firebase at module-eval, and
 * the eager cockpit bundle stays Firebase-free.
 */

import { useMemo } from "react";
import { useCombatStore } from "@/stores/combatStore";
import { useCharacterStore } from "@/stores/characterStore";
import {
  useGlobalCombat,
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";

/** The four derived turn phases (spec §1.2): solo play, or — in an encounter — the
 *  gathering-initiative wait, my own turn, or someone else's turn. */
export type TurnPhase = "solo" | "gathering" | "my-turn" | "waiting";

/** The PURE display half of the turn state (no side-effects) — unit-testable without React
 *  or Firebase. */
export interface TurnDisplay {
  /** The round to SHOW: the SHARED encounter round in a campaign, else the solo round.
   *  Never a private counter that can drift from the encounter (the cured bug). */
  round: number;
  /** Whether the open character may act now — always true solo; in an encounter, only when
   *  the shared pointer is on this player's PC. */
  isMyTurn: boolean;
  phase: TurnPhase;
  /** The current actor's display name (encounter, when visible) — for a "{actor}'s turn"
   *  cue; null solo or when the current actor is a hidden combatant. */
  currentActorName: string | null;
}

export interface TurnState extends TurnDisplay {
  /** End the open character's turn. In an encounter this advances the SHARED turn pointer
   *  (the same `advanceEncounterTurn` transaction the encounter's Next button calls); solo
   *  it bumps the local round. */
  endTurn: () => void;
}

/**
 * PURE — resolve the displayed turn facts from the shared encounter status (or solo). In
 * an encounter the round is `gc.round` (the SHARED doc), NEVER the solo `combatStore.round`
 * — this is what makes the private-counter drift bug unrepresentable. Exported for the unit
 * regression.
 */
export function resolveTurnState(
  gc: GlobalCombat | null,
  soloRound: number
): TurnDisplay {
  if (!gc) {
    return { round: soloRound, isMyTurn: true, phase: "solo", currentActorName: null };
  }
  const phase: TurnPhase = gc.gathering
    ? "gathering"
    : gc.isMyTurn
      ? "my-turn"
      : "waiting";
  const currentActorName =
    gc.view.rows.find((r) => r.id === gc.view.currentId)?.name ?? null;
  return { round: gc.round, isMyTurn: gc.isMyTurn, phase, currentActorName };
}

/** The owning player's uid behind a PC combatant id (`pc-<uid>` → `<uid>`). The advancing
 *  player IS the current combatant, so their uid is encoded in the status's `myId` — no
 *  `authStore` read needed (which would pull `firebase/auth` into this module's graph). */
function combatantUid(myCombatantId: string): string {
  return myCombatantId.startsWith("pc-") ? myCombatantId.slice(3) : myCombatantId;
}

/**
 * Advance the SHARED encounter turn (the `next` step) for the player whose PC combatant id
 * is `myCombatantId` (`pc-<uid>`). Reaches the Firebase-backed `campaign-io` through a
 * DYNAMIC import so this module's static graph stays Firebase-free (the cockpit + unit-test
 * posture — see the file header). `isDm: false` is correct for an own-turn advance (the
 * transaction re-validates the caller owns the current turn — `currentCombatantId ===
 * pc-<uid>`; a DM ending their own PC's turn still passes). Failures are logged, never
 * thrown — a turn advance is a fire-and-forget UI action.
 */
export function advanceSharedTurn(
  campaignId: string,
  myCombatantId: string,
  expectedCurrentId: string | null
): void {
  const uid = combatantUid(myCombatantId);
  void import("@/features/campaigns/campaign-io")
    .then(({ advanceEncounterTurn }) =>
      // `expectedCurrentId` = the pointer this player saw (their own PC) — the CAS aborts
      // a stale double-press so ending one's turn can never skip the next combatant.
      advanceEncounterTurn(campaignId, "next", { uid, isDm: false }, expectedCurrentId)
    )
    .catch((e: unknown) => {
      // The shared write FAILED (offline / denied): the pointer never advanced, so drop the
      // optimistic hand-off marker — the producer's reconcile then falls back to the real
      // (still-your-turn) read instead of holding the pip advanced forever. Self-heals the
      // one case the live snapshot can't (a failed transaction emits no reconciling snapshot).
      useCombatStatusStore.getState().clearPendingTurn();
      console.error("Turn-advance write failed", e);
    });
}

/**
 * CHARACTER SCOPING — the shell combat status is keyed on the USER's uid (whichever of their
 * heroes is IN the fight), NOT the open sheet. So a DIFFERENT hero of the same user (a second
 * character not in this encounter) must read the status as ABSENT — it is pure solo in every
 * respect (own round, End Combat, no waiting/gathering chrome) even while another of the
 * user's heroes sits in a live encounter. Scope the status to the sheet: return it only when
 * the OPEN character is the encounter's PC (`gc.characterId === openCharacterId`), else `null`.
 * The topbar pip stays UNSCOPED (it is the user-wide signal + the switch back to that fight).
 * Pure — exported for the scoping regression.
 */
export function sheetEncounter(
  gc: GlobalCombat | null,
  openCharacterId: string | null
): GlobalCombat | null {
  return gc && gc.characterId === openCharacterId ? gc : null;
}

/** The encounter status SCOPED to the OPEN sheet's character (see {@link sheetEncounter}).
 *  Both the cockpit turn band ({@link useTurnState}) and the in-combat own-turn control read
 *  THIS, so a non-encounter hero of the same user never inherits the fight's combat chrome. */
export function useSheetCombat(): GlobalCombat | null {
  const gc = useGlobalCombat();
  const openCharacterId = useCharacterStore((s) => s.character?.id ?? null);
  return sheetEncounter(gc, openCharacterId);
}

/** The reactive seam: round / whose-turn / phase / actor + `endTurn`, resolved from the
 *  shared encounter when in combat, else the solo combat store. */
export function useTurnState(): TurnState {
  const gc = useSheetCombat();
  const soloRound = useCombatStore((s) => s.round);
  const soloEndTurn = useCombatStore((s) => s.endTurn);
  return useMemo<TurnState>(() => {
    const display = resolveTurnState(gc, soloRound);
    const endTurn = gc
      ? () => advanceSharedTurn(gc.campaignId, gc.myId, gc.encounter.currentCombatantId)
      : soloEndTurn;
    return { ...display, endTurn };
  }, [gc, soloRound, soloEndTurn]);
}
