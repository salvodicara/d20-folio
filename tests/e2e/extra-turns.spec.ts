/**
 * Extra turns in a real browser: Thief's Reflexes' second turn and Time Stop's turns in
 * a row on the solo sheet (the round stays put while the economy refreshes), and the
 * DM's turn order showing the rogue a second time at Initiative − 10 in round 1.
 * Screenshots land in the test's own output directory.
 */
import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang, freezeMotion } from "./surfaces";

async function shot(page: Page, name: string): Promise<void> {
  await freezeMotion(page);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: false });
}

async function openPlay(page: Page, charId: string): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "it");
  await page.goto(`/characters/${charId}?tab=play`);
  await page.locator(".turn").waitFor({ timeout: 90_000 });
}

const roundNum = (page: Page) => page.locator(".turn .r-num");

test.describe("extra turns", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");
  test.setTimeout(180_000);

  for (const size of ["desktop", "mobile"] as const) {
    test(`Thief's Reflexes: a second turn in round 1 keeps the round and refreshes the turn (${size})`, async ({
      page,
    }) => {
      await page.setViewportSize(
        size === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 }
      );
      await openPlay(page, "scn-thief-reflexes");
      await expect(roundNum(page)).toHaveText("1");
      const offer = page.getByTestId("extra-turn-offer");
      const second = offer.getByRole("button", {
        name: "Secondo turno (Riflessi da Furfante)",
      });
      await expect(second).toBeVisible();
      // Spend the Bonus Action on Cunning Action: Dash, so the refresh is visible
      // (desktop: the phone keeps the action board one tap away).
      const bonus = page.locator('.turn .econ-tok[data-kind="bonus"]');
      const spend = size === "desktop";
      if (spend) {
        await page.getByRole("button", { name: /^Usa: Azione Scaltra: Scatto/ }).click();
        await expect(bonus).toContainText("spesa");
      }
      await page.locator(".turn").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await shot(page, `thief-round1-offer-${size}`);

      await second.click();
      await expect(roundNum(page)).toHaveText("1");
      await expect(page.getByTestId("extra-turn-ordinal")).toHaveText("Turno 2/2");
      if (spend) await expect(bonus).toContainText("disponibile");
      await expect(offer).toHaveCount(0);
      await page.locator(".turn").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await shot(page, `thief-second-turn-${size}`);

      await page.locator(".turn .endturn").click();
      await expect(roundNum(page)).toHaveText("2");
      await expect(page.getByTestId("extra-turn-ordinal")).toHaveCount(0);
      await expect(page.getByTestId("extra-turn-offer")).toHaveCount(0);
    });
  }

  test("Time Stop: the cast asks for the count, then each turn keeps the round", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPlay(page, "scn-time-stop");
    await expect(roundNum(page)).toHaveText("1");
    await expect(page.getByTestId("time-stop-turns")).toHaveCount(0);
    await page.getByRole("button", { name: "Lancia: Fermare il Tempo" }).click();
    // A slot picker or the damage tray may follow the cast; the cast is logged either way.
    const dialog = page.getByRole("dialog");
    const slot = dialog.getByRole("button", { name: /Slot di livello 9/ });
    if (await slot.isVisible().catch(() => false)) await slot.click();
    const skip = dialog.getByRole("button", { name: /^Salta$/ });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    const ask = page.getByTestId("time-stop-turns");
    await expect(ask).toBeVisible();
    await ask.scrollIntoViewIfNeeded();
    await shot(page, "time-stop-ask");
    await ask.getByRole("spinbutton").fill("3");
    await ask.getByRole("spinbutton").press("Enter");
    const next = page
      .getByTestId("extra-turn-offer")
      .getByRole("button", { name: "Turno successivo (Fermare il Tempo, 1/3)" });
    await expect(next).toBeVisible();
    await shot(page, "time-stop-offer");
    await next.click();
    await expect(roundNum(page)).toHaveText("1");
    await expect(page.getByTestId("extra-turn-ordinal")).toHaveText("Turno 1/3");
    await page
      .getByTestId("extra-turn-offer")
      .getByRole("button", { name: "Turno successivo (Fermare il Tempo, 2/3)" })
      .click();
    await page
      .getByTestId("extra-turn-offer")
      .getByRole("button", { name: "Turno successivo (Fermare il Tempo, 3/3)" })
      .click();
    await expect(roundNum(page)).toHaveText("1");
    await expect(page.getByTestId("extra-turn-offer")).toHaveCount(0);
    await expect(page.getByTestId("extra-turn-ordinal")).toHaveText("Turno 3/3");
    await shot(page, "time-stop-last");
  });

  for (const size of ["desktop", "mobile"] as const) {
    test(`encounter: the DM's order shows the rogue again at Initiative − 10 in round 1 (${size})`, async ({
      page,
    }) => {
      await page.setViewportSize(
        size === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 }
      );
      await seedUI(page, "dark", "play");
      await seedLang(page, "it");
      await page.addInitScript(() =>
        window.localStorage.setItem("d20-dev-encounter", "reflexes")
      );
      await page.goto("/campaigns/mock-1");
      await page
        .getByRole("button", { name: /Inizia i turni/ })
        .first()
        .click({ timeout: 90_000 });
      const second = page.locator(".encounter-turn-order > li").filter({
        hasText: "Secondo turno (Riflessi da Furfante)",
      });
      await expect(second).toHaveCount(1);
      const names = await page
        .locator(".encounter-turn-order > li .party-id-name")
        .allInnerTexts();
      // Vess (20) first; her second turn at 10 sits after the Goblin Chief (12) and
      // before Bren (3 + bonus).
      expect(names.filter((n) => n.includes("Vess"))).toHaveLength(2);
      expect(names.indexOf("Goblin Chief")).toBeLessThan(
        names.lastIndexOf("Vess, Quickfingers")
      );
      const next = page.getByRole("button", { name: "Turno successivo" }).first();
      for (let i = 0; i < 10; i++) {
        if ((await second.getAttribute("aria-current")) === "true") break;
        await next.click();
      }
      await expect(second).toHaveAttribute("aria-current", "true");
      await expect(page.locator(".encounter-turn-order > li[aria-current]")).toHaveCount(
        1
      );
      await second.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await shot(page, `encounter-second-turn-${size}`);
      // Past the round's end the second row is gone.
      for (let i = 0; i < 6; i++) {
        if ((await second.count()) === 0) break;
        await next.click();
      }
      await expect(second).toHaveCount(0);
    });
  }
});
