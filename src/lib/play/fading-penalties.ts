/**
 * D20 Test penalties that fade by one each Long Rest: Raise Dead (SRD 5.2.1) leaves
 * "a −4 penalty to all attack rolls, saving throws, and ability checks. Every time
 * the creature finishes a Long Rest, the penalty is reduced by 1 until it
 * disappears." The session stores the remaining amount per source; this module
 * starts, ends and counts it down, and feeds it to the two seams the sheet's D20
 * Tests already read: the flat grants (save, check, initiative, spell attack) and
 * the attack resolver's to-hit penalty beside Exhaustion's.
 */
import type { Grant } from "@/lib/grant-schema";
import type { GrantSource } from "@/lib/grants";
import { srdText } from "@/lib/loc-text";
import { locPart, type RawBreakdownPart } from "@/lib/value-breakdown";
import type { CharacterDoc, SessionState } from "@/types/character";

export interface FadingPenaltyDef {
  /** The penalty the source imposes when it starts. */
  readonly start: number;
  /** The catalogue entry that imposes it (names the breakdown row). */
  readonly ref: { readonly kind: "spell"; readonly key: string };
}

/** Every source of a fading penalty, keyed by its catalogue id. */
export const FADING_PENALTIES: Readonly<Record<string, FadingPenaltyDef>> = {
  "raise-dead": { start: 4, ref: { kind: "spell", key: "raise-dead" } },
};

type FadingPenalties = SessionState["fadingPenalties"];

function withEntry(
  penalties: FadingPenalties,
  id: string,
  amount: number
): FadingPenalties {
  const next = Object.fromEntries(
    Object.entries(penalties ?? {}).filter(([key]) => key !== id)
  );
  if (amount > 0) next[id] = amount;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Start (or restart) a fading penalty at its full amount. Null for an unknown source
 *  or one already at full strength. */
export function startFadingPenalty(doc: CharacterDoc, id: string): SessionState | null {
  const def = FADING_PENALTIES[id];
  if (!def || doc.session.fadingPenalties?.[id] === def.start) return null;
  return {
    ...doc.session,
    fadingPenalties: withEntry(doc.session.fadingPenalties, id, def.start),
  };
}

/** Set a fading penalty's remaining amount (0 ends it) — the undo of a start or an
 *  end. Null when nothing changes. */
export function setFadingPenalty(
  doc: CharacterDoc,
  id: string,
  amount: number
): SessionState | null {
  const next = Math.max(0, Math.round(amount));
  if ((doc.session.fadingPenalties?.[id] ?? 0) === next) return null;
  return {
    ...doc.session,
    fadingPenalties: withEntry(doc.session.fadingPenalties, id, next),
  };
}

/** End a fading penalty early (a table ruling). Null when it is not running. */
export function endFadingPenalty(doc: CharacterDoc, id: string): SessionState | null {
  return setFadingPenalty(doc, id, 0);
}

/** The Long Rest law: every penalty drops by 1; a spent one disappears. */
export function fadingPenaltiesAfterLongRest(
  penalties: FadingPenalties
): FadingPenalties {
  let next: FadingPenalties = penalties;
  for (const [id, amount] of Object.entries(penalties ?? {})) {
    next = withEntry(next, id, amount - 1);
  }
  return next;
}

function running(penalties: FadingPenalties): Array<[FadingPenaltyDef, number]> {
  return Object.entries(penalties ?? {}).flatMap(([id, amount]) => {
    const def = FADING_PENALTIES[id];
    return def && amount > 0 ? [[def, amount] as [FadingPenaltyDef, number]] : [];
  });
}

/**
 * The running penalties as the flat grants saves, checks, initiative and spell
 * attacks already sum. Weapon and unarmed attack rows take theirs through the
 * attack resolver's to-hit penalty instead ({@link fadingD20Penalty}), beside
 * Exhaustion's, so every attack row carries it.
 */
export function resolveFadingPenaltySources(penalties: FadingPenalties): GrantSource[] {
  return running(penalties).map(([def, amount]) => ({
    id: def.ref.key,
    ref: { ...def.ref },
    grants: [
      { type: "spell-attack-bonus", amount: -amount, scope: "all" },
      { type: "save-bonus", amount: -amount },
      {
        type: "ability-check-bonus",
        appliesTo: "all-checks",
        value: -amount,
        min: -amount,
      },
      { type: "initiative-bonus", amount: -amount },
    ] satisfies Grant[],
  }));
}

/** The total attack-roll penalty of the running penalties (≤ 0). */
export function fadingD20Penalty(penalties: FadingPenalties): number {
  return running(penalties).reduce((sum, [, amount]) => sum - amount, 0);
}

/** One breakdown row per running penalty, named by the imposing spell. */
export function fadingPenaltyParts(penalties: FadingPenalties): RawBreakdownPart[] {
  return running(penalties).map(([def, amount]) =>
    locPart(srdText(def.ref.kind, def.ref.key, "name"), -amount)
  );
}
