/**
 * E2E: every painted avatar fills its slot exactly, never spilling past the frame
 * (owner, 2026-11-08: the fight's paintings ran below their gold frame on a phone).
 * Checked in real Chromium at phone and desktop width on the three places the slot is
 * used: the campaign fight's initiative rows, its «Aggiungi mostri» sheet, and the
 * Play rows of a character sheet.
 */
import { expect, test, type Page } from "@playwright/test";
import { seedLang } from "./surfaces";

test.describe.configure({ timeout: 180_000 });

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/** Each slot image's box against the inside of its slot's frame, in px. */
async function spills(page: Page, scope: string) {
  // Lazy images below the fold never load here; the ones that have loaded are measured.
  await page.waitForFunction(
    (s) =>
      [...document.querySelectorAll<HTMLImageElement>(`${s} .f-act-slot img`)].some(
        (i) => i.complete && i.naturalWidth > 0
      ),
    scope,
    { timeout: 90_000 }
  );
  return page.evaluate((s) => {
    const out: string[] = [];
    for (const img of document.querySelectorAll<HTMLImageElement>(
      `${s} .f-act-slot img`
    )) {
      const slot = img.closest(".f-act-slot");
      if (!slot || !img.complete || img.naturalWidth === 0) continue;
      const cs = getComputedStyle(slot);
      const r = slot.getBoundingClientRect();
      const inner = {
        left: r.left + parseFloat(cs.borderLeftWidth),
        top: r.top + parseFloat(cs.borderTopWidth),
        right: r.right - parseFloat(cs.borderRightWidth),
        bottom: r.bottom - parseFloat(cs.borderBottomWidth),
      };
      const i = img.getBoundingClientRect();
      const off = Math.max(
        Math.abs(i.left - inner.left),
        Math.abs(i.top - inner.top),
        Math.abs(i.right - inner.right),
        Math.abs(i.bottom - inner.bottom)
      );
      if (off > 1.5 || Math.abs(r.width - r.height) > 1.5)
        out.push(
          `${img.src.split("/").at(-1)}: img ${Math.round(i.width)}×${Math.round(i.height)} in slot ${Math.round(r.width)}×${Math.round(r.height)}`
        );
    }
    return out;
  }, scope);
}

for (const vp of VIEWPORTS) {
  test(`fight avatars fill their slots (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seedLang(page, "it");
    await page.addInitScript(() =>
      window.localStorage.setItem("d20-dev-encounter", "table")
    );
    await page.goto("/campaigns/DEVCAMPAIGN24");
    await page
      .getByRole("tab", { name: /Scontro/ })
      .first()
      .click({ timeout: 90_000 });
    expect(await spills(page, ".f-fight")).toEqual([]);

    await page.locator(".f-pnh .f-btn").first().click();
    await page.locator("dialog[open] input").first().fill("gob");
    expect(await spills(page, "dialog[open] .f-dm-list")).toEqual([]);
  });

  test(`Play row avatars fill their slots (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seedLang(page, "it");
    await page.goto("/characters/team-bard");
    expect(await spills(page, "main")).toEqual([]);
  });
}
