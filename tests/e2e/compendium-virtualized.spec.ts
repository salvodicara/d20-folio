/**
 * Compendium result virtualization — REAL-Chromium proof (jsdom can't measure layout)
 * that the bestiary list WINDOWS its rows: only a bounded slice is mounted, yet the
 * ENTIRE pool stays reachable by scroll AND by keyboard — no cap, no ceiling.
 *
 * The list is `.cmp-list`; each mounted row carries a `data-index` (its absolute
 * position in the filtered pool), so we can prove the window slides across the whole
 * corpus without hard-coding any monster's name.
 */
import { test, expect, type Page } from "@playwright/test";

async function mountedIndices(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".cmp-list [data-vrow][data-index]")].map((el) =>
      Number((el as HTMLElement).dataset.index)
    )
  );
}

test.describe("compendium result list — virtualized (no ceiling)", () => {
  test("mounts a bounded window that slides across the FULL pool on scroll", async ({
    page,
  }) => {
    await page.goto("/compendium?type=monster");
    await expect(page.getByRole("searchbox")).toBeVisible();
    await page.locator(".cmp-list .pick-row").first().waitFor();

    // The truthful full count (from the tome head), and the bounded mounted window.
    const total = await page
      .locator(".cmp-index-count")
      .first()
      .evaluate((el) => Number(el.textContent.replace(/\D+/g, "")));
    expect(total).toBeGreaterThan(120); // the SRD+pack bestiary is large

    const atTop = await mountedIndices(page);
    // WINDOWED: far fewer rows are mounted than exist, and the top window starts at 0.
    expect(atTop.length).toBeGreaterThan(8);
    expect(atTop.length).toBeLessThan(total); // the whole pool is NOT in the DOM
    expect(Math.min(...atTop)).toBe(0);
    expect(Math.max(...atTop)).toBeLessThan(total - 1); // the tail is not mounted yet

    // Scroll to the BOTTOM — the window must slide to the tail (every row reachable).
    await page.locator(".cmp-list").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(async () => Math.max(...(await mountedIndices(page))))
      .toBeGreaterThan(total - 3); // the last rows are now mounted
    const atBottom = await mountedIndices(page);
    expect(atBottom.length).toBeLessThan(total); // still windowed, not the whole pool
    expect(Math.min(...atBottom)).toBeGreaterThan(10); // the head is unmounted now
  });

  test("keyboard ↓ reaches a row far past the initial window", async ({ page }) => {
    await page.goto("/compendium?type=monster");
    await expect(page.getByRole("searchbox")).toBeVisible();
    await page.locator(".cmp-list .pick-row").first().waitFor();

    // ↓ from the search field drops focus into the first row, then walks down. Paced
    // like a real held key (a ~25ms repeat) so the window re-mounts ahead of focus —
    // the property under test is that arrow-nav CROSSES the window, not raw throughput.
    await page.getByRole("searchbox").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".cmp-list .pick-row:focus")).toBeVisible();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(25);
    }

    // The focused row is now far down the pool — proving arrow-nav crosses the window
    // boundary (the overscan keeps the next row mounted, scroll follows focus).
    const focusedIndex = await page.evaluate(() => {
      const wrap = document
        .querySelector(".cmp-list .pick-row:focus")
        ?.closest("[data-index]");
      return wrap ? Number((wrap as HTMLElement).dataset.index) : -1;
    });
    expect(focusedIndex).toBeGreaterThan(30);
  });
});
