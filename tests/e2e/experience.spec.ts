/**
 * E2E: optional experience points in the sheet header.
 *
 * Lyra Voss (Bard 9, no XP set) shows no XP line in play; edit mode offers the
 * empty field; a total is typed in place and reads "N / 64,000 XP" with a progress
 * pool; reaching level 10's threshold shows the ready cue and marks the Level-Up
 * chip, which still only navigates — nothing levels by itself. Clearing the field
 * removes the line again (back to milestone levelling). Italian dark shots
 * (desktop + mobile) land in the test output dir.
 */

import { test, expect, type Page } from "@playwright/test";
import { enterSheetEdit } from "./sheet-edit";
import { seedLang, seedUI } from "./surfaces";

const XP = /^(experience points|punti esperienza)$/i;

async function setXp(page: Page, value: number): Promise<void> {
  await page.getByRole("button", { name: XP }).click();
  const input = page.getByRole("spinbutton", { name: XP });
  await input.fill(String(value));
  await input.press("Enter");
}

test.describe("Experience points", () => {
  test("XP is absent until set, edits in place, and cues the level-up", async ({
    page,
  }) => {
    await seedLang(page, "en");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/mock-1");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible({ timeout: 20000 });

    // Milestone default: no XP anywhere on the sheet.
    await expect(page.getByRole("button", { name: XP })).toHaveCount(0);

    await enterSheetEdit(page);
    await expect(page.getByRole("button", { name: XP })).toHaveText("—");
    await setXp(page, 50000);
    await expect(page.getByText("/ 64,000 XP")).toBeVisible();
    await expect(page.getByRole("button", { name: XP })).toHaveText("50,000");
    await expect(page.getByRole("progressbar", { name: XP })).toHaveAttribute(
      "aria-valuenow",
      "13"
    );
    await expect(page.getByText("Ready to level up")).toHaveCount(0);
    await expect(page.locator(".lvl-chip")).not.toHaveAttribute("data-ready", "");

    // Back in play, the set total stays and stays editable (golden rule 7).
    await page.keyboard.press("Escape");
    await expect(page.locator('.content[data-mode="edit"]')).toHaveCount(0);
    await setXp(page, 64000);
    await expect(page.getByText("Ready to level up")).toBeVisible();
    await expect(page.locator(".lvl-chip")).toHaveAttribute("data-ready", "");
    // The cue never levels: still level 9, the chip still offers level 10.
    await expect(page.locator(".lvl-chip")).toHaveText(/level 10/i);

    // Clearing the field returns the table to milestone levelling: the XP line
    // disappears in play exactly like on a character that never set it.
    await page.getByRole("button", { name: XP }).click();
    const input = page.getByRole("spinbutton", { name: XP });
    await input.fill("");
    await input.press("Enter");
    await expect(page.getByRole("button", { name: XP })).toHaveCount(0);
    await expect(page.getByText("Ready to level up")).toHaveCount(0);
    await expect(page.locator(".lvl-chip")).not.toHaveAttribute("data-ready", "");
    // Edit mode offers the empty field again, as before any total was set.
    await enterSheetEdit(page);
    await expect(page.getByRole("button", { name: XP })).toHaveText("—");
  });

  for (const [device, size] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    test(`Italian dark shots (${device}): unset in edit, progress, ready`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await seedLang(page, "it");
      // Opens straight into edit mode (the Edit control's label is localized).
      await seedUI(page, "dark", "edit");
      await page.goto("/characters/mock-1");
      await expect(page.getByText("Lyra Voss").first()).toBeVisible({ timeout: 20000 });
      const header = page.locator("header.folio-panel").first();
      // At rest: no hover or focus frame on the field just edited.
      const shot = async (name: string) => {
        await page.mouse.move(0, 0);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await header.screenshot({
          path: test.info().outputPath(`xp-${device}-${name}.png`),
        });
      };

      await shot("edit-unset");

      await setXp(page, 52450);
      await page.keyboard.press("Escape");
      await expect(page.getByText("/ 64.000 PE")).toBeVisible();
      await shot("progress");

      await setXp(page, 64000);
      await expect(page.getByText("Pronto a salire di livello")).toBeVisible();
      await shot("ready");
    });
  }
});
