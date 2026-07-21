/**
 * Add-item picker scroll-preserve — REAL-Chromium proof that a background
 * character-store write does NOT snap the results list back to the top.
 *
 * The bug: `useCompendiumPicker` keyed `useScrollMemory` on the `filtered` result
 * ARRAY. That array's reference is re-created on EVERY character-store mutation
 * (the memo closes over `ctx`, which holds the whole character), so the ~2s
 * debounced auto-save write-back — or any session/HP tick — produced a fresh
 * `filtered` even though the visible rows were byte-identical, and the scroll
 * memory dutifully reset the list to the top. You scroll the Add-item list, the
 * store ticks in the background, the list jumps to row 0.
 *
 * jsdom cannot measure scroll, so this is proven in a real browser: scroll the
 * list, fire the faithful production trigger (`setCharacter` with a fresh doc —
 * exactly what the auto-save write-back does), and assert the depth is preserved.
 * Fails before the fix (scrollTop → 0), passes after (scrollTop unchanged).
 */

import { test, expect } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

test.describe("Add-item picker — scroll depth survives background store churn", () => {
  test("a character-store write does NOT reset the results list to the top", async ({
    page,
  }) => {
    await seedUI(page, "dark", "play");
    await seedLang(page, "en");
    // The bundled MOCK (Lyra Voss) under the dev-bypass — a non-readonly character,
    // so the store mutation below applies exactly as an owner edit would.
    await page.goto("/characters/mock-1?tab=inventory");
    await page.getByText("Lyra Voss").first().waitFor({ timeout: 20_000 });

    // Open the unified Add-item modal (its Equipment tab is the default).
    await page
      .getByRole("button", { name: /add item/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 20_000 });

    // The results list = the scroll container the picker attaches its memory to.
    // Empty query + no facet = the full SRD equipment list (plenty of rows).
    const list = dialog.locator('[data-variant="codex"]');
    await list.waitFor({ timeout: 20_000 });
    await expect
      .poll(() => list.evaluate((e) => e.querySelectorAll(".pick-row").length), {
        timeout: 10_000,
      })
      .toBeGreaterThan(20);

    // Scroll DOWN. The mount-time settle loop stands down on a >24px user move, so
    // once the depth holds we know the list is parked below the top.
    await list.evaluate((e) => {
      e.scrollTop = 300;
    });
    await expect
      .poll(() => list.evaluate((e) => e.scrollTop), { timeout: 5_000 })
      .toBeGreaterThan(100);
    const before = await list.evaluate((e) => e.scrollTop);

    // Faithful background CHARACTER-STORE churn: setCharacter with a fresh doc —
    // exactly the shape the ~2s auto-save write-back / a session tick produces. It
    // changes the character IDENTITY but NOT the equipment result set. Reaching the
    // live Zustand singleton via the Vite-served module keeps this a real store
    // write (no production test seam), same instance the app rendered from.
    await page.evaluate(async () => {
      // The Vite-served source URL resolves to the same module instance the app
      // imported, so this is the live Zustand singleton. The specifier is held in
      // a variable so tsc doesn't try to resolve the browser URL as a module; the
      // result is cast to the module's compile-time shape (no `any`, no seam).
      const specifier = "/src/stores/characterStore.ts";
      const mod = (await import(
        specifier
      )) as typeof import("../../src/stores/characterStore");
      const store = mod.useCharacterStore.getState();
      const doc = store.character;
      if (!doc) throw new Error("no character in store");
      store.setCharacter({ ...doc, session: { ...doc.session } });
    });

    // The list must NOT have jumped to the top — the rows are byte-identical.
    await expect
      .poll(() => list.evaluate((e) => e.scrollTop), { timeout: 5_000 })
      .toBeGreaterThan(100);
    const after = await list.evaluate((e) => e.scrollTop);
    expect(after, "scroll depth preserved across background store churn").toBe(before);
  });
});
