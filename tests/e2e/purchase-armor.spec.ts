/**
 * Coins on purchase and the armor time, Italian, dark theme, desktop and phone.
 * Bram has 50 gp and 3 pp: adding Chain Mail (75 gp) from the catalogue offers
 * "Paga 75 mo"; paying spends the 50 gp and breaks the 3 pp, 5 gp coming back, and
 * logs it; the Chain Mail goes on and the worn Leather comes off. The Longsword sells
 * for half its price. Taking the Chain Mail off says its 5 minutes; putting it on over
 * the Leather inside a fight is one line naming both, and no single action covers it.
 * Review shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  DESKTOP,
  MOBILE,
  freezeMotion,
  seedLang,
  seedUI,
  startSoloFight,
} from "./surfaces";

test.describe.configure({ timeout: 90_000 });

const SHEET = "/characters/scn-purchase";

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

/** The purse token of one coin. */
function coin(page: Page, metal: string) {
  return page.locator(`.cur-tok[data-metal="${metal}"] .cur-amt`).first();
}

async function openInventory(page: Page, size: "desktop" | "mobile") {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto(`${SHEET}?tab=inventory`);
  await expect(coin(page, "gp")).toBeVisible({ timeout: 45_000 });
  await freezeMotion(page);
}

/** Expand an inventory row by its name. */
async function expand(page: Page, name: string) {
  await page
    .getByRole("button", { name: new RegExp(`^Espandi: ${name}`, "i") })
    .first()
    .click();
}

for (const size of ["desktop", "mobile"] as const) {
  test(`buying with change, selling, and the armor time (it, dark, ${size})`, async ({
    page,
  }) => {
    await openInventory(page, size);
    await expect(coin(page, "gp")).toHaveText("50");
    await expect(coin(page, "pp")).toHaveText("3");

    // Buy: open Chain Mail in the catalogue; Plate (1500 gp) is out of reach.
    await page
      .getByRole("button", { name: /aggiungi oggetto/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("searchbox").fill("Armatura a piastre");
    await dialog.getByRole("button", { name: "Armatura a Piastre", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Compra per 1500 mo" })
    ).toBeDisabled();
    await expect(dialog).toContainText("Le tue monete valgono 80 mo: non bastano");
    await page.screenshot({ path: shotPath(`purchase-short-${size}.png`) });
    await dialog.getByRole("button", { name: "Indietro" }).click();

    await dialog.getByRole("searchbox").fill("Cotta di maglia");
    await dialog.getByRole("button", { name: "Cotta di Maglia", exact: true }).click();
    await page.screenshot({ path: shotPath(`purchase-offer-${size}.png`) });
    await dialog.getByRole("button", { name: "Compra per 75 mo" }).click();
    await expect(
      page.getByText("Pagato 75 mo per Cotta di Maglia (−3 mp, −45 mo)")
    ).toBeVisible();
    await page.screenshot({ path: shotPath(`purchase-paid-${size}.png`) });
    await dialog.getByRole("button", { name: "Chiudi" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(coin(page, "gp")).toHaveText("5");
    await expect(coin(page, "pp")).toHaveText("0");

    // Sell the Longsword at half price: 7 gp 5 sp.
    await expand(page, "Spada Lunga");
    await page.getByRole("button", { name: "Vendi per 7 mo 5 ma" }).click();
    await expect(page.getByText("Vendita: Spada Lunga per 7 mo 5 ma")).toBeVisible();
    await expect(coin(page, "gp")).toHaveText("12");
    await expect(coin(page, "sp")).toHaveText("5");
    await page.screenshot({ path: shotPath(`purchase-sold-${size}.png`) });

    // One body armor at a time: the bought Chain Mail went on, the Leather came off.
    const armorRow = (name: string) =>
      page.locator("article", {
        has: page.getByRole("button", { name: `Espandi: ${name}` }),
      });
    const chain = armorRow("Cotta di Maglia");
    const leather = armorRow("Armatura di Cuoio");
    await expect(chain.getByRole("button", { name: "Equipaggiato" })).toBeVisible();
    await expect(
      leather.getByRole("button", { name: "Equipaggia", exact: true })
    ).toBeVisible();

    // The armor time: the fact on the row, then one line per tap.
    await expand(page, "Cotta di Maglia");
    await expect(
      chain.getByRole("region", { name: "Cotta di Maglia", exact: true })
    ).toContainText("Indossare / Togliere10 min / 5 min");
    await chain.getByRole("button", { name: "Equipaggiato" }).click();
    await expect(
      page.getByText("Togliere Cotta di Maglia richiede 5 minuti")
    ).toBeVisible();
    await page.screenshot({ path: shotPath(`armor-doff-${size}.png`) });
    await leather.getByRole("button", { name: "Equipaggia", exact: true }).click();
    await expect(
      page.getByText("Indossare Armatura di Cuoio richiede 1 minuto")
    ).toBeVisible();

    // In a fight, Chain Mail over the Leather: ONE line names both, and the swap holds.
    await page.getByRole("tab", { name: "Combattimento" }).click();
    await startSoloFight(page);
    await page.getByRole("tab", { name: "Inventario" }).click();
    await chain.getByRole("button", { name: "Equipaggia", exact: true }).click();
    await expect(
      page.getByText(
        "Cambiare armatura: togliere Armatura di Cuoio (1 min) e indossare Cotta di Maglia (10 min); in combattimento non basta un'azione"
      )
    ).toBeVisible();
    // One armor line on screen: the earlier ones were replaced, not stacked.
    await expect(page.locator(".toast", { hasText: /Indossare|Togliere/ })).toHaveCount(
      0
    );
    // Never blocked: the Chain Mail is on, the Leather off.
    await expect(chain.getByRole("button", { name: "Equipaggiato" })).toBeVisible();
    await expect(
      leather.getByRole("button", { name: "Equipaggia", exact: true })
    ).toBeVisible();
    await page.screenshot({ path: shotPath(`armor-don-fight-${size}.png`) });

    // Both trades are in the log.
    await page.goto(`${SHEET}?tab=play`);
    await expect(
      page.getByText("Acquisto: Cotta di Maglia per 75 mo").first()
    ).toBeAttached({
      timeout: 45_000,
    });
    await expect(
      page.getByText("Vendita: Spada Lunga per 7 mo 5 ma").first()
    ).toBeAttached();
  });
}
