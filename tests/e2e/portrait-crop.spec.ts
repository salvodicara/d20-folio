/**
 * E2E: Portrait crop flow — leak + crash regression.
 *
 * Owner-reported bug (the one this spec must catch): you import a character with
 * a portrait, open the sheet, and RE-CROP the picture. After the re-crop the
 * cropped image OVERFLOWS its tile — it spills up into the top bar on the sheet
 * and "takes the whole character card" in the roster. It behaves like a layout
 * leak, and historically the cropper could also white-screen the whole app
 * (recoverable only by deleting the character — data loss).
 *
 * Root cause: a cropped portrait is rendered as an OVER-SIZED `position:absolute`
 * `<img>`; it is only clipped if its positioning context is a
 * `position:relative; overflow:hidden` box. The tiles (`.portrait`,
 * `.ch-portrait`) set `overflow:hidden` but NOT `position:relative`, so the
 * over-sized image escaped. PortraitImg now owns its own clip box.
 *
 * This spec drives the REAL flow against the dev server
 * (VITE_DEV_BYPASS_AUTH=true, mock character at /characters/mock-1/*): it stubs
 * the Firebase Storage upload + download so the upload succeeds offline, frames
 * an aggressive (zoomed) crop, confirms, and then asserts the rendered portrait
 * stays INSIDE its tile (nothing leaks above it into the top bar) and the app
 * never falls into the app-root error boundary.
 *
 * It is the owner's dev signal: with the fix it is GREEN; with the fix reverted
 * (PortraitImg rendering the cropped image without its own clip box) the leak
 * assertion goes RED. Verified red→green during development.
 */

import { test, expect, type Page, type Route } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { enterSheetEdit } from "./sheet-edit";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, "fixtures/portrait.png");

/** The app-root ErrorBoundary fallback (the "white screen"). Must never appear. */
const ERROR_BOUNDARY = (page: Page) =>
  page.getByRole("alert").filter({ hasText: "Something went wrong" });

/** The crop modal's local error-boundary fallback (degraded, but recoverable). */
const CROPPER_FALLBACK = (page: Page) =>
  page.getByText("Something went wrong loading the cropper.");

/** react-easy-crop renders this container once it mounts successfully. */
const CROP_AREA = ".reactEasyCrop_Container";

/** Stored object metadata the Firebase Storage SDK expects after an upload. */
const OBJECT_META = {
  name: "users/mock-uid/portraits/mock-1.jpeg",
  bucket: "d20-folio.firebasestorage.app",
  downloadTokens: "e2e-token",
  contentType: "image/jpeg",
};

/**
 * Stub the Firebase Storage REST endpoints so the NEW-upload flow succeeds in
 * the dev-bypass environment (which has no real Storage backend). The upload
 * POST returns object metadata; the metadata GET (getDownloadURL) returns the
 * same; the `?alt=media` GET returns the actual fixture bytes so the `<img>`
 * loads. With these stubs, `usePortraitCrop.onConfirm` persists a portraitUrl +
 * portraitCrop into the store and PortraitImg renders in cropped mode — exactly
 * the path that leaked.
 */
async function stubStorage(page: Page) {
  const json = (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(OBJECT_META),
    });

  await page.route(
    /firebasestorage\.googleapis\.com\/v0\/b\/.*\/o\?name=/,
    (route) => void json(route)
  );
  await page.route(
    /firebasestorage\.googleapis\.com\/v0\/b\/.*\/o\/users%2F/,
    (route) => {
      if (route.request().url().includes("alt=media")) {
        void route.fulfill({
          status: 200,
          contentType: "image/png",
          body: readFileSync(FIXTURE),
        });
      } else {
        void json(route);
      }
    }
  );
}

/** Fail loud if any uncaught page error fires (the real crash signal). */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** Upload the fixture through the Bio tab's portrait file input (inside #main).
 *  The cockpit header is a monogram now, so the only portrait surface — and the
 *  only `image/*` file input — is the Bio tab's. */
async function uploadPortrait(page: Page) {
  await page
    .locator('#main input[type="file"][accept="image/*"]')
    .first()
    .setInputFiles(FIXTURE);
}

/** Drive an aggressive (zoomed) crop so the rendered image is heavily over-sized. */
async function frameAggressiveCrop(page: Page) {
  await expect(page.locator(CROP_AREA)).toBeVisible({ timeout: 10000 });
  await expect(CROPPER_FALLBACK(page)).toHaveCount(0);
  const slider = page.getByRole("slider", { name: /zoom/i }).first();
  await slider.focus();
  // Crank zoom toward max — a small crop region → a large display image, which
  // is precisely what overflowed the tile before the fix.
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");
}

test.describe("Portrait crop — crash regression (Bio tab)", () => {
  test("Bio tab: cropper opens, frames, confirms — no white-screen", async ({ page }) => {
    const errors = trackPageErrors(page);
    await stubStorage(page);
    await page.goto("/characters/mock-1?tab=bio");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();

    await enterSheetEdit(page);
    await uploadPortrait(page);
    await frameAggressiveCrop(page);
    await expect(ERROR_BOUNDARY(page)).toHaveCount(0);
    await page.getByRole("button", { name: /set portrait/i }).click();

    await expect(page.locator(CROP_AREA)).toHaveCount(0, { timeout: 10000 });
    await expect(ERROR_BOUNDARY(page)).toHaveCount(0);
    expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("cropper container mounts with real (non-collapsed) dimensions", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await stubStorage(page);
    await page.goto("/characters/mock-1?tab=bio");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
    await enterSheetEdit(page);
    await uploadPortrait(page);

    const container = page.locator(CROP_AREA);
    await expect(container).toBeVisible({ timeout: 10000 });
    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThan(100);
    await expect(ERROR_BOUNDARY(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("portrait crop overlay is the lapidary SQUARE, not a circle", async ({ page }) => {
    // Owner (2026-06-06): the portrait renders in a square on every surface, but
    // the crop overlay was still a circle "for historical reasons" — so the
    // corners that ARE shown were hidden while framing. The overlay must MATCH
    // the displayed shape: react-easy-crop's rounded-rect, never its round disc.
    await page.goto("/characters/mock-1?tab=bio");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
    await enterSheetEdit(page);
    await uploadPortrait(page);

    const cropArea = page.locator(".reactEasyCrop_CropArea");
    await expect(cropArea).toBeVisible({ timeout: 10000 });
    // react-easy-crop adds `reactEasyCrop_CropAreaRound` ONLY for cropShape="round".
    const cls = (await cropArea.getAttribute("class")) ?? "";
    expect(cls, `crop area must NOT be round — class was "${cls}"`).not.toContain(
      "reactEasyCrop_CropAreaRound"
    );
    // …and it carries the lapidary corner (a small px radius), not a 50% disc
    // (which would compute to ~half the box, well over 20px on this crop area).
    const radiusPx = await cropArea.evaluate(
      (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
    );
    expect(radiusPx).toBeGreaterThan(0);
    expect(radiusPx).toBeLessThan(20);
  });
});
