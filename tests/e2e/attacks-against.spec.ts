/**
 * Attacks against you on the turn meter's status ledge, Italian, dark theme,
 * desktop and phone: Paralizzato states that attacks against you have Advantage
 * and a hit within 1,5 m is a Critical Hit; Prono states its within/beyond split;
 * Invisibile now badges for the unseen attackers' Disadvantage. Review shots land
 * under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import { addCondition } from "./sheet-steps";

// Cold dev-server compiles under parallel workers can exceed the default 30 s.
test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function openSheet(page: Page, size: "desktop" | "mobile") {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/scn-weapon-mastery-numbers?tab=play");
  await expect(page.getByRole("button", { name: /^tutti$/i })).toBeVisible({
    timeout: 45_000,
  });
  await freezeMotion(page);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`the ledge states attacks against you (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    await addCondition(page, "Paralizzato");
    await addCondition(page, "Prono");
    await addCondition(page, "Invisibile");

    const ledge = page.getByRole("group", { name: "Effetti attivi" });
    const paralyzed = ledge.getByRole("button", { name: "Paralizzato" });
    await paralyzed.scrollIntoViewIfNeeded();
    await paralyzed.click();
    const pop = page.locator(".status-pop", { hasText: "Colpo Critico" });
    await expect(pop).toContainText("Gli attacchi contro di te hanno Vantaggio");
    await expect(pop).toContainText("Un colpo da entro 1,5 m è un Colpo Critico");
    await page.screenshot({ path: shotPath(`attacks-against-paralyzed-${size}.png`) });
    await page.keyboard.press("Escape");

    await ledge.getByRole("button", { name: "Prono" }).click();
    await expect(page.locator(".status-pop", { hasText: "oltre" })).toContainText(
      "Attacchi contro di te: Vantaggio entro 1,5 m, Svantaggio oltre"
    );
    await page.screenshot({ path: shotPath(`attacks-against-prone-${size}.png`) });
    await page.keyboard.press("Escape");

    await ledge.getByRole("button", { name: "Invisibile" }).click();
    await expect(page.locator(".status-pop", { hasText: "vederti" })).toContainText(
      "Chi non può vederti ha Svantaggio ad attaccarti"
    );
  });
}
