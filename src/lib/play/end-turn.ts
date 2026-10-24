/**
 * End Turn's own decisions, pure (moved out of the turn-economy provider so any
 * screen can End Turn the same way):
 *
 * - which "maintained" states (Rage) surface the keep/end prompt: still lit, not
 *   kept going this round by one of their declared events (an attack-roll or
 *   target-save action, or the dedicated Bonus Action that extends it), and not just
 *   expired outright (a hard drop supersedes the soft prompt). Merely occupying the
 *   Action slot (Dash, Help) keeps nothing going. Recomputed from scratch every End
 *   Turn, so a "Keep" clears only the current round.
 * - which ended effects to announce, in the order they ended.
 */
import { resolveActiveMaintainedEffects } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";

type ActiveMaintainedEffect = ReturnType<typeof resolveActiveMaintainedEffects>[number];
type MaintainingEvent = "attack" | "bonus-extend";

/** The turn's committed actions, by slot, as the turn economy keeps them. */
export type TurnSelections = Readonly<
  Record<string, ReadonlyArray<{ triggerEvents?: ReadonlyArray<MaintainingEvent> }>>
>;

/** The maintained states that need the keep/end prompt at this End Turn. */
export function unmaintainedStates(
  doc: CharacterDoc | null,
  selected: TurnSelections,
  expiredKeys: ReadonlySet<string>
): ActiveMaintainedEffect[] {
  if (!doc) return [];
  const maintainedThisRound: ReadonlySet<string> = new Set(
    Object.values(selected)
      .flat()
      .flatMap((entry) => entry.triggerEvents ?? [])
  );
  return resolveActiveMaintainedEffects(doc).filter(
    (effect) =>
      !expiredKeys.has(effect.activeKey) &&
      !effect.maintainedBy.some((event) => maintainedThisRound.has(event))
  );
}

/** The sources of every effect this End Turn ended, to announce in order: the timed
 *  ones, those that ended at the turn's end, then those at the next turn's start
 *  (none in a shared fight, whose next turn is someone else's). */
export function expiryNoticeSources(
  timed: ReadonlyArray<{ sourceId: string }>,
  atTurnEnd: ReadonlyArray<{ sourceId: string }>,
  atNextTurnStart: ReadonlyArray<{ sourceId: string }> = []
): string[] {
  return [...timed, ...atTurnEnd, ...atNextTurnStart].map((effect) => effect.sourceId);
}

// ── The End Turn sequence ────────────────────────────────────────────────────────

type Expired = ReadonlyArray<{ activeKey: string; sourceId: string }>;

/**
 * What End Turn reads and writes, injected so the sequence has no React and no
 * store: the provider (or a new screen) wires its stores, toasts and prompts here.
 * Every getter reads LIVE state, so a redo re-running {@link runEndTurn} sees the
 * world as it is then.
 */
export interface EndTurnPorts {
  /** The shared fight the sheet is in, or null when solo. */
  encounter: () => { isMyTurn: boolean; round: number } | null;
  /** Solo: the local round counter. */
  soloRound: () => number;
  selections: () => TurnSelections;
  character: () => CharacterDoc | null;
  expireBoundaries: (position: { round: number; phase: "turn-start" | "turn-end" }) => {
    expired: Expired;
    restore: () => void;
  };
  recoverPerTurnTrackers: () => (() => void) | null;
  advanceEffectTimers: (round: number) => { expired: Expired; restore: () => void };
  /** The keep/end prompt for maintained states (empty clears it). */
  setMaintenancePrompts: (states: ActiveMaintainedEffect[]) => void;
  /** Each ended effect's live notice (the log already has its line). */
  announce: (sourceIds: string[]) => void;
  /** Shared fight: advance the turn pointer (optimistic hand-off + shared write). */
  handOffSharedTurn: () => void;
  /** Solo: end the turn and start the next; returns the restore of the turn it ended
   *  (round, economy, budget, reaction, movement). */
  advanceSoloTurn: () => () => void;
  /** Solo: fold this turn's undo entries into End Turn's; returns their reinstall. */
  compactTurnUndo: () => () => void;
  /** Solo: a readied spell not released by the next turn's start is lost. */
  expireReadiedSpell: (round: number) => (() => void) | null;
  logTurnEnd: (round: number) => string | null;
  removeLogEntry: (id: string | null) => void;
  /** Solo: the one End Turn undo entry; `replay` is its redo. */
  registerUndo: (round: number, reverse: () => void, replay: () => void) => void;
}

/**
 * End Turn. In a shared fight it only ever acts on your own turn (a stale control is
 * a true no-op): it refills per-turn uses, counts timed states down, asks about
 * maintained states, announces what ended, and hands the turn on. Solo it also
 * advances the round, loses an unreleased readied spell, logs the new round, and
 * registers one undo that restores all of it (the turn's own entries come back
 * individually undoable) and whose redo runs End Turn again.
 */
export function runEndTurn(ports: EndTurnPorts): void {
  const encounter = ports.encounter();
  if (encounter && !encounter.isMyTurn) return;
  const round = encounter?.round ?? ports.soloRound();
  const boundaryAtEnd = ports.expireBoundaries({ round, phase: "turn-end" });
  // Before the prompt: an expired state never also asks to be kept.
  const restorePerTurn = ports.recoverPerTurnTrackers();
  const timers = ports.advanceEffectTimers(round);
  const expiredKeys = new Set(timers.expired.map((effect) => effect.activeKey));
  ports.setMaintenancePrompts(
    unmaintainedStates(ports.character(), ports.selections(), expiredKeys)
  );

  if (encounter) {
    // The economy resets when the shared pointer lands back on this sheet.
    ports.handOffSharedTurn();
    ports.announce(expiryNoticeSources(timers.expired, boundaryAtEnd.expired));
    return;
  }

  const reinstateTurnUndo = ports.compactTurnUndo();
  const restoreTurn = ports.advanceSoloTurn();
  const boundaryAtStart = ports.expireBoundaries({
    round: round + 1,
    phase: "turn-start",
  });
  const restoreReadied = ports.expireReadiedSpell(round + 1);
  const turnLogId = ports.logTurnEnd(round + 1);
  ports.announce(
    expiryNoticeSources(timers.expired, boundaryAtEnd.expired, boundaryAtStart.expired)
  );
  ports.registerUndo(
    round + 1,
    () => {
      restoreTurn();
      ports.removeLogEntry(turnLogId);
      restorePerTurn?.();
      timers.restore();
      restoreReadied?.();
      boundaryAtStart.restore();
      boundaryAtEnd.restore();
      ports.setMaintenancePrompts([]);
      reinstateTurnUndo();
    },
    () => runEndTurn(ports)
  );
}
