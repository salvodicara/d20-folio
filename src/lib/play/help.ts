/**
 * The Help action (SRD 5.2.1 "Help [Action]"): the use names one creature, never
 * yourself. An ally gets Advantage on their next ability check (Assist an Ability
 * Check); an enemy within 5 feet gives your allies Advantage on their next attack
 * roll against it (Assist an Attack Roll). Either benefit expires at the start of
 * your next turn. The roll stays at the table; the sheet names and logs the pick.
 */

/** The Help base action's stable id (`BASE_ACTIONS`). */
export const HELP_ACTION_ID = "base-help";

/** One creature in the encounter, as the sheet's roster knows it. */
export interface HelpRosterRow {
  id: string;
  kind: "pc" | "monster";
  side?: "ally" | "enemy";
  name: string;
}

export type HelpBenefit =
  | { kind: "check"; name: string }
  | { kind: "attack"; name: string };

/** Which Help option the pick is, and who it names; null when nobody is named. */
export function helpBenefit(
  targets: ReadonlyArray<string>,
  rows: ReadonlyArray<HelpRosterRow>
): HelpBenefit | null {
  const row = rows.find((candidate) => candidate.id === targets[0]);
  if (!row) return null;
  const side = row.side ?? (row.kind === "pc" ? "ally" : "enemy");
  return { kind: side === "ally" ? "check" : "attack", name: row.name };
}
