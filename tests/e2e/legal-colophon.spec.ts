/**
 * legal-colophon — the Legal & Attribution COLOPHON SPREAD (owner 2026-07-10, after
 * three verdicts against a swimming prose column: "still wastes a lot of space. Do it
 * properly and SOTA!"). The page is set as the folio's colophon plate: a full-width
 * engraved attribution plaque on the centred ceremonial axis, the two licenses as twin
 * deed columns, and Trademarks · The App side by side in the bottom register.
 *
 * Pins: (1) at desktop the spread genuinely uses the width — the licenses share a row,
 * Trademarks · The App share a row, and the plaques span (wider than any single column);
 * (2) below the register breakpoint everything stacks into one clean column; (3) the
 * TWO verbatim attribution statements (SRD 5.2.1 + SRD 5.1 — the shipped prose draws
 * on both CC-BY-4.0 documents, and each license requires its exact statement) render
 * inside the plaque blockquotes, in BOTH locales (EN required texts + WotC's official
 * IT texts); (4) the page never scrolls horizontally.
 */

import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, seedUI, seedLang } from "./surfaces";

// The exact CC-BY-4.0 attribution statements, verbatim from WotC's PDFs
// (SRD_CC_v5.2.1.pdf / SRD_CC_v5.1.pdf and the official Italian editions
// IT_SRD_CC_v5.2.1.pdf / SRD_CC_v5.1_IT.pdf). The unit lock
// (`tests/unit/legal-page.test.tsx`) pins the catalogues; this lock pins the
// RENDERED page.
const STATEMENTS = {
  en: [
    "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
    "This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.",
  ],
  it: [
    "Quest'opera include materiale tratto dal System Reference Document 5.2.1 (\"SRD 5.2.1\") di Wizards of the Coast LLC, disponibile all'indirizzo https://www.dndbeyond.com/srd. Il SRD 5.2.1 è concesso in licenza ai sensi della licenza di attribuzione 4.0 Internazionale di Creative Commons, disponibile all'indirizzo https://creativecommons.org/licenses/by/4.0/legalcode.",
    "Questo lavoro include materiale del System Reference Document 5.1 (“SRD 5.1”) di Wizards of the Coast LLC disponibile al sito https://dnd.wizards.com/it/resources/systems-reference-document. L’SRD 5.1 è concesso in licenza sotto l’Attribuzione 4.0 Internazionale di Creative Commons disponibile al sito https://creativecommons.org/licenses/by/4.0/legalcode.it.",
  ],
} as const;

async function gotoLegal(
  page: Page,
  viewport: { width: number; height: number },
  lang: "en" | "it" = "en"
) {
  await seedUI(page, "dark", "play");
  await seedLang(page, lang);
  await page.setViewportSize(viewport);
  await page.goto("/legal");
  await page.waitForSelector(".colophon");
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox();
  expect(b, `${selector} should render`).not.toBeNull();
  return b as NonNullable<typeof b>;
}

test.describe("legal page colophon spread", () => {
  test("desktop: the plaque spans and the registers run two-up", async ({ page }) => {
    await gotoLegal(page, DESKTOP);

    // Both engraved plaques render the exact required statements, verbatim.
    await expect(page.locator("blockquote.colophon-statement")).toHaveText([
      ...STATEMENTS.en,
    ]);

    // Twin license columns: side by side on one row.
    const srd = await box(page, ".colophon-license:nth-of-type(1)");
    const mit = await box(page, ".colophon-license:nth-of-type(2)");
    expect(Math.abs(srd.y - mit.y)).toBeLessThan(4);
    expect(mit.x).toBeGreaterThan(srd.x + srd.width);

    // Bottom register: Trademarks · The App side by side.
    const marks = await box(page, "#trademarks");
    const app = await box(page, "#app");
    expect(Math.abs(marks.y - app.y)).toBeLessThan(4);
    expect(app.x).toBeGreaterThan(marks.x + marks.width);

    // The plaque is the full-width centrepiece — wider than any single column.
    const plaque = await box(page, ".colophon-statement:first-of-type");
    expect(plaque.width).toBeGreaterThan(srd.width * 1.8);

    // The spread never scrolls horizontally.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("narrow: the spread stacks into one clean column", async ({ page }) => {
    await gotoLegal(page, MOBILE);

    const srd = await box(page, ".colophon-license:nth-of-type(1)");
    const mit = await box(page, ".colophon-license:nth-of-type(2)");
    expect(mit.y).toBeGreaterThan(srd.y + srd.height - 1);

    const marks = await box(page, "#trademarks");
    const app = await box(page, "#app");
    expect(app.y).toBeGreaterThan(marks.y + marks.height - 1);

    // The verbatim plaques still render, and nothing overflows the phone.
    await expect(page.locator("blockquote.colophon-statement")).toHaveText([
      ...STATEMENTS.en,
    ]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("italian: WotC's official IT statements render verbatim on both plaques", async ({
    page,
  }) => {
    await gotoLegal(page, DESKTOP, "it");
    await expect(page.locator("blockquote.colophon-statement")).toHaveText([
      ...STATEMENTS.it,
    ]);
  });
});
