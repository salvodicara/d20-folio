/**
 * Casting a self-transformation spell opens its form picker, from either tab, in a
 * real browser (Italian, dark, desktop and phone): True Polymorph cast from the
 * Combat tab offers the bestiary picker, Animal Shapes cast from the Spells tab
 * offers the Beast picker. One cast spends one slot: choosing a form, skipping the
 * picker, or changing form later with Transform never spends another. Review shots
 * land under REVIEW_SHOTS when set, else in the test output.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 120_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function usedSlots(page: Page, id: string, level: number): Promise<number> {
  return page.evaluate(
    ({ id, level }) => {
      const raw = localStorage.getItem(
        `d20-folio.dev-doc.v1:combat-state:mock-uid%2F${id}`
      );
      if (!raw) return 0;
      const { value } = JSON.parse(raw) as {
        value: { playState?: { state?: { usedSlots?: Record<string, number> } } };
      };
      // A doc nobody has spent from yet carries no slot ledger.
      return value.playState?.state?.usedSlots?.[String(level)] ?? 0;
    },
    { id, level }
  );
}

/** Pick the base slot when the cast asks which one to spend. */
async function chooseBaseSlot(page: Page, level: number): Promise<void> {
  const slot = page.getByRole("button", {
    name: new RegExp(`Slot di livello ${level} \\(base\\)`),
  });
  if (await slot.isVisible({ timeout: 2_000 }).catch(() => false)) await slot.click();
}

for (const size of ["desktop", "mobile"] as const) {
  test(`True Polymorph cast from the Combat tab opens the form picker (it, dark, ${size})`, async ({
    page,
  }) => {
    const id = "scn-true-polymorph-wizard";
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto(`/characters/${id}?tab=play`);
    const allChip = page.getByRole("button", { name: /^tutti$/i });
    await allChip.waitFor({ timeout: 90_000 });
    await allChip.click();
    const cast = page.getByRole("button", { name: "Lancia: Metamorfosi pura" });
    await cast.scrollIntoViewIfNeeded();
    const before = await usedSlots(page, id, 9);
    await cast.click();
    await chooseBaseSlot(page, 9);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Scegli una forma")).toBeVisible();
    await expect.poll(() => usedSlots(page, id, 9)).toBe(before + 1);
    await freezeMotion(page);
    await page.screenshot({ path: shotPath(`combat-cast-picker-${size}.png`) });

    await dialog.getByRole("searchbox").fill("golem di ferro");
    await dialog.getByText("Golem di ferro", { exact: true }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(`/characters/${id}?tab=spells`);
    await expect(page.locator(".polymorph-banner")).toContainText("Golem di ferro");
    expect(await usedSlots(page, id, 9)).toBe(before + 1);
  });

  test(`Animal Shapes cast from the Spells tab opens the picker, skippable, Transform later (it, dark, ${size})`, async ({
    page,
  }) => {
    const id = "scn-animal-shapes-druid";
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto(`/characters/${id}?tab=spells`);
    const chevron = page.locator('.uc-chevron[aria-label$=": Forme Animali"]').first();
    await chevron.waitFor({ timeout: 90_000 });
    if ((await chevron.getAttribute("aria-expanded")) !== "true") await chevron.click();
    const before = await usedSlots(page, id, 8);
    const cast = page
      .getByRole("region", { name: "Forme Animali", exact: true })
      .getByRole("button", { name: /^Lancia/ })
      .first();
    await cast.scrollIntoViewIfNeeded();
    await cast.click();
    await chooseBaseSlot(page, 8);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Scegli una forma bestiale")).toBeVisible();
    await expect.poll(() => usedSlots(page, id, 8)).toBe(before + 1);
    // Skippable: closing the picker keeps the cast and leaves the Druid as is.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".polymorph-banner")).toHaveCount(0);

    // The card's Transform still picks the form later, for no further slot.
    const transform = page.getByRole("button", { name: "Trasforma", exact: true });
    await transform.first().scrollIntoViewIfNeeded();
    await transform.first().click();
    await page.getByRole("dialog").getByRole("searchbox").fill("orso");
    await page.getByRole("dialog").getByText("Orso bruno").click();
    await expect(page.locator(".polymorph-banner")).toContainText("Orso bruno");
    expect(await usedSlots(page, id, 8)).toBe(before + 1);
  });
}
