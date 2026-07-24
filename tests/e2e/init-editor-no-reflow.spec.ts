/**
 * init-editor-no-reflow — the initiative roll editor must FLOAT, never reflow the card.
 *
 * The bug (owner, dogfood): opening the leading-edge INIT chip on an encounter card used
 * to MORPH the chip in place from a compact resting badge into a much wider inline edit box,
 * shoving the portrait seal + name column right, re-wrapping the hero name onto an extra line,
 * growing the card taller, and pushing every card below down — the whole list JUMPED, then
 * snapped back on commit. The fix floats the wide edit UI in a popover (the shipped CombatPip
 * roller pattern) so the resting chip keeps its width IN FLOW and nothing reflows.
 *
 * These are DETERMINISTIC layout assertions (not transient polls): capture every
 * `.party-card`'s DOCUMENT-ABSOLUTE box (immune to any incidental scroll) at rest, open the
 * editor, and assert NO card's geometry changed. Run at a CONSTRAINED width (the phone-ish
 * column where the owner hit the jump) so the in-place morph provably steals room from the
 * name column and grows the card — a regression fails the frozen-geometry assertion, then the
 * follow-up popover check pins the FIX's mechanism (the editor floats, it is not in flow).
 *
 * Driven through the dev-bypass encounter fixture (`d20-dev-encounter=gathering`, a real
 * gathering-phase encounter at `/campaigns/mock-1`): the viewer is the DM, so every PC init
 * chip AND the monsters' typed-init chips are editable. The monster edit rides the OPTIMISTIC
 * `campaignStore.setEncounter` path (no Firestore under bypass), so a committed monster roll
 * lands visibly — the "the number still applies" proof.
 */

import { test, expect, type Page, type Locator } from "@playwright/test";
import { freezeMotion } from "./surfaces";

/** Every `.party-card`'s DOCUMENT-ABSOLUTE box (top/left include the scroll offset, so the
 *  measurement is immune to any incidental page scroll — only a genuine REFLOW moves a box).
 *  Catches the cards-BELOW shift when an in-place morph grows the edited card taller. */
function cardBoxes(page: Page) {
  return page.locator(".party-card").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top + window.scrollY),
        left: Math.round(r.left + window.scrollX),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    })
  );
}

/** One element's DOCUMENT-ABSOLUTE box. Used on the target card's `.party-head-toggle` (the
 *  flex:1 name column right of the INIT chip): an in-place chip morph steals ~85px from it —
 *  its left shifts right and its width shrinks — the width-independent shove signal the bug
 *  produces even when the card height doesn't change. */
function absBox(locator: Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top + window.scrollY),
      left: Math.round(r.left + window.scrollX),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  });
}

/** Boot the dev gathering encounter in a phone-ish column (where the morph reflows), motion
 *  frozen, and wait for the party cards to paint. */
async function bootEncounter(page: Page) {
  await page.setViewportSize({ width: 430, height: 920 });
  await page.addInitScript(() =>
    window.localStorage.setItem("d20-dev-encounter", "gathering")
  );
  await page.goto("/campaigns/mock-1");
  await page.locator(".party-card").first().waitFor({ timeout: 20_000 });
  await freezeMotion(page);
}

test.describe("initiative editor floats — the card never reflows", () => {
  test("PC card: opening the roll editor reflows NO card, floats a popover, and the roll→total still computes", async ({
    page,
  }) => {
    await bootEncounter(page);

    // The target is a PC (ally) card whose leading INIT chip is an editable trigger button.
    const pcCard = page
      .locator(".party-card[data-side='ally']")
      .filter({ has: page.locator("button.vital-init") })
      .first();
    const pcTrigger = pcCard.locator("button.vital-init");
    const pcToggle = pcCard.locator(".party-head-toggle");
    await pcTrigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const boxesBefore = await cardBoxes(page);
    const toggleBefore = await absBox(pcToggle);

    // Open the roller. The d20 input appears whether the editor floats (fix) or morphs in
    // place (regression), so this confirms the editor opened either way.
    await pcTrigger.click();
    const roll = page.getByPlaceholder("d20");
    await expect(roll).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(150); // let any (regressed) in-flow reflow settle before measuring

    // PRIMARY GUARD: nothing in flow moved. The name column keeps its EXACT box (an in-place
    // chip morph shoves it right + narrows it), and every card holds its geometry (a taller
    // edited card would push the ones below down). Both are frozen when the editor floats.
    expect(await absBox(pcToggle)).toEqual(toggleBefore);
    expect(await cardBoxes(page)).toEqual(boxesBefore);

    // MECHANISM: the edit box is FLOATED in a popover (not placed in the card head).
    await expect(page.locator(".popover").getByPlaceholder("d20")).toBeVisible();

    // The roll→total contract is intact: the live readout equals the typed roll + the shown
    // bonus (the app never rolls — it ADDS the engine bonus to the player's physical d20).
    await roll.fill("20");
    const mathText = await page.locator(".popover .vi-math").innerText();
    const m = mathText.match(/([+−-]?\d+)\s*=\s*(\d+)/);
    expect(m, `math readout parseable: "${mathText}"`).not.toBeNull();
    if (!m || m[1] === undefined || m[2] === undefined) {
      throw new Error(`math readout not parseable: "${mathText}"`);
    }
    const bonus = Number(m[1].replace("−", "-"));
    expect(Number(m[2])).toBe(20 + bonus);

    // Committing (Enter) closes the floating editor cleanly.
    await roll.press("Enter");
    await expect(roll).toBeHidden();
  });

  test("Monster card: opening the typed-init editor reflows NO card, floats a popover, and the entered value lands", async ({
    page,
  }) => {
    await bootEncounter(page);

    // The un-rolled Goblin Chief (initiative null → a glowing "—" chip) is a stable target;
    // pin the CARD by its title so it survives losing the urgent flag after the commit.
    const bossCard = page
      .locator(".party-card")
      .filter({ hasText: "Goblin Chief" })
      .first();
    const bossTrigger = bossCard.locator("button.vital-init");
    const bossToggle = bossCard.locator(".party-head-toggle");
    await bossTrigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await expect(bossTrigger).toContainText("—");

    const boxesBefore = await cardBoxes(page);
    const toggleBefore = await absBox(bossToggle);

    // Open the typed-init editor. The input appears whether it floats (fix) or morphs in
    // place (regression) — `init-edit-input` matches either — so the editor opened.
    await bossTrigger.click();
    const monsterInput = page.locator("input.init-edit-input");
    await expect(monsterInput).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(150);

    // PRIMARY GUARD: nothing in flow moved — the name column and every card hold their boxes.
    expect(await absBox(bossToggle)).toEqual(toggleBefore);
    expect(await cardBoxes(page)).toEqual(boxesBefore);
    // MECHANISM: the editor is floated in a popover.
    await expect(page.locator(".popover input.init-edit-input")).toBeVisible();

    // Entering a value APPLIES it: the optimistic encounter store re-renders the boss chip
    // with the committed initiative (the number lands), and the popover closes.
    await monsterInput.fill("15");
    await monsterInput.press("Enter");
    await expect(monsterInput).toBeHidden();
    await expect(bossTrigger).toContainText("15");
  });
});
