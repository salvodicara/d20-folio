/**
 * E2E: the new design system (`src/ui`) on its story page `/ui`.
 *
 * The page sits in the app frame (AppShell), so its top bar and both menus are checked too.
 * Runs the same layout and copy rules that guarded the approved prototype
 * (`tests/e2e/ui-rules/checks.browser.js`: no horizontal scroll, no clipped or
 * overflowing text, no one-word last lines, nothing under 12 px, AA contrast,
 * the 4/8 grid, banned terms …) at the prototype's audit viewports, in Italian
 * and English, with the dialog and toast open too. It also checks every control
 * shows a focus ring and that the English page carries no Italian leftovers.
 * Pixel pins fire only in the VISUAL lane (`shouldAssertSnapshots`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { shouldAssertSnapshots } from "./visual-gate";

const RULES = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "ui-rules/checks.browser.js"),
  "utf8"
);

// Real people's names live only in the private pack; without it the check runs on the public list alone.
const PRIVATE_TERMS_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../content-pack/private-terms.json"
);
const PRIVATE_TERMS: string[] = fs.existsSync(PRIVATE_TERMS_FILE)
  ? (JSON.parse(fs.readFileSync(PRIVATE_TERMS_FILE, "utf8")) as string[])
  : [];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, scale: 1 },
  { name: "w1100", width: 1100, height: 800, scale: 1 },
  { name: "tablet", width: 768, height: 1024, scale: 1 },
  { name: "phone", width: 390, height: 844, scale: 1 },
  { name: "p320", width: 320, height: 640, scale: 1 },
  { name: "zoom200", width: 720, height: 450, scale: 2 },
] as const;

const STATES = {
  base: "",
  dialog: "&dialog=1",
  toast: "&toast=1",
  menu: "",
  account: "",
} as const;
// The two menus of the top bar open with a click: ☰ (phone and tablet only) and the account.
const OPENER: Partial<Record<keyof typeof STATES, string>> = {
  menu: ".f-burger",
  account: ".f-av",
};

async function open(page: Page, lang: "it" | "en", state: keyof typeof STATES) {
  await page.goto(`/ui?lang=${lang}${STATES[state]}`);
  await page.locator(".fui").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const opener = OPENER[state];
  if (!opener) return true;
  const button = page.locator(opener);
  if (!(await button.isVisible())) return false;
  await button.click();
  await page.locator("dialog.f-menu[open]").waitFor();
  return true;
}

/** Every visible piece of text on the page, trimmed. */
function visibleTexts(page: Page) {
  return page.evaluate(() => {
    const out = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent?.trim();
      const p = n.parentElement;
      if (t && p && p.getClientRects().length && !p.closest("script,style")) out.add(t);
    }
    return [...out];
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`/ui at ${vp.name}`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
    });

    for (const lang of ["it", "en"] as const) {
      for (const state of Object.keys(STATES) as (keyof typeof STATES)[]) {
        test(`${lang} ${state} passes the design rules`, async ({ page }) => {
          const shown = await open(page, lang, state);
          test.skip(!shown, "the areas sit in the top bar at this width");
          await page.addScriptTag({ content: RULES });
          const failures = await page.evaluate(
            (privateTerms) =>
              (window as unknown as { __audit: (o: object) => object }).__audit({
                needsLogo: false,
                privateTerms,
              }),
            PRIVATE_TERMS
          );
          expect(failures).toEqual({});

          const noRing = await page.evaluate(() => {
            // An open modal makes the rest of the page inert, so only its own controls take focus.
            const scope = document.querySelector("dialog[open]") ?? document;
            const controls = [
              ...scope.querySelectorAll<HTMLElement>(
                "a[href],button,[tabindex='0'],input"
              ),
            ].filter(
              (e) => e.getClientRects().length && !(e as HTMLButtonElement).disabled
            );
            return controls
              .filter((e) => {
                // A menu opened by a click already focuses its first item, without a ring.
                (document.activeElement as HTMLElement | null)?.blur();
                e.focus({ focusVisible: true });
                const cs = getComputedStyle(e);
                const outline =
                  cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2;
                return !outline && !/rgb/.test(cs.boxShadow);
              })
              .map((e) => e.outerHTML.slice(0, 80));
          });
          expect(noRing).toEqual([]);

          if (shouldAssertSnapshots(test.info())) {
            await expect(page).toHaveScreenshot(`ui-${vp.name}-${lang}-${state}.png`, {
              fullPage: true,
            });
          }
        });
      }
    }
  });
}

test("the English page has no Italian left over", async ({ page }) => {
  await open(page, "it", "base");
  const italian = new Set(await visibleTexts(page));
  await open(page, "en", "base");
  // Names, numbers and dice are the same in both languages, and so are these words
  // (a key name on the search field is the keyboard's, in every language).
  const shared = new Set(["Folio", "Menu", "Ctrl K"]);
  const same = (await visibleTexts(page)).filter(
    (t) =>
      italian.has(t) && /[a-zà-ù]{3,}/i.test(t) && !/^d\d+$/.test(t) && !shared.has(t)
  );
  expect(same).toEqual([]);
});
