/**
 * Wish in a real browser, Italian, dark theme, desktop and phone: the cast spends the
 * 9th-level slot, then its follow-up offers Duplicate (the picker over every spell of
 * level 8 or lower, cast with no slot) or Wish Stress (a state on the rail; each later
 * spell's toast states its Necrotic dice). Review shots land under REVIEW_SHOTS when
 * set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 120_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function openSheet(page: Page, size: "desktop" | "mobile") {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/scn-wish?tab=play");
  await expect(page.getByRole("button", { name: /^tutti$/i })).toBeVisible({
    timeout: 60_000,
  });
  await freezeMotion(page);
  await page.getByRole("button", { name: /^tutti$/i }).click();
}

/** Cast a spell through its slot picker (and past an optional target step). */
async function cast(page: Page, name: string, slot?: RegExp) {
  await page.getByRole("button", { name: `Lancia: ${name}` }).click();
  const dialog = page.getByRole("dialog");
  if (slot) {
    const pick = dialog.getByRole("button", { name: slot });
    if (await pick.isVisible().catch(() => false)) await pick.click();
  }
  await skipTargets(page);
}

async function skipTargets(page: Page) {
  const skip = page.getByRole("dialog").getByRole("button", { name: /^Salta/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Wish duplicates a spell of level 8 or lower (it, dark, ${size})`, async ({
    page,
  }) => {
    await openSheet(page, size);
    await cast(page, "Desiderio", /Slot di livello 9/);
    const followUp = page.getByTestId("wish-follow-up");
    await expect(followUp).toBeVisible();
    // Asked right after the cast from its card: it comes into view by itself.
    await expect(followUp).toBeInViewport();
    await page.screenshot({ path: shotPath(`wish-follow-up-${size}.png`) });

    await followUp.getByRole("button", { name: "Duplica un incantesimo" }).click();
    const picker = page.getByRole("dialog");
    // The dialog opens on its own title (vision 1); the list carries the instruction.
    await expect(picker.getByLabel("Scegli un incantesimo da lanciare")).toBeVisible();
    // Level 8 is offered, level 9 is not.
    await picker.getByRole("searchbox").fill("Terremoto");
    await expect(picker.getByRole("listitem")).toHaveCount(1);
    await picker.getByRole("searchbox").fill("Desiderio");
    await expect(picker.getByRole("listitem")).toHaveCount(0);
    // Stoneskin consumes a 100 gp diamond, which Wish does not need.
    await picker.getByRole("searchbox").fill("Pelle di Pietra");
    await page.screenshot({ path: shotPath(`wish-picker-${size}.png`) });
    await picker.getByRole("listitem").first().click();
    await page
      .getByRole("dialog", { name: /Pelle di Pietra: su chi/ })
      .getByRole("button", { name: /^Salta/ })
      .click();

    await expect(page.getByText("Usato Pelle di Pietra", { exact: true })).toBeVisible();
    await expect(followUp).toHaveCount(0);
    await expect(page.getByText(/consuma un componente/)).toHaveCount(0);
  });

  test(`Wish Stress lights a state and prices later spells (it, dark, ${size})`, async ({
    page,
  }) => {
    await openSheet(page, size);
    await cast(page, "Desiderio", /Slot di livello 9/);
    const followUp = page.getByTestId("wish-follow-up");
    await followUp.getByRole("button", { name: "Stress di Desiderio" }).click();
    await expect(followUp).toHaveCount(0);
    await expect(
      page.getByText("Stress di Desiderio fino al prossimo Riposo Lungo")
    ).toBeVisible();

    await cast(page, "Dardo Incantato", /Slot di livello 1/);
    await expect(
      page.getByText(
        "Hai usato Dardo Incantato. Stress di Desiderio: subisci 1d10 danni necrotici, non riducibili."
      )
    ).toBeVisible();
    await page.screenshot({ path: shotPath(`wish-stress-${size}.png`) });
  });
}
