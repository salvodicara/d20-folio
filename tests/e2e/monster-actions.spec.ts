/**
 * monster-actions — the DM's one-tap monster actions in REAL Chromium (dev-bypass,
 * the begun `mock-1` encounter, Italian, dark), desktop + phone:
 *
 *  A. The Goblin's "Scimitarra +4" chip opens the damage tray; the DM picks the two
 *     PCs, one Colpito and one Mancato, types 5 and applies: the bard loses 5 HP and
 *     the feed reads "Goblin: Scimitarra → …: colpito, 5 danni" with no "Who struck?",
 *     plus the paladin's miss line.
 *  B. An Adult Red Dragon's Fire Breath (DEX DC 21) starts on both PCs; the DM adds the
 *     Goblin Chief, types 59 and marks the paladin Salvato: resistant to Fire, he takes
 *     ¼ (14); the bard and the Goblin Chief take the full 59.
 *
 * Screenshots go to the test's output folder (the owner's review copies them).
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { coralinoCard, freezeMotion, seedLang, seedUI } from "./surfaces";

const tray = (page: Page) => page.getByTestId("damage-tray");
const row = (page: Page, id: string) =>
  tray(page).locator(`[data-testid="damage-tray-row"][data-target="${id}"]`);
const monsterCard = (page: Page, id: string) =>
  page.locator(`li[data-combatant-id="${id}"]`);
const feed = (page: Page) =>
  page.locator("section", { hasText: "Cronaca dello scontro" }).first();
const hpOf = (card: Locator) => card.locator(".vital-hp").first();

async function boot(page: Page): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "it");
  await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
  await page.goto("/campaigns/mock-1");
  await expect(coralinoCard(page)).toBeVisible({ timeout: 60_000 });
}

async function addMonster(page: Page, query: string, name: RegExp): Promise<void> {
  await page
    .getByRole("button", { name: /aggiungi mostro/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/cerca mostri/i).fill(query);
  await dialog.getByRole("button", { name }).first().click();
  await dialog.getByRole("button", { name: /aggiungi mostro/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function shot(page: Page, name: string): Promise<void> {
  await freezeMotion(page);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}

for (const leg of [
  { name: "desktop", viewport: { width: 1280, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const) {
  test.describe(`monster actions (${leg.name})`, () => {
    test.skip(({ browserName }) => browserName !== "chromium", "DM tracker, Chromium.");

    test("a goblin strikes two PCs from its card in one tray", async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(leg.viewport);
      await boot(page);

      const goblin = monsterCard(page, "monster-1");
      const actions = goblin.getByRole("group", { name: "Azioni di Goblin" });
      const scimitar = actions.getByRole("button", { name: /^Scimitarra \+4/ });
      await expect(scimitar).toContainText("1d6+2 Tagliente");
      await goblin.scrollIntoViewIfNeeded();
      await shot(page, `goblin-card-${leg.name}`);
      const coralinoHp = (await hpOf(coralinoCard(page)).innerText()).match(/\d+/)?.[0];

      await scimitar.click(); // tap 1
      await expect(tray(page)).toBeVisible();
      await expect(tray(page)).toContainText(
        "Goblin · +4 per colpire · Danni da Tagliente"
      );
      await expect(tray(page)).toContainText("Tira 1d6+2 al tavolo");
      const onWhom = tray(page).getByRole("group", { name: "Su chi?" });
      await onWhom.getByRole("button", { name: /catalion/i }).click(); // tap 2
      await onWhom.getByRole("button", { name: /mandorlino/i }).click(); // tap 3
      await expect(tray(page).getByTestId("damage-tray-row")).toHaveCount(2);
      await row(page, "pc-member-bren").getByRole("button", { name: "Mancato" }).click();
      await tray(page).getByRole("textbox", { name: "Totale tirato" }).fill("5");
      await expect(
        row(page, "pc-member-mara").getByTestId("damage-tray-preview")
      ).toContainText("−5");
      await shot(page, `goblin-tray-${leg.name}`);

      await tray(page).getByRole("button", { name: "Applica" }).click();
      await expect(tray(page)).toHaveCount(0);
      if (coralinoHp)
        await expect(hpOf(coralinoCard(page))).toContainText(
          String(Number(coralinoHp) - 5)
        );
      await expect(
        feed(page).getByText(/Goblin: Scimitarra → [^:]+: colpito, 5 danni/)
      ).toBeVisible();
      await expect(
        feed(page).getByText(/Goblin usa Scimitarra su [^:]+: mancato/)
      ).toBeVisible();
      await feed(page).scrollIntoViewIfNeeded();
      await shot(page, `goblin-feed-${leg.name}`);
    });

    test("a dragon's breath on three targets, one Salvato", async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(leg.viewport);
      await boot(page);
      await addMonster(page, "drago rosso adulto", /^drago rosso adulto\b/i);

      const dragon = page
        .locator("li.combatant-card")
        .filter({
          has: page.getByRole("group", { name: /Azioni di Drago rosso adulto/ }),
        })
        .first();
      const breath = dragon.getByRole("button", { name: /^Soffio di fuoco/ });
      await expect(breath).toContainText("TS DES · CD 21 · 17d6 Fuoco");
      await expect(
        dragon.getByText(/Il drago effettua tre attacchi Squarcio/)
      ).toBeVisible();
      await breath.scrollIntoViewIfNeeded();
      await shot(page, `dragon-card-${leg.name}`);

      await breath.click(); // tap 1: both PCs start picked (an area)
      await expect(tray(page).getByTestId("damage-tray-row")).toHaveCount(2);
      await tray(page)
        .getByRole("group", { name: "Su chi?" })
        .getByRole("button", { name: "Goblin Chief" })
        .click(); // tap 2: a third target
      await expect(tray(page).getByTestId("damage-tray-row")).toHaveCount(3);
      await tray(page).getByRole("textbox", { name: "Totale tirato" }).fill("59");
      await tray(page)
        .getByRole("button", {
          name: /Mandorlino ha superato il TS/,
        })
        .click(); // tap 3
      await expect(
        row(page, "pc-member-bren").getByTestId("damage-tray-preview")
      ).toContainText("−14");
      await expect(
        row(page, "monster-2").getByTestId("damage-tray-preview")
      ).toContainText("−59");
      await shot(page, `dragon-tray-${leg.name}`);

      await tray(page).getByRole("button", { name: "Applica" }).click(); // tap 4
      await expect(tray(page)).toHaveCount(0);
      await expect(hpOf(monsterCard(page, "monster-2"))).toContainText("0");
      await expect(
        feed(page).getByText(/Drago rosso adulto usa Soffio di fuoco su [^:]+: 14 danni/)
      ).toBeVisible();
      await expect(
        feed(page).getByText(
          /Drago rosso adulto usa Soffio di fuoco su Goblin Chief: 21 danni/
        )
      ).toBeVisible();
      await feed(page).scrollIntoViewIfNeeded();
      await shot(page, `dragon-feed-${leg.name}`);
    });
  });
}
