/**
 * E2E: tab selection never jumps (owner, 2026-07-31 — grilled).
 *
 * THE STANDARD (owner-ratified): clicking a FULLY VISIBLE tab moves NOTHING —
 * not the strip, not the page. Clicking a CLIPPED tab nudges ONLY the strip,
 * by the minimal nearest-edge delta; the window never scrolls either axis.
 * The regression this pins: scrollIntoView/native focus-scroll moving the
 * page (or re-centering the strip) on tab selection. Companion:
 * no-page-jump.spec.ts pins the 390px mobile cases of the same contract.
 */
import { test, expect } from "@playwright/test";
import { seedUI, seedLang, freezeMotion } from "./surfaces";

async function metrics(page: import("@playwright/test").Page, strip: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return {
      stripLeft: el.scrollLeft,
      winX: window.scrollX,
      winY: window.scrollY,
    };
  }, strip);
}

test("compendium: selecting a fully visible type moves nothing", async ({ page }) => {
  await seedLang(page, "en");
  await seedUI(page, "dark", "play");
  await freezeMotion(page);
  await page.goto("/compendium");
  const ribbon = ".cmp-ribbon";
  await page.waitForSelector(ribbon);
  // FEATURES sits beside SPELLS — fully visible at 1280px.
  const before = await metrics(page, ribbon);
  await page.getByRole("tab", { name: /features/i }).click();
  await page.waitForTimeout(250);
  const after = await metrics(page, ribbon);
  expect(after.winY, "window must not scroll vertically").toBe(before.winY);
  expect(after.winX, "window must not scroll horizontally").toBe(before.winX);
  expect(after.stripLeft, "strip must not move for a visible tab").toBe(before.stripLeft);
});

test("compendium: selecting a clipped type nudges ONLY the strip, minimally", async ({
  page,
}) => {
  // Keep this regression independent of the runner's desktop default: at 900px the
  // ribbon genuinely overflows, while remaining in the desktop layout under test.
  await page.setViewportSize({ width: 900, height: 800 });
  await seedLang(page, "en");
  await seedUI(page, "dark", "play");
  await freezeMotion(page);
  await page.goto("/compendium");
  const ribbon = ".cmp-ribbon";
  await page.waitForSelector(ribbon);
  const before = await metrics(page, ribbon);
  // The LAST type tab sits past the right edge at this explicit narrow-desktop width.
  const tabs = page.getByRole("tab");
  const last = tabs.last();
  await last.click();
  await page.waitForTimeout(350);
  const after = await metrics(page, ribbon);
  expect(after.winY, "window must not scroll vertically").toBe(before.winY);
  expect(after.winX, "window must not scroll horizontally").toBe(before.winX);
  // the strip DID move (the tab was clipped)…
  expect(after.stripLeft).toBeGreaterThan(before.stripLeft);
  // …by the MINIMAL nearest-edge delta: the tab's right edge now sits at (or
  // just inside) the ribbon's right edge — never centred.
  const gap = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`missing ${sel}`);
    const active = el.querySelector('[aria-selected="true"]');
    if (!active) throw new Error("no active tab");
    const c = el.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    return c.right - a.right;
  }, ribbon);
  expect(gap).toBeGreaterThanOrEqual(-1);
  expect(gap, "nearest-edge nudge, not centring").toBeLessThan(80);
});

test("cockpit: selecting a visible sheet tab moves nothing", async ({ page }) => {
  await seedLang(page, "en");
  await seedUI(page, "dark", "play");
  await freezeMotion(page);
  await page.goto("/characters/mock-1");
  const strip = ".tabstrip";
  await page.waitForSelector(strip);
  // scroll the page down a little so a block-axis reveal would be visible
  await page.evaluate(() => window.scrollTo(0, 40));
  const before = await metrics(page, strip);
  await page.getByRole("tab", { name: /spells/i }).click();
  await page.waitForTimeout(250);
  const after = await metrics(page, strip);
  expect(after.winY, "window must not scroll vertically").toBe(before.winY);
  expect(after.stripLeft, "strip must not move for a visible tab").toBe(before.stripLeft);
});

test("cockpit @ mobile: ribbon stays bound to its leaf without detached ground", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLang(page, "en");
  await seedUI(page, "dark", "play");
  await freezeMotion(page);
  await page.goto("/characters/mock-1");
  await page.getByText("Lyra Voss").first().waitFor();

  const shell = page.locator(".tabstrip-shell");
  const treatment = await shell.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      position: style.position,
      backdropFilter: style.backdropFilter,
      backgroundColor: style.backgroundColor,
    };
  });
  expect(treatment.position).toBe("relative");
  expect(treatment.backdropFilter).toBe("none");
  expect(treatment.backgroundColor).toBe("rgba(0, 0, 0, 0)");

  // The local ribbon belongs to the tome. It scrolls away with the leaf instead
  // of becoming a second floating navigation bar over the working document.
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect(shell).not.toBeInViewport();
});

test("compendium @ narrow, entry open: strip scroll survives a type switch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await seedLang(page, "en");
  await seedUI(page, "dark", "play");
  await freezeMotion(page);
  await page.goto("/compendium");
  const ribbon = ".cmp-ribbon";
  await page.waitForSelector(ribbon);
  // hand-scroll the ribbon far right (as a user hunting the last types does)
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`missing ${sel}`);
    el.scrollLeft = el.scrollWidth;
  }, ribbon);
  await page.waitForTimeout(120);
  const before = await metrics(page, ribbon);
  expect(before.stripLeft).toBeGreaterThan(0);
  // click a type tab that is FULLY VISIBLE at this scroll position (the last one)
  const lastTab = page.getByRole("tab").last();
  await lastTab.click();
  await page.waitForTimeout(300);
  const after = await metrics(page, ribbon);
  expect(after.winY, "window must not scroll").toBe(before.winY);
  expect(
    Math.abs(after.stripLeft - before.stripLeft),
    "the strip must keep its scroll position on type switch (no remount reset)"
  ).toBeLessThan(2);
});
