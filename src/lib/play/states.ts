/**
 * Pure play transitions for the character's active states (Rage, Bless lit on
 * yourself, a potion's timer): the character in, the next session out.
 */
import { getSpellById } from "@/data/spells";
import type { SrdSpellData } from "@/data/types";
import { combatResolutionSpec } from "@/lib/combat-resolution";
import type { Grant } from "@/lib/grants";
import {
  drunkPotionId,
  potionDurationRounds,
  potionStateGrant,
  potionStatesEndingOn,
  potionTimerKey,
} from "@/lib/potion-states";
import {
  resolveActiveTimedEffects,
  resolvePerTurnRecoveryTrackerIds,
  type ResolvedAction,
} from "@/lib/smart-tracker";
import type { CharacterDoc, SessionState, TrackerState } from "@/types/character";
import { concentrationValue } from "@/lib/concentration";
import { changeConcentration } from "./concentration";
import { restoreTrackerEntry } from "./recoveries";
import { countActivationUse } from "./reuse-save";

/** Drop one key from an optional record; undefined when nothing is left. */
function without<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string
): Record<string, T> | undefined {
  const next = Object.fromEntries(
    Object.entries(record ?? {}).filter(([entryKey]) => entryKey !== key)
  );
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Light or end an active state, or null when it already is. Either way its countdown,
 * turn edge (and, when ending, its cast level) restart; a state with a declared round
 * cap is armed with it, stamped `litRound` (the round before the sheet's current one,
 * so a turn-boundary catch-up never counts the lighting round again).
 */
export function setActiveState(
  doc: CharacterDoc,
  key: string,
  isActive: boolean,
  litRound: number
): SessionState | null {
  const active = doc.session.activeFeatures ?? [];
  if (active.includes(key) === isActive) return null;
  const levels = isActive
    ? doc.session.activeSpellCastLevels
    : without(doc.session.activeSpellCastLevels, key);
  // Lighting a state whose item strains on reuse counts the use (Ring of X-ray Vision).
  const base = isActive ? countActivationUse(doc, key) : doc.session;
  const session: SessionState = {
    ...base,
    activeFeatures: isActive ? [...active, key] : active.filter((k) => k !== key),
    activeSpellCastLevels: levels && Object.keys(levels).length > 0 ? levels : undefined,
    effectTimers: without(doc.session.effectTimers, key),
    effectBoundaries: without(doc.session.effectBoundaries, key),
  };
  if (!isActive) return session;
  const timed = resolveActiveTimedEffects({ ...doc, session }).find(
    (effect) => effect.activeKey === key
  );
  if (!timed) return session;
  return {
    ...session,
    effectTimers: {
      ...(session.effectTimers ?? {}),
      [key]: { roundsLeft: timed.maxRounds, tickedRound: litRound },
    },
  };
}

/** End these lit state keys: their toggle, countdown, turn edge and cast level go. */
export function endStateKeys(
  session: SessionState,
  keys: ReadonlyArray<string>
): SessionState {
  if (keys.length === 0) return session;
  let next: SessionState = {
    ...session,
    activeFeatures: (session.activeFeatures ?? []).filter((k) => !keys.includes(k)),
  };
  for (const key of keys) {
    next = {
      ...next,
      activeSpellCastLevels: without(next.activeSpellCastLevels, key),
      effectTimers: without(next.effectTimers, key),
      effectBoundaries: without(next.effectBoundaries, key),
    };
  }
  return next;
}

/** Something you do that ends a state early ("The effect ends early if you make an
 *  attack roll, deal damage, or cast a spell"; Hide also ends on a spell with a Verbal
 *  component and on a sound louder than a whisper). */
export type StateEndingAct =
  | "attack-roll"
  | "deal-damage"
  | "cast-spell"
  | "verbal-spell"
  | "loud-noise";

/** The acts that end a Hide (2024 Hide; being found is `removeCondition`). */
const HIDE_ENDING_ACTS: ReadonlySet<StateEndingAct> = new Set([
  "attack-roll",
  "verbal-spell",
  "loud-noise",
]);

/** What a committed use does that can end a state: its attack roll, its spell cast
 *  and the spell's Verbal component. Dealing damage is the tray's, after the roll. */
export function actsOfUse(action: ResolvedAction): StateEndingAct[] {
  const acts: StateEndingAct[] = [];
  const kind = combatResolutionSpec(action).kind;
  if (kind === "attack" || kind === "attack-save") acts.push("attack-roll");
  if (action.source === "spell") {
    acts.push("cast-spell");
    const spell =
      action.homebrewSpell ?? (action.spellId ? getSpellById(action.spellId) : undefined);
    if (spell?.components.v) acts.push("verbal-spell");
  }
  return acts;
}

/**
 * End every lit state whose duration ends early on `act` (Potion of Invisibility),
 * and a Hide on the acts that end it, with what ended for the caller's notice
 * (`"hide"` for the Hide); null when nothing ends.
 */
export function endStatesOnAct(
  doc: CharacterDoc,
  act: StateEndingAct
): { session: SessionState; ended: string[] } | null {
  const states = potionStatesEndingOn(doc.session.activeFeatures ?? [], act);
  const hide = doc.session.hiddenDc !== undefined && HIDE_ENDING_ACTS.has(act);
  if (states.length === 0 && !hide) return null;
  const session = endSpellsOf(doc, states, endStateKeys(doc.session, states));
  return {
    session: hide
      ? {
          ...session,
          conditions: session.conditions.filter((c) => c !== "invisible"),
          hiddenDc: undefined,
        }
      : session,
    ended: hide ? [...states, "hide"] : states,
  };
}

/**
 * A spell whose state an act ended ends whole (Invisibility: "the spell ends early"):
 * the conditions it holds for as long as it lasts go, and so does its Concentration.
 */
function endSpellsOf(
  doc: CharacterDoc,
  keys: ReadonlyArray<string>,
  session: SessionState
): SessionState {
  let next = session;
  for (const key of keys) {
    if (!key.startsWith(SPELL_STATE_PREFIX)) continue;
    const spellId = key.slice(SPELL_STATE_PREFIX.length);
    const spell = getSpellById(spellId);
    if (!spell) continue;
    const held: ReadonlyArray<string> =
      spell.conditionApplication?.lifetime?.kind === "source"
        ? spell.conditionApplication.options
        : [];
    if (held.length > 0) {
      next = {
        ...next,
        conditions: next.conditions.filter((c) => !held.includes(c)),
        concentrationConditions: next.concentrationConditions?.filter(
          (c) => !held.includes(c)
        ),
      };
    }
    if (spell.concentration && next.concentration === concentrationValue(spellId)) {
      next = changeConcentration({ ...doc, session: next }, "").doc.session;
    }
  }
  return next;
}

/** The prefix of a spell's lit state key (`spell-invisibility`). */
const SPELL_STATE_PREFIX = "spell-";

/** Record (or clear, with no level) the slot level an active spell state was cast at. */
export function setActiveSpellCastLevel(
  doc: CharacterDoc,
  key: string,
  level: number | undefined
): SessionState {
  const previous = doc.session.activeSpellCastLevels ?? {};
  const levels =
    level !== undefined && Number.isFinite(level) && level > 0
      ? { ...previous, [key]: Math.round(level) }
      : (without(previous, key) ?? {});
  return {
    ...doc.session,
    activeSpellCastLevels: Object.keys(levels).length > 0 ? levels : undefined,
  };
}

/** Refill every spent per-turn tracker (Sneak Attack) at the owner's turn start, or
 *  null when none needs it; `prior` is what the undo restores. */
export function recoverPerTurnTrackers(
  doc: CharacterDoc,
  /** The turn that starts ("5:monster-1"): only uses spent in another turn come back
   *  (a use spent in this very turn stays spent). Absent: every once-per-turn use. */
  turnKey?: string
): { session: SessionState; prior: Map<string, TrackerState | undefined> } | null {
  const ids = resolvePerTurnRecoveryTrackerIds(doc).filter((id) => {
    const entry = doc.session.trackers[id];
    if (turnKey === undefined) return true;
    return entry !== undefined && entry.used > 0 && entry.turnKey !== turnKey;
  });
  if (ids.length === 0) return null;
  const prior = new Map<string, TrackerState | undefined>();
  let trackers = doc.session.trackers;
  for (const id of ids) {
    prior.set(id, doc.session.trackers[id]);
    trackers = restoreTrackerEntry(trackers, id, undefined);
  }
  return { session: { ...doc.session, trackers }, prior };
}

/**
 * Drink a timed potion: a potion that declares a standing state (Flying's fly
 * speed) lights its `potion:<id>` key, armed to the declared countdown (drinking
 * another restarts it); any other timed potion only arms the bare countdown. Null
 * for an instant potion (Healing), which has nothing to arm. `costKey` is the
 * drink's equipment key: a catalogue potion's `srdId`, or `custom-<instanceId>` for
 * a homebrew potion, whose state and countdown are read from its copy and keyed
 * `potion:<instanceId>` (`drunkPotionId`).
 */
export function drinkPotion(
  doc: CharacterDoc,
  costKey: string,
  litRound: number
): SessionState | null {
  const copies = doc.character.equipment;
  const itemId = drunkPotionId(copies, costKey);
  if (itemId === null) return null;
  const key = potionTimerKey(itemId);
  if (potionStateGrant(itemId, copies)) {
    const off = setActiveState(doc, key, false, litRound) ?? doc.session;
    return setActiveState({ ...doc, session: off }, key, true, litRound);
  }
  const rounds = potionDurationRounds(itemId, copies);
  if (rounds === undefined || !Number.isFinite(rounds) || rounds <= 0) return null;
  return {
    ...doc.session,
    effectTimers: {
      ...(doc.session.effectTimers ?? {}),
      [key]: { roundsLeft: rounds, tickedRound: litRound },
    },
  };
}

/** Put one state key back as it was in `prior` (the undo of a drink), leaving
 *  every other state started in the meantime untouched. */
export function restoreStateKey(
  session: SessionState,
  prior: SessionState,
  key: string
): SessionState {
  const wasActive = (prior.activeFeatures ?? []).includes(key);
  const active = (session.activeFeatures ?? []).filter((k) => k !== key);
  const put = <T>(
    now: Readonly<Record<string, T>> | undefined,
    before: Readonly<Record<string, T>> | undefined
  ): Record<string, T> | undefined => {
    const value = before?.[key];
    return value === undefined ? without(now, key) : { ...(now ?? {}), [key]: value };
  };
  return {
    ...session,
    activeFeatures: wasActive ? [...active, key] : active,
    effectTimers: put(session.effectTimers, prior.effectTimers),
    effectBoundaries: put(session.effectBoundaries, prior.effectBoundaries),
  };
}

/** Every option choice (`choice-grant-bundle` key) nested in these grants. */
function choiceBundleKeys(grants: ReadonlyArray<Grant>): string[] {
  return grants.flatMap((g) => {
    if (g.type === "choice-grant-bundle") return [g.bundleKey];
    // The weapon a cast names (Shillelagh's staff) and its damage-type pick.
    if (g.type === "weapon-binding") {
      return [g.choiceKey, ...(g.damageTypeChoice ? [g.damageTypeChoice.choiceKey] : [])];
    }
    return g.type === "while-active" ? choiceBundleKeys(g.grants) : [];
  });
}

/**
 * The option choices a spell's standing state carries (Enlarge or Reduce, an Alter
 * Self form, Fire Shield's warm or chill, the weapon Shillelagh imbues). Each cast picks anew, so lighting the
 * state by a cast clears them and the rail asks again, as on the first cast.
 */
export function castStateChoiceKeys(
  spell: Pick<SrdSpellData, "grants"> | undefined,
  activeKey: string
): string[] {
  return (spell?.grants ?? []).flatMap((g) =>
    g.type === "while-active" && g.activeKey === activeKey
      ? choiceBundleKeys(g.grants)
      : []
  );
}

/** Set (an option id) or clear (null) option choices, or null when none changes. */
export function setBundleChoices(
  doc: CharacterDoc,
  choices: Readonly<Record<string, string | null>>
): SessionState | null {
  const prior = doc.session.grantBundleChoices ?? {};
  const merged: Record<string, string | null> = { ...prior, ...choices };
  const next = Object.fromEntries(
    Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== null)
  );
  const keys = new Set([...Object.keys(prior), ...Object.keys(next)]);
  if ([...keys].every((key) => prior[key] === next[key])) return null;
  return {
    ...doc.session,
    grantBundleChoices: Object.keys(next).length > 0 ? next : undefined,
  };
}
