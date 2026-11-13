/**
 * The short evening the session-report rehearsals play on both UIs
 * (`08-session-report.spec.ts`, `classic-session-report.spec.ts`), and the automatic
 * report it must leave. Nobody starts a campaign fight: Paladin swings and marks the
 * hit, Bard swings and ignores the result chips, casts a levelled spell from a higher
 * slot, spends a Bardic Inspiration die by hand, takes a hit and short-rests on a Hit
 * Die. The report works the fight out from the blows (`infer-fights.ts`): one fight
 * holding every line up to the hit, then the rest outside it.
 */
import { expect, type Page } from "@playwright/test";
import { BARD_NAME, PALADIN_NAME } from "./helpers";

export const PALADIN_WEAPON = "Rapier";
/** The plain row (the thrown one, if listed apart, is another row). */
export const BARD_WEAPON = "Dagger";
/** A level 1 spell; Bard 3 has level 2 slots. A damaging save spell, so it is a blow. */
export const UPCAST_SPELL = "Dissonant Whispers";
export const UPCAST_SLOT = 2;
export const RESOURCE = "Bardic Inspiration";
export const HIT_DAMAGE = 7;
export const DAMAGE_TAKEN = 9;
/** One d8 Hit Die, its roll typed as at the table. */
export const HIT_DIE_ROLL = 5;
/** Bard's Constitution 14: the die heals its roll + 2 (below the 9 taken, no cap). */
export const HIT_DIE_HEAL = HIT_DIE_ROLL + 2;

/** The inferred fight's lines, in the order they were played. */
export function fightLines(): string[] {
  return [
    `${PALADIN_NAME} uses ${PALADIN_WEAPON} — hit, ${String(HIT_DAMAGE)} damage`,
    // Ignored chips: today's plain line.
    `${BARD_NAME} uses ${BARD_WEAPON}`,
    `${BARD_NAME} casts ${UPCAST_SPELL} (level ${String(UPCAST_SLOT)} slot)`,
    `${BARD_NAME} spends one use of ${RESOURCE}`,
    `${BARD_NAME} takes ${String(DAMAGE_TAKEN)} damage`,
  ];
}

/** The rest, after the fight and outside it, with what it gave back (#1142). */
export function restLine(): string {
  return `${BARD_NAME} takes a short rest: +${String(HIT_DIE_HEAL)} HP, 1 Hit Die`;
}

/** The copied (and classic) report's heading for the one fight nobody started. */
export const INFERRED_HEADING = "Encounter 1 (inferred)";

/** A heading and the lines under it, as one report section reads. */
export interface ReportSection {
  heading: string;
  lines: string[];
  /** A fight's round headings («Round 2»), once it reached a second round. */
  rounds?: string[];
}

/** Text as read, with the non-breaking spaces the UI ties words with made plain. */
export function plain(text: string): string {
  return text.replace(/\u00a0/g, " ").trim();
}

/** The report's markdown (`## heading`, `### round`, `- line`) as its sections. */
export function markdownSections(markdown: string): ReportSection[] {
  const sections: ReportSection[] = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## "))
      sections.push({ heading: plain(line.slice(3)), lines: [] });
    else if (line.startsWith("### ")) {
      const section = sections.at(-1);
      if (section) (section.rounds ??= []).push(plain(line.slice(4)));
    } else if (line.startsWith("- ")) sections.at(-1)?.lines.push(plain(line.slice(2)));
  }
  return sections;
}

/** What a report must never show: an open question, a newer app's placeholder, a
 *  name or source it could not resolve, a raw id or translation key. */
const DANGLING: ReadonlyArray<[RegExp, string]> = [
  [/Who struck\?/, "an unanswered «Who struck?»"],
  [/newer version of the app/, "a line from a newer version"],
  [/\bSomeone\b/, "an unresolved name"],
  [/\b(uses|casts) something\b/, "an unresolved source"],
  [/\bpc-[\w-]+/, "a raw combatant id"],
  [/bard-bardic-inspiration/, "a raw tracker id"],
  [/\b(sessionReport|combatLog|combatChronicle|diary)\.\w/, "a translation key"],
  [/\{\{/, "an unfilled placeholder"],
];

export function expectNothingDangling(sections: readonly ReportSection[]): void {
  const text = sections.flatMap((s) => [s.heading, ...s.lines]).join("\n");
  for (const [pattern, what] of DANGLING)
    expect.soft(text, `the report shows no ${what}`).not.toMatch(pattern);
}

/** The fight and the rest, checked on the sections a report shows. `isFight` tells a
 *  fight's heading; `fightHeading`, when given, is the one it must read. */
export function expectEvening(
  sections: readonly ReportSection[],
  options: { isFight: (heading: string) => boolean; fightHeading?: string }
): void {
  const fights = sections.filter((s) => options.isFight(s.heading));
  expect(
    fights.map((s) => s.heading),
    "exactly one fight, the inferred one"
  ).toHaveLength(1);
  const fight = fights[0];
  if (options.fightHeading) expect(fight?.heading).toBe(options.fightHeading);
  expect(fight?.lines, "the fight's lines, in play order").toEqual(fightLines());
  const after = sections.slice(sections.indexOf(fight as ReportSection) + 1);
  expect(
    after.flatMap((s) => s.lines),
    "the rest comes after the fight, outside it"
  ).toContain(restLine());
}

/**
 * Hit · Miss · Critical on the row just used (`AttackOutcomeChips`, the same on both
 * UIs): Hit, then the damage typed and entered.
 */
export async function markHit(page: Page, amount: number): Promise<void> {
  const result = page.getByRole("group", { name: "Result", exact: true });
  const hit = result.getByRole("button", { name: "Hit", exact: true });
  await hit.click();
  await expect(hit).toHaveAttribute("aria-pressed", "true");
  const field = result.getByRole("textbox");
  await field.fill(String(amount));
  await field.press("Enter");
  await expect.soft(field, "the damage stays on the row").toHaveValue(String(amount));
}

/** The result chips the last attack offered (none once another action was used). */
export function resultChips(page: Page) {
  return page.getByRole("group", { name: "Result", exact: true });
}
