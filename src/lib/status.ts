/**
 * Phase 2 — one Status model (docs/ARCHITECTURE_MAP.md, "Phase 2: states and
 * timers").
 *
 * A Status is "something active on a creature for a while": Rage, Shield, a
 * Hunter's Mark, a drunk Potion of Speed. Today those facts are spread over
 * several session fields — the `activeFeatures` toggles, their round
 * countdowns (`effectTimers`), their exact turn-edge expiries
 * (`effectBoundaries`), the cast level behind a spell state
 * (`activeSpellCastLevels`) and the held `concentration` — and each surface
 * re-joins them by hand. This module is the ONE read of those fields as a list
 * of {@link Status} records, joined with the catalogue's declared durations.
 *
 * It is a pure, read-only VIEW: it stores nothing and changes no rule. Writers
 * keep mutating the old fields; every surface that shows a status (the rail
 * toggles, the potion timers, the concentration badge) reads this view, so
 * when storage later moves to `session.statuses[]` only this module changes.
 */
import type { CharacterDoc, SessionState } from "@/types/character";
import type { StoredConcentration } from "@/types/ids";
import { getSpellById } from "@/data/spells";
import { CUSTOM_CONCENTRATION_PREFIX } from "@/lib/concentration";
import {
  resolveGrantActiveKey,
  whileActiveDurationAtCastLevel,
  type WhileActiveDuration,
} from "@/lib/grants";
import {
  POTION_TIMER_PREFIX,
  castSourceIdFromActiveKey,
  resolveLifecycleGrantSources,
} from "@/lib/smart-tracker";

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

/** One active status on the character. */
export interface Status {
  /** The stable gate key `while-active` grants read (`barbarian-rage`,
   *  `spell-shield`, `cast-source:<source>:<spell>`, `potion:<item>`). */
  key: string;
  /** The stable id of what established it: the feature, spell, item or cast
   *  source. Falls back to the key for a homebrew toggle with no declaration. */
  source: string;
  /** The slot level a spell status was cast at, when it was upcast. */
  castLevel?: number;
  /** Whose status it is. Every status the sheet stores today is the owner's;
   *  statuses on a selected creature (Bless on an ally) arrive with step 7. */
  recipient: "self";
  /** Held by the owner's Concentration: dropping it ends this status too. */
  concentration: boolean;
  lifetime: StatusLifetime;
  endsOn: ReadonlyArray<StatusEnd>;
}

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
function undatedLifetime(duration: WhileActiveDuration | undefined): StatusLifetime {
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

/**
 * Every active status on the character, in a stable order: the lit toggles in
 * `session.activeFeatures` order, then the self-sustaining potion timers.
 *
 * The lifetime prefers the stored countdown (an exact turn edge, then a round
 * counter) and otherwise falls back to the declared duration. The rest ends
 * mirror `resolveActiveStatesEndingOnRest`: the engine only ends what the data
 * proves has elapsed.
 */
export function deriveStatuses(character: CharacterDoc): Status[] {
  const { session } = character;
  const timers = session.effectTimers ?? {};
  const boundaries = session.effectBoundaries ?? {};
  const castLevels = session.activeSpellCastLevels ?? {};
  const concentrationKeys = new Set(concentrationStatusKeys(session.concentration));

  // The first declaration of each key wins, as in every lifecycle resolver.
  const declared = new Map<
    string,
    { source: string; duration: WhileActiveDuration | undefined }
  >();
  if ((session.activeFeatures ?? []).length > 0) {
    for (const source of resolveLifecycleGrantSources(character)) {
      for (const grant of source.grants ?? []) {
        if (grant.type !== "while-active") continue;
        const key = resolveGrantActiveKey(source, grant.activeKey);
        const prior = declared.get(key);
        if (prior && (prior.duration || !grant.duration)) continue;
        declared.set(key, { source: source.id, duration: grant.duration });
      }
    }
  }

  const statuses: Status[] = [];
  const seen = new Set<string>();
  for (const key of session.activeFeatures ?? []) {
    if (seen.has(key)) continue;
    seen.add(key);
    const castLevel = castLevels[key];
    const declaration = declared.get(key);
    const duration = whileActiveDurationAtCastLevel(declaration?.duration, castLevel);
    const concentration = concentrationKeys.has(key);
    const boundary = boundaries[key];
    const timer = timers[key];
    const lifetime: StatusLifetime = boundary
      ? { kind: "turn-edge", round: boundary.round, phase: boundary.phase }
      : timer
        ? {
            kind: "rounds",
            roundsLeft: timer.roundsLeft,
            ...(timer.tickedRound !== undefined
              ? { tickedRound: timer.tickedRound }
              : {}),
          }
        : undatedLifetime(duration);
    const endsOn = statusEndsOn(duration, concentration);
    statuses.push({
      key,
      source: declaration?.source ?? castSourceIdFromActiveKey(key) ?? key,
      ...(castLevel !== undefined ? { castLevel } : {}),
      recipient: "self",
      concentration,
      lifetime,
      endsOn,
    });
  }

  // A drunk potion has no toggle: its countdown alone is the status.
  for (const [key, timer] of Object.entries(timers)) {
    if (seen.has(key) || !key.startsWith(POTION_TIMER_PREFIX)) continue;
    seen.add(key);
    statuses.push({
      key,
      source: key.slice(POTION_TIMER_PREFIX.length),
      recipient: "self",
      concentration: false,
      lifetime: {
        kind: "rounds",
        roundsLeft: timer.roundsLeft,
        ...(timer.tickedRound !== undefined ? { tickedRound: timer.tickedRound } : {}),
      },
      endsOn: [],
    });
  }
  return statuses;
}

/** Rounds left on a status's countdown, or `undefined` when it has none. */
export function statusRoundsLeft(status: Status | undefined): number | undefined {
  return status?.lifetime.kind === "rounds" ? status.lifetime.roundsLeft : undefined;
}

/** Rounds left on each status that counts rounds, keyed by status key. */
export function statusRoundCounts(
  statuses: ReadonlyArray<Status>
): Record<string, { roundsLeft: number }> {
  const out: Record<string, { roundsLeft: number }> = {};
  for (const status of statuses) {
    const roundsLeft = statusRoundsLeft(status);
    if (roundsLeft !== undefined) out[status.key] = { roundsLeft };
  }
  return out;
}

/**
 * The rounds left on the held Concentration: the soonest countdown among the
 * statuses it holds (Bless lit on yourself, Hunter's Mark, Haste). `undefined`
 * when Concentration holds no counting status (a custom spell, Bless only on
 * allies), so the badge shows no counter rather than a guess.
 */
export function concentrationRoundsLeft(
  statuses: ReadonlyArray<Status>
): number | undefined {
  let soonest: number | undefined;
  for (const status of statuses) {
    if (!status.concentration) continue;
    const roundsLeft = statusRoundsLeft(status);
    if (roundsLeft !== undefined && (soonest === undefined || roundsLeft < soonest)) {
      soonest = roundsLeft;
    }
  }
  return soonest;
}

// ─── Concentration: a flag on the statuses it holds ─────────────────────────

/**
 * The status keys a Concentration spell holds — every `while-active` wrapper
 * the spell declares (Fly, Haste, Hunter's Mark, Bless lit on yourself, and the
 * hidden duration-only wrappers of condition spells). A status whose key is in
 * this set carries `concentration: true`. Resolved from the spell's stable ref,
 * never its name; "" and a custom spell hold nothing.
 */
export function concentrationStatusKeys(ref: StoredConcentration): string[] {
  if (ref === "" || ref.startsWith(CUSTOM_CONCENTRATION_PREFIX)) return [];
  return (
    getSpellById(ref)?.grants?.flatMap((grant) =>
      grant.type === "while-active" ? [grant.activeKey] : []
    ) ?? []
  );
}

/** Whether ending these statuses ends the held Concentration: one of them is a
 *  status Concentration holds (Bless's countdown ran out, Shield's turn edge). */
export function endsConcentration(
  concentration: StoredConcentration,
  endedKeys: Iterable<string>
): boolean {
  if (concentration === "") return false;
  const held = new Set(concentrationStatusKeys(concentration));
  for (const key of endedKeys) if (held.has(key)) return true;
  return false;
}

/** The status fields with these statuses removed. */
export type StatusFields = Pick<
  SessionState,
  "activeFeatures" | "activeSpellCastLevels" | "effectTimers" | "effectBoundaries"
>;

function omitKeys<T>(
  record: Readonly<Record<string, T>> | undefined,
  keys: ReadonlySet<string>
): Record<string, T> | undefined {
  if (!record || keys.size === 0) return record;
  const kept = Object.entries(record).filter(([key]) => !keys.has(key));
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/**
 * End these statuses: the ONE pure patch over today's status fields (toggle,
 * cast level, round countdown, turn edge). A key that is not active is simply
 * absent from the result.
 */
export function endStatuses(
  session: Pick<SessionState, keyof StatusFields>,
  keys: Iterable<string>
): StatusFields {
  const ended = new Set(keys);
  return {
    activeFeatures:
      ended.size === 0
        ? (session.activeFeatures ?? [])
        : (session.activeFeatures ?? []).filter((key) => !ended.has(key)),
    activeSpellCastLevels: omitKeys(session.activeSpellCastLevels, ended),
    effectTimers: omitKeys(session.effectTimers, ended),
    effectBoundaries: omitKeys(session.effectBoundaries, ended),
  };
}
