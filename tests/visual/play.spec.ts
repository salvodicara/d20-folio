/**
 * The play surface's screenshot lane — the owner's visual gate (golden rule 25).
 *
 * It drives the DEV harness `/_play` (a folded fixture over an in-memory table: no Firestore, no
 * sign-in, no network) across the matrix the redesign is judged on — 1440 × 900 and 1024 × 768,
 * dark and light, Italian and English, the DM and a seated player — and then through the states
 * a still frame cannot reach by loading a URL: the drawer, a settled roll, the reaction card,
 * a fog rectangle mid-drag, an area under consideration, and the HP editor.
 *
 * **Nothing here is asserted against a pixel.** These are curated frames for a person to look
 * at; the semantics are pinned by `tests/unit/play-screen.test.tsx`. The one thing the lane does
 * assert is that the frame it captured is the frame it meant to capture — a screenshot of an
 * error page is worse than no screenshot, because it is reviewed as if it were the design.
 *
 *   pnpm exec playwright test --config=playwright.visual.config.ts tests/visual/play.spec.ts
 *
 * Captures land OUTSIDE the repository (`PLAY_CAPTURES`, overridable by env), because they are
 * review artefacts of one session, not files the repository carries.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "node:process";
import { expect, test, type Page } from "@playwright/test";

const OUT = resolve(
  env.PLAY_CAPTURES ??
    "/private/tmp/claude-501/-Users-salvatoredicara-Workspace-d20-folio/a49dee04-dc15-46c6-b800-150db2a01d08/scratchpad/play-captures"
);

const VIEWPORTS = {
  "1440x900": { width: 1440, height: 900 },
  "1024x768": { width: 1024, height: 768 },
} as const;

type Theme = "dark" | "light";
type Locale = "it" | "en";
type Role = "dm" | "player" | "spectator";

/** Seed theme and language BEFORE boot so the first paint is already right (no flash, no race)
 *  — the same discipline `tests/e2e/surfaces.ts` uses for the census lane. */
async function seed(
  page: Page,
  theme: Theme,
  locale: Locale,
  dice: "app" | "manual" = "app"
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ([t, lng, mode]) => {
      window.localStorage.setItem(
        "d20-folio-ui",
        JSON.stringify({ state: { theme: t, sheetMode: "play" }, version: 0 })
      );
      window.localStorage.setItem("i18nextLng", lng);
      // The person's dice mode: the app rolls, so a capture never waits on a form — except
      // where the capture is OF a landed blow, which needs chosen faces to be deterministic.
      window.localStorage.setItem("d20-dice-mode", mode);
    },
    [theme, locale, dice] as const
  );
}

/** Open the harness, take the role, and hide the harness's own chrome so it never appears in a
 *  frame the owner reviews as product. */
async function open(
  page: Page,
  opts: {
    theme: Theme;
    locale: Locale;
    role: Role;
    scene?: "ambush" | "reaction";
    dice?: "app" | "manual";
  }
): Promise<void> {
  await seed(page, opts.theme, opts.locale, opts.dice);
  await page.goto(opts.scene === "reaction" ? "/_play?scene=reaction" : "/_play");
  await expect(page.getByTestId("play-screen")).toBeVisible({ timeout: 30_000 });
  if (opts.role !== "dm") {
    await page
      .getByTestId("play-dev-chrome")
      .getByRole("combobox")
      .first()
      .selectOption(opts.role);
  }
  await expect(page.getByTestId("play-screen")).toHaveAttribute("data-role", opts.role);
  await page.addStyleTag({
    content: `[data-testid="play-dev-chrome"]{display:none!important}
      *,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}`,
  });
  // The map's ground is drawn into a canvas at first render; give it a frame to land.
  await page.waitForTimeout(300);
}

async function shot(page: Page, name: string): Promise<void> {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test.describe("the matrix the redesign is judged on", () => {
  for (const [size, viewport] of Object.entries(VIEWPORTS)) {
    for (const theme of ["dark", "light"] as const) {
      for (const locale of ["it", "en"] as const) {
        for (const role of ["dm", "player"] as const) {
          test(`${size} · ${theme} · ${locale} · ${role}`, async ({ page }) => {
            await page.setViewportSize(viewport);
            await open(page, { theme, locale, role });
            await shot(page, `play-${size}-${theme}-${locale}-${role}`);
          });
        }
      }
    }
  }
});

/**
 * The one GEOMETRY assertion in this lane, and it is here because it is a standing owner
 * correction rather than a matter of taste: the HUD's two clusters are mirrored about the bar,
 * so the portrait's centre and the End turn ring's centre sit on one horizontal line. A layout
 * change that lets the right cluster drift down or right fails here instead of arriving as the
 * same review comment a third time.
 */
test("the HUD's two clusters share one horizontal centre", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS["1440x900"]);
  await open(page, { theme: "dark", locale: "it", role: "dm" });
  const centreY = async (testId: string): Promise<number> => {
    const box = await page.getByTestId(testId).boundingBox();
    if (!box) throw new Error(`${testId} has no box`);
    return box.y + box.height / 2;
  };
  const [portrait, ring, bar] = await Promise.all([
    centreY("pl-portrait"),
    centreY("pl-end-turn"),
    centreY("pl-hotbar-bar"),
  ]);
  // The portrait's own ring against the End turn ring: the correction is about those two
  // circles, so the assertion is about those two circles. The HP pill hangs below the portrait
  // and would have tolerated any drift.
  expect(Math.abs(portrait - ring)).toBeLessThanOrEqual(2);
  expect(Math.abs(ring - bar)).toBeLessThanOrEqual(2);
});

test.describe("the states a URL cannot reach", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS["1440x900"]);
  });

  test("the DM drawer, on the log", async ({ page }) => {
    await open(page, { theme: "dark", locale: "it", role: "dm" });
    await page.getByTestId("pl-drawer-open").click();
    await expect(page.getByTestId("pl-drawer")).toBeVisible();
    await shot(page, "state-drawer-registro");
    await page.getByTestId("pl-dtab-hidden").click();
    await shot(page, "state-drawer-nascosti");
    await page.getByTestId("pl-dtab-fog").click();
    await shot(page, "state-drawer-nebbia");
    await page.getByTestId("pl-dtab-rules").click();
    await shot(page, "state-drawer-regole");
  });

  test("the drawer's Modifica, on a line that wounded somebody", async ({ page }) => {
    // Manual dice so the blow LANDS: the control exists only on a line that moved somebody's
    // hit points, and a random miss would cut a capture of an absent button.
    await open(page, { theme: "dark", locale: "it", role: "dm", dice: "manual" });
    await page.getByTestId("pl-tile-pc:lyra:weapon-rapier#attack").click();
    await page.getByTestId("pl-cell-ogre").click();
    const faces = page.getByTestId("pl-roll-manual").locator('input[type="number"]');
    await faces.nth(0).fill("20");
    await faces.nth(1).fill("8");
    await page.getByTestId("pl-roll-apply").click();
    await page.getByTestId("pl-drawer-open").click();
    const edit = page.locator('[data-testid^="pl-edit-"]').first();
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(page.getByTestId("pl-hp-editor")).toBeVisible();
    await shot(page, "state-drawer-modifica");
  });

  test("a settled roll, with its verdict", async ({ page }) => {
    await open(page, { theme: "dark", locale: "it", role: "player" });
    await page.getByTestId("pl-tile-pc:lyra:weapon-rapier#attack").click();
    await expect(page.getByTestId("pl-aiming")).toBeVisible();
    await page.getByTestId("pl-cell-ogre").click();
    await expect(page.getByTestId("pl-roll")).toBeVisible();
    await shot(page, "state-roll-panel");
  });

  test("the reaction card, with the window open", async ({ page }) => {
    await open(page, { theme: "dark", locale: "it", role: "dm", scene: "reaction" });
    await expect(page.getByTestId("pl-reaction")).toBeVisible();
    await shot(page, "state-reaction-card");
  });

  test("a fog rectangle being drawn", async ({ page }) => {
    await open(page, { theme: "dark", locale: "it", role: "dm" });
    await page.getByTestId("pl-tool-fog-reveal").click();
    await expect(page.getByTestId("pl-subbar")).toBeVisible();
    const map = page.getByRole("application");
    const box = await map.boundingBox();
    if (!box) throw new Error("the map has no box");
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.55, {
      steps: 8,
    });
    await expect(page.getByTestId("map-fog-preview")).toBeVisible();
    await shot(page, "state-fog-drawing");
    await page.mouse.up();
  });

  test("an area under consideration, with its caption", async ({ page }) => {
    await open(page, { theme: "dark", locale: "it", role: "player" });
    await page.getByTestId("pl-tile-pc:lyra:spell-fireball#cast").click();
    await expect(page.getByTestId("pl-aiming")).toBeVisible();
    const map = page.getByRole("application");
    const box = await map.boundingBox();
    if (!box) throw new Error("the map has no box");
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.32);
    await expect(page.getByTestId("map-area")).toBeVisible();
    await shot(page, "state-area-preview");
  });

  test("the HP editor, mid-correction", async ({ page }) => {
    await open(page, { theme: "dark", locale: "it", role: "dm" });
    await page.getByTestId("pl-hp-pill").click();
    await expect(page.getByTestId("pl-hp-editor")).toBeVisible();
    await page.getByTestId("pl-hp-amount").fill("13");
    await shot(page, "state-hp-editor");
  });

  test("the token pill on a selected creature", async ({ page }) => {
    await open(page, { theme: "dark", locale: "it", role: "dm" });
    await page.getByTestId("pl-cell-ogre").click();
    await expect(page.getByTestId("pl-token-pill")).toBeVisible();
    await expect(page.getByTestId("pl-target")).toBeVisible();
    await shot(page, "state-token-pill");
  });

  test("the creature dock", async ({ page }) => {
    await open(page, { theme: "dark", locale: "it", role: "dm" });
    await page.getByTestId("pl-tool-add").click();
    await expect(page.getByTestId("pl-add-creature")).toBeVisible();
    await shot(page, "state-add-creature");
  });

  test("a spectator, who has nothing to act with", async ({ page }) => {
    await open(page, { theme: "dark", locale: "it", role: "spectator" });
    await shot(page, "state-spectator");
  });
});
