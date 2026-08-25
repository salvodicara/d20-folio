import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import {
  assertSurfaceCensus,
  SURFACE_CENSUS,
  type B01MotionFrame,
  type SurfaceCensusEntry,
  type SurfaceVariant,
} from "../e2e/surface-census";
import { seedLang, seedUI, SURFACES, type Surface } from "../e2e/surfaces";

const CENSUS_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../e2e/surface-census"
);
const LEGACY_RUNTIME = new Map<string, Surface>(
  SURFACES.map((surface) => [surface.slug, surface])
);
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

type CensusFragmentModule = { SURFACE_CENSUS_FRAGMENT?: unknown };

export interface VisualCapture {
  readonly surface: SurfaceCensusEntry;
  readonly variant: SurfaceVariant;
  readonly frame?: B01MotionFrame;
}

function fragmentFiles(): readonly string[] {
  return readdirSync(CENSUS_DIRECTORY)
    .filter((file) => file.endsWith(".ts") && file !== "index.ts" && file !== "schema.ts")
    .sort();
}

/** Load the canonical census plus deterministically discovered, schema-checked future fragments. */
export async function loadVisualCensus(): Promise<readonly SurfaceCensusEntry[]> {
  const entries: SurfaceCensusEntry[] = [...SURFACE_CENSUS];
  const files = fragmentFiles();
  const fragments = await Promise.all(
    files.map(
      async (file) =>
        (await import(`../e2e/surface-census/${file}`)) as CensusFragmentModule
    )
  );

  for (const [index, fragment] of fragments.entries()) {
    const file = files[index];
    if (!Array.isArray(fragment.SURFACE_CENSUS_FRAGMENT)) {
      throw new Error(
        `Surface census fragment "${file}" must export SURFACE_CENSUS_FRAGMENT.`
      );
    }
    for (const surface of fragment.SURFACE_CENSUS_FRAGMENT) {
      if (!SURFACE_CENSUS.includes(surface as SurfaceCensusEntry)) {
        entries.push(surface as SurfaceCensusEntry);
      }
    }
  }

  assertSurfaceCensus(entries);
  return entries;
}

function routeFor(surface: SurfaceCensusEntry, frame?: B01MotionFrame): string {
  const route = new URL(surface.route, "http://visual-review.local");
  route.searchParams.set("__visualState", surface.state);
  if (frame) route.searchParams.set("__visualFrame", frame);
  return `${route.pathname}${route.search}`;
}

export async function assertVisualMarkers(
  page: Page,
  surface: SurfaceCensusEntry,
  frame?: B01MotionFrame
): Promise<void> {
  const statePresent = await page
    .locator("[data-surface-id][data-surface-state]")
    .evaluateAll(
      (nodes, expected) =>
        nodes.some(
          (node) =>
            node.getAttribute("data-surface-id") === expected.id &&
            node.getAttribute("data-surface-state") === expected.state
        ),
      surface
    );
  expect(statePresent, `${surface.id}: missing exact data-surface-id/state markers`).toBe(
    true
  );

  if (frame) {
    const framePresent = await page
      .locator("[data-surface-id][data-surface-state][data-motion-frame]")
      .evaluateAll(
        (nodes, expected) =>
          nodes.some(
            (node) =>
              node.getAttribute("data-surface-id") === expected.surface.id &&
              node.getAttribute("data-surface-state") === expected.surface.state &&
              node.getAttribute("data-motion-frame") === expected.frame
          ),
        { surface, frame }
      );
    expect(framePresent, `${surface.id}: missing data-motion-frame="${frame}"`).toBe(
      true
    );
  }
}

/** Reach one census state without allowing a future fragment to fall back to legacy behavior. */
export async function reachVisualSurface(
  page: Page,
  surface: SurfaceCensusEntry,
  variant: SurfaceVariant,
  frame?: B01MotionFrame
): Promise<void> {
  await page.setViewportSize(VIEWPORTS[variant.device]);
  await seedUI(page, variant.theme, "play");
  await seedLang(page, variant.locale);

  const legacy = LEGACY_RUNTIME.get(surface.id);
  if (legacy) {
    expect(
      legacy.route,
      `${surface.id}: legacy runtime route drifted from the census`
    ).toBe(surface.route);
    await page.goto(surface.route);
    await legacy.ready(page);
    if (legacy.prepare) await legacy.prepare(page);
    return;
  }

  if (frame) {
    await page.emulateMedia({
      reducedMotion: frame === "reduced" ? "reduce" : "no-preference",
    });
  }
  await page.goto(routeFor(surface, frame));
  await assertVisualMarkers(page, surface, frame);
}

export function visualArtifactName(
  surface: SurfaceCensusEntry,
  variant: SurfaceVariant,
  frame?: B01MotionFrame
): string {
  const route = surface.route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const state = surface.state.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const viewport = VIEWPORTS[variant.device];
  return [
    surface.board,
    route,
    state,
    variant.locale,
    variant.theme,
    `${viewport.width}x${viewport.height}`,
    frame,
    encodeURIComponent(surface.id),
  ]
    .filter(Boolean)
    .join("-")
    .concat(".png");
}

/** Refuse an evidence plan that would overwrite another capture's artifact. */
export function assertUniqueArtifactPaths(captures: readonly VisualCapture[]): void {
  const paths = new Set<string>();

  for (const capture of captures) {
    const path = visualArtifactName(capture.surface, capture.variant, capture.frame);
    if (paths.has(path)) {
      throw new Error(`Duplicate visual artifact path "${path}".`);
    }
    paths.add(path);
  }
}
