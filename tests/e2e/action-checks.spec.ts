/**
 * Search as a check entry, Italian, dark theme, desktop and phone: the card offers
 * the SRD Search skills with their live bonus, the typical DCs and the d20 face;
 * Applica uses the action and the toast and the log say "Percezione N contro CD 15,
 * successo". Review shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import { openBaseActions } from "./sheet-steps";

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
  await page.goto("/characters/scn-champion-6?tab=play");
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  await expect(allChip).toBeVisible({ timeout: 45_000 });
  await allChip.click();
  await freezeMotion(page);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Search: Perception 14 + bonus vs DC 15 (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    await openBaseActions(page);
    const use = page.getByRole("button", { name: "Usa: Ricerca" });
    await use.scrollIntoViewIfNeeded();
    const card = page.locator("article.uc", { has: use }).first();
    await card.locator("button.uc-row-toggle").click();

    const skills = card.getByRole("group", { name: "Abilità richiesta dal DM" });
    for (const name of ["Intuizione", "Medicina", "Percezione", "Sopravvivenza"]) {
      await expect(
        skills.getByRole("button", { name: new RegExp(`^${name} [+-]\\d+$`) })
      ).toBeVisible();
    }
    const perception = skills.getByRole("button", { name: /^Percezione / });
    await perception.click();
    await expect(perception).toHaveAttribute("aria-pressed", "true");
    const bonus = Number((await perception.innerText()).split(" ").pop());
    await card
      .getByRole("group", { name: "CD (facoltativa)" })
      .getByRole("button", { name: "15", exact: true })
      .click();
    await card.getByRole("spinbutton", { name: "Il tuo d20 per la prova" }).fill("14");
    await card.screenshot({ path: shotPath(`search-entry-${size}.png`) });

    await card.getByRole("button", { name: "Applica" }).click();
    const total = 14 + bonus;
    const verdict = total >= 15 ? "successo" : "fallimento";
    await expect(
      page.getByText(`Ricerca: Percezione ${total} contro CD 15, ${verdict}`, {
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Usata: Ricerca" })).toBeDisabled();
    await expect(page.getByRole("log", { name: "Registro Azioni" })).toContainText(
      `Usato Ricerca: Percezione ${total} contro CD 15, ${verdict}`
    );
    await page.screenshot({ path: shotPath(`search-used-${size}.png`) });
  });
}
