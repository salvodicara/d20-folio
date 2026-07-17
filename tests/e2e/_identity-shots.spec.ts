/**
 * IDENTITY SWEEP — the reusable owner-preview capture harness (rule 25).
 * Not a CI test: env-gated (skipped unless SHOT_DIR is set), it walks every major
 * surface × both themes × desktop/mobile (+ IT spot checks + modal chrome) and
 * writes PNGs for a visual/identity review. Re-run it whenever the identity or
 * theme system changes; keep it generic (add surfaces here, never fork a copy).
 * Run: SHOT_DIR=/path pnpm exec playwright test _identity-shots --project=chromium
 */

import { test, type Page } from "@playwright/test";
import path from "path";
import {
  seedUI,
  seedLang,
  freezeMotion,
  DESKTOP,
  MOBILE,
  type Theme,
  type Locale,
} from "./surfaces";
import { waitForStableLayout } from "./ready";

const OUT = process.env.SHOT_DIR ?? "";
const shot = (name: string) => path.join(OUT, `${name}.png`);

test.skip(!OUT, "shot harness — set SHOT_DIR to run");

/** The major surfaces of the identity sweep. */
const SURFACES: ReadonlyArray<{ slug: string; route: string; fullPage?: boolean }> = [
  { slug: "login", route: "/login" },
  { slug: "roster", route: "/characters" },
  { slug: "cockpit", route: "/characters/mock-1" },
  { slug: "creation", route: "/characters/new" },
  { slug: "level-up", route: "/characters/mock-1/level-up" },
  { slug: "compendium", route: "/compendium?type=spell&sel=fireball" },
  { slug: "campaigns", route: "/campaigns" },
  { slug: "campaign-hub", route: "/campaigns/mock-1", fullPage: true },
  { slug: "settings", route: "/settings" },
  { slug: "admin", route: "/admin" },
];

async function load(
  page: Page,
  route: string,
  theme: Theme,
  locale: Locale,
  vp: { width: number; height: number }
): Promise<void> {
  await page.setViewportSize(vp);
  await seedUI(page, theme, "play");
  await seedLang(page, locale);
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { level: 1 })
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => undefined);
  await freezeMotion(page);
  await waitForStableLayout(page);
}

test("identity sweep — dark+light EN desktop", async ({ page }) => {
  test.setTimeout(600_000);
  for (const theme of ["dark", "light"] as const) {
    for (const s of SURFACES) {
      await load(page, s.route, theme, "en", DESKTOP);
      await page.screenshot({
        path: shot(`${s.slug}-${theme}-en-desktop`),
        fullPage: s.fullPage ?? false,
      });
    }
  }
});

test("identity sweep — dark+light EN mobile", async ({ page }) => {
  test.setTimeout(600_000);
  for (const theme of ["dark", "light"] as const) {
    for (const s of SURFACES) {
      await load(page, s.route, theme, "en", MOBILE);
      await page.screenshot({
        path: shot(`${s.slug}-${theme}-en-mobile`),
        fullPage: false,
      });
    }
  }
});

test("identity sweep — IT spot checks", async ({ page }) => {
  test.setTimeout(300_000);
  const spots = SURFACES.filter((s) =>
    ["login", "roster", "cockpit", "compendium", "settings"].includes(s.slug)
  );
  for (const theme of ["dark", "light"] as const) {
    for (const s of spots) {
      await load(page, s.route, theme, "it", DESKTOP);
      await page.screenshot({ path: shot(`${s.slug}-${theme}-it-desktop`) });
    }
  }
});

test("identity — modal chrome (dark+light)", async ({ page }) => {
  test.setTimeout(180_000);
  for (const theme of ["dark", "light"] as const) {
    await load(page, "/campaigns", theme, "en", DESKTOP);
    const createBtn = page
      .getByRole("button", {
        name: /new campaign|nuova campagna|create campaign|crea campagna/i,
      })
      .first();
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
      await page.getByRole("dialog").waitFor({ timeout: 5000 });
      await waitForStableLayout(page);
      await page.screenshot({ path: shot(`modal-create-campaign-${theme}`) });
      await page.keyboard.press("Escape");
    }
  }
});
