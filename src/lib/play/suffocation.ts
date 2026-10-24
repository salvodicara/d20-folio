/**
 * Suffocation (SRD 5.2.1 Rules Glossary, "Suffocation [Hazard]"): a creature holds
 * its breath for 1 + its Constitution modifier minutes (minimum 30 seconds); out of
 * breath or choking, it gains 1 Exhaustion level at the end of each of its turns; when
 * it can breathe again it removes every level it gained from suffocating.
 *
 * The budget is counted in the character's turn ends (1 round = 6 seconds), by End
 * Turn (`breath-turn-end`) and by time passing (`time-passes`, every round of it). A
 * creature that breathes air and water (the `air-and-water-breathing` grant: Water
 * Breathing potion, Gift of the Depths, Alter Self) never runs out underwater, and
 * breathes again the moment it gains the grant; a choke is not helped by it.
 */
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { abilityModifier } from "@/lib/ability";
import { aggregateAbilityScores } from "@/lib/compute";
import { ROUNDS_PER_MINUTE } from "@/lib/spell-duration";
import { srdText, type LocText } from "@/lib/loc-text";
import type { CombatEvent } from "@/types/combat-log";
import type { CharacterDoc, SessionState } from "@/types/character";
import { setExhaustion } from "./vitals";

/** The rule that names a suffocation line in the log. */
export const SUFFOCATION_SOURCE: LocText = srdText("rule", "hazard.suffocation", "name");

const MIN_HOLD_ROUNDS = 5; // 30 seconds
const DEAD = 6;

/** The turns of air a creature with this Constitution score holds. */
export function breathHoldRounds(constitution: number): number {
  const minutes = 1 + abilityModifier(constitution);
  return Math.max(MIN_HOLD_ROUNDS, minutes * ROUNDS_PER_MINUTE);
}

function canBreatheWater(doc: CharacterDoc): boolean {
  return aggregateCharacterGrants(doc.character, doc.session).airAndWaterBreathing;
}

function constitution(doc: CharacterDoc): number {
  const aggregate = aggregateCharacterGrants(doc.character, doc.session);
  return aggregateAbilityScores(doc.character.abilityScores, aggregate).CON;
}

/** Start holding breath (or choking, out of air at once). Null when already holding
 *  it, or when the creature breathes water and nothing chokes it. */
export function holdBreath(
  doc: CharacterDoc,
  opts: { choking?: boolean } = {}
): SessionState | null {
  if (doc.session.breath) return null;
  if (!opts.choking && canBreatheWater(doc)) return null;
  const breath: NonNullable<SessionState["breath"]> = opts.choking
    ? { roundsLeft: 0, gained: 0, choking: true }
    : { roundsLeft: breathHoldRounds(constitution(doc)), gained: 0 };
  return { ...doc.session, breath };
}

/** The creature breathes again: every level suffocating added goes (death stays).
 *  Null when it was breathing. */
export function breatheAgain(doc: CharacterDoc): SessionState | null {
  const breath = doc.session.breath;
  if (!breath) return null;
  const session = { ...doc.session };
  delete session.breath;
  const exhaustion = doc.session.exhaustion;
  if (exhaustion >= DEAD || breath.gained <= 0) return session;
  const next = { ...doc, session };
  return setExhaustion(next, exhaustion - Math.min(breath.gained, exhaustion)) ?? session;
}

/** `rounds` of the character's turn ends pass while it holds its breath (or not). */
export function passBreathRounds(doc: CharacterDoc, rounds: number): SessionState | null {
  const breath = doc.session.breath;
  if (!breath || !Number.isFinite(rounds) || rounds <= 0) return null;
  if (!breath.choking && canBreatheWater(doc)) return breatheAgain(doc);
  const turns = Math.round(rounds);
  const roundsLeft = Math.max(0, breath.roundsLeft - turns);
  const outOfBreath = Math.max(0, turns - breath.roundsLeft);
  const before = doc.session.exhaustion;
  const exhaustion = Math.min(DEAD, before + outOfBreath);
  const counted = {
    ...doc.session,
    breath: { ...breath, roundsLeft, gained: breath.gained + (exhaustion - before) },
  };
  if (exhaustion === before) return counted;
  return setExhaustion({ ...doc, session: counted }, exhaustion) ?? counted;
}

/**
 * The log lines suffocation's automatic Exhaustion writes, from the character before
 * and after a transition: a gained level (named after Suffocation), or the levels lost
 * on breathing again. Any other Exhaustion change logs nothing here.
 */
export function breathLogEvents(
  before: CharacterDoc,
  after: CharacterDoc
): CombatEvent[] {
  const was = before.session.breath;
  if (!was) return [];
  const delta = after.session.exhaustion - before.session.exhaustion;
  if (delta > 0 && after.session.breath) {
    return [
      { kind: "condition-gain", conditionId: "exhaustion", source: SUFFOCATION_SOURCE },
    ];
  }
  if (delta < 0 && !after.session.breath) {
    return [{ kind: "condition-loss", conditionId: "exhaustion" }];
  }
  return [];
}
