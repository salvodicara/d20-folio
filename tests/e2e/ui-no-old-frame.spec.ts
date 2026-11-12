/**
 * No route is left in the old frame (go/no-go 2026-11-21): under VITE_NEW_UI every page
 * a player can reach renders in the new shell, never the classic topbar. The routes
 * come from the router itself, so a route added later is checked too; the ones still
 * waiting for their move are listed below, and the list may only shrink (a listed
 * route that has moved fails until it leaves the list).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { seedLang } from "./surfaces";

test.describe.configure({ timeout: 240_000 });

/** Still in the old frame, each with the step that moves it. */
const NOT_YET_MOVED = new Set([
  "/admin", // owner-only, after the go/no-go
  "/admin/users/:uid/characters/:charId", // owner-only, after the go/no-go
  "/campaigns/:campaignId/sheets/:memberUid", // the DM's read-only member sheet
  "/view/:uid/:charId", // the public share view
]);

/** Not player pages: dev probes, the sign-in, the classic level-up kept on purpose. */
const NOT_PAGES = new Set([
  "/_crash",
  "/_crash-root",
  "/_specimens",
  "/ui",
  "/login",
  // a redirect to the campaign it joins; its bad-invite state cannot be reached with the
  // dev account (every code joins) and still renders the old frame: still to move
  "/join/:code",
  "/characters/:characterId/level-up/classic",
]);

/** A value for each route parameter, from the dev fixtures. */
const SAMPLE: Record<string, string> = {
  characterId: "mock-1",
  campaignId: "mock-1",
  memberUid: "member-bren",
  uid: "mock-uid",
  charId: "mock-1",
};

function routerPaths(): string[] {
  const src = readFileSync(join(process.cwd(), "src/app/router.tsx"), "utf8");
  return [...new Set([...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1] ?? ""))];
}

const url = (path: string) =>
  path === "*"
    ? "/no-such-page"
    : path.replace(/:(\w+)/g, (_, name: string) => SAMPLE[name] ?? name);

const oldFrame = (page: Page) => page.locator(".topbar-brand").count();
const newFrame = (page: Page) => page.locator(".fui.f-app").count();

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect
    .poll(async () => (await oldFrame(page)) + (await newFrame(page)), {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
}

test("the router's player pages render in the new frame", async ({ page }) => {
  await seedLang(page, "it");
  const paths = routerPaths().filter((p) => !NOT_PAGES.has(p));
  expect(paths.length).toBeGreaterThan(8);
  const wrong: string[] = [];
  for (const path of paths) {
    await page.goto(url(path));
    await settle(page);
    const old = (await oldFrame(page)) > 0;
    if (old !== NOT_YET_MOVED.has(path))
      wrong.push(`${path}: ${old ? "old frame" : "moved, drop it from the list"}`);
  }
  expect(wrong).toEqual([]);
});

test("roster → campaigns → a campaign → settings → back never shows the old frame", async ({
  page,
}) => {
  await seedLang(page, "it");
  await page.goto("/characters");
  await settle(page);
  // each step: what the player taps, and the page it lands on
  const steps: Array<[string, () => Promise<unknown>, RegExp]> = [
    [
      "campaigns",
      () =>
        page
          .getByRole("navigation", { name: "Principale" })
          .getByRole("link", { name: "Campagne" })
          .click(),
      /\/campaigns$/,
    ],
    [
      "a campaign",
      // the campaign list's own card (the roster's stays on screen while the list loads)
      () => page.locator(".f-camps .f-ccard-link").first().click(),
      /\/campaigns\/[^/]+$/,
    ],
    [
      "settings",
      async () => {
        await page.getByRole("button", { name: "Il tuo account" }).click();
        await page.getByRole("button", { name: "Impostazioni" }).click();
      },
      /\/settings$/,
    ],
    ["back", () => page.goBack(), /\/campaigns\/[^/]+$/],
  ];
  for (const [name, go, lands] of steps) {
    await go();
    await expect(page, name).toHaveURL(lands, { timeout: 30_000 });
    await settle(page);
    expect(await oldFrame(page), name).toBe(0);
  }
});
