/**
 * Readying a spell (2024 Ready action): after Ready, the spell is cast now (its slot
 * spent) and held with Concentration until the trigger, when the Reaction releases
 * it, or until the start of your next turn, when it is lost. Losing Concentration
 * loses it too: the mark lives beside the concentration it rides, and any change of
 * concentration drops it.
 */
import { getSpellById } from "@/data/spells";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { SelectedAction } from "@/stores/combatStore";
import type { CharacterDoc, SessionState } from "@/types/character";

/** The Ready base action's id. */
export const READY_ACTION_ID = "base-ready";

/** The Reaction occupant id when the readied spell is released. */
export const READIED_SPELL_REACTION_ID = "readied-spell";

/**
 * Whether casting `action` now readies it: Ready was used this turn, nothing is held
 * yet, and the spell takes an action to cast (RAW: the readied spell must have a
 * casting time of an action).
 */
export function castReadiesSpell(
  action: ResolvedAction,
  selectedActions: ReadonlyArray<SelectedAction>,
  session: SessionState
): boolean {
  return (
    action.source === "spell" &&
    action.castTiming === "action" &&
    session.readiedSpell === undefined &&
    selectedActions.some((selected) => selected.id === READY_ACTION_ID)
  );
}

/** The hold for a spell readied on `round`: it lasts until the start of your next
 *  turn, and remembers the readying cast's log line. */
export function readiedHold(
  round: number,
  castLogId: string | null
): NonNullable<SessionState["readiedSpell"]> {
  return { expiresRound: round + 1, ...(castLogId ? { castLogId } : {}) };
}

/**
 * The session with `readied` held (or dropped when undefined); null when nothing
 * changes. Holding needs a concentration to ride.
 */
export function setReadiedSpell(
  session: SessionState,
  readied: SessionState["readiedSpell"]
): SessionState | null {
  if (readied) {
    return session.concentration ? { ...session, readiedSpell: readied } : null;
  }
  if (!session.readiedSpell) return null;
  const next = { ...session };
  delete next.readiedSpell;
  return next;
}

/** Whether releasing the held spell keeps Concentration (the spell itself needs it). */
export function releaseKeepsConcentration(session: SessionState): boolean {
  const spell = getSpellById(session.concentration);
  return spell?.concentration === true;
}

/** The targets the readying cast was aimed at (its log line), for the release. */
export function readiedTargets(doc: CharacterDoc): string[] {
  const logId = doc.session.readiedSpell?.castLogId;
  const event = doc.session.logEntries.find((entry) => entry.id === logId)?.event;
  return event && "targets" in event && event.targets ? [...event.targets] : [];
}

/** Whether the held spell is lost at this turn start (the start of your next turn). */
export function readiedSpellExpires(session: SessionState, round: number): boolean {
  const held = session.readiedSpell;
  return held !== undefined && round >= held.expiresRound;
}
