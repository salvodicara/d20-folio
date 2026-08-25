import { expect, test } from "@playwright/test";
import { B01_MOTION_FRAMES } from "../e2e/surface-census";
import {
  assertUniqueArtifactPaths,
  loadVisualCensus,
  reachVisualSurface,
  visualArtifactName,
} from "./census";

test("captures B01 frames for motion-enabled census entries", async ({
  page,
}, testInfo) => {
  test.setTimeout(10 * 60_000);
  const surfaces = (await loadVisualCensus()).filter(
    (surface) => surface.motionFrames && surface.motionFrames.length > 0
  );
  test.skip(
    surfaces.length === 0,
    "No Tactical Codex motion fragments are registered yet."
  );
  const captures = surfaces.flatMap((surface) => {
    const variant = surface.variants[0];
    if (!variant) throw new Error(`${surface.id}: motion surface has no variant.`);
    return (surface.motionFrames ?? []).map((frame) => ({ surface, variant, frame }));
  });
  assertUniqueArtifactPaths(captures);

  for (const { surface, variant, frame } of captures) {
    await reachVisualSurface(page, surface, variant, frame);
    if (frame === "reduced") {
      await expect(
        page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
      ).resolves.toBe(true);
    }
    await page.screenshot({
      path: testInfo.outputPath(visualArtifactName(surface, variant, frame)),
      fullPage: true,
    });
  }
});

test("detector writes every imported B01 motion frame", async ({ page }, testInfo) => {
  const written: string[] = [];

  for (const frame of B01_MOTION_FRAMES) {
    if (frame === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    else await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setContent(
      `<main data-surface-id="motion-detector" data-surface-state="visible" data-motion-frame="${frame}">${frame}</main>`
    );
    if (frame === "reduced") {
      expect(
        await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
      ).toBe(true);
    }
    const file = `motion-detector-${frame}.png`;
    await page.screenshot({ path: testInfo.outputPath(file) });
    written.push(file);
  }

  expect(written).toEqual(
    B01_MOTION_FRAMES.map((frame) => `motion-detector-${frame}.png`)
  );
});
