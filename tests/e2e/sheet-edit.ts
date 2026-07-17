/**
 * Shared e2e helper: enter the sheet's EDIT mode through whichever management home
 * the current viewport renders.
 *
 * Two homes expose the ✎ Edit control differently (both owner-ratified):
 *   • Desktop BinderFob (fine pointer ≥768px): the `.fob-edit` coin IS a direct
 *     "Edit" button, always present.
 *   • Phone Signet (coarse pointer / compact): the Edit coin lives INSIDE the
 *     bloomed chain — you tap the seal FAB (aria "Sheet tools") to bloom it first.
 *
 * Home-agnostic by construction: if the "Edit" button is not already showing, we
 * bloom the Signet's seal, then click Edit. So it works on either project AND at
 * any width (e.g. the tablet band under the coarse-pointer mobile project, where
 * the Signet — not the fob — renders even at 768–834px).
 */

import { expect, type Page } from "@playwright/test";

/** Reveal + click the ✎ Edit control for whichever home is mounted, then confirm
 *  the sheet is in edit mode. */
export async function enterSheetEdit(page: Page): Promise<void> {
  const editBtn = page.getByRole("button", { name: /^edit$/i }).first();
  if (!(await editBtn.isVisible())) {
    // Phone Signet: bloom the seal chain so the ✎ Edit coin mounts.
    await page
      .getByRole("button", { name: /^sheet tools$/i })
      .first()
      .click();
  }
  await editBtn.click();
  await expect(page.locator('.content[data-mode="edit"]')).toBeVisible();
}
