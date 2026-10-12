/** Pure play transitions for companions and the familiar: the session in, the next out. */
import { FIND_FAMILIAR_SPELL_ID, type FamiliarCreatureType } from "@/lib/familiar-ids";
import {
  isSummonInstanceOf,
  MAX_SUMMONED,
  summonInstanceNumber,
} from "@/lib/summon-count";
import type { SessionState } from "@/types/character";

/** Set a companion's current HP (never below 0). */
export function setCompanionHp(
  session: SessionState,
  featureId: string,
  current: number
): SessionState {
  return {
    ...session,
    companionHp: {
      ...(session.companionHp ?? {}),
      [featureId]: { current: Math.max(0, current) },
    },
  };
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
