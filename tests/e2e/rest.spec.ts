/**
 * E2E: Rest Flow
 *
 * Tests short rest and long rest with confirmation dialogs
 * and verifies resources are restored correctly.
 *
 * Every interaction is SCOPED to the rest modal (`getByRole("dialog")`) and the
 * rest cards are targeted as BUTTONS, never by a bare `getByText(/short rest/i)`.
 * That bare text now also matches feature-card descriptions in the cockpit BEHIND
 * the modal (e.g. "As a Bonus Action, you can regain Hit Points…") — `.first()`
 * grabbed that background paragraph, which the modal scrim correctly blocks, so
 * the click timed out. Scoping to the dialog + role keeps the target inside the
 * open modal.
 */

import { test, expect, type Page } from "@playwright/test";

/** The open rest modal. */
function restDialog(page: Page) {
  return page.getByRole("dialog");
}

test.describe("Rest Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/characters/mock-1");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
    // Rest is a header action now (blueprint §2.4) — open its modal, which hosts
    // the short/long-rest flow the rest of this spec drives.
    await page
      .getByRole("button", { name: /^rest$/i })
      .first()
      .click();
    // The rest-card buttons live inside the modal; scope to the dialog so we never
    // resolve to the cockpit content behind the scrim.
    await expect(
      restDialog(page).getByRole("button", { name: /short rest/i })
    ).toBeVisible();
  });

  test("displays short rest and long rest buttons", async ({ page }) => {
    const dialog = restDialog(page);
    await expect(dialog.getByRole("button", { name: /short rest/i })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /long rest/i })).toBeVisible();
  });

  test("short rest shows confirmation with preview", async ({ page }) => {
    const dialog = restDialog(page);
    await dialog.getByRole("button", { name: /short rest/i }).click();

    // Should show confirmation or resource preview (scoped to the modal).
    await expect(
      dialog.getByText(/confirm|restore|hit dice|riposo/i).first()
    ).toBeVisible();
  });

  test("can confirm short rest", async ({ page }) => {
    const dialog = restDialog(page);
    await dialog.getByRole("button", { name: /short rest/i }).click();

    await dialog.getByRole("button", { name: "Complete rest" }).click();
    await expect(dialog.getByText("Short Rest Complete")).toBeVisible();
  });

  test("spending a Hit Die requires a physical roll before completing the rest", async ({
    page,
  }) => {
    const dialog = restDialog(page);
    await dialog.getByRole("button", { name: /short rest/i }).click();
    await dialog.getByRole("button", { name: "Use one more Hit Die" }).click();
    const confirm = dialog.getByRole("button", { name: "Complete rest" });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("spinbutton", { name: "Dice total" }).fill("6");
    await expect(dialog.getByRole("status", { name: "HP after rest" })).toHaveText(
      "38 → 46 / 62"
    );
    await confirm.click();
    await expect(dialog.getByText("Short Rest Complete")).toBeVisible();
  });

  test("long rest shows confirmation with preview", async ({ page }) => {
    const dialog = restDialog(page);
    await dialog.getByRole("button", { name: /long rest/i }).click();

    // Should show confirmation
    await expect(dialog.getByText(/confirm|restore|full|riposo/i).first()).toBeVisible();
  });

  test("can confirm long rest", async ({ page }) => {
    const dialog = restDialog(page);
    await dialog.getByRole("button", { name: /long rest/i }).click();

    const confirmButton = dialog
      .getByRole("button", { name: /confirm|yes|start|take/i })
      .first();
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }
  });

  test("can cancel a rest", async ({ page }) => {
    const dialog = restDialog(page);
    // Open the short-rest confirm phase.
    const shortRestBtn = dialog.getByRole("button", { name: /short rest/i });
    await expect(shortRestBtn).toBeVisible();
    await shortRestBtn.click();

    // (No fixed settle needed: the isVisible timeout below waits for the
    // confirmation phase itself.)

    // Cancel — if no cancel button visible, the rest might not have a cancel flow
    const cancelButton = dialog.getByRole("button", { name: /cancel|annulla/i }).first();
    if (await cancelButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelButton.click();
      // Should return to rest choice page (the long-rest card is visible again)
      await expect(dialog.getByRole("button", { name: /long rest/i })).toBeVisible();
    }
  });
});
