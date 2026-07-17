/**
 * E2E: Compendium browse page (Phase 5 — Part 1).
 *
 * Drives the new faceted, read-only SRD browse at `/compendium` (dev-bypass
 * auth, no Firebase): the type selector (Spells · Features · Feats · Equipment ·
 * Magic Items), bilingual search, a facet filter, and opening one entry's read
 * view + returning to the list. Powered by the same `CompendiumPicker` primitive
 * the sheet "Add-X" modals use — here in browse mode.
 */

import { test, expect } from "@playwright/test";

test.describe("Compendium browse", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/compendium");
    // The page's search box is the unique, content-bearing ready anchor.
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  test("browses spells by default and searches by name", async ({ page }) => {
    // Browse is global (no class filter) → every spell is listed.
    await expect(
      page.locator(".pick-name", { hasText: /Hypnotic Pattern/i }).first()
    ).toBeVisible();

    // Searching narrows the list (bilingual, accent-insensitive substring).
    await page.getByRole("searchbox").fill("Hypnotic");
    await expect(
      page.locator(".pick-name", { hasText: /Hypnotic Pattern/i }).first()
    ).toBeVisible();
    await expect(page.locator(".pick-name", { hasText: /Healing Word/i })).toHaveCount(0);
  });

  test("filters spells by level via a facet chip", async ({ page }) => {
    // The facets collapse behind the "Filters" disclosure at EVERY width
    // (COMPENDIUM-LUX v2); open it so the level chips are reachable.
    const filtersToggle = page.getByRole("button", { name: /^Filters$/i });
    if (await filtersToggle.isVisible().catch(() => false)) {
      await filtersToggle.click();
    }

    // The "Cantrip" level facet leaves only cantrips.
    await page.getByRole("button", { name: /^Cantrip$/i }).click();
    await expect(
      page.locator(".pick-name", { hasText: /Mage Hand/i }).first()
    ).toBeVisible();
    // A leveled spell (Hypnotic Pattern is L3) drops out.
    await expect(
      page.locator(".pick-name", { hasText: /Hypnotic Pattern/i })
    ).toHaveCount(0);
  });

  test("the clipped facet ledger always cues 'more below' at 390×844 IT (F1)", async ({
    page,
  }) => {
    // The bug: at phone height the flex-squeezed valve clips SCUOLA/PROPRIETÀ
    // below the fold, but the cut can land in a group GAP so nothing straddles
    // the edge and the shallow fade only dims whitespace — the panel reads
    // COMPLETE. The fix makes the cue DETERMINISTIC: a full-row-deep bottom fade
    // so the last visible row is always dimmed even when the cut is gap-aligned.
    await page.setViewportSize({ width: 390, height: 844 });
    // Hold the 0fr→1fr reveal still so the valve's settled height is measured,
    // not a mid-animation frame. Seed IT and reload so the whole ledger paints in
    // Italian (locale-robust below regardless — we assert geometry, never copy).
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.localStorage.setItem("i18nextLng", "it"));
    await page.reload();
    await expect(page.getByRole("searchbox")).toBeVisible();
    await page.getByRole("button", { name: /^(Filtri|Filters)$/i }).click();

    // Wait for the valve to settle into its clipped regime: the overflow-fade
    // observer flags the bottom edge (`data-fade` gains "b") once the reveal has
    // expanded and the content genuinely overflows.
    const scroll = page.locator(".cmp-facet-scroll");
    await expect
      .poll(() => scroll.evaluate((el) => el.getAttribute("data-fade") ?? ""))
      .toContain("b");

    // Depth of the bottom fade run in .cmp-facet-scroll[data-fade~="b"] — kept in
    // lockstep with folio.css (chip 25 + gap 11 + label margin ≈ 44px).
    const FADE = 44;
    const r = await scroll.evaluate((sc, fade) => {
      const el = sc as HTMLElement;
      const visH = el.clientHeight;
      const scRect = el.getBoundingClientRect();
      const chips = Array.from(el.querySelectorAll<HTMLElement>(".fchip")).map((c) => {
        const cr = c.getBoundingClientRect();
        return { top: cr.top - scRect.top, bottom: cr.bottom - scRect.top };
      });
      const straddles = chips.some((c) => c.top < visH - 1 && c.bottom > visH + 1);
      const fullyVisible = chips.filter((c) => c.bottom <= visH + 0.5);
      const lastFull = fullyVisible[fullyVisible.length - 1] ?? null;
      // The fade band [visH - fade, visH] overlaps the last fully-visible row.
      const fadeOverlapsLastRow = !!lastFull && lastFull.bottom > visH - fade;
      return {
        overflow: el.scrollHeight - el.clientHeight,
        dataFade: el.getAttribute("data-fade"),
        straddles,
        fadeOverlapsLastRow,
      };
    }, FADE);

    // Precondition: the valve is genuinely clipping (this is the bug's regime).
    expect(r.overflow).toBeGreaterThan(1);
    expect(r.dataFade).toContain("b");
    // The cue is present: a row straddles the edge OR the deep fade dims the last
    // fully-visible row — never a bright, "complete"-reading panel.
    expect(r.straddles || r.fadeOverlapsLastRow).toBe(true);
  });

  test("switches the type to Equipment via the codex ribbon", async ({ page }) => {
    // The type selector is now the codex ribbon (role=tablist / role=tab).
    await page.getByRole("tab", { name: "Equipment" }).click();
    // The Equipment spec's own search placeholder + a known item appear.
    await expect(page.getByPlaceholder(/search equipment/i)).toBeVisible();
    await expect(page.locator(".pick-name").first()).toBeVisible();
  });

  test("opens an entry's read view and returns to the list", async ({ page }) => {
    // COMPENDIUM-LUX has TWO reading models by width. The close control differs:
    // the phone leaf (the entry REPLACES the index) leads with a labelled Back;
    // the ≥1024px two-leaf spread (the index stays beside the entry) closes with
    // a corner ✕ — "back" is a lie when the list never left.
    const spread = (page.viewportSize()?.width ?? 0) >= 1024;
    const closeControl = page.getByRole("button", {
      name: spread ? /close/i : /back/i,
    });

    await page.getByRole("searchbox").fill("Hypnotic");
    await page
      .locator(".pick-row", { hasText: /Hypnotic Pattern/i })
      .first()
      .click();

    // EntryView: the entry title + its close control + its description body.
    await expect(closeControl).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Hypnotic Pattern/i }).first()
    ).toBeVisible();

    // COMPENDIUM-LUX masthead: the title sits in the illuminated entry head
    // beside the entry's struck seal and its type eyebrow (level · school) —
    // and the eyebrow renders ONLY there (not duplicated in the scroll body).
    const head = page.locator(".cmp-entry-head");
    await expect(head.getByRole("heading", { name: /Hypnotic Pattern/i })).toBeVisible();
    await expect(head.locator(".cmp-entry-seal .lvl-seal")).toBeVisible();
    await expect(head.locator(".cmp-entry-eyebrow")).toContainText(/level 3/i);
    await expect(page.locator(".cmp-entry-eyebrow")).toHaveCount(1);

    // Closing the leaf dismisses the entry and leaves the searchable list (on
    // the spread the index never left; on the phone it swaps back in).
    await closeControl.click();
    await expect(page.locator(".cmp-entry")).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  // ── COMPENDIUM-NAV — the explore-loop comfort properties ────────────────────

  test("keeps the list depth across the entry leaf (in-app Back AND browser Back)", async ({
    page,
  }) => {
    const list = page.locator(".cmp-list");
    // The comfort property is VISUAL: after Back, the row that topped the
    // viewport sits within a hair of where it was. The raw scrollTop is NOT
    // stable across a restore (content-visibility realizes the true heights of
    // newly visible rows and the same position re-expresses as a different
    // offset), so we measure the NAMED anchor row's viewport offset.
    const topAnchor = () =>
      list.evaluate((el) => {
        const lr = el.getBoundingClientRect();
        for (const row of el.querySelectorAll(".pick-row")) {
          const r = row.getBoundingClientRect();
          if (r.bottom > lr.top + 1) {
            return {
              name: row.querySelector(".pick-name")?.textContent ?? "",
              top: r.top - lr.top,
            };
          }
        }
        return null;
      });
    const offsetError = async (anchor: { name: string; top: number }) => {
      const v = await list.evaluate((el, a) => {
        const lr = el.getBoundingClientRect();
        for (const row of el.querySelectorAll(".pick-row")) {
          if ((row.querySelector(".pick-name")?.textContent ?? "") === a.name) {
            return row.getBoundingClientRect().top - lr.top - a.top;
          }
        }
        return null;
      }, anchor);
      return v == null ? Number.POSITIVE_INFINITY : Math.abs(v);
    };

    // The click point of the first row sitting FULLY inside the list viewport
    // (or null while none is realized yet). The coordinates come from a live
    // row rect — a blind center-click can land in the gap between rows.
    const firstVisibleRowPoint = () =>
      list.evaluate((el) => {
        const lr = el.getBoundingClientRect();
        for (const row of el.querySelectorAll(".pick-row")) {
          const r = row.getBoundingClientRect();
          if (r.top >= lr.top + 4 && r.bottom <= lr.bottom - 4) {
            return { x: r.left + r.width * 0.4, y: r.top + r.height / 2 };
          }
        }
        return null;
      });

    // `.cmp-list .pick-row` is `content-visibility: auto`, so a programmatic
    // scroll only realizes the true heights of the now-visible rows on the
    // NEXT layout pass. Read one frame too early and no row is cleanly fully
    // visible AND the top-of-viewport offset is still the pre-realization
    // ESTIMATE. Wait for a fully-visible row to appear before reading the
    // anchor or clicking: the app snapshots its restore anchor at click time
    // (post-realization), so the offset the test captures must be
    // post-realization too — otherwise the restore is compared against a
    // stale offset that is ~one row (≈58px) off.
    const settle = async () => {
      await expect.poll(() => firstVisibleRowPoint(), { timeout: 5000 }).not.toBeNull();
    };

    // Tap a VISIBLE row exactly as a user does — a locator click on row #1
    // would auto-scroll it back into view and corrupt the measurement.
    const clickVisibleRow = async () => {
      await settle();
      const pt = await firstVisibleRowPoint();
      if (!pt) throw new Error("no fully visible row to click");
      await page.mouse.click(pt.x, pt.y);
    };

    // COMPENDIUM-LUX — the depth-keeping property has TWO shapes by width.
    const spread = (page.viewportSize()?.width ?? 0) >= 1024;

    if (spread) {
      // The two-leaf spread NEVER unmounts the index: opening an entry paints
      // it on the recto beside a verso that keeps its exact scroll — depth is
      // preserved by construction, no remount/restore. Assert the list stays
      // visible and at the SAME offset across open + close.
      await list.evaluate((el) => {
        el.scrollTop = 1500;
      });
      await settle();
      const depth = await list.evaluate((el) => el.scrollTop);
      expect(depth).toBeGreaterThan(500);

      await clickVisibleRow();
      await expect(page.locator(".cmp-entry")).toBeVisible();
      await expect(page).toHaveURL(/sel=/);
      // The reading column starts AT THE TOP; the index stayed exactly put.
      expect(
        await page.locator(".cmp-entry .overflow-y-auto").evaluate((el) => el.scrollTop)
      ).toBe(0);
      await expect(list).toBeVisible();
      expect(await list.evaluate((el) => el.scrollTop)).toBe(depth);

      // Closing the leaf (corner ✕) leaves the index exactly where it was.
      await page.getByRole("button", { name: /close/i }).click();
      await expect(page.locator(".cmp-entry")).toHaveCount(0);
      await expect(page).not.toHaveURL(/sel=/);
      expect(await list.evaluate((el) => el.scrollTop)).toBe(depth);

      // The browser's own Back closes the entry too (the open pushed a history
      // entry) — the index never unmounts, so no depth restore is in play.
      await clickVisibleRow();
      await expect(page.locator(".cmp-entry")).toBeVisible();
      await page.goBack();
      await expect(page.locator(".cmp-entry")).toHaveCount(0);
      await expect(page).not.toHaveURL(/sel=/);
      return;
    }

    // Phone model — the leaf REPLACES the index, so the picker's scroll memory
    // must restore the index depth when the list remounts on Back.
    await list.evaluate((el) => {
      el.scrollTop = 1500;
    });
    await settle();
    const anchor = await topAnchor();
    if (!anchor || !anchor.name) throw new Error("no anchor row found");

    await clickVisibleRow();
    await expect(page.locator(".cmp-entry")).toBeVisible();

    // Opening an entry: it's in the URL (shareable; browser Back closes it)
    // and its read column starts AT THE TOP.
    await expect(page).toHaveURL(/sel=/);
    expect(
      await page.locator(".cmp-entry .overflow-y-auto").evaluate((el) => el.scrollTop)
    ).toBe(0);

    // In-app Back lands where the reader left the list: the anchor row within
    // half a row of its old offset (late content-visibility realization of a
    // wrapped row above can shift a final ~20px under load), clearly deep —
    // never reset to the start. The remounted list re-realizes its rows, which
    // under heavy CPU load can take longer than the default 5s poll to finish
    // settling, so give the restore up to 10s (tolerance stays tight).
    await page.getByRole("button", { name: /back/i }).click();
    await expect(list).toBeVisible();
    await expect.poll(() => offsetError(anchor), { timeout: 10000 }).toBeLessThan(32);
    expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);

    // …and the browser's own Back does too (the open was a pushed history
    // entry). Re-anchor first: the restore may re-express the depth. Settle
    // before reading so the fresh anchor is a post-realization offset too.
    await settle();
    const anchor2 = await topAnchor();
    if (!anchor2 || !anchor2.name) throw new Error("no anchor row found");
    await clickVisibleRow();
    await expect(page.locator(".cmp-entry")).toBeVisible();
    await page.goBack();
    await expect(list).toBeVisible();
    await expect(page).not.toHaveURL(/sel=/);
    await expect.poll(() => offsetError(anchor2), { timeout: 10000 }).toBeLessThan(32);
    expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  });

  test("switching entries replaces the leaf — closing returns to the index, never a pile", async ({
    page,
  }) => {
    // The tome shows ONE page at a time: opening entry B while A is open must
    // REPLACE A (not push a second frame), so a single close returns to the
    // index instead of unveiling A, then the entry before it. Needs the spread
    // (≥1024px), where the index list stays visible to click entry→entry.
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1024,
      "spread-only: the index leaf stays visible to click one entry then another"
    );

    // Open entry A.
    await page.getByRole("searchbox").fill("Hypnotic");
    await page
      .locator(".pick-row", { hasText: /Hypnotic Pattern/i })
      .first()
      .click();
    await expect(
      page.locator(".cmp-entry-head").getByRole("heading", { name: /Hypnotic Pattern/i })
    ).toBeVisible();
    await expect(page).toHaveURL(/sel=/);

    // Switch to entry B (the index leaf never left).
    await page.getByRole("searchbox").fill("Fireball");
    await page
      .locator(".pick-row", { hasText: /Fireball/i })
      .first()
      .click();
    await expect(
      page.locator(".cmp-entry-head").getByRole("heading", { name: /Fireball/i })
    ).toBeVisible();

    // One close lands on the INDEX — not a pile revealing entry A beneath B.
    await page.getByRole("button", { name: /close/i }).click();
    await expect(page.locator(".cmp-entry")).toHaveCount(0);
    await expect(page).not.toHaveURL(/sel=/);
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  test("the header Compendium tab lands on a fresh index, never the last open entry", async ({
    page,
  }) => {
    // The hub realm tabs are desktop-only chrome (they collapse below md into
    // "Ask the Folio").
    test.skip(
      (page.viewportSize()?.width ?? 0) < 768,
      "the hub nav tabs are desktop-only chrome"
    );

    // Open an entry (its `?sel=` becomes the recorded realm visit).
    await page.getByRole("searchbox").fill("Hypnotic");
    await page
      .locator(".pick-row", { hasText: /Hypnotic Pattern/i })
      .first()
      .click();
    await expect(page).toHaveURL(/sel=/);

    // Navigate away to another realm, then return via the header Compendium tab.
    await page.getByRole("link", { name: /^Characters$/ }).click();
    await expect(page).toHaveURL(/\/characters/);
    await page.getByRole("link", { name: /^Compendium$/ }).click();

    // A realm-tab click resurrects the codex category (`?type`) but NEVER the
    // open entry (`?sel`) or a seeded search (`?q`).
    await expect(page).toHaveURL(/\/compendium/);
    await expect(page).not.toHaveURL(/sel=/);
    await expect(page.locator(".cmp-entry")).toHaveCount(0);
  });

  test("a new search resets the list depth to the top", async ({ page }) => {
    const list = page.locator(".cmp-list");
    await list.evaluate((el) => {
      el.scrollTop = 1500;
    });
    await page.getByRole("searchbox").fill("bo");
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
  });

  test("Esc closes a deep-linked entry in place (URL never goes stale)", async ({
    page,
  }) => {
    await page.goto("/compendium?type=spell&sel=fireball");
    await expect(page.locator(".cmp-entry")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("searchbox")).toBeVisible();
    await expect(page).not.toHaveURL(/sel=/);
  });

  test("the page never grows with the codex (the tome scrolls, not the page)", async ({
    page,
  }) => {
    // 400+ spells must not stretch the document: the page may exceed the
    // viewport ONLY by the colophon footer (+ slack), at every width.
    const growth = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    );
    expect(growth).toBeLessThan(260);
    // …while the codex column itself carries the long scroll.
    const list = page.locator(".cmp-list");
    const scrollable = await list.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(scrollable).toBeGreaterThan(1000);
  });
});
