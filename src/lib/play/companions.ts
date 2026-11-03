/** Pure play transitions for companions and the familiar: the session in, the next out. */
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import type { CompanionEnd } from "@/data/types";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { FIND_FAMILIAR_SPELL_ID, type FamiliarCreatureType } from "@/lib/familiar-ids";
import {
  isSummonInstanceOf,
  MAX_SUMMONED,
  summonInstanceNumber,
} from "@/lib/summon-count";
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
      summons: { ...(next.summons ?? {}), [featureId]: { fallen: true } },
    };
  }
  return next;
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
  return {
    ...session,
    summons: {
      ...(session.summons ?? {}),
      [sourceId]: castLevel !== undefined ? { castLevel } : {},
    },
    companionHp: withoutHpOf(session.companionHp, sourceId),
  };
}

/** A summon leaves the field: its record and its HP go (the variant pick stays, for
 *  the next time). Recording it keeps the session "recorded" (an empty record). */
export function endSummon(session: SessionState, sourceId: string): SessionState {
  const { [sourceId]: _gone, ...rest } = session.summons ?? {};
  void _gone;
  return {
    ...session,
    summons: rest,
    companionHp: withoutHpOf(session.companionHp, sourceId),
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
