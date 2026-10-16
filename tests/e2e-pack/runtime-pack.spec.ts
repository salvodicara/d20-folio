/**
 * The runtime content pack, as an allowlisted player meets it (owner rule
 * 2026-10-16: the private content stays fully usable).
 *
 * The emulators hold the sandbox (`scripts/dev-seed-sandbox.ts`), the emitted pack
 * in Storage, and the `pack` claim on the sandbox account. The team's six real
 * characters (the pack's fixtures) are imported through the app's own import, and
 * each sheet is compared between the runtime build and today's bundled one.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { COMPOSED_URL, RUNTIME_URL } from "../../playwright.pack.config";

const TEAM_DIR = path.resolve(import.meta.dirname, "../../content-pack/fixtures/team");
const TEAM = readdirSync(TEAM_DIR).filter((name) => name.endsWith(".json"));
const SHEETS: string[] = [];
/** A request for a pack file (object names are URL-encoded: `content-pack%2F…`). */
const FIRST_SHEET = () => SHEETS[0] ?? "/characters";
const STORAGE = (url: URL) => url.pathname.includes("/o/content-pack");

/** The sandbox account's characters, read straight from the Firestore emulator. */
async function sandboxCharacterIds(): Promise<string[]> {
  const response = await fetch(
    "http://127.0.0.1:8080/v1/projects/demo-d20folio/databases/(default)/documents/users/dev-owner/characters",
    { headers: { Authorization: "Bearer owner" } }
  );
  const body = (await response.json()) as { documents?: Array<{ name: string }> };
  return (body.documents ?? []).map((doc) => doc.name.split("/").at(-1) ?? "");
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(`${COMPOSED_URL}/characters`);
  const input = page.locator('input[type="file"]').first();
  for (const file of TEAM) {
    const before = (await sandboxCharacterIds()).length;
    await input.setInputFiles(path.join(TEAM_DIR, file));
    await expect
      .poll(async () => (await sandboxCharacterIds()).length, { timeout: 30_000 })
      .toBe(before + 1);
  }
  SHEETS.push(...(await sandboxCharacterIds()).map((id) => `/characters/${id}`));
  await page.close();
});

async function sheetText(page: Page, url: string): Promise<string> {
  await page.goto(url);
  const main = page.locator("main");
  await expect(main).toBeVisible({ timeout: 60_000 });
  // The sheet has settled once its text stops changing between two reads.
  let previous = "";
  await expect
    .poll(
      async () => {
        const now = await main.innerText();
        const stable = now === previous && now.length > 200;
        previous = now;
        return stable;
      },
      { intervals: [1_000], timeout: 60_000 }
    )
    .toBe(true);
  return previous;
}

test("an allowlisted player sees every team sheet exactly as today", async ({
  browser,
}) => {
  test.setTimeout(SHEETS.length * 60_000);
  const composed = await browser.newPage();
  const runtime = await browser.newPage();
  for (const sheet of SHEETS) {
    const expected = await sheetText(composed, COMPOSED_URL + sheet);
    expect(await sheetText(runtime, RUNTIME_URL + sheet), sheet).toBe(expected);
  }
});

test("after the first load the pack works without reaching Storage", async ({
  browser,
}) => {
  const page = await browser.newPage();
  const first = await sheetText(page, RUNTIME_URL + FIRST_SHEET());
  await page.route(STORAGE, (route) => route.abort("internetdisconnected"));
  await page.reload();
  expect(await sheetText(page, RUNTIME_URL + FIRST_SHEET())).toBe(first);
});

test("a failing download shows the loading notice and recovers, never a stripped sheet", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let blocked = true;
  await page.route(STORAGE, (route) =>
    blocked ? route.abort("internetdisconnected") : route.fallback()
  );
  await page.goto(RUNTIME_URL + FIRST_SHEET());
  await expect(
    page.getByRole("status").filter({ hasText: /loading your content/i })
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator("main")).toHaveCount(0);
  blocked = false;
  const expected = await sheetText(await browser.newPage(), COMPOSED_URL + FIRST_SHEET());
  await expect(
    page.getByRole("status").filter({ hasText: /loading your content/i })
  ).toHaveCount(0, {
    timeout: 60_000,
  });
  expect(await sheetText(page, RUNTIME_URL + FIRST_SHEET())).toBe(expected);
  await context.close();
});
