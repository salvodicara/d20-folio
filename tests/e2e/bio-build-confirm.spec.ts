/**
 * E2E: hero-header vital hints + the destructive-Bio-edit confirm modal.
 *
 * Owner 2026-06-08:
 *  - The PB/AC/INIT hover hints must trigger on the WHOLE vital box, not just the
 *    tiny label — so the native `title` lives on the `.vital` container.
 *  - A destructive Bio edit (changing class/subclass/species, or lowering level)
 *    must ask for confirmation in a modal ("warning that the choices made will be
 *    reset/lost"), like deleting a character. Cancel keeps the build; confirm
 *    applies it.
 */
import { test, expect } from "@playwright/test";

test.describe("Bio build edits — confirm + vital hints", () => {
  test("AC / INIT / PB hints sit on the whole vital box", async ({ page }) => {
    await page.goto("/characters/mock-1?tab=bio");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible({ timeout: 30000 });
    // The label text's enclosing `.vital` box carries the title (hover anywhere).
    for (const label of ["AC", "Init", "PB"]) {
      const box = page.locator(".vital", { hasText: label }).first();
      await expect(box).toHaveAttribute("title", /.+/);
    }
  });

  test("changing class asks to confirm; cancel keeps the old class", async ({ page }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem(
        "d20-folio-ui",
        JSON.stringify({ state: { theme: "dark", sheetMode: "edit" }, version: 0 })
      )
    );
    await page.goto("/characters/mock-1?tab=bio");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible({ timeout: 30000 });
    const classSelect = page.getByLabel("Class", { exact: true });
    await classSelect.selectOption({ label: "Wizard" });
    // The confirm modal appears, warning about the reset.
    await expect(page.getByText("Change build?")).toBeVisible();
    await expect(page.getByText(/resets dependent choices/i)).toBeVisible();
    // Cancel → the class stays Bard (Lyra is a Bard); the change is NOT applied.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Change build?")).toBeHidden();
    await expect(classSelect).toHaveValue("bard");
  });
});
