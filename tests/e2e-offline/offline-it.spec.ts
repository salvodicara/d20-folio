/**
 * An Italian player opens the app once, online, then plays offline (owner's groups
 * play in Italian; coordinator 2026-10-24). The Italian text and the bestiary are
 * no longer in the install: the first visit must cache every Italian shard the
 * sheet loads, and the bestiary for a character with a bestiary form (True
 * Polymorph). Offline, the sheet, the spell list, the features and the form picker
 * all read in Italian.
 */
import { test, expect, type Page } from "@playwright/test";

const ID = "scn-true-polymorph-wizard";

async function lazyCached(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cache = await caches.open("lazy-data-cache");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
}

test("one online visit in Italian, then the sheet, spells and bestiary work offline", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => window.localStorage.setItem("i18nextLng", "it"));
  await page.emulateMedia({ reducedMotion: "reduce" });

  // ── The one online visit ─────────────────────────────────────────────────────
  await page.goto(`/characters/${ID}?tab=play`);
  await page.getByRole("button", { name: /^tutti$/i }).waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 60_000,
  });
  // The startup Italian shards and the warmed bestiary land in the runtime cache.
  await expect
    .poll(async () => (await lazyCached(page)).join(" "), { timeout: 60_000 })
    .toMatch(/srd-monsters-.*spells-|spells-.*srd-monsters-/);
  const cached = await lazyCached(page);
  expect(
    cached.some((p) => /\/monsters-[^/]+\.js$/.test(p)),
    "Italian bestiary names"
  ).toBe(true);

  // ── Offline ──────────────────────────────────────────────────────────────────
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /^tutti$/i }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /^tutti$/i }).click();
  const cast = page.getByRole("button", { name: "Lancia: Metamorfosi pura" });
  await expect(cast).toBeVisible();

  await page.goto(`/characters/${ID}?tab=spells`);
  await expect(page.getByText("Metamorfosi pura").first()).toBeVisible({
    timeout: 60_000,
  });

  // The bestiary, in Italian, offline: the form picker of True Polymorph.
  await page.goto(`/characters/${ID}?tab=play`);
  await page.getByRole("button", { name: /^tutti$/i }).click();
  await page.getByRole("button", { name: "Lancia: Metamorfosi pura" }).click();
  const base = page.getByRole("button", { name: /Slot di livello 9 \(base\)/ });
  if (await base.isVisible({ timeout: 2_000 }).catch(() => false)) await base.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Scegli una forma")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("searchbox").fill("golem di ferro");
  await expect(dialog.getByText("Golem di ferro", { exact: true }).first()).toBeVisible();
});
