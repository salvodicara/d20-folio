/**
 * E2E: Level-Up Flow (wizard F — the full-screen route)
 *
 * Drives Lyra Voss (Bard 9 → 10) through `/characters/mock-1/level-up`:
 * Hit Points → Spells (read-then-Learn morph list: +1 spell, +1 cantrip,
 * optional swap) → Review & Confirm. Bard 10 gains Magical Secrets,
 * +1 5th-level slot, Bardic Inspiration d8→d10 (the review cards).
 */

import { test, expect, type Page } from "@playwright/test";
import { firstWord, teamFixtureName } from "./team-fixture";

// Derived from the pack fixture at runtime — no name literal ships publicly.
const HERO_NAME = teamFixtureName("catalion-bard");
const HERO_FIRST = firstWord(HERO_NAME);
import { seedLang } from "./surfaces";

async function openWizard(page: Page) {
  // DETERMINISM (full-suite contention, 2026-07-01): mirror a reduced-motion OS
  // user BEFORE the first paint so `data-motion="reduced"` collapses every
  // transition (see index.css). The morph-list disclosure (`.wiz-fold`) is a
  // grid-track animation; clicking the Learn button WHILE that track is still
  // opening let a CPU-starved "stable" heuristic mis-fire the synthetic click —
  // it double-toggled the pick (togglePick add→remove) and the row sat back at
  // 0/1. Instant folds remove the moving target entirely.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/characters/mock-1");
  // First-load post-conditions carry the sibling fb3 tests' 20s budget: the
  // shared vite dev server serves the SPA's cold module graph slowly under many
  // parallel workers, and the default 5s expect window is too tight then (a bare
  // <img> loading shell, not a real failure).
  await expect(page.getByText("Lyra Voss").first()).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", { name: /level up|livello/i })
    .first()
    .click();
  // The route paints the wizard chrome: eyebrow carries name + level range.
  await expect(page.getByText(/9 → 10/).first()).toBeVisible({ timeout: 20000 });
}

/** The footer's forward CTA (Continue / Confirm) — position-stable. */
function nextBtn(page: Page) {
  return page.locator(".wiz-pager-btn.next");
}

test.describe("Level-Up Flow (wizard F)", () => {
  test("level-up button routes to the wizard with pixel-stable chrome", async ({
    page,
  }) => {
    await openWizard(page);
    await expect(page).toHaveURL(/\/characters\/mock-1\/level-up$/);
    // Progress orbs + the Hit Points chapter.
    await expect(page.locator(".wiz-orbs")).toBeVisible();
    await expect(page.locator(".wiz-title")).toBeVisible();
    // Average is pre-selected on the HP step.
    await expect(page.locator(".lvl-pick.selected").first()).toBeVisible();
  });

  test("chrome holds still across step navigation (no perceived jump)", async ({
    page,
  }) => {
    await openWizard(page);
    // LAYOUT positions (scroll-independent): the chrome must not move between
    // steps — the owner's "no perceived jump while navigating" contract.
    const layoutTops = () =>
      page.evaluate(() => {
        const top = (sel: string) =>
          document.querySelector<HTMLElement>(sel)?.offsetTop ?? -1;
        return { orbs: top(".wiz-orbs"), title: top(".wiz-title") };
      });
    const before = await layoutTops();
    await nextBtn(page).click(); // hp → spells
    await expect(page.locator(".wiz-list").first()).toBeVisible();
    const after = await layoutTops();
    expect(after.orbs).toBe(before.orbs);
    expect(after.title).toBe(before.title);
  });

  test("spells step: read-then-Learn — browsing never commits; Learn does", async ({
    page,
  }) => {
    await openWizard(page);
    await nextBtn(page).click(); // hp → spells
    await expect(page.locator(".wiz-list").first()).toBeVisible();

    // Tap a row: it expands for READING (no pick committed — tab count 0/1).
    const firstRow = page.locator(".wiz-row").first();
    await firstRow.click();
    await expect(page.locator(".wiz-entry[data-open]").first()).toBeVisible();
    // The explicit Learn commits the pick: the entry seals gold.
    await page.locator(".wiz-entry[data-open] .wiz-read-act button").first().click();
    await expect(page.locator(".wiz-entry[data-picked]").first()).toBeVisible();
    // Detail on SELECTED only: collapse the row → the open-book affordance grows.
    await page.locator(".wiz-entry[data-picked] .wiz-row").first().click();
    await expect(page.locator(".wiz-book").first()).toBeVisible();
  });

  test("full journey: pick spell + cantrip, review shows gains, confirm levels up", async ({
    page,
  }) => {
    await openWizard(page);
    await nextBtn(page).click(); // hp → spells
    await expect(page.locator(".wiz-list").first()).toBeVisible(); // step painted

    // Slot tabs: pick 1 leveled spell on the first slot…
    const firstRow = page.locator(".wiz-row").first();
    await firstRow.click();
    await page.locator(".wiz-entry[data-open] .wiz-read-act button").first().click();
    // STATE SIGNAL (full-suite contention incidents, 2026-06-12): the pick must
    // be COMMITTED (the entry seals gold) before the tab switch re-renders the
    // list — under CPU starvation an unanchored follow-on click could land on
    // the old list mid-commit and the journey then stalled at the gated pager.
    await expect(page.locator(".wiz-entry[data-picked]")).toHaveCount(1);
    // …then switch to the cantrips tab and learn one. Anchor on the tab's own
    // pressed state, THEN on the swapped pool (the cantrip pool has no picks
    // yet) — both real state signals, so the next .wiz-row click can never hit
    // the stale leveled-spell list.
    const cantripTab = page.locator(".wiz-fork-tab").last();
    await cantripTab.click();
    await expect(cantripTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".wiz-entry[data-picked]")).toHaveCount(0);
    await page.locator(".wiz-row").first().click();
    await expect(page.locator(".wiz-entry[data-open]").first()).toBeVisible();
    await page.locator(".wiz-entry[data-open] .wiz-read-act button").first().click();
    await expect(page.locator(".wiz-entry[data-picked]")).toHaveCount(1);

    // Continue: the SWAP step (B5 — its own orb; optional, skip it)…
    await nextBtn(page).click();
    await expect(
      page.getByText(/Replace a Spell|Sostituisci un incantesimo/i).first()
    ).toBeVisible();
    // …then to review: the gains cards render (Magical Secrets + scaling).
    await nextBtn(page).click();
    await expect(page.getByText(/Magical Secrets|Segreti Magici/i).first()).toBeVisible();
    await expect(
      page.getByText(/Bardic Inspiration|Ispirazione Bardica/i).first()
    ).toBeVisible();

    // Confirm: the wizard applies the level and enthrones the NON-dismissing
    // completion ceremony (fb2, owner 2026-06-11) — its one CTA returns to
    // the cockpit.
    const confirm = nextBtn(page);
    await expect(confirm).toBeEnabled();
    await confirm.click();
    // Bounds widened 8s → 30s/15s after the 2026-06-12 full-suite contention
    // incidents: the apply + ceremony (and the route change after it) are pure
    // local work that exceeded 8s ONLY under concurrent-load CPU starvation —
    // the assertions themselves are unchanged.
    await expect(page.locator(".wiz-done")).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: /To the sheet|Vai alla scheda/ }).click();
    await expect(page).toHaveURL(/\/characters\/mock-1$/, { timeout: 15000 });
  });

  test("next is gated until the current step is complete", async ({ page }) => {
    await openWizard(page);
    await nextBtn(page).click(); // hp → spells (hp defaults complete: average)
    // Nothing picked yet → Continue is disabled.
    await expect(nextBtn(page)).toBeDisabled();
  });

  test("leaving the wizard asks for confirmation ONLY when dirty (A1)", async ({
    page,
  }) => {
    await openWizard(page);
    // PRISTINE: browser back leaves immediately — never a trap, no prompt.
    await page.goBack();
    await expect(page).toHaveURL(/\/characters\/mock-1$/, { timeout: 5000 });

    // DIRTY (moved a step): back now prompts; staying keeps the wizard.
    await openWizard(page);
    await nextBtn(page).click(); // hp → spells (invested)
    await page.goBack();
    await expect(
      page.getByText(/Leave the level-up|Abbandonare il passaggio/i).first()
    ).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^(Continue|Continua)$/ }).click();
    await expect(page.getByText(/9 → 10/).first()).toBeVisible();
  });
});

/**
 * fb3 regression pins (owner 2026-06-11, third report) — driven at the owner's
 * REAL reproduction: his window width (~1130px CSS), the Artigiano/Crafter
 * tool asks inside the chosen feat's throne, Italian locale.
 */
test.describe("fb3: asks-column ledger + chrome rhythm + mobile nav", () => {
  test("the chosen feat's tool asks are a BOUNDED, scrolling, dense ledger at 1130px (the owner's width)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1130, height: 800 });
    await seedLang(page, "it");
    test.skip(!HERO_NAME, "pack fixtures absent (SRD-only tree)");
    await page.goto("/characters/team-catalion-bard/level-up");
    await expect(page.getByText(HERO_FIRST).first()).toBeVisible({ timeout: 20000 });
    await nextBtn(page).click(); // hp → boon
    await page.locator(".wiz-fork-tab").nth(2).click(); // feat mode
    const row = page.locator(".wiz-row").filter({ hasText: "Artigiano" }).first();
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await page.getByRole("button", { name: /Scegli Artigiano/ }).click();
    await expect(page.locator(".wiz-entry[data-chosen]")).toBeVisible();
    // Wait for the asks track to settle.
    const asksList = page.locator(".wiz-spread-asks .wiz-asks .wiz-list").first();
    await expect(asksList).toBeVisible();
    await page.waitForTimeout(400);

    const m = await asksList.evaluate((el) => {
      const rows = [...el.querySelectorAll<HTMLElement>(".wiz-row")];
      const seal = el.querySelector<HTMLElement>(".wiz-socket");
      return {
        clientH: el.clientHeight,
        scrollH: el.scrollHeight,
        overflowY: getComputedStyle(el).overflowY,
        rowHeights: rows.map((r) => r.getBoundingClientRect().height),
        sealW: seal?.getBoundingClientRect().width ?? 0,
      };
    });
    // BOUNDED + internally scrolling — the card never balloons (owner: "we
    // don't want that card to expand like that").
    expect(m.overflowY).toBe("auto");
    expect(m.clientH).toBeLessThanOrEqual(330);
    expect(m.scrollH).toBeGreaterThan(m.clientH);
    // DENSE width-proof rows — never a 50px-socket slab (the leak was 66px).
    for (const h of m.rowHeights) expect(h).toBeLessThanOrEqual(44);
    expect(m.sealW).toBeLessThanOrEqual(28);
  });

  test("EQUAL-HEIGHT ENTHRONEMENT (fb4): reading → chosen → released keeps the SAME card height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1130, height: 800 });
    await seedLang(page, "it");
    test.skip(!HERO_NAME, "pack fixtures absent (SRD-only tree)");
    await page.goto("/characters/team-catalion-bard/level-up");
    await expect(page.getByText(HERO_FIRST).first()).toBeVisible({ timeout: 20000 });
    await nextBtn(page).click(); // hp → boon
    await page.locator(".wiz-fork-tab").nth(2).click(); // feat mode
    const row = page.locator(".wiz-row").filter({ hasText: "Artigiano" }).first();
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await page.waitForTimeout(450); // the unfold settles
    const entry = page.locator('[data-fid="crafter"]');
    const reading = await entry.boundingBox();
    expect(reading).not.toBeNull();

    // Commit — the asks track opens INSIDE the measured height lock.
    await page.getByRole("button", { name: /Scegli Artigiano/ }).click();
    await expect(page.locator(".wiz-entry[data-chosen]")).toBeVisible();
    await page.waitForTimeout(450); // the track morph settles
    const chosenBox = await entry.boundingBox();
    expect(
      Math.abs((chosenBox?.height ?? 0) - (reading?.height ?? -1))
    ).toBeLessThanOrEqual(1.5);

    // The act row never folds: the ghost release stands where Choose stood…
    const release = page.getByRole("button", { name: /Rimuovi la scelta/ });
    await expect(release).toBeVisible();
    // …and releasing reverses to the SAME height too.
    await release.click();
    await page.waitForTimeout(450);
    const releasedBox = await entry.boundingBox();
    expect(
      Math.abs((releasedBox?.height ?? 0) - (reading?.height ?? -1))
    ).toBeLessThanOrEqual(1.5);
  });

  test("the fork-card foot renders on ONE line in Italian (third report — never a wrapped LIVELLO)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1130, height: 800 });
    await seedLang(page, "it");
    test.skip(!HERO_NAME, "pack fixtures absent (SRD-only tree)");
    await page.goto("/characters/team-catalion-bard/level-up");
    await expect(page.getByText(HERO_FIRST).first()).toBeVisible({ timeout: 20000 });
    const foots = page.locator(".wiz-card-foot");
    const n = await foots.count();
    expect(n).toBeGreaterThan(1); // the fork gallery is present
    for (let i = 0; i < n; i++) {
      const h = await foots.nth(i).evaluate((el) => el.getBoundingClientRect().height);
      // One mono-micro line ≈ 21px incl. padding; a wrapped foot measured 34px.
      expect(h).toBeLessThanOrEqual(26);
    }
  });

  test("the chrome→first-card gap is IDENTICAL across steps (no reserved void)", async ({
    page,
  }) => {
    await openWizard(page);
    const gap = () =>
      page.evaluate(() => {
        const chrome = document.querySelector<HTMLElement>(".wiz-chrome");
        const body = document.querySelector<HTMLElement>(".wiz-body");
        const first = body?.firstElementChild as HTMLElement | null;
        if (!chrome || !first) return -1;
        return first.getBoundingClientRect().top - chrome.getBoundingClientRect().bottom;
      });
    const hpGap = await gap();
    await nextBtn(page).click(); // hp → spells
    await expect(page.locator(".wiz-list").first()).toBeVisible();
    const spellsGap = await gap();
    expect(spellsGap).toBe(hpGap);
    // Reduced: no 34px reserved fork slab between the hint and the body.
    expect(hpGap).toBeLessThanOrEqual(24);
  });

  test("mobile: the realm nav STAYS in the wizard, the pager clears it, and Back is visible (never overlapped)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWizard(page);
    // (b) the realm bottom-nav is present INSIDE the wizard route.
    const mNav = page.locator(".m-nav");
    await expect(mNav).toBeVisible();
    // (a) Back is visible and NOT overlapped by the next pill.
    const back = page.locator(".wiz-pager-btn.back");
    const next = page.locator(".wiz-pager-btn.next");
    await expect(back).toBeVisible();
    const [bb, nb, nv] = await Promise.all([
      back.boundingBox(),
      next.boundingBox(),
      mNav.boundingBox(),
    ]);
    expect(bb && nb && bb.x + bb.width <= nb.x + 1).toBeTruthy();
    // The pager cluster sits ABOVE the realm nav.
    expect(bb && nv && bb.y + bb.height <= nv.y + 1).toBeTruthy();
    // (c) the forward caption is compact and unclipped (no ellipsis overflow).
    const capFits = await next.evaluate((el) => {
      const cap = [...el.querySelectorAll<HTMLElement>(".wiz-pager-cap")].find(
        (c) => getComputedStyle(c).display !== "none"
      );
      return cap ? cap.scrollWidth <= cap.clientWidth + 1 : false;
    });
    expect(capFits).toBeTruthy();
  });

  test("mobile: the creation wizard keeps the realm nav too", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/characters/new");
    await expect(page.locator(".wiz").first()).toBeVisible();
    await expect(page.locator(".m-nav")).toBeVisible();
  });
});
