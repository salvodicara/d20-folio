/**
 * E2E (new UI): on a failed Concentration save with a reroll at hand, the reroll is
 * the lit wide button and «Confirm» a plain one (Baldur's Gate 3 shows the reroll at
 * the weight of «Continue»). The dev Fighter 13 holds Bless, takes 30 damage (DC 15)
 * and enters a 2: «Indomitable: reroll +13» leads.
 */
import { expect, test } from "@playwright/test";

test("a failed Concentration save leads with the reroll", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/characters/scn-indomitable-fighter");
  const hp = page.getByRole("button", { name: /^Damage and healing: \d+ \/ \d+/ });
  await expect(hp).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Damage", exact: true }).click();
  const tray = page.locator("dialog[open]");
  await tray.getByRole("spinbutton").or(tray.getByRole("textbox")).first().fill("30");
  await tray
    .getByRole("button", { name: /^(Apply|Damage|Take)/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Roll the die" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("textbox").first().fill("2");
  const offer = dialog.getByRole("button", { name: /^Indomitable: reroll \+13$/ });
  await expect(offer).toBeVisible();
  await page.screenshot({ path: info.outputPath("reroll-weight-failed.png") });
  await expect(offer).toHaveAttribute("data-kind", "primary");
  await expect(dialog.getByRole("button", { name: "Confirm" })).toHaveAttribute(
    "data-kind",
    "ghost"
  );
});
