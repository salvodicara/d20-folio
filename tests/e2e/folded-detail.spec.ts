/**
 * A folded section's controls are out of reach (#1222). The fold is a 0-px clip box; its
 * content kept real boxes, so Tab walked into controls nobody could see (the campaign
 * Journal's older evenings, the folded notes and ledger) and a screen reader read them.
 * Closed folds are `inert` and stop painting; the Tab order skips them.
 */
import { test, expect } from "@playwright/test";

test("Tab never lands inside a closed fold, and a folded control is not in the accessibility tree", async ({
  page,
}) => {
  await page.goto("/campaigns/mock-1");
  await page.getByRole("tab", { name: "Journal" }).click();
  const closed = page.locator(".section-detail-wrap:not([data-open]) .section-detail");
  await expect(closed.first()).toBeAttached();
  // The folds hold real controls: the test is about reaching them, not about emptiness.
  expect(await closed.locator("button, a, input, textarea").count()).toBeGreaterThan(0);

  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press("Tab");
    const inFold = await page.evaluate(
      () => !!document.activeElement?.closest(".section-detail-wrap:not([data-open])")
    );
    expect(inFold, `Tab stop ${i + 1} is inside a closed fold`).toBe(false);
  }
  // Hidden from assistive technology: no role query finds a folded control.
  await expect(closed.getByRole("button")).toHaveCount(0);
});
