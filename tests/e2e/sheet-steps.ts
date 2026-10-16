/**
 * Steps shared by the Play-board journeys after the direction-B reorganisation
 * (owner 2026-10-16): the special situations and the base actions open on
 * request, and every state is lit from the status row's one "+" under the name.
 */
import { expect, type Page } from "@playwright/test";

/** Open the closed "Special situations" row (no-op when already open). */
export async function openSituations(page: Page): Promise<void> {
  const row = page.locator("details.situations").first();
  await row.scrollIntoViewIfNeeded();
  if ((await row.getAttribute("open")) === null) {
    await row.locator("summary").click();
  }
  await expect(row).toHaveAttribute("open", "");
}

/** Open the closed "Base Actions" group (no-op when already open). */
export async function openBaseActions(page: Page): Promise<void> {
  const group = page.locator("details.base-actions").first();
  await group.scrollIntoViewIfNeeded();
  if ((await group.getAttribute("open")) === null) {
    await group.locator("summary").click();
  }
  await expect(group).toHaveAttribute("open", "");
}

/** The status row's "+" menu, opened. */
async function openAddState(page: Page) {
  await page
    .getByRole("button", { name: /^(aggiungi stato|add a state)$/i })
    .first()
    .click();
}

/** Light a condition from the status row's "+" (Italian or English label). */
export async function addCondition(page: Page, label: string): Promise<void> {
  await openAddState(page);
  const listbox = page.getByRole("listbox", {
    name: /aggiungi condizione|add condition/i,
  });
  await listbox.getByRole("option", { name: label, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
}

/** Switch on a feature state (Rage, Cover…) from the status row's "+". */
export async function lightState(page: Page, label: RegExp | string): Promise<void> {
  await openAddState(page);
  await page
    .locator(".status-add-group")
    .getByRole("button", { name: label })
    .first()
    .click();
  await page.keyboard.press("Escape");
}

/** A badge in the character's status row. */
export function stateBadge(page: Page, label: RegExp | string) {
  return page.locator(".char-status-row .status-badge", { hasText: label }).first();
}
