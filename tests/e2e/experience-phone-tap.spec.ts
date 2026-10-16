/**
 * E2E: on a phone in edit mode, one tap on the empty XP field opens it.
 *
 * Brienne's identity line ("Umano · Paladino 5 · Livello 6 — PE") ends with the
 * empty XP field just fitting the 390px line. The tap's hover revealed the field's
 * frame, which is wider, so the field jumped to the next line before the tap
 * landed and nothing opened. The field now keeps its width when its frame shows.
 */

import { test, expect } from "@playwright/test";
import { MOBILE, seedLang, seedUI } from "./surfaces";

test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });
test.describe.configure({ timeout: 90_000 });

test("one tap on the empty XP field opens it (it, phone, edit mode)", async ({
  page,
}) => {
  await seedLang(page, "it");
  await seedUI(page, "dark", "edit");
  await page.goto("/characters/scn-steed-paladin?tab=play");
  const field = page.getByRole("button", { name: "Punti esperienza" });
  await expect(field).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);

  const box = await field.boundingBox();
  if (!box) throw new Error("the XP field has no box");
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  const input = page.getByRole("spinbutton", { name: "Punti esperienza" });
  await expect(input).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("xp-phone-tap-open.png") });
  await input.fill("6400");
  await input.press("Enter");
  await expect(page.getByText("/ 14.000 PE")).toBeVisible();
});
