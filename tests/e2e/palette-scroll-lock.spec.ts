/**
 * palette-scroll-lock — opening the ⌘K palette (and every Radix dialog) must NOT blink the
 * page scrollbar or shift the layout.
 *
 * The bug (owner, macOS desktop with visible custom scrollbars): opening the palette made the
 * main page's scrollbar THUMB vanish (and reappear on close) — a perceived "jump". Root cause:
 * <html> is the scrolling element and was `overflow: visible`, so react-remove-scroll's lock
 * (`body { overflow: hidden }`) PROPAGATED up to the viewport (the CSS overflow-propagation
 * rule) and removed the scrollbar. `scrollbar-gutter: stable` held the geometry steady (no
 * horizontal shift) but could not keep the thumb painted. The fix owns the viewport scrollbar
 * on <html> (`overflow-y: auto`) so the lock's body-overflow no longer propagates.
 *
 * These assertions are deterministic (no reliance on macOS classic-scrollbar pixels, which
 * headless Chromium renders as overlay): (1) NO horizontal geometry delta on open — the
 * `scrollbar-gutter` guarantee; (2) the viewport scrollbar stays governed by <html> and is NOT
 * removed on open (the page remains overflowing + <html> overflow is not `hidden`) — the
 * thumb-blink fix; (3) the scroll LOCK still holds — a wheel over the scrimmed background does
 * not move the page.
 */

import { test, expect } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

test.describe("⌘K palette scroll-lock", () => {
  test("opening the palette shifts no geometry, keeps the scrollbar, and still locks scroll", async ({
    page,
  }) => {
    await seedUI(page, "dark", "play");
    await seedLang(page, "en");
    // A short viewport over a long surface guarantees the page overflows (a scrollbar exists).
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.goto("/compendium");
    await page.waitForLoadState("networkidle");

    const probe = () =>
      page.evaluate(() => {
        const html = document.documentElement;
        const cs = getComputedStyle(html);
        return {
          gutter: window.innerWidth - html.clientWidth,
          mainWidth: Math.round(
            document.querySelector("#main")?.getBoundingClientRect().width ?? -1
          ),
          overflows: html.scrollHeight > html.clientHeight,
          htmlOverflowY: cs.overflowY,
        };
      });

    const before = await probe();
    expect(before.overflows).toBe(true); // the page genuinely scrolls (a thumb exists)

    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    const during = await probe();

    // (1) No horizontal geometry shift — scrollbar-gutter holds the reservation.
    expect(during.gutter).toBe(before.gutter);
    expect(during.mainWidth).toBe(before.mainWidth);
    // (2) The viewport scrollbar is NOT removed: <html> still governs it (not `hidden`) and
    //     the page still overflows, so the classic thumb stays painted — no open/close blink.
    expect(during.htmlOverflowY).toBe("auto");
    expect(during.overflows).toBe(true);

    // (3) The lock still holds — a wheel over the scrimmed background does not scroll the page.
    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBe(y0);
  });
});
