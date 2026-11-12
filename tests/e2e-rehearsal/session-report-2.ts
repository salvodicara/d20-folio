/**
 * The second session-report evening, played on both UIs (`09-session-report-2.spec.ts`,
 * `classic-session-report-2.spec.ts`): the report features the first evening
 * (`session-report.ts`) leaves out. In play order:
 *
 * 1. Saves: Bard casts two save spells with nobody named and marks each save on the
 *    row just used (#1150): one failed, one saved, each with its damage.
 * 2. Level-up: Paladin goes from level 3 to 4 (#1142, #1155).
 * 3. A started campaign fight: initiative rolled, turns passed into round 2, one blow
 *    in each round, then ended. Never marked inferred; its heading tells its end.
 * 4. A solo fight: Paladin starts one on their own sheet, Bard strikes once, Paladin
 *    ends it. One blow is below the usual threshold, but the solo start alone makes it
 *    an inferred fight (`infer-fights.ts`).
 * 5. A forgotten fight: a campaign fight started and never ended; the next line after a
 *    rest or an idle hour leaves it (`close-forgotten-fights.ts`).
 *
 * Each scene closes its own fight before the next starts, and Bard's two save spells
 * come from one player (an inferred fight needs two), so the scenes compose in one
 * evening: one sitting, one report, read once.
 */
import { expect, type Page } from "@playwright/test";
import { BARD_NAME, PALADIN_NAME } from "./helpers";
import { plain, type ReportSection } from "./session-report";
import { visibleWithin } from "../e2e/visible-within";

/** A cantrip with a Wisdom save and damage: the failed save. */
export const SAVE_CANTRIP = "Vicious Mockery";
export const FAILED_DAMAGE = 3;
/** A level 1 spell with a Wisdom save and damage (half on a success): the saved one. */
export const SAVE_SPELL = "Dissonant Whispers";
export const SAVE_SPELL_SLOT = 1;
export const SAVED_DAMAGE = 4;

export const PALADIN_WEAPON = "Rapier";
export const BARD_WEAPON = "Dagger";
export const FIGHT_HIT = 7;
export const SOLO_HIT = 4;
export const LEVEL_TO = 4;
export const RESOURCE = "Bardic Inspiration";

/** The d20s the players type for their own initiative. */
export const BARD_D20 = 12;
export const PALADIN_D20 = 9;

/** A line as read: exact text, or a pattern for a number the app rolled itself. */
export type Line = string | RegExp;

export function savesLines(): string[] {
  return [
    `${BARD_NAME} casts ${SAVE_CANTRIP} — the target fails, ${String(FAILED_DAMAGE)} damage`,
    `${BARD_NAME} casts ${SAVE_SPELL} — the target saves, ${String(SAVED_DAMAGE)} damage`,
  ];
}

export function levelUpLine(): string {
  return `${PALADIN_NAME} reaches level ${String(LEVEL_TO)} (Paladin)`;
}

export function ownInitiative(name: string, total: number): string {
  return `${name} rolls initiative: ${String(total)}`;
}

/** The DM's «Roll for the missing» rolls the d20 itself: only its shape is known. */
export function dmInitiative(name: string): RegExp {
  return new RegExp(`^Initiative for ${escape(name)}, rolled by the DM: \\d+$`);
}

/** The started fight's blows: Paladin's hit in round 1, Bard's miss in round 2. */
export function fightBlows(): string[] {
  return [
    `${PALADIN_NAME} uses ${PALADIN_WEAPON} — hit, ${String(FIGHT_HIT)} damage`,
    `${BARD_NAME} uses ${BARD_WEAPON} — miss`,
  ];
}

/** The solo fight's one blow, by the other player. */
export function soloLines(): string[] {
  return [`${BARD_NAME} uses ${BARD_WEAPON} — hit, ${String(SOLO_HIT)} damage`];
}

export function spendLine(): string {
  return `${BARD_NAME} spends one use of ${RESOURCE}`;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The lines a report section shows, against the expected ones in order. */
export function expectLines(
  actual: readonly string[],
  expected: readonly Line[],
  what: string
): void {
  expect(actual, `${what}: how many lines`).toHaveLength(expected.length);
  expected.forEach((line, i) => {
    if (typeof line === "string")
      expect(actual[i], `${what}, line ${String(i + 1)}`).toBe(line);
    else expect(actual[i], `${what}, line ${String(i + 1)}`).toMatch(line);
  });
}

/** One expected section: its heading, its lines (`unordered`: written at once, in any
 *  order) and, for a fight that reached a second round, its round headings. */
export interface ExpectedSection {
  heading: Line;
  lines: readonly Line[];
  unordered?: boolean;
  rounds?: readonly string[];
}

/** The whole report, section by section: nothing more, nothing less. */
export function expectReport(
  sections: readonly ReportSection[],
  expected: readonly ExpectedSection[]
): void {
  expect(
    sections.map((s) => s.heading),
    "the report's sections, in play order"
  ).toHaveLength(expected.length);
  expected.forEach((want, i) => {
    const got = sections[i] as ReportSection;
    const what = `section ${String(i + 1)} («${got.heading}»)`;
    if (typeof want.heading === "string") expect(got.heading, what).toBe(want.heading);
    else expect(got.heading, what).toMatch(want.heading);
    if (want.unordered) {
      expect(got.lines, `${what}: how many lines`).toHaveLength(want.lines.length);
      for (const line of want.lines)
        expect(
          got.lines.some((l) => (typeof line === "string" ? l === line : line.test(l))),
          `${what} holds ${String(line)}`
        ).toBe(true);
    } else expectLines(got.lines, want.lines, what);
    if (want.rounds) expect(got.rounds ?? [], `${what}: its rounds`).toEqual(want.rounds);
  });
}

/** A clock time as the new UI's Journal prints it ("07:41 PM" or "19:41"). */
const TIME = String.raw`\d{1,2}:\d{2}(?:\s?[AP]M)?`;
/** A Journal block heading: its title and meta, then its time or time span. */
export function blockHeading(title: string, span: boolean): RegExp {
  return new RegExp(`^${escape(title)} · ${TIME}${span ? `–${TIME}` : ""}$`);
}

/** The new UI's Journal: each block's heading and lines, as the DM sees them. */
export async function journalBlocks(dm: Page): Promise<ReportSection[]> {
  const raw = await dm.locator("section.f-tl-block").evaluateAll((blocks) =>
    blocks.map((block) => ({
      heading: block.querySelector("h4")?.textContent ?? "",
      lines: [...block.querySelectorAll("p.f-tl")].map((p) => p.textContent),
    }))
  );
  return raw.map((b) => ({ heading: plain(b.heading), lines: b.lines.map(plain) }));
}

/** The classic hub's Journal: the newest sitting's «Automatic report», opened and read
 *  with its round headings. */
export async function classicJournalReport(
  dm: Page,
  campaign: string
): Promise<ReportSection[]> {
  await dm.goto(`/campaigns/${campaign}`);
  await dm.getByRole("tab", { name: "Journal" }).click();
  const toggle = dm.getByRole("button", { name: /^Automatic report/ }).last();
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const body = dm.locator(".sess-report-body").last();
  await expect(body).toBeVisible();
  const raw = await body.evaluate((root) => {
    const out: Array<{ heading: string; lines: string[]; rounds: string[] }> = [];
    const last = () => {
      if (out.length === 0) out.push({ heading: "", lines: [], rounds: [] });
      return out[out.length - 1] as {
        heading: string;
        lines: string[];
        rounds: string[];
      };
    };
    for (const el of Array.from(root.children)) {
      if (el.tagName === "H4")
        out.push({ heading: el.textContent, lines: [], rounds: [] });
      else if (el.tagName === "H5") last().rounds.push(el.textContent);
      else if (el.tagName === "UL")
        last().lines.push(
          ...Array.from(el.querySelectorAll("li")).map((li) => li.textContent)
        );
    }
    return out;
  });
  return raw.map((s) => ({
    heading: plain(s.heading),
    lines: s.lines.map(plain),
    ...(s.rounds.length > 0 ? { rounds: s.rounds.map(plain) } : {}),
  }));
}

/** Saved · Failed on a save spell cast with nobody named (#1150, the same on both UIs),
 *  then the damage it dealt, typed and entered. */
export async function markSave(
  page: Page,
  result: "Saved" | "Failed",
  amount: number
): Promise<void> {
  const save = page.getByRole("group", { name: "Save", exact: true });
  const chip = save.getByRole("button", { name: result, exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  const field = save.getByRole("textbox");
  await field.fill(String(amount));
  await field.press("Enter");
  await expect.soft(field, "the damage stays on the row").toHaveValue(String(amount));
}

/** Miss, on the attack row just used. */
export async function markMiss(page: Page): Promise<void> {
  const miss = page
    .getByRole("group", { name: "Result", exact: true })
    .getByRole("button", { name: "Miss", exact: true });
  await miss.click();
  await expect(miss).toHaveAttribute("aria-pressed", "true");
}

/** Wait for an optional dialog step and answer it, or pass when it never shows. */
export async function whenShown(
  locator: ReturnType<Page["locator"]>,
  answer: () => Promise<void>,
  ms = 3_000
): Promise<void> {
  if (await visibleWithin(locator, ms)) await answer();
}
