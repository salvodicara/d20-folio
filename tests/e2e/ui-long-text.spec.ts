/**
 * Long user text stays inside its card on the new UI (the #885 / #1032 class): a grid
 * or flex item keeps its min-content width unless it says `min-width: 0`, so one long
 * unbroken token (a pasted link) in a name or a note stretched its card off the
 * screen. Each case puts such a token where a player or DM writes text, then checks
 * the text's box ends inside its card and the page never scrolls sideways.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP, seedLang } from "./surfaces";

test.describe.configure({ timeout: 150_000 });

const PHONE = { width: 390, height: 844 } as const;
const LONG = `https://example.com/${"a".repeat(380)}`;

interface Case {
  what: string;
  route: string;
  tab?: string;
  /** The user's text. */
  text: string;
  /** The card the text must stay inside. */
  card: string;
  /** Shown only on a wide screen. */
  wideOnly?: boolean;
}

const CASES: Case[] = [
  {
    what: "a house rule's text",
    route: "/campaigns/mock-1",
    tab: "Rules",
    text: ".f-rule .f-row-s",
    card: ".f-pn",
  },
  {
    what: "a treasury entry's note",
    route: "/campaigns/mock-1",
    tab: "Treasury",
    text: ".f-tl-by",
    card: ".f-pn",
  },
  {
    what: "a roster card's name",
    route: "/characters",
    text: ".f-ccard-name",
    card: ".f-ccard",
  },
  {
    what: "the sheet's character name",
    route: "/characters/mock-1",
    text: ".f-char-id h1",
    card: ".f-hero",
  },
  {
    what: "the level-up summary's name",
    route: "/characters/mock-1/level-up",
    text: ".f-lvl-sum-h b",
    card: ".f-lvl-sum",
    wideOnly: true,
  },
];

for (const viewport of [PHONE, DESKTOP]) {
  for (const c of CASES.filter((x) => !x.wideOnly || viewport.width > PHONE.width)) {
    test(`${c.what} stays inside its card at ${String(viewport.width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedLang(page, "en");
      await page.goto(c.route);
      if (c.tab) await page.getByRole("tab", { name: c.tab }).click();
      const text = page.locator(c.text).first();
      await expect(text).toBeVisible({ timeout: 90_000 });
      const box = await text.evaluate(
        (el, { long, card }) => {
          const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
          if (node) node.nodeValue = long;
          else el.textContent = long;
          const holder = el.closest(card);
          if (!holder) throw new Error(`no ${card} around the text`);
          return {
            right: el.getBoundingClientRect().right,
            cardRight: holder.getBoundingClientRect().right,
            pageWidth: document.documentElement.scrollWidth,
            viewport: document.documentElement.clientWidth,
          };
        },
        { long: LONG, card: c.card }
      );
      expect(box.right).toBeLessThanOrEqual(box.cardRight + 1);
      expect(box.pageWidth).toBeLessThanOrEqual(box.viewport);
    });
  }
}
