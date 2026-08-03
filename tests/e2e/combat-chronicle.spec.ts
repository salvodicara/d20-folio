/**
 * E2E — the auto-narrated Combat Chronicle, driven through the ACTUAL app surfaces in
 * REAL Chromium under dev-bypass (no Firebase). This is a KEEPER regression for the
 * chronicle pipeline (the real `reconcileChronicle` engine + the real feed/end/chapter
 * UI) AND the source of the owner-review screenshots (rule 25): it makes NO bespoke
 * showcase component — every pixel is a genuine in-app surface, produced by genuine user
 * actions against the real engine.
 *
 * Two legs:
 *
 *  A. The SHEET's universal in-encounter resolver — the evoker
 *     (`scn-evoker-wizard`) is scoped into a live own-turn encounter (the dev seam
 *     `d20-dev-combat-chronicle`), and a committed action opens the REAL banner where the
 *     player chooses concrete creatures, records each outcome, and TYPES only the dice
 *     fact the app cannot know:
 *     a weapon swing → one target + one damage field; Magic Missile → the multi-select
 *     with a PER-TARGET damage field (3 darts); Fireball → the area burst + one rolled
 *     damage. These are the PC's real `declareAttack` writes + the auto-apply to monster HP.
 *
 *  B. The DM hub's reconciled LIVE FEED + editable end entry + saved Chronicle chapter —
 *     the dev campaign (`mock-1`) runs a begun encounter with the bypass user as DM. The
 *     party's declared attacks are seeded (`d20-dev-declarations` — the dev-bypass
 *     stand-in for the players' live `combat/state` rings), and the DM books monster HP +
 *     conditions through the REAL encounter tracker across two rounds. The real
 *     `reconcileChronicle` fuses the two streams live: an auto-attributed weapon hit, a
 *     synthesized miss, a fused Magic Missile multi-line, a Fireball area-save with mixed
 *     saves (some resisted), a Topple→Prone rider credited to its caster, a plain
 *     Frightened condition, and a one-tap "No one" skip. End encounter → the editable
 *     entry → Save appends ONE chapter to the Chronicle.
 *
 * Screenshots: when CHRONICLE_SHOT_DIR is set the key surfaces are written there as PNGs
 * (light + dark) for the owner's review; the assertions run either way (the regression).
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { seedUI, seedLang, freezeMotion, settleForShot, type Theme } from "./surfaces";

const SHOT_DIR = process.env.CHRONICLE_SHOT_DIR;
if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });

/** Write a full-page review PNG (only when a shot dir is configured). Never a gate. */
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  await freezeMotion(page);
  await settleForShot(page);
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

/** Crop the end-entry itself at both responsive contracts. The regular full-page
 *  sequence stays desktop-first; this focused matrix makes the modal's frame margins
 *  and footer rhythm judgeable without making the owner hunt through a page shot. */
async function shotEndEntry(page: Page, dialog: Locator, theme: Theme): Promise<void> {
  if (!SHOT_DIR) return;
  await freezeMotion(page);
  await settleForShot(page);
  for (const viewport of [
    { name: "desktop", width: 1280, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await dialog.screenshot({
      path: path.join(SHOT_DIR, `B3-end-entry-${theme}-${viewport.name}.png`),
    });
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
}

/** Crop the joined encounter status + Chronicle surface at both responsive contracts. */
async function shotEncounterSummary(
  page: Page,
  theme: Theme,
  state: "expanded" | "collapsed"
): Promise<void> {
  if (!SHOT_DIR) return;
  const prior = page.viewportSize();
  for (const [label, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await freezeMotion(page);
    await settleForShot(page);
    await page.getByTestId("encounter-summary").screenshot({
      path: path.join(SHOT_DIR, `encounter-summary-${state}-${theme}-${label}.png`),
    });
  }
  if (prior) await page.setViewportSize(prior);
}

const THEMES: Theme[] = ["dark", "light"];

// ════════════════════════════════════════════════════════════════════════════
// A. The SHEET's in-encounter CombatResolver banner
// ════════════════════════════════════════════════════════════════════════════

/** Boot the evoker sheet scoped into the dev combat-chronicle encounter, on the Play
 *  tab, in `theme`. Returns once the Play surface (an action CTA) has painted. */
async function bootEvokerSheet(page: Page, theme: Theme): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await seedUI(page, theme, "play");
  await seedLang(page, "en");
  await page.addInitScript(() =>
    window.localStorage.setItem("d20-dev-combat-chronicle", "1")
  );
  await page.goto("/characters/scn-evoker-wizard?tab=play");
  await expect(page.getByText(/pyra/i).first()).toBeVisible({ timeout: 20_000 });
}

const banner = (page: Page) => page.getByTestId("combat-resolver");
const resolverTarget = (page: Page, name: string) =>
  banner(page)
    .locator(".combat-target-card")
    .filter({ has: page.getByText(name, { exact: true }) });

/** Type damage into one of the resolver's damage steppers (found by its accessible label).
 *  EXACT match — "Damage to Goblin" must not also match "Damage to Goblin Chief". */
async function enterBannerDamage(
  page: Page,
  label: string,
  amount: string
): Promise<void> {
  await banner(page).getByRole("spinbutton", { name: label, exact: true }).fill(amount);
}

/** Click an action-card CTA, finish any cast configuration, then wait for targets. */
async function commitAction(page: Page, ctaName: RegExp): Promise<void> {
  await page.getByRole("button", { name: ctaName }).first().click();
  const castOpt = page.locator(".cl-opt").first();
  if (await castOpt.isVisible({ timeout: 1500 }).catch(() => false))
    await castOpt.click();
  await expect(banner(page)).toBeVisible();
}

/** Apply the reviewed action. The exact preselected cast configuration commits now. */
async function applyResolvedAction(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Apply action", exact: true }).click();
  await expect(banner(page)).toHaveCount(0);
}

test.describe("Combat Chronicle — the sheet CombatResolver banner", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Desktop-first live play (mirrors combat.spec)."
  );

  for (const theme of THEMES) {
    test(`weapon swing → single-target damage entry (${theme})`, async ({ page }) => {
      await bootEvokerSheet(page, theme);
      await commitAction(page, /^(Attack|Used): Quarterstaff/);
      // Single-select: one concrete creature, one rolled-damage field, one review.
      await resolverTarget(page, "Goblin Chief").click();
      await enterBannerDamage(page, "Damage to Goblin Chief", "8");
      await shot(page, `A1-banner-weapon-${theme}`);
      // Confirm for real: the PC's declaration write + the auto-apply to the monster HP.
      await applyResolvedAction(page);
    });

    test(`Magic Missile → per-target damage entry (${theme})`, async ({ page }) => {
      await bootEvokerSheet(page, theme);
      await commitAction(page, /^(Cast|Used): Magic Missile/);
      // Multi-select up to the instance count (3 darts): pick distinct targets, and keep
      // every dart independently editable when more than one hits the same creature.
      await resolverTarget(page, "Goblin").click();
      await resolverTarget(page, "Goblin Chief").click();
      const chiefBonus = banner(page).getByRole("button", {
        name: "Apply +4 to one damage roll against Goblin Chief",
      });
      await chiefBonus.click();
      await expect(chiefBonus).toHaveAttribute("aria-pressed", "true");
      await banner(page)
        .getByRole("spinbutton", { name: "Instances assigned to Goblin", exact: true })
        .fill("2");
      await enterBannerDamage(page, "Damage roll 1 for Goblin", "3");
      await enterBannerDamage(page, "Damage roll 2 for Goblin", "3");
      await enterBannerDamage(page, "Damage to Goblin Chief", "4");
      await shot(page, `A2-banner-magic-missile-${theme}`);
      await applyResolvedAction(page);
    });

    test(`Fireball → area rolled-damage entry (${theme})`, async ({ page }) => {
      await bootEvokerSheet(page, theme);
      await commitAction(page, /^(Cast|Used): Fireball/);
      // Area save: unbounded multi-select + ONE rolled-damage number (applied in full to
      // all; the DM trims the savers).
      await resolverTarget(page, "Goblin").click();
      await resolverTarget(page, "Goblin Chief").click();
      await resolverTarget(page, "Ogre").click();
      await enterBannerDamage(page, "Damage you rolled", "24");
      await shot(page, `A3-banner-fireball-${theme}`);
      await applyResolvedAction(page);
    });
  }

  test("upcast is chosen before targets and changes the resolver instance cap", async ({
    page,
  }) => {
    await bootEvokerSheet(page, "dark");
    await page
      .getByRole("button", { name: /^(Cast|Used): Magic Missile/ })
      .first()
      .click();
    const rows = page.locator(".cl-opt");
    await expect(rows.nth(1)).toBeVisible();
    await rows.nth(1).click(); // level 2: four darts
    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText("0 of 4 assigned");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(banner(page)).toHaveCount(0);
  });

  test("the resolver keeps its hierarchy and actions reachable on a phone", async ({
    page,
  }) => {
    await bootEvokerSheet(page, "light");
    await commitAction(page, /^(Cast|Used): Fireball/);
    await resolverTarget(page, "Goblin").click();
    await resolverTarget(page, "Goblin Chief").click();
    await enterBannerDamage(page, "Damage you rolled", "24");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(banner(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply action", exact: true })
    ).toBeInViewport();
    const dialog = page.getByRole("dialog", { name: "Fireball" });
    const box = await dialog.boundingBox();
    expect(box?.width ?? Infinity).toBeLessThanOrEqual(390);
    if (SHOT_DIR) {
      await freezeMotion(page);
      await settleForShot(page);
      await dialog.screenshot({
        path: path.join(SHOT_DIR, "A4-resolver-mobile-light.png"),
      });
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B. The DM hub's reconciled live feed + end entry + saved chapter
// ════════════════════════════════════════════════════════════════════════════

/** The party's DECLARED attacks — the dev-bypass stand-in for the players' live
 *  `combat/state` rings. Keyed by member uid; the reconcile fuses them with the DM's
 *  live-booked HP below. Target ids + rounds are chosen so each (target, round) has ONE
 *  claimant (clean, un-ambiguous lines). Monster ids match the begun dev encounter:
 *  monster-1 Goblin (×3 tokens), monster-2 Goblin Chief, monster-3 Shadow. */
const DEV_DECLARATIONS = {
  "member-mara": [
    // R2 — a weapon swing that also knocks Prone (a Topple-mastery rider).
    { id: "1", targetIds: ["monster-2"], outcome: "hit", round: 2, riders: ["prone"] },
    // R2 — a clean miss (synthesized, needs no HP).
    { id: "2", targetIds: ["monster-3"], outcome: "miss", round: 2 },
    // R3 — Fireball over the whole field (area save-for-half).
    {
      id: "3",
      targetIds: ["monster-1", "monster-2", "monster-3"],
      outcome: "hit",
      round: 3,
      save: true,
    },
  ],
  "member-bren": [
    // R2 — a multi-instance spell splitting darts across two foes (Magic Missile shape).
    {
      id: "1",
      targetIds: ["monster-1", "monster-3"],
      outcome: "hit",
      round: 2,
      instances: 3,
    },
  ],
};

/** Boot the dev campaign hub as the DM of a begun encounter, with the party's
 *  declarations seeded, in `theme`. Returns once the party (Coralino) has painted. */
async function bootDmHub(page: Page, theme: Theme): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await seedUI(page, theme, "play");
  await seedLang(page, "en");
  await page.addInitScript((decls) => {
    window.localStorage.setItem("d20-dev-encounter", "1");
    window.localStorage.setItem("d20-dev-declarations", JSON.stringify(decls));
  }, DEV_DECLARATIONS);
  await page.goto("/campaigns/mock-1");
  await expect(page.getByText(/coralino/i).first()).toBeVisible({ timeout: 20_000 });
}

/** A monster combatant card by its stable id (the DM row carries `data-combatant-id`). */
const monsterCard = (page: Page, id: string) =>
  page.locator(`li[data-combatant-id="${id}"]`);

/** Open a monster card's DM disclosure body (idempotent — a no-op if already open). */
async function openMonster(page: Page, id: string): Promise<void> {
  const card = monsterCard(page, id);
  const toggle = card.locator(".party-head-toggle").first();
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(card.locator("button.vital-hp").first()).toBeVisible({ timeout: 1500 });
  }).toPass();
}

/** Book damage on one of a monster's HP tokens through the real token popover (DM edit
 *  → `recordMonsterHp` → a chronicle beat). `tokenIndex` selects among a group's tokens. */
async function bookDamage(
  page: Page,
  id: string,
  tokenIndex: number,
  amount: string
): Promise<void> {
  await openMonster(page, id);
  await monsterCard(page, id).locator("button.vital-hp").nth(tokenIndex).click();
  // The HP popover (a Radix dialog named by the monster, not "hit points") — scope to
  // it by its own Damage control so the amount field is unambiguous.
  const pop = page
    .locator('[role="dialog"]')
    .filter({ has: page.locator(".hp-act-dmg") });
  await pop.getByRole("spinbutton", { name: /amount/i }).fill(amount);
  await pop.locator(".hp-act-dmg").click();
  await expect(pop).toBeHidden();
}

const feed = (page: Page) =>
  page.locator("section", { hasText: "Chronicle of the fight" }).first();

/** Add a condition to a monster through the real DM condition editor, then close the
 *  listbox so it never covers a later interaction / screenshot. */
async function addCondition(page: Page, id: string, label: string): Promise<void> {
  await openMonster(page, id);
  const card = monsterCard(page, id);
  await card.locator("button.co-add").click();
  const listbox = page.getByRole("listbox", { name: /add condition/i });
  await listbox.getByRole("option", { name: label, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
}

/** Scroll the collapsible feed's line list to its end so the newest reconciled lines
 *  are in frame for a screenshot (the feed is a fixed-height scroll region). */
async function scrollFeedToEnd(page: Page): Promise<void> {
  await feed(page)
    .locator("ol")
    .evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    })
    .catch(() => {});
}

test.describe("Combat Chronicle — the DM hub feed, end entry, and saved chapter", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Desktop-first DM tracker (mirrors encounter-picker.spec)."
  );

  for (const theme of THEMES) {
    test(`the feed accumulates round-by-round, then saves a chapter (${theme})`, async ({
      page,
    }) => {
      await bootDmHub(page, theme);
      // The reconciled feed is live from the seeded declarations + the pre-seeded round-1
      // beats before the DM books a thing.
      await expect(feed(page).getByText("Chronicle of the fight")).toBeVisible();
      if (SHOT_DIR) {
        await shotEncounterSummary(page, theme, "expanded");
        const summaryToggle = page
          .getByTestId("encounter-summary")
          .getByRole("button", { name: /Chronicle of the fight/i });
        await summaryToggle.click();
        await shotEncounterSummary(page, theme, "collapsed");
        await summaryToggle.click();
      }

      // ── Round 2: the DM books what the party declared ────────────────────────
      // Goblin Chief takes Coralino's weapon hit (auto-attributed) + is knocked Prone
      // (the Topple rider, credited to Coralino).
      await bookDamage(page, "monster-2", 0, "7");
      await addCondition(page, "monster-2", "Prone");
      // Bren's multi-instance darts strike the Goblin group + the Shadow (fused).
      await bookDamage(page, "monster-1", 0, "5");
      await bookDamage(page, "monster-3", 0, "9");

      // The reconciled feed now carries the round-2 fusions.
      await expect(feed(page).getByText(/Coralino.*hits Goblin Chief for/)).toBeVisible();
      await expect(
        feed(page).getByText(/Goblin Chief is Prone \(Coralino/)
      ).toBeVisible();
      await expect(feed(page).getByText(/Bren.*hits Goblin.*Shadow/)).toBeVisible();
      await expect(feed(page).getByText(/Coralino.*misses Shadow/)).toBeVisible();
      await scrollFeedToEnd(page);
      await shot(page, `B1-feed-round2-${theme}`);

      // ── The one-tap "No one" skip on the pre-seeded pending PC hit ────────────
      await feed(page).getByRole("button", { name: "No one" }).first().click();

      // ── Advance to round 3 ───────────────────────────────────────────────────
      await page.getByRole("button", { name: "Next turn" }).click();
      await expect(page.getByText("Round 3").first()).toBeVisible();

      // ── Round 3: Coralino's Fireball — Goblin + Chief take it, the Shadow saves ─
      await bookDamage(page, "monster-1", 0, "1");
      await bookDamage(page, "monster-2", 0, "5");
      // A plain Frightened on the Shadow (no matching rider → an un-attributed line).
      await addCondition(page, "monster-3", "Frightened");

      await expect(
        feed(page).getByText(/Coralino.*blasts Goblin.*Goblin Chief.*Shadow.*no damage/)
      ).toBeVisible();
      await expect(feed(page).getByText(/Shadow is Frightened/)).toBeVisible();
      await scrollFeedToEnd(page);
      await shot(page, `B2-feed-round3-${theme}`);

      // ── End encounter → the editable entry ───────────────────────────────────
      await page.getByRole("button", { name: "End encounter" }).click();
      const endDialog = page.getByRole("dialog", {
        name: /save this fight to the chronicle/i,
      });
      await expect(endDialog).toBeVisible();
      await endDialog.getByLabel("Chapter title").fill("The Ambush at the Ravine Bridge");
      await endDialog
        .getByLabel("Your account of the fight")
        .fill(
          "The goblins sprang the trap on the bridge, but Coralino's fire broke them and the Shadow fled into the dark."
        );
      // The editable record carries the reconciled lines (the DM may prune any).
      await expect(endDialog.getByText(/Coralino.*hits Goblin Chief for/)).toBeVisible();
      await expect(endDialog.getByText(/blasts Goblin/)).toBeVisible();
      await shotEndEntry(page, endDialog, theme);
      await shot(page, `B3-end-entry-${theme}`);

      // ── Save → the chapter is appended to the Chronicle ──────────────────────
      await endDialog.getByRole("button", { name: "Save to Chronicle" }).click();
      await expect(endDialog).toBeHidden();
      // The Chronicle section now carries the appended chapter: its title is the newest
      // entry in the chapter navigator, and the FIXED reading body (which follows the
      // latest chapter) shows the saved narrative note + the reconciled record lines.
      const chronicle = page.locator('section[aria-labelledby="chronicle-head"]');
      // The appended chapter is the newest entry (its title shows in the chapter navigator
      // + as the reading heading)…
      await expect(
        chronicle.getByText("The Ambush at the Ravine Bridge").first()
      ).toBeAttached();
      // …and the FIXED reading body (which follows the latest chapter) shows the saved
      // narrative note + the reconciled record lines — proof the real save landed.
      const prose = chronicle.locator(".chronicle-prose").first();
      await expect(prose).toContainText("The goblins sprang the trap on the bridge");
      await expect(prose).toContainText("hits Goblin Chief for");
      await expect(prose).toContainText("blasts Goblin");
      await shot(page, `B4-saved-chapter-${theme}`);
    });

    // REMEDIABILITY (owner 2026-08-02 — "mistakes should always be remediable"): a
    // player-applied hit drops the monster's HP and reads as an attributed feed line; the
    // DM can UNDO it in one tap — the line disappears AND the monster's HP is restored.
    // (In dev-bypass the DM tracker stands in for the cross-user apply write; the real
    // member write path is proven by tests/rules/firestore-rules.test.ts.)
    test(`the DM can undo an auto-applied hit — line + HP both revert (${theme})`, async ({
      page,
    }) => {
      await bootDmHub(page, theme);
      // A player's declared weapon hit lands on the Goblin Chief (21 HP) — the applied
      // damage drops its HP and the reconciled feed reads it as Coralino's hit.
      await bookDamage(page, "monster-2", 0, "7");
      const chiefCard = monsterCard(page, "monster-2");
      await expect(chiefCard.locator(".vital-hp").first()).toContainText("14");
      const hitLine = feed(page).getByText(/Coralino.*hits Goblin Chief for 7/);
      await expect(hitLine).toBeVisible();
      await scrollFeedToEnd(page);
      await shot(page, `B5-applied-hit-${theme}`);

      // The DM overrides it: one tap on THAT line's Undo control removes the line AND heals
      // the Goblin Chief back to full — the auto-applied number is trivially correctable.
      // Scope to the Goblin Chief line's own row (the feed has an undo per HP line).
      await feed(page)
        .locator("li", { hasText: "hits Goblin Chief for 7" })
        .getByRole("button", { name: "Undo this line" })
        .click();
      await expect(hitLine).toHaveCount(0);
      await expect(chiefCard.locator(".vital-hp").first()).toContainText("21");
      await shot(page, `B6-dm-undo-${theme}`);
    });
  }
});
