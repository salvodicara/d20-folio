/**
 * E2E: Mobile layout gate — EVERY surface at phone viewport (MOBILE-SWEEP).
 *
 * Walks the shared `SURFACES` manifest at 390×844 and asserts, per surface:
 *
 *  1. **No page-level horizontal overflow** — `scrollWidth ≤ clientWidth`.
 *     Horizontal scroll at page level is NEVER acceptable on a phone (owner,
 *     2026-06-11: the campaign hub scrolled sideways — root cause: a pasted URL
 *     in user-authored prose with no `overflow-wrap` defense; fixed by the
 *     body-level `overflow-wrap: break-word` in `src/index.css`, and the dev
 *     campaign chronicle now carries a viewport-wide URL at rest so THIS gate
 *     fails if that defense ever regresses).
 *
 *  2. **The realm bottom-nav is present + fully in the viewport** — the m-nav
 *     shows on EVERY signed-in route, wizards included (owner fb3, 2026-06-11:
 *     "the wizards are routes, not jails"); the login screen is the only
 *     sanctioned exception (no signed-in shell, and no manifest entry).
 *
 *  3. **Content clears the nav** — the AppShell reserves `--m-nav-h` bottom
 *     padding (the `.pwa-dock` clearance contract, DESIGN.md §11) so a page's
 *     last row is never occluded by the fixed bar.
 *
 * SELF-ENFORCING like the a11y gate: a new surface added to `surface-manifest.ts`
 * inherits all three checks automatically — mobile coverage can't silently rot.
 *
 * Also pins the guided-wizard regression (owner Img #6): the 10-step rail used to
 * run wider than the viewport in the ~620–1000px band, so the whole document
 * scrolled sideways. The band sweep lives here (one mobile-layout home) — it
 * subsumed and replaced the old `creation-no-horizontal-overflow.spec.ts`.
 */

import { test, expect, type Page } from "@playwright/test";
import { SURFACES, MOBILE, seedUI, seedLang, freezeMotion } from "./surfaces";
import { waitForStableLayout, waitForQuiescentWidth } from "./ready";

/** Strict page-level horizontal overflow in px (0 or negative = none). */
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

/**
 * The card/row NAME selectors protected by the No-Truncation Rule (DESIGN.md §3
 * — owner, 2026-06-12: "the ellipsis on mobile … like 'Pozione di G…' are not
 * really acceptable"). Identity text on a card or picker row must WRAP, never
 * mid-string ellipsize or clip. The probe is the F1-audit methodology made
 * permanent: an element whose content is wider than its box (`scrollWidth >
 * clientWidth`) is a clipped name — with `text-overflow: ellipsis` that is an
 * ENGAGED "Pozione di G…", and without it a silent crop; both are failures.
 * `.uc-name-cell` is probed alongside `.uc-name` because the name renders
 * INLINE inside the cell (so marks flow after the last word) and inline boxes
 * report scrollWidth 0 — the cell catches a parent-level clip reintroduction.
 */
const NAME_SELECTORS = [
  ".uc-name",
  ".uc-name-cell",
  ".pick-name",
  // CARD-NAMES extended (AC-ZERO, owner 2026-06-12: "Coralino di Sanval…"): the
  // roster CARD title.
  ".ch-name",
  // The campaign party card title (owner 2026-07-07 re-decision, golden rule 26): the
  // 2026-06-29 single-line/ellipsis exception was reversed — the freed row lets the name
  // break at a space, so it WRAPS like every other name family and must never clip.
  ".party-id-hero",
];

/** Every protected name element whose content is clipped horizontally. */
async function clippedNames(page: Page): Promise<string[]> {
  return page.evaluate((selectors: string[]) => {
    const offenders: string[] = [];
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        const rect = el.getBoundingClientRect();
        // Skip unlaid-out boxes (hidden, or inside a content-visibility-skipped
        // row) — they report zero sizes and cannot be judged.
        if (rect.width === 0 || rect.height === 0) continue;
        const clip = el.scrollWidth - el.clientWidth;
        if (clip > 1) {
          const text = el.textContent.trim().slice(0, 60);
          offenders.push(`${sel} "${text}" clipped by ${clip}px`);
        }
      }
    }
    return offenders;
  }, NAME_SELECTORS);
}

for (const surface of SURFACES) {
  test(`mobile layout: ${surface.slug} — no h-overflow, m-nav present + cleared`, async ({
    page,
  }) => {
    // The viewport is set explicitly below, so the run under the Pixel-7 device
    // project would be an identical duplicate — one execution is the whole gate.
    test.skip(
      test.info().project.name === "mobile",
      "explicit 390×844 viewport — runs once under chromium"
    );
    await seedUI(page, "dark", surface.edit ? "edit" : "play");
    await seedLang(page, "en");
    await page.setViewportSize(MOBILE);
    await page.goto(surface.route, { waitUntil: "domcontentloaded" });
    await surface.ready(page);
    if (surface.prepare) await surface.prepare(page);
    await freezeMotion(page);
    // Deterministic measurement: fonts swapped, reflow cascade quiesced.
    await waitForStableLayout(page);
    await waitForQuiescentWidth(page);

    // 1 — the page NEVER scrolls horizontally on a phone.
    const overflow = await pageOverflow(page);
    expect(
      overflow,
      `page overflows horizontally by ${overflow}px at ${MOBILE.width}px`
    ).toBeLessThanOrEqual(1);

    // 2 — the realm bottom-nav is mounted, visible, and fully inside the viewport
    // on every signed-in surface (login excepted — it has no manifest entry;
    // `shellless` surfaces render ABOVE the router, where the nav cannot exist
    // by construction — the no-h-overflow assertion above still applies to them).
    if (surface.shellless) return;
    const nav = page.locator(".m-nav");
    await expect(nav, "the mobile bottom-nav must render on every page").toBeVisible();
    const box = await nav.boundingBox();
    expect(box, "the m-nav must have a layout box").not.toBeNull();
    if (box) {
      expect(box.x, "m-nav left edge inside the viewport").toBeGreaterThanOrEqual(-1);
      expect(
        box.x + box.width,
        "m-nav right edge inside the viewport"
      ).toBeLessThanOrEqual(MOBILE.width + 1);
      expect(box.y, "m-nav top edge inside the viewport").toBeGreaterThanOrEqual(0);
      expect(
        box.y + box.height,
        "m-nav bottom edge inside the viewport"
      ).toBeLessThanOrEqual(MOBILE.height + 1);
    }

    // 3 — the shell reserves the nav's height so content never floats beneath it
    // (the `--m-nav-h` clearance contract, DESIGN.md §11).
    const clearance = await page.evaluate(() => {
      const canvas = document.querySelector(".app-canvas");
      if (!canvas) return -1;
      return parseFloat(getComputedStyle(canvas).paddingBottom);
    });
    const navHeight = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--m-nav-h"))
    );
    expect(
      clearance,
      `the shell must reserve ≥ --m-nav-h (${navHeight}px) bottom padding; got ${clearance}px`
    ).toBeGreaterThanOrEqual(navHeight);

    // 4 — no card/row NAME is mid-string truncated or clipped (the No-Truncation
    // Rule, DESIGN.md §3). Names WRAP at phone width; the verdict/CTA cluster
    // keeps natural width. Manifest-wide and self-enforcing: any new surface
    // rendering a UniversalCard or PickerRow inherits the check.
    const offenders = await clippedNames(page);
    expect(
      offenders,
      `card/row names must wrap, never truncate (No-Truncation Rule):\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
}

/**
 * No-Truncation worst-string stress (IT) — drives the four card/row surfaces to
 * the LONGEST real Italian SRD names (IT runs ~25–45% longer than EN; worst is
 * the 49-char "Turibolo del Controllo degli Elementali dell'Aria") and asserts
 * the protected name selectors render unclipped at 390px. The compendium routes
 * use `?q=` so the worst row is top-of-list (also defeating the codex list's
 * content-visibility skip); the cockpit tabs carry their long entries in
 * MOCK_CHARACTER (detect-thoughts · dungeoneers-pack — seeded for exactly this).
 */
const WORST_NAME_SURFACES: { slug: string; route: string; anchor: RegExp }[] = [
  {
    slug: "compendium-magic-item-longest",
    route: "/compendium?type=magic-item&q=turibolo",
    anchor: /Turibolo del Controllo degli Elementali dell'Aria/,
  },
  {
    slug: "compendium-equipment-longest",
    route: "/compendium?type=equipment&q=dotazione da esploratore",
    anchor: /Dotazione da Esploratore di Dungeon/,
  },
  {
    slug: "cockpit-spells-longest",
    route: "/characters/mock-1?tab=spells",
    anchor: /Individuazione dei Pensieri/,
  },
  {
    slug: "cockpit-inventory-longest",
    route: "/characters/mock-1?tab=inventory",
    anchor: /Dotazione da Esploratore di Dungeon/,
  },
];

for (const s of WORST_NAME_SURFACES) {
  test(`no-truncation stress (IT): ${s.slug} — longest real name renders unclipped`, async ({
    page,
  }) => {
    test.skip(
      test.info().project.name === "mobile",
      "explicit 390×844 viewport — runs once under chromium"
    );
    await seedUI(page, "dark", "play");
    await seedLang(page, "it");
    await page.setViewportSize(MOBILE);
    await page.goto(s.route, { waitUntil: "domcontentloaded" });
    await page.getByText(s.anchor).first().waitFor({ timeout: 20000 });
    await freezeMotion(page);
    await waitForStableLayout(page);
    const offenders = await clippedNames(page);
    expect(
      offenders,
      `the longest IT names must wrap, never truncate (No-Truncation Rule):\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
}

/**
 * Regression (MOBILE-SWEEP): a wide setting control (the 3-way theme Segmented)
 * must never crush the shrinkable `.sr-text` label column into a one-character
 * vertical sliver at phone width — the row WRAPS instead (folio.css `.set-row`
 * phone rule). Pins the readable label minimum the wrap is keyed on.
 */
test("settings rows never crush the label column at phone width", async ({ page }) => {
  test.skip(
    test.info().project.name === "mobile",
    "explicit 390×844 viewport — runs once under chromium"
  );
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  await page.setViewportSize(MOBILE);
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 15000 });
  await waitForStableLayout(page);
  const widths = await page.$$eval(".set-row .sr-text", (els) =>
    els.map((el) => el.getBoundingClientRect().width)
  );
  expect(widths.length, "the settings rows must render").toBeGreaterThan(0);
  for (const w of widths) {
    expect(w, "a setting label column must stay readable (≥150px)").toBeGreaterThan(150);
  }
});

/**
 * Regression (owner Img #6): the guided creation wizard must NOT force a
 * page-level horizontal scroll at narrow / split-window viewports — the wizard-F
 * orbs WRAP. (Moved verbatim from the retired creation-only spec; the manifest
 * walk above covers 390, this sweeps the historical ~620–1000px failure band.)
 */
test("guided wizard never overflows the page horizontally at narrow widths", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "d20-folio-ui",
      JSON.stringify({ state: { theme: "light", motion: "auto" }, version: 0 })
    );
    localStorage.setItem("i18nextLng", "it");
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/characters/new", { waitUntil: "networkidle" });
  // Switch to the Guided mode that renders the multi-step rail.
  const guided = page.getByRole("button", { name: /guidato|guided/i }).first();
  if (await guided.isVisible({ timeout: 5000 }).catch(() => false)) {
    await guided.click();
  }
  await waitForStableLayout(page);
  await expect(page.locator(".wiz-orbs")).toBeVisible();
  await waitForQuiescentWidth(page);

  for (const w of [960, 880, 820, 760, 700, 640]) {
    await page.setViewportSize({ width: w, height: 900 });
    await waitForStableLayout(page);
    await waitForQuiescentWidth(page);
    const overflow = await pageOverflow(page);
    expect(
      overflow,
      `page overflows horizontally by ${overflow}px at ${w}px wide`
    ).toBeLessThanOrEqual(1);
  }
});

/**
 * The ROSTER card title at DESKTOP card width (AC-ZERO, owner 2026-06-12). The
 * "Coralino di Sanval…" leak was on a ~480px-wide card — NOT a phone — so the
 * 390px manifest walk alone would have missed it. This squeezes the column to the
 * real card width (480px / 360px) and asserts the protected roster title
 * (`.ch-name`) never clips horizontally.
 */
for (const cardWidth of [480, 360]) {
  test(`card titles wrap at ${cardWidth}px desktop card width: roster-cards`, async ({
    page,
  }) => {
    test.skip(
      test.info().project.name === "mobile",
      "explicit desktop viewport — runs once under chromium"
    );
    await seedUI(page, "dark", "play");
    await seedLang(page, "en");
    // A real desktop window — then constrain the WINDOW to the card column so
    // the cards reflow to their narrow per-card width (the screenshot's case).
    await page.setViewportSize({ width: cardWidth + 40, height: 1000 });
    await page.goto("/characters", { waitUntil: "domcontentloaded" });
    await page
      .getByText(/Lyra Voss/)
      .first()
      .waitFor({ timeout: 20000 });
    await freezeMotion(page);
    await waitForStableLayout(page);
    await waitForQuiescentWidth(page);
    const offenders = await clippedNames(page);
    expect(
      offenders,
      `card titles must WRAP at ${cardWidth}px, never truncate (No-Truncation Rule):\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
}

/**
 * CARD-NAMES party title (owner 2026-07-07 re-decision, golden rule 26 — REVERSES
 * the 2026-06-29 single-line/ellipsis exception). The freed row (the player tag
 * moved to the subtitle) lets the hero name break at a SPACE, so `.party-id-hero`
 * now WRAPS balanced like every other name family and must never clip. At the
 * card's real DESKTOP widths (480 / 360px — where the AC-ZERO leak occurred) the
 * long synthetic "Bren Ironbeard of the Thunderhold" wraps to two balanced lines
 * instead of the mid-word "Bren Ironbeard of the Thunderho…" ellipsis.
 */
for (const cardWidth of [480, 360]) {
  test(`party card title wraps, never clips at ${cardWidth}px: campaign-hub-party`, async ({
    page,
  }) => {
    test.skip(
      test.info().project.name === "mobile",
      "explicit desktop viewport — runs once under chromium"
    );
    await seedUI(page, "dark", "play");
    await seedLang(page, "en");
    await page.setViewportSize({ width: cardWidth + 40, height: 1000 });
    await page.goto("/campaigns/mock-1", { waitUntil: "domcontentloaded" });
    await page
      .getByText(/Bren Ironbeard of the Thunderhold/)
      .first()
      .waitFor({ timeout: 20000 });
    await freezeMotion(page);
    await waitForStableLayout(page);
    await waitForQuiescentWidth(page);
    const offenders = await clippedNames(page);
    expect(
      offenders,
      `party card titles must WRAP at ${cardWidth}px, never truncate (No-Truncation Rule):\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
}

/**
 * The cockpit rail-drop band (P1-cockpit-combat): the three-column HUD mounts at
 * the `rail:` breakpoint (--bp-rail 1180px, DESIGN.md §11) — NOT `lg:` (1024).
 * Between 1024–1179 (iPad landscape) three columns squeezed the center column to
 * ~400px — narrower than a phone — which ragged-wrapped the turn meter and hid
 * the Bio tab off the strip with no cue. The band keeps the recomposed
 * single-column cockpit (rails behind their Stats/Resources disclosures); the
 * three-column grid returns at ≥1180.
 */
test("cockpit tablet band (1100px): single column with rail disclosures; 3-col returns at 1180", async ({
  page,
}) => {
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await waitForStableLayout(page);

  // 1100 (inside the 1024–1179 band): the rails sit behind their disclosure
  // toggles and the content column owns the full width (never the ~400px squeeze).
  const statsToggle = page.getByRole("button", { name: /^stats$/i });
  await expect(statsToggle).toBeVisible();
  const contentWidth = await page
    .locator(".content")
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(contentWidth, "band content column must not be squeezed").toBeGreaterThan(700);

  // ≥1180: the three-column HUD mounts — toggles hide, rails render open.
  await page.setViewportSize({ width: 1180, height: 800 });
  await waitForStableLayout(page);
  await expect(statsToggle).toBeHidden();
  await expect(page.locator(".content")).toBeVisible();
});

/**
 * The ⌘K hint chip is a hint for a keyboard most phone users don't have — and it
 * used to leak a `Ctrl K` chip on some mobile widths (facts.json). It is now gated
 * off coarse pointers (§3.5), so a touch phone never renders it (the shortcuts
 * themselves still WORK on a tablet with a hardware keyboard). Mobile project only
 * (the coarse-pointer emulation lives in the Pixel-7 profile).
 */
test("the ⌘K hint chip never renders on a touch phone (§3.5)", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "coarse-pointer gating — assert under the touch (mobile) profile only"
  );
  await page.goto("/characters", { waitUntil: "domcontentloaded" });
  await page.getByRole("main").waitFor();
  await expect(page.locator(".topbar-ask kbd")).toHaveCount(0);
});
