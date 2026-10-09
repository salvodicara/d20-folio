/**
 * The status lifetime vocabulary (Phase 2): how a status ends on its own and what
 * ends it early, and the lifetime a declared `while-active` duration starts with.
 * A leaf module — the catalogue's Activities declare their durations with it
 * without loading the engine; `@/lib/status` re-exports it.
 */
import type { WhileActiveDuration } from "@/lib/grants";

/** An owner-turn edge: the start or the end of the status owner's turn. */
export type StatusTurnPhase = "turn-start" | "turn-end";

/** The countdown that ends a status on its own. */
export type StatusLifetime =
  /** Ends at an exact owner-turn edge (Shield: the start of your next turn). */
  | { kind: "turn-edge"; round: number; phase: StatusTurnPhase }
  /** Counts down one round on each of the owner's turn starts (Bless: 10). */
  | { kind: "rounds"; roundsLeft: number; tickedRound?: number }
  /** No round counter; the next rest of this kind (or longer) outlasts it. */
  | { kind: "rest"; rest: "short" | "long" }
  /** Lasts while the owner keeps maintaining it, with no round cap stored. */
  | { kind: "maintained" }
  /** No declared end: the player ends it (homebrew toggles, permanent forms). */
  | { kind: "manual" };

/** Something other than the lifetime countdown that ends the status early. */
export type StatusEnd =
  /** Ends when the owner's Concentration ends (drop, failed save, 0 HP, swap). */
  | { kind: "concentration" }
  /** Ends when this rest (or a longer one) completes. */
  | { kind: "rest"; rest: "short" | "long" }
  /** Ends when a round passes without one of these maintaining events (Rage). */
  | { kind: "maintenance"; by: ReadonlyArray<"attack" | "bonus-extend"> }
  /** Ends as soon as this data-declared fact becomes true ("heavy-armor",
   *  "incapacitated"). Unknown homebrew tokens are kept verbatim. */
  | { kind: "trigger"; trigger: string };

/** The longest rest-free span a rest can outlast, in minutes. */
const REST_MINUTES = { short: 60, long: 8 * 60 } as const;

function restEnd(duration: WhileActiveDuration | undefined): "short" | "long" | null {
  if (!duration) return null;
  if (duration.kind === "maintained" || duration.kind === "turn-boundary") return "short";
  if (duration.minutes <= REST_MINUTES.short) return "short";
  if (duration.minutes <= REST_MINUTES.long) return "long";
  return null;
}

/**
 * The lifetime a declared duration implies when no countdown is stored: kept up
 * by its owner, outlasted by a rest, or ended by the player.
 */
export function undatedLifetime(
  duration: WhileActiveDuration | undefined
): StatusLifetime {
  if (duration?.kind === "maintained") return { kind: "maintained" };
  const rest = restEnd(duration);
  return rest ? { kind: "rest", rest } : { kind: "manual" };
}

/**
 * The lifetime a status starts with when it is lit from its declared duration:
 * an owner-turn edge counted from the lighting round (Shield: `round: 1`, the
 * start of your next turn), else the declared round cap the store arms as a
 * countdown (Bless: 10), else the undated lifetime. Activities declare their
 * durations with it, so a lit status and its declaration share one vocabulary.
 */
export function startingStatusLifetime(
  duration: WhileActiveDuration | undefined
): StatusLifetime {
  if (duration?.kind === "turn-boundary") {
    return { kind: "turn-edge", round: duration.turns, phase: duration.phase };
  }
  if (duration?.maxRounds !== undefined) {
    return { kind: "rounds", roundsLeft: duration.maxRounds };
  }
  return undatedLifetime(duration);
}

/**
 * Everything besides the countdown that ends a status with this declared
 * duration, in a stable order: Concentration, maintenance, the data-declared
 * triggers, then the rest that outlasts it.
 */
export function statusEndsOn(
  duration: WhileActiveDuration | undefined,
  concentration: boolean
): StatusEnd[] {
  const endsOn: StatusEnd[] = [];
  if (concentration) endsOn.push({ kind: "concentration" });
  if (duration?.kind === "maintained") {
    endsOn.push({ kind: "maintenance", by: duration.maintainedBy });
  }
  if (duration && "endsEarlyOn" in duration) {
    for (const trigger of duration.endsEarlyOn ?? []) {
      endsOn.push({ kind: "trigger", trigger });
    }
  }
  const rest = restEnd(duration);
  if (rest) endsOn.push({ kind: "rest", rest });
  return endsOn;
}
