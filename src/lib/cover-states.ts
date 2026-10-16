/**
 * Cover as a one-tap state (SRD 5.2.1 "Cover": Half Cover +2 and Three-Quarters
 * Cover +5 to AC and Dexterity saving throws). The player lights the level the
 * table agreed on; it holds until the start of their next turn or until tapped
 * off. Built from `COVER_REFERENCE`, so the numbers live in one place. Total
 * Cover adds no number (it only stops targeting), so it has no state.
 */
import { COVER_REFERENCE, type CoverEffect, type CoverLevel } from "@/data/cover";
import type { GrantSource } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";
import type { LocaleText } from "@/data/types";

export type CoverStateLevel = Exclude<CoverLevel, "total">;

export interface CoverState {
  level: CoverStateLevel;
  /** The cover table's row: its name and one-line summary. */
  reference: CoverEffect;
  grant: Extract<Grant, { type: "while-active" }>;
}

/** The stable active key a cover level lights (`cover-half`). */
export function coverStateKey(level: CoverStateLevel): string {
  return `cover-${level}`;
}

export const COVER_STATES: ReadonlyArray<CoverState> = COVER_REFERENCE.flatMap(
  (cover) => {
    if (cover.id === "total" || cover.acBonus === null) return [];
    const level: CoverStateLevel = cover.id;
    return [
      {
        level,
        reference: cover,
        grant: {
          type: "while-active",
          activeKey: coverStateKey(level),
          label: cover.name,
          duration: { kind: "turn-boundary", phase: "turn-start", turns: 1 },
          grants: [
            { type: "ac-bonus", amount: cover.acBonus },
            { type: "save-bonus", amount: cover.dexSaveBonus ?? 0, appliesToSave: "DEX" },
          ],
        },
      },
    ];
  }
);

/** The lit cover states as grant sources; an unlit level contributes nothing. */
export function resolveCoverStateSources(activeKeys: ReadonlySet<string>): GrantSource[] {
  return COVER_STATES.filter((state) => activeKeys.has(state.grant.activeKey)).map(
    (state) => ({ id: state.grant.activeKey, grants: [state.grant] })
  );
}

/** The cover level lit on the session, or null. */
export function litCoverLevel(session: {
  activeFeatures?: ReadonlyArray<string>;
}): CoverStateLevel | null {
  const active = session.activeFeatures ?? [];
  return (
    COVER_STATES.find((state) => active.includes(state.grant.activeKey))?.level ?? null
  );
}

/** The cover table's row for a level. */
export function coverReference(level: CoverStateLevel): CoverEffect | undefined {
  return COVER_STATES.find((state) => state.level === level)?.reference;
}

/** The bilingual name behind a cover key, for log lines and labels. */
export function coverStateName(key: string): LocaleText | undefined {
  const label = COVER_STATES.find((state) => state.grant.activeKey === key)?.grant.label;
  return label;
}
