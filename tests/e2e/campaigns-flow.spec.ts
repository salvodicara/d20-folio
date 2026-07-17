/**
 * E2E: the campaign flow (Phase 5 — Part 2b).
 *
 * Drives the campaign realm under dev-bypass auth (no Firebase): the empty list,
 * create → reveal invite code → open the hub, join-by-code → hub, and the
 * campaign chrome (the breadcrumb segment) revealing only for a real Shared
 * campaign — never for a Personal character. The scoped-listener attach/detach
 * proof is the unit test (`campaign-hub.test.tsx`); this is the user-facing flow.
 *
 * Under dev-bypass create/join persist nothing and the hub seeds a deterministic
 * fixture ("The Starless Keep"), so the hub renders without a backend.
 */

import { test, expect } from "@playwright/test";

test.describe("Campaigns flow", () => {
  test("create a campaign, reveal the invite code, and land in the hub", async ({
    page,
  }) => {
    await page.goto("/campaigns");
    // D29 — under dev-bypass the list is now populated with the seeded campaign,
    // so the realm body has loaded once its card is visible.
    await expect(page.getByText(/the starless keep/i).first()).toBeVisible();

    // Populated list → the header "New campaign" CTA (empty-state "Create a
    // campaign" is matched too, for robustness).
    await page
      .getByRole("button", { name: /new campaign|create a campaign/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/campaign name/i).fill("The Starless Keep");
    await dialog.getByRole("button", { name: /^create campaign$/i }).click();

    // The invite link is revealed to share, then we open the hub.
    await expect(dialog.getByRole("button", { name: /open campaign/i })).toBeVisible();
    await dialog.getByRole("button", { name: /open campaign/i }).click();

    await expect(page).toHaveURL(/\/campaigns\/[A-Z0-9]+/i);
    await expect(page.getByRole("heading", { name: /treasury/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /party/i })).toBeVisible();

    // The hub names the campaign in its banner header (the breadcrumb was removed
    // per owner — the flat-hub topbar / bottom-nav carries the back navigation).
    // The DM title is an inline-editable, so assert the visible name text directly.
    await expect(page.getByText(/the starless keep/i).first()).toBeVisible();
  });

  test("join by invite code reaches the hub", async ({ page }) => {
    await page.goto("/campaigns");
    await expect(page.getByText(/the starless keep/i).first()).toBeVisible();
    // Populated list → the header "Join" CTA (empty-state "Join with a link" too).
    await page
      .getByRole("button", { name: /^join$|join with a link/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/invite link/i).fill("ABCDEFGH234567");
    await dialog.getByRole("button", { name: /^join$/i }).click();

    await expect(page).toHaveURL(/\/campaigns\/ABCDEFGH234567/i);
    await expect(page.getByRole("heading", { name: /treasury/i })).toBeVisible();
  });

  test("CAMPAIGN-NOTES-UX — long notes clamp behind Show more; long lists bound behind View all", async ({
    page,
  }) => {
    await page.goto("/campaigns/mock-1");
    await expect(page.getByRole("heading", { name: /shared notes/i })).toBeVisible();

    // The fixture's long rumor note renders CLAMPED at rest: its body stays under
    // the `note` cap (10.5em) instead of stretching the page…
    const noteClamp = page
      .locator("li", { hasText: "Rumors heard in Duskwell" })
      .locator(".note-clamp");
    const noteBody = noteClamp.locator(".note-clamp-body");
    await expect(noteClamp.getByRole("button", { name: /show more/i })).toBeVisible();
    const collapsed = (await noteBody.boundingBox())?.height ?? 0;
    expect(collapsed).toBeGreaterThan(0);
    expect(collapsed).toBeLessThanOrEqual(200);
    // …and "Show more" reveals the full text in place; "Show less" folds it back
    // to the cap (visibility of clipped text can't be asserted — overflow:hidden
    // clips the box, it doesn't hide the element — so pin the heights).
    await noteClamp.getByRole("button", { name: /show more/i }).click();
    await expect
      .poll(async () => (await noteBody.boundingBox())?.height ?? 0)
      .toBeGreaterThan(collapsed);
    await noteClamp.getByRole("button", { name: /show less/i }).click();
    await expect
      .poll(async () => (await noteBody.boundingBox())?.height ?? 0)
      .toBeLessThanOrEqual(200);

    // The session list shows the latest 5 of the fixture's 7; the archive sits
    // behind "View all (7)".
    const rows = page.locator(".sess-item");
    await expect(rows).toHaveCount(5);
    await page.getByRole("button", { name: /view all \(7\)/i }).click();
    await expect(rows).toHaveCount(7);

    // Expanding the long recap (Session 5) clamps it at the `reading` cap
    // (min(420px, 55vh)) with its own Show more.
    const longRow = page.locator(".sess-item", { hasText: "Session 5" });
    await longRow.locator(".sess-toggle").click();
    const sessMore = longRow.getByRole("button", { name: /show more/i });
    await expect(sessMore).toBeVisible();
    const sessBody = longRow.locator(".note-clamp-body");
    // Wait for the accordion glide to settle at the cap before measuring.
    await expect
      .poll(async () => (await sessBody.boundingBox())?.height ?? 0)
      .toBeGreaterThan(300);
    expect((await sessBody.boundingBox())?.height ?? 0).toBeLessThanOrEqual(421);
    await sessMore.click();
    await expect
      .poll(async () => (await sessBody.boundingBox())?.height ?? 0)
      .toBeGreaterThan(421);
  });

  test("a Personal character shows no campaign chrome (chrome hidden)", async ({
    page,
  }) => {
    await page.goto("/characters/mock-1");
    // The cockpit names the character in its OWN header (CombatHeader) — proves we
    // landed on the personal character page.
    await expect(page.getByText(/lyra voss/i).first()).toBeVisible();
    // A Shared-campaign name never leaks onto a personal character page (the cockpit
    // header + topbar/bottom-nav orient you; there is no campaign chrome here).
    await expect(page.getByText(/starless keep/i)).toHaveCount(0);
  });
});
