/** Pure play transitions for companions and the familiar: the session in, the next out. */
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import type { CompanionEnd } from "@/data/types";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { FIND_FAMILIAR_SPELL_ID, type FamiliarCreatureType } from "@/lib/familiar-ids";
import {
  isSummonInstanceOf,
  MAX_SUMMONED,
  SUMMON_TIMER_PREFIX,
  summonInstanceNumber,
  summonTimerKey,
} from "@/lib/summon-count";
import { totalLevel } from "@/lib/classes";
import { proficiencyBonus } from "@/lib/proficiency";
import { ROUNDS_PER_MINUTE } from "@/lib/spell-duration";
import type { CharacterDoc, SessionState } from "@/types/character";

/** The familiar has no companion stat block: "when the familiar drops to 0 Hit
 *  Points, it disappears" (SRD 5.2.1, Find Familiar). */
const FAMILIAR_ENDS: readonly CompanionEnd[] = ["0-hp:vanish"];

/** When a summon from `sourceId` ends (its catalogue `lifecycle.endsOn`, M6). */
export function summonEnds(sourceId: string): readonly CompanionEnd[] {
  if (sourceId === FIND_FAMILIAR_SPELL_ID) return FAMILIAR_ENDS;
  const block =
    getSpellById(sourceId)?.companion ?? classFeatureIndex.get(sourceId)?.companion;
  return block?.lifecycle?.endsOn ?? [];
}

/**
 * Set a companion's current HP (never below 0). At 0 its catalogue rule applies
 * (edge-case family M6): a summon that vanishes (Find Steed, the familiar) leaves the
 * field with its HP entry; one that dies (Beast Master's beast) is `fallen`.
 */
export function setCompanionHp(
  session: SessionState,
  featureId: string,
  current: number
): SessionState {
  const next: SessionState = {
    ...session,
    companionHp: {
      ...(session.companionHp ?? {}),
      [featureId]: { current: Math.max(0, current) },
    },
  };
  const ends = summonEnds(featureId);
  // An absent entry is full HP, so any value set from it is a hit.
  const before = session.companionHp?.[featureId]?.current ?? Infinity;
  // Phantom Steed: "the spell ends early if the steed takes any damage".
  if (ends.includes("damaged") && current < before) return endSummon(next, featureId);
  if (current > 0) return next;
  if (featureId === FIND_FAMILIAR_SPELL_ID) return dismissFamiliar(next) ?? next;
  if (ends.includes("0-hp:vanish")) return endSummon(next, featureId);
  if (ends.includes("0-hp:dies")) {
    return {
      ...next,
      summons: {
        ...(next.summons ?? {}),
        [featureId]: { fallen: true, fallenMinutes: 0 },
      },
    };
  }
  return next;
}

/** One round of combat on the game clock (6 seconds). */
export const ROUND_MINUTES = 0.1;

/** Time passes for the fallen companions: each one's clock since it fell runs on.
 *  The same session when none has fallen. */
export function ageFallenSummons(session: SessionState, minutes: number): SessionState {
  if (!(minutes > 0) || !session.summons) return session;
  const fallen = Object.entries(session.summons).filter(([, s]) => s.fallen);
  if (fallen.length === 0) return session;
  const summons = { ...session.summons };
  for (const [key, entry] of fallen) {
    summons[key] = { ...entry, fallenMinutes: (entry.fallenMinutes ?? 0) + minutes };
  }
  return { ...session, summons };
}

/**
 * Whether a fallen companion can still be revived (its catalogue's
 * `lifecycle.revive.withinMinutes`): the minutes since it fell and the window.
 * `within` is null when the fall time is unknown. Null when it hasn't fallen or
 * can't be revived.
 */
export function companionReviveWindow(
  doc: Pick<CharacterDoc, "session">,
  sourceId: string
): {
  fallenMinutes: number | null;
  withinMinutes: number;
  within: boolean | null;
} | null {
  const entry = doc.session.summons?.[sourceId];
  if (!entry?.fallen) return null;
  const block =
    getSpellById(sourceId)?.companion ?? classFeatureIndex.get(sourceId)?.companion;
  const spec = block?.lifecycle?.revive;
  if (!spec) return null;
  const since = entry.fallenMinutes;
  return {
    fallenMinutes: since ?? null,
    withinMinutes: spec.withinMinutes,
    // A hair of float drift from summed rounds never closes the window early.
    within: since === undefined ? null : since <= spec.withinMinutes + 1e-9,
  };
}

/** Bring a fallen companion back with all its Hit Points (the catalogue's `revive`:
 *  Beast Master, Steel Defender). The cost is paid by the use that calls it. Null
 *  when it hasn't fallen. */
export function reviveCompanion(
  session: SessionState,
  sourceId: string
): SessionState | null {
  if (!session.summons?.[sourceId]?.fallen) return null;
  return {
    ...session,
    summons: { ...session.summons, [sourceId]: {} },
    companionHp: withoutHpOf(session.companionHp, sourceId),
  };
}

/** The HP entries of a summon: its own and each creature's of a group. */
function withoutHpOf(
  companionHp: SessionState["companionHp"],
  sourceId: string
): NonNullable<SessionState["companionHp"]> {
  return Object.fromEntries(
    Object.entries(companionHp ?? {}).filter(
      ([key]) => key !== sourceId && !isSummonInstanceOf(key, sourceId)
    )
  );
}

/**
 * Summon a creature (edge-case family M6): it comes onto the field at full HP, at
 * the level it was cast with. Casting it again replaces the one before (Find
 * Steed: "the steed returns"), so its old HP goes; the variant pick stays.
 */
export function summonCompanion(
  session: SessionState,
  sourceId: string,
  castLevel?: number
): SessionState {
  const minutes = summonTimerMinutes(sourceId);
  return {
    ...session,
    summons: {
      ...(session.summons ?? {}),
      [sourceId]: castLevel !== undefined ? { castLevel } : {},
    },
    companionHp: withoutHpOf(session.companionHp, sourceId),
    // A summon that lasts a while counts down on game time (M6).
    ...(minutes !== null
      ? {
          effectTimers: {
            ...(session.effectTimers ?? {}),
            [summonTimerKey(sourceId)]: { roundsLeft: minutes * ROUNDS_PER_MINUTE },
          },
        }
      : {}),
  };
}

/** How long a `timer` summon lasts, in minutes: the feature's `timerMinutes`, else
 *  the spell's duration (Phantom Steed: 1 hour). Null for one without a timer. */
export function summonTimerMinutes(sourceId: string): number | null {
  if (!summonEnds(sourceId).includes("timer")) return null;
  const feature = classFeatureIndex.get(sourceId)?.companion?.lifecycle;
  if (feature?.timerMinutes) return feature.timerMinutes;
  const duration = getSpellById(sourceId)?.duration;
  if (!duration || !("amount" in duration)) return null;
  const perUnit = { rounds: 1 / ROUNDS_PER_MINUTE, minutes: 1, hours: 60, days: 1440 };
  return duration.amount * perUnit[duration.kind];
}

/** End the summons a stretch of `minutes` outlasts (a rest: a Short Rest is an hour,
 *  a Long Rest eight). */
export function endSummonsOutlastedBy(
  session: SessionState,
  minutes: number
): SessionState {
  const rounds = minutes * ROUNDS_PER_MINUTE;
  return endExpiredSummons(
    session,
    Object.entries(session.effectTimers ?? {}).flatMap(([key, timer]) =>
      key.startsWith(SUMMON_TIMER_PREFIX) && timer.roundsLeft <= rounds ? [key] : []
    )
  );
}

/** End the summons whose countdowns ran out (`summon:<id>` among `expiredKeys`). */
export function endExpiredSummons(
  session: SessionState,
  expiredKeys: Iterable<string>
): SessionState {
  let next = session;
  for (const key of expiredKeys) {
    if (key.startsWith(SUMMON_TIMER_PREFIX)) {
      next = endSummon(next, key.slice(SUMMON_TIMER_PREFIX.length));
    }
  }
  return next;
}

/** A summon leaves the field: its record and its HP go (the variant pick stays, for
 *  the next time). Recording it keeps the session "recorded" (an empty record). */
export function endSummon(session: SessionState, sourceId: string): SessionState {
  const { [sourceId]: _gone, ...rest } = session.summons ?? {};
  void _gone;
  const { [summonTimerKey(sourceId)]: _timer, ...timers } = session.effectTimers ?? {};
  void _timer;
  return {
    ...session,
    summons: rest,
    companionHp: withoutHpOf(session.companionHp, sourceId),
    ...(session.effectTimers
      ? { effectTimers: Object.keys(timers).length > 0 ? timers : undefined }
      : {}),
  };
}

/**
 * The session with its summons recorded (M6). A session written before `summons`
 * existed shows every prepared non-Concentration summoning spell's creature (Find
 * Steed); the first write records exactly those, so none disappears on update.
 */
export function withSummonsRecorded(doc: CharacterDoc): SessionState {
  if (doc.session.summons) return doc.session;
  const spellIds = new Set<string>(
    aggregateCharacterGrants(doc.character, doc.session).alwaysPrepared
  );
  for (const ref of doc.character.spells) {
    if ("srdId" in ref) spellIds.add(ref.srdId);
  }
  const summons: NonNullable<SessionState["summons"]> = {};
  for (const id of spellIds) {
    const spell = getSpellById(id);
    if (spell?.companion && !spell.concentration) summons[id] = {};
  }
  return { ...doc.session, summons };
}

/** End every recorded summon whose catalogue rule ends on `end` (a Long Rest, the
 *  caster's death). Null when none does. */
export function endSummonsOn(
  session: SessionState,
  end: CompanionEnd
): SessionState | null {
  const ending = Object.keys(session.summons ?? {}).filter((id) =>
    summonEnds(id).includes(end)
  );
  if (ending.length === 0) return null;
  return ending.reduce(endSummon, session);
}

/** Pick a companion variant. A different variant is a different beast, so its HP
 *  entries reset (a stale current would misreport the new max) — every creature of
 *  a multi-creature group too — and so does the group's count (a Large object or a
 *  Wight comes in a different number). */
export function setCompanionVariant(
  session: SessionState,
  featureId: string,
  variantId: string
): SessionState {
  const restHp = Object.fromEntries(
    Object.entries(session.companionHp ?? {}).filter(
      ([key]) => key !== featureId && !isSummonInstanceOf(key, featureId)
    )
  );
  const { [featureId]: _count, ...restCount } = session.companionCount ?? {};
  void _count;
  return {
    ...session,
    companionVariant: { ...(session.companionVariant ?? {}), [featureId]: variantId },
    companionHp: restHp,
    ...(session.companionCount ? { companionCount: restCount } : {}),
  };
}

/** Send a picked bestiary creature away (Planar Ally's ally, Gate's guest): its
 *  pick, its HP and its count go. Null when nothing was picked. */
export function releaseCompanion(
  session: SessionState,
  featureId: string
): SessionState | null {
  if (!session.companionVariant?.[featureId]) return null;
  const { [featureId]: _pick, ...companionVariant } = session.companionVariant;
  void _pick;
  const { [featureId]: _count, ...restCount } = session.companionCount ?? {};
  void _count;
  return {
    ...session,
    companionVariant,
    companionHp: Object.fromEntries(
      Object.entries(session.companionHp ?? {}).filter(
        ([key]) => key !== featureId && !isSummonInstanceOf(key, featureId)
      )
    ),
    ...(session.companionCount ? { companionCount: restCount } : {}),
  };
}

/** Set how many creatures a multi-creature summon fields (1..MAX_SUMMONED). The
 *  creatures past the new count leave, and their HP entries with them. Null when
 *  nothing changes. */
export function setCompanionCount(
  session: SessionState,
  groupId: string,
  count: number
): SessionState | null {
  const next = Math.min(MAX_SUMMONED, Math.max(1, Math.round(count)));
  if (session.companionCount?.[groupId] === next) return null;
  const companionHp = Object.fromEntries(
    Object.entries(session.companionHp ?? {}).filter(([key]) => {
      const n = summonInstanceNumber(key, groupId);
      return n === null || n <= next;
    })
  );
  return {
    ...session,
    companionCount: { ...(session.companionCount ?? {}), [groupId]: next },
    companionHp,
  };
}

/** Summon the familiar at full HP (at least 1). */
export function summonFamiliar(
  session: SessionState,
  monsterId: string,
  creatureType: FamiliarCreatureType,
  maxHp: number
): SessionState {
  return {
    ...session,
    familiar: { monsterId, creatureType },
    companionHp: {
      ...(session.companionHp ?? {}),
      [FIND_FAMILIAR_SPELL_ID]: { current: Math.max(1, maxHp) },
    },
  };
}

/** Send the familiar away (pocket dimension) or bring it back; null without one. */
export function setFamiliarDismissed(
  session: SessionState,
  dismissed: boolean
): SessionState | null {
  const familiar = session.familiar;
  if (!familiar) return null;
  const { dismissed: _prev, ...rest } = familiar;
  void _prev;
  return { ...session, familiar: dismissed ? { ...rest, dismissed: true } : rest };
}

/** End the familiar and its HP entry; null without one. */
export function dismissFamiliar(session: SessionState): SessionState | null {
  if (!session.familiar) return null;
  const { [FIND_FAMILIAR_SPELL_ID]: _hp, ...restHp } = session.companionHp ?? {};
  void _hp;
  const { familiar: _f, ...restSession } = session;
  void _f;
  return { ...restSession, companionHp: restHp };
}

/**
 * A summoned creature's Hit Point maximum: its stat block's, plus what your feats
 * add (`companion-mod`, Familiar Friend: twice your character level).
 */
export function summonMaxHp(doc: CharacterDoc, spellId: string, baseHp: number): number {
  return baseHp + summonMods(doc, spellId).hpBonus;
}

/**
 * What your feats change on a creature your spell summons (`companion-mod`): its
 * extra Hit Points, its own Reaction (Warlike Familiar's AC bonus, your Proficiency
 * Bonus), its emanation (Soothing Familiar's healing-die floor), and the imbuing you
 * may give it at the cast (Otherworldly Familiar). Resolved to numbers for the card.
 */
export function summonMods(
  doc: CharacterDoc,
  spellId: string
): {
  hpBonus: number;
  reactions: Array<{ sourceId: string; trigger: string; acBonus: number }>;
  auras: Array<{
    sourceId: string;
    radiusFt: number;
    ownerWithinFt?: number;
    healingDieFloor: { below: number; to: number };
  }>;
  imbues: Array<{
    sourceId: string;
    resistanceChoice: readonly string[];
    movesThroughCreatures: boolean;
  }>;
} {
  const level = totalLevel(doc.character);
  const mods = aggregateCharacterGrants(doc.character, doc.session).companionMods.filter(
    (mod) => mod.companion === spellId
  );
  const pb = proficiencyBonus(level);
  return {
    hpBonus: mods.reduce(
      (sum, mod) => sum + (mod.hpBonus?.perCharacterLevel ?? 0) * level,
      0
    ),
    reactions: mods.flatMap((mod) =>
      mod.reaction
        ? [{ sourceId: mod.sourceId, trigger: mod.reaction.trigger, acBonus: pb }]
        : []
    ),
    auras: mods.flatMap((mod) =>
      mod.aura
        ? [
            {
              sourceId: mod.sourceId,
              radiusFt: mod.aura.radiusFt,
              ...(mod.aura.ownerWithinFt !== undefined
                ? { ownerWithinFt: mod.aura.ownerWithinFt }
                : {}),
              healingDieFloor: mod.aura.healingDieFloor,
            },
          ]
        : []
    ),
    imbues: mods.flatMap((mod) =>
      mod.imbue
        ? [
            {
              sourceId: mod.sourceId,
              resistanceChoice: mod.imbue.resistanceChoice,
              movesThroughCreatures: mod.imbue.movesThroughCreatures === true,
            },
          ]
        : []
    ),
  };
}
