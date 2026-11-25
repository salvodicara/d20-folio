/**
 * E2E: Expertise follows the Bard table (SRD 5.2.1: two skills at Bard 2, two more at 9).
 *
 * - A Bard 9 the classic creation leaves without Expertise (`scn-bard-9-no-expertise`)
 *   is asked for 4 Expertise skills in «Choices to finish»; answering raises them and
 *   the banner goes.
 * - A Bard 8 holding its 2 (`scn-bard-8`) levels to 9 in the classic wizard: the step
 *   asks 2 more, offering only the proficient skills not yet at Expertise; afterwards
 *   the sheet owes nothing.
 */
import { expect, test, type Page } from "@playwright/test";

const BANNER = ".species-due";

async function openSheet(page: Page, id: string, name: RegExp) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/characters/${id}`);
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 20000 });
}

test.describe("Owed Expertise (Bard 2 + 9)", () => {
  test("a Bard 9 with none is asked for 4 Expertise skills, and answering clears it", async ({
    page,
  }) => {
    await openSheet(page, "scn-bard-9-no-expertise", /Pell, the Unpracticed/i);
    const banner = page.locator(BANNER);
    await expect(banner).toContainText("4 Expertise skills (Bard)");
    await banner.getByRole("button").last().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Choose 4 skills for Expertise/i)).toBeVisible();
    // The proficient skills are offered: Acrobatics, Deception, Insight, Performance,
    // Persuasion (three from the class, two from the Entertainer).
    for (const skill of ["Acrobatics", "Deception", "Insight", "Performance"]) {
      await dialog.getByRole("button", { name: skill, exact: true }).click();
    }
    await dialog.getByRole("button", { name: /^Save$/ }).click();
    await expect(banner).toHaveCount(0);
  });

  test("a Bard 8 levelling to 9 is asked 2 more, from its proficient skills", async ({
    page,
  }) => {
    await openSheet(page, "scn-bard-8", /Pell, the Practiced/i);
    await expect(page.locator(BANNER)).toHaveCount(0);
    await page.goto("/characters/scn-bard-8/level-up");
    await expect(page.getByText(/8 → 9/).first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "Continue to Choices" }).click();
    await expect(page.getByText(/Choose 2 skills for Expertise/i)).toBeVisible();
    // Performance and Persuasion are already at Expertise: never offered again.
    for (const held of ["Performance", "Persuasion"]) {
      await expect(page.getByRole("button", { name: held, exact: true })).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Acrobatics", exact: true }).click();
    await page.getByRole("button", { name: "Insight", exact: true }).click();
    // Walk the rest of the wizard (spells, swap, review) to its end, learning a spell
    // whenever the step still asks for one (the classic-journey rehearsal's walk).
    const next = page.locator(".wiz-pager-btn.next");
    for (let step = 0; step < 12; step++) {
      if (await page.locator(".wiz-done").isVisible()) break;
      // A spells step: «Pick N more» is the step's total (a fixed rubric, not a live
      // count), so learn exactly N, each by the read-then-Learn grammar.
      const rubric = page.getByText(/^Pick \d+ more$/).first();
      if (await rubric.isVisible()) {
        const total = Number((await rubric.innerText()).match(/\d+/)?.[0] ?? 0);
        for (let picked = 0; picked < total; picked++) {
          await page.locator(".wiz-entry:not([data-picked]) .wiz-row").first().click();
          await page
            .locator(".wiz-entry[data-open] .wiz-read-act button")
            .first()
            .click();
          await expect(page.locator(".wiz-entry[data-picked]")).toHaveCount(picked + 1);
        }
      }
      await expect(next).toBeEnabled();
      await next.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator(".wiz-done")).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "To the sheet" }).click();
    await expect(page).toHaveURL(/\/characters\/scn-bard-8$/, { timeout: 20000 });
    await expect(page.getByText(/Bard 9/).first()).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });
});
