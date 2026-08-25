import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { SurfaceCensusEntry, SurfaceVariant } from "../e2e/surface-census";
import {
  assertUniqueArtifactPaths,
  assertVisualMarkers,
  loadVisualCensus,
  reachVisualSurface,
  visualArtifactName,
  withIsolatedVisualPage,
} from "./census";

const FUTURE_VARIANT: SurfaceVariant = {
  locale: "en",
  theme: "light",
  device: "desktop",
};

function futureSurface(id: string, route: string, state: string): SurfaceCensusEntry {
  return {
    id,
    board: "A00",
    route,
    state,
    variants: [FUTURE_VARIANT],
    authority: "detector",
    callSite: "tests/visual/curated.spec.ts",
    curatedReview: true,
  };
}

test("detector gives future captures distinct artifact identities", () => {
  const dot = futureSurface("future.dot", "/future.dot", "state.dot");
  const dash = futureSurface("future-dash", "/future-dot", "state-dot");

  expect(visualArtifactName(dot, FUTURE_VARIANT)).not.toBe(
    visualArtifactName(dash, FUTURE_VARIANT)
  );
});

test("detector hard-fails duplicate planned curated artifact paths", () => {
  const surface = futureSurface("future.duplicate", "/future", "visible");
  expect(() =>
    assertUniqueArtifactPaths([
      { surface, variant: FUTURE_VARIANT },
      { surface, variant: FUTURE_VARIANT },
    ])
  ).toThrow(/duplicate visual artifact path/i);
  expect(() =>
    assertUniqueArtifactPaths([
      { surface, variant: FUTURE_VARIANT, frame: "entry" },
      { surface, variant: FUTURE_VARIANT, frame: "exit" },
    ])
  ).not.toThrow();
});

test("legacy captures isolate storage while preserving their runtime contract", async ({
  browser,
}) => {
  const census = await loadVisualCensus();
  const isolationKey = "d20-folio-visual-isolation";
  const captures = [
    { id: "roster-empty", mode: "play" },
    { id: "home", mode: "play" },
    { id: "character-spell-add", mode: "edit" },
  ] as const;

  for (const expected of captures) {
    const surface = census.find(({ id }) => id === expected.id);
    if (!surface) throw new Error(`Missing regression surface "${expected.id}".`);
    const variant = surface.variants[0];
    if (!variant) throw new Error(`Regression surface "${expected.id}" has no variant.`);

    await withIsolatedVisualPage(browser, async (page) => {
      await page.goto("/");
      expect(
        await page.evaluate((key) => window.localStorage.getItem(key), isolationKey)
      ).toBeNull();
      await reachVisualSurface(page, surface, variant);
      const seededMode = await page.evaluate(() => {
        const persisted = window.localStorage.getItem("d20-folio-ui");
        if (!persisted) return null;
        return (JSON.parse(persisted) as { state?: { sheetMode?: unknown } }).state
          ?.sheetMode;
      });
      expect(seededMode).toBe(expected.mode);
      await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
        isolationKey,
        expected.id,
      ] as const);
    });
  }
});

test("detector fails a hung capture with its census identity", async ({ browser }) => {
  test.setTimeout(5_000);
  const surface = futureSurface("future.hung", "/future-hung", "blocked");

  await expect(
    withIsolatedVisualPage(browser, async () => new Promise<void>(() => {}), {
      capture: { surface, variant: FUTURE_VARIANT, frame: "entry" },
      timeoutMs: 1_000,
    })
  ).rejects.toThrow(
    "future.hung [en/light/desktop/entry]: visual capture exceeded 1000ms"
  );
});

test("captures every curated census variant", async ({ browser }, testInfo) => {
  test.setTimeout(30 * 60_000);
  const census = await loadVisualCensus();
  const captures = census
    .filter(({ curatedReview }) => curatedReview)
    .flatMap((surface) => surface.variants.map((variant) => ({ surface, variant })));
  assertUniqueArtifactPaths(captures);

  for (const { surface, variant } of captures) {
    await withIsolatedVisualPage(
      browser,
      async (page) => {
        await reachVisualSurface(page, surface, variant);
        await page.screenshot({
          path: testInfo.outputPath(visualArtifactName(surface, variant)),
          fullPage: true,
        });
      },
      { capture: { surface, variant } }
    );
  }
});

test("detector captures a visible curated mutation as distinct bytes", async ({
  page,
}, testInfo) => {
  const before = testInfo.outputPath("curated-detector-before.png");
  const after = testInfo.outputPath("curated-detector-after.png");

  await page.setContent(
    '<main style="width: 200px; height: 120px; background: black"></main>'
  );
  await page.screenshot({ path: before });
  await page.locator("main").evaluate((element) => {
    element.setAttribute("style", "width: 200px; height: 120px; background: white");
  });
  await page.screenshot({ path: after });

  expect(await readFile(before)).not.toEqual(await readFile(after));
});

test("detector rejects a future specimen with a missing state marker", async ({
  page,
}) => {
  await page.setContent('<main data-surface-id="detector"></main>');
  await expect(
    assertVisualMarkers(page, {
      id: "detector",
      board: "A00",
      route: "/detector",
      state: "visible",
      variants: [{ locale: "en", theme: "light", device: "desktop" }],
      authority: "detector",
      callSite: "tests/visual/curated.spec.ts",
      curatedReview: true,
    })
  ).rejects.toThrow(/missing exact data-surface-id\/state markers/i);
});
