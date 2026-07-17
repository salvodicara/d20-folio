/**
 * Shared visual-surface model — consumed by BOTH the polish harness
 * (`_polish-shots.spec.ts`, human-review PNGs) and the CI visual-regression
 * suite (`visual-full.spec.ts`, pixel baselines) AND the a11y gate
 * (`a11y.spec.ts`). One model means they can never drift: the same surface list,
 * the same theme/locale/viewport variants, the same `ready`/`prepare`.
 *
 * The pure `{ slug, route }` shape lives in `surface-manifest.ts` (no Playwright
 * import) so the unit-side route-coverage guard can read it without dragging in a
 * browser framework. This file ADDS the runtime bits (the per-surface
 * `ready`/`prepare` interactions + the variant matrix + the seeding helpers) on
 * top of that manifest, and asserts at load time that every manifest slug is
 * realised here.
 *
 * Phase-1: the surfaces are the new flat-hub Character shell (roster · cockpit
 * identity stub · re-mounted creation + guided steps · campaign/compendium/
 * settings stubs · the command-palette and account-menu overlays).
 */

import { expect, type Page } from "@playwright/test";
import { SURFACE_ROUTES, type SurfaceRoute } from "./surface-manifest";
import { firstWord, teamFixtureName } from "./team-fixture";

export type Theme = "dark" | "light";
export type SheetMode = "play" | "edit";
export type Locale = "en" | "it";

/** Desktop = 1440w (design target); mobile = 390w (iPhone-class). */
export const DESKTOP = { width: 1440, height: 900 } as const;
export const MOBILE = { width: 390, height: 844 } as const;

/**
 * Seed the uiStore persist key BEFORE the app boots so the first paint is
 * already in the target theme + sheet mode (no flash, no toggle race). Motion has
 * no in-app toggle anymore — it mirrors the OS prefers-reduced-motion — so for
 * deterministic stills we force the OS preference via `emulateMedia` rather than a
 * (now-ignored) persisted field.
 */
export async function seedUI(
  page: Page,
  theme: Theme,
  sheetMode: SheetMode
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ([key, t, mode]) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          state: { theme: t, sheetMode: mode },
          version: 0,
        })
      );
    },
    ["d20-folio-ui", theme, sheetMode] as const
  );
}

/**
 * Seed the i18next language-detector cache BEFORE boot so the FIRST paint is in
 * the target locale (detector order ["localStorage","navigator"], default
 * `i18nextLng` key). Deterministic — no flash, no race.
 */
export async function seedLang(page: Page, locale: Locale): Promise<void> {
  await page.addInitScript((lng) => {
    window.localStorage.setItem("i18nextLng", lng);
  }, locale);
}

/** Hold animations still so the capture is deterministic. NAVIGATION-SAFE: a
 *  late client-side redirect can destroy the context as `addStyleTag` runs, so
 *  we settle, retry once, then tolerate a final miss (the reduced-motion seed +
 *  diff tolerance already cover determinism). */
export async function freezeMotion(page: Page): Promise<void> {
  const css = `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }`;
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  try {
    await page.addStyleTag({ content: css });
  } catch {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.addStyleTag({ content: css }).catch(() => {});
  }
}

/**
 * Best-effort PRE-CAPTURE settle for the review harness (NOT a gate): let the
 * in-viewport images finish DECODING and give the page one short post-networkidle
 * beat, so a full-page screenshot never freezes a pre-paint state — blank stat
 * chips, undecoded cover/portrait art. Every wait is BOUNDED and swallowed (a
 * miss just captures a hair early, never blocks/flakes the harness). Motivated by
 * a live-verification pass that traced 4 false-positive audit findings to exactly
 * these capture artifacts.
 */
export async function settleForShot(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .evaluate(async () => {
      const inView = Array.from(document.images).filter((img) => {
        const r = img.getBoundingClientRect();
        return (
          r.bottom > 0 &&
          r.top < window.innerHeight &&
          r.right > 0 &&
          r.left < window.innerWidth
        );
      });
      // Race decode() against a hard cap so a stuck/broken image can't hang us.
      await Promise.race([
        Promise.allSettled(inView.map((img) => img.decode().catch(() => {}))),
        new Promise((res) => setTimeout(res, 1500)),
      ]);
    })
    .catch(() => {});
  await page.waitForTimeout(400);
}

/** The character name in the cockpit — present in EN and IT (proper noun, never
 *  translated). The canonical locale-robust ready anchor for the cockpit. */
export async function readyByName(page: Page): Promise<void> {
  await page.getByText("Lyra Voss").first().waitFor({ timeout: 15000 });
}

/**
 * Wait for a locale-STABLE text anchor to paint.
 *
 * READY-CHECKS MUST BE LOCALE-STABLE. They run across the full EN+IT variant
 * matrix, so anchoring on translated UI copy is a latent break: the moment a page
 * gets its IT strings (the i18n sweeps), the EN regex stops matching and every IT
 * variant times out here — exactly the rot this suite accumulated. So NEVER pass
 * translated app copy to `readyText`. Pass ONLY genuinely locale-invariant text:
 * a proper noun that is never translated (the seeded "Lyra Voss" / "Starless
 * Keep"), or a numeric/symbolic token ("404"). For everything else prefer a
 * locale-invariant STRUCTURAL anchor — a role (`readyByH1`), a stable className
 * (`readyBySelector`), or a test id — over an EN|IT regex union.
 */
function readyText(re: RegExp): (page: Page) => Promise<void> {
  return async (page) => {
    await page.getByText(re).first().waitFor({ timeout: 15000 });
  };
}

/** Wait for the realm page's single <h1> (every realm page renders one via
 *  `PageHeader as="h1"`; the shell renders none, so it is unambiguous). Keys on
 *  the heading ROLE+LEVEL, never its translated text — locale-invariant. */
async function readyByH1(page: Page): Promise<void> {
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 15000 });
}

/** Wait for the crash-net fallback to paint. The `ErrorFallback` wears the shared
 *  runic hero (`RunicEmptyState`), whose title is an <h2> — the surface has NO
 *  <h1> (the shell renders none; the page's own <h1> died with the crash), so we
 *  anchor on the fallback wrapper's `role="alert"` instead. Locale-invariant
 *  (a role, never translated copy) and proof the themed fallback — not a blank
 *  frame — rendered, across the full EN+IT matrix. */
async function readyByAlert(page: Page): Promise<void> {
  await page.getByRole("alert").first().waitFor({ timeout: 15000 });
}

/** The creation wizard (re-mounted) has painted when its mode chooser shows.
 *  Bound widened 10s → 30s after the `create-guided-background [it]` full-suite
 *  flake (2026-06-12, green in isolation): this anchor covers the whole app BOOT
 *  (dev-server transforms + the locale catalogues), pure local work that exceeded
 *  10s ONLY under concurrent-load CPU starvation — the same contention class the
 *  1d3667d2 level-up widening cites. The assertion itself is unchanged. */
async function readyCreate(page: Page): Promise<void> {
  await page
    .getByText(/quick start|guided|avvio rapido|guidato|crea personaggio/i)
    .first()
    .waitFor({ timeout: 30000 });
}

/**
 * Each capture variant = locale + theme + viewport, identified by a stable
 * `key`. This array is the SINGLE SOURCE OF TRUTH for what a variant key means.
 */
export const VARIANTS: {
  key: string;
  locale: Locale;
  theme: Theme;
  device: string;
  viewport: { width: number; height: number };
}[] = [
  {
    key: "en-dark-desktop",
    locale: "en",
    theme: "dark",
    device: "desktop",
    viewport: DESKTOP,
  },
  {
    key: "en-light-desktop",
    locale: "en",
    theme: "light",
    device: "desktop",
    viewport: DESKTOP,
  },
  {
    key: "en-dark-mobile",
    locale: "en",
    theme: "dark",
    device: "mobile",
    viewport: MOBILE,
  },
  {
    key: "it-light-desktop",
    locale: "it",
    theme: "light",
    device: "desktop",
    viewport: DESKTOP,
  },
  {
    key: "it-dark-mobile",
    locale: "it",
    theme: "dark",
    device: "mobile",
    viewport: MOBILE,
  },
];

/** The default full-page set (every variant). */
export const FULL_PAGE_VARIANTS = [
  "en-dark-desktop",
  "en-light-desktop",
  "en-dark-mobile",
  "it-light-desktop",
  "it-dark-mobile",
];

/** Representative subset for overlays — the i18n lens + the mobile-overflow lens. */
export const OVERLAY_VARIANTS = [
  "en-light-desktop",
  "it-light-desktop",
  "it-dark-mobile",
];

/** Overlays whose trigger lives in the desktop topbar (account menu): the two
 *  desktop lenses (EN + IT) + a dark-desktop lens. */
export const DESKTOP_OVERLAY_VARIANTS = [
  "en-light-desktop",
  "it-light-desktop",
  "en-dark-desktop",
];

/**
 * Jump the guided create wizard to a step by clicking the wizard-F progress ORB
 * at the given 0-based index (locale-invariant by position — creation orbs are
 * free-jump, and all NINE steps are present under the wizard's defaults).
 * First clicks the Guided mode plaque.
 *
 * STATE-SIGNAL waits only (the 1d3667d2 contention-hardening pattern; F1 P3
 * flake-watch on `create-guided-background [it]`, 2026-06-12): the old helper
 * peeked with `isVisible({ timeout })` — Playwright IGNORES that timeout (it is
 * an immediate, non-waiting check) — swallowed every click error and padded with
 * a fixed 150ms sleep, so under CPU starvation a click could silently no-op and
 * the sweep then asserted against the WRONG step (the silent prepare() no-op
 * tolerance). Every transition now anchors on the wizard's own committed state —
 * `aria-current="step"` on the target orb — and a miss FAILS the surface instead
 * of capturing something it isn't. No retries, no timing sleeps.
 */
async function gotoGuidedStep(page: Page, stepIndex: number): Promise<void> {
  await page
    .getByRole("button", { name: /guided|guidat/i })
    .first()
    .click();
  const orbs = page.locator(".wiz-orb");
  // The wizard chrome committed: the class step's orb is current.
  await expect(orbs.first()).toHaveAttribute("aria-current", "step", {
    timeout: 15000,
  });
  if (stepIndex > 0) {
    await orbs.nth(stepIndex).click();
    // The jump committed: the clicked orb IS the current step (sync re-render,
    // but anchored — never assumed — so starvation cannot outrun it).
    await expect(orbs.nth(stepIndex)).toHaveAttribute("aria-current", "step", {
      timeout: 15000,
    });
  }
}

/** The 0-based stepper index for each guided-create step slug. */
const GUIDED_STEP_INDEX: Record<string, number> = {
  "create-guided": 0,
  "create-guided-race": 1,
  "create-guided-background": 2,
  "create-guided-skills": 3,
  "create-guided-spells": 4,
  "create-guided-equipment": 5,
  "create-guided-bgasi": 6,
  "create-guided-abilities": 7,
  "create-guided-review": 8,
};

export interface Surface extends SurfaceRoute {
  /** Edit mode on/off (seeded into uiStore). */
  edit: boolean;
  /** A locator that proves the surface has painted before we shoot. */
  ready: (page: Page) => Promise<void>;
  /** Optional interaction to open an overlay AFTER ready, BEFORE the shot. */
  prepare?: (page: Page) => Promise<void>;
  /** Optional allowlist of variant keys; omitted = all FULL_PAGE_VARIANTS. */
  variants?: string[];
  /**
   * A variants-limited surface whose `prepare` drives an INLINE page state
   * (e.g. the campaign-hub encounter tracker), not a modal/popover — set
   * `overlay: false` so the harness's overlay-mounted assert skips it (the
   * assert otherwise fails: there is no dialog/menu to find by construction).
   * Omitted = the default: variants+prepare means "captures an overlay".
   */
  overlay?: false;
  /**
   * The surface renders OUTSIDE the app shell, so the realm bottom-nav cannot
   * exist there by construction. Today that is ONLY the app-root crash fallback
   * (`error-fullscreen`): it mounts ABOVE the router precisely so it survives a
   * shell crash, and its recovery actions (Reload / Back) are its navigation.
   * The mobile-layout gate still asserts no-h-overflow on shell-less surfaces;
   * it skips only the m-nav assertions.
   */
  shellless?: true;
}

type SurfaceRuntime = Omit<Surface, "slug" | "route">;

const RUNTIME: Record<string, SurfaceRuntime> = {
  // ─── Shell realms (Phase-1 stubs + re-mounted creation) ──────────────────────
  // Roster: anchor on the seeded character card (proper noun, never translated)
  // rather than the EN "Your characters" heading — proves the list resolved too.
  home: { edit: false, ready: readyByName },
  character: { edit: false, ready: readyByName },
  "character-bio": { edit: false, ready: readyByName },
  "character-features": { edit: false, ready: readyByName },
  "character-inventory": { edit: false, ready: readyByName },
  "character-spells": { edit: false, ready: readyByName },
  // Cockpit in EDIT mode (#60): seeds sheetMode "edit" so the design-source amber
  // frame + the textual "Editing" banner are present for the axe scan.
  "character-edit": { edit: true, ready: readyByName },
  // P2 — the glossary popover (GlossaryTip) open on the AC vital label. Keys on
  // the stable `.glossary-term` class inside a `.vital` (locale-invariant), then
  // waits for the branded `.glossary-pop` overlay so axe + the locale sweep see
  // the OPEN state (rubric + plain-language body).
  "glossary-popover": {
    edit: false,
    variants: OVERLAY_VARIANTS,
    ready: readyByName,
    prepare: async (page) => {
      const trigger = page.locator(".vital .glossary-term").first();
      if (await trigger.isVisible({ timeout: 5000 }).catch(() => false)) {
        await trigger.click().catch(() => {});
        await page
          .locator(".glossary-pop")
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => {});
      }
    },
  },
  // The Weapon Mastery re-pick MODAL on the maneuver-Fighter scenario (edit
  // mode). Anchors on the scenario's proper-noun name ("Garran", never translated),
  // then opens the picker via the edit-mode "Modifica"/"Change" control. The IT
  // sweep then asserts the picker rows carry localized mastery names — the EN
  // tokens are on the ENGLISH_IN_IT denylist, so a raw "Topple"/"Vex" leak fails.
  "weapon-mastery-picker": {
    edit: true,
    variants: OVERLAY_VARIANTS,
    ready: readyText(/Garran/),
    prepare: async (page) => {
      // The maneuver-Fighter has SEVERAL re-pick groups (maneuvers + weapon
      // mastery), each with its own re-pick trigger — so scope to the Weapon
      // Mastery section by its heading ("Padronanza Armi" / "Weapon Mastery")
      // and click the trigger inside THAT section's card, not just any. The
      // trigger reads "Choose"/"Scegli" while the group is EMPTY (the scenario
      // starts unchosen) and "Change"/"Modifica" once picks exist — match both,
      // or an empty-group scenario silently no-ops the overlay open.
      const rePickCta = /modifica|change|scegli|choose/i;
      const section = page
        .locator("div", {
          has: page.getByRole("heading", { name: /padronanza armi|weapon mastery/i }),
        })
        .filter({ has: page.getByRole("button", { name: rePickCta }) })
        .last();
      const trigger = section.getByRole("button", { name: rePickCta }).first();
      if (await trigger.isVisible({ timeout: 5000 }).catch(() => false)) {
        await trigger.click().catch(() => {});
        await page
          .getByRole("dialog")
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => {});
      }
    },
  },
  // The maneuver-Fighter's PLAY tab — renders the Second Wind heal chip so
  // the IT sweep asserts it reads "1d10 + livello da Guerriero", never the English
  // "Fighter level" the old prose-regex leaked (HEAL-SEAM P1). Anchors on the
  // scenario's proper-noun name ("Garran", never translated).
  "fighter-second-wind-chip": { edit: false, ready: readyText(/Garran/) },
  create: { edit: false, ready: readyCreate },
  // The level-up wizard route (wizard F). The eyebrow carries the character's
  // proper-noun name, so readyByName proves the chrome painted.
  "level-up": { edit: false, ready: readyByName },
  "level-up-boon": {
    edit: false,
    ready: readyText(/Sable/),
    prepare: async (page) => {
      // hp → boon (the footer CTA), then flip the boon fork to the feat list —
      // locale-invariant by position (.wiz-pager next / third fork tab).
      const next = page.locator(".wiz-pager-btn.next");
      if (await next.isVisible({ timeout: 4000 }).catch(() => false)) {
        await next.click().catch(() => {});
      }
      const featTab = page.locator(".wiz-fork-tab").nth(2);
      if (await featTab.isVisible({ timeout: 4000 }).catch(() => false)) {
        await featTab.click().catch(() => {});
      }
      await page.waitForTimeout(200);
    },
  },
  // P7 — the subclass step's hero altar: hp → subclass, then enthrone the
  // first oath plaque (locale-invariant by position).
  "level-up-subclass": {
    edit: false,
    ready: readyText(/Seraphine/),
    prepare: async (page) => {
      const next = page.locator(".wiz-pager-btn.next");
      if (await next.isVisible({ timeout: 4000 }).catch(() => false)) {
        await next.click().catch(() => {}); // hp → subclass
      }
      const plaque = page.locator(".wiz-card").first();
      if (await plaque.isVisible({ timeout: 4000 }).catch(() => false)) {
        await plaque.click().catch(() => {});
      }
      await page.waitForTimeout(250);
    },
  },
  // B5 — the spell-swap step: walk hp → spells (learn the required picks via
  // the read-then-Learn list + slot tabs) → swap. Locale-invariant locators.
  "level-up-swap": {
    edit: false,
    ready: readyByName,
    prepare: async (page) => {
      const next = page.locator(".wiz-pager-btn.next");
      const learnFirst = async () => {
        const row = page.locator(".wiz-row").first();
        if (await row.isVisible({ timeout: 4000 }).catch(() => false)) {
          await row.click().catch(() => {});
          await page
            .locator(".wiz-entry[data-open] .wiz-read-act button")
            .first()
            .click({ timeout: 4000 })
            .catch(() => {});
        }
      };
      await next.click().catch(() => {}); // hp → spells
      await learnFirst();
      const cantripTab = page.locator(".wiz-fork-tab").last();
      if (await cantripTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cantripTab.click().catch(() => {});
        await learnFirst();
      }
      await next.click().catch(() => {}); // spells → swap
      await page.waitForTimeout(250);
    },
  },
  // Campaigns realm: under dev-bypass the list is now populated with the seeded
  // dev campaign (D29 — reachable in dev), so anchor on its locale-INVARIANT proper
  // noun ("The Starless Keep") — present only after the body list paints, exactly
  // the structural-anchor guidance for this suite.
  campaigns: { edit: false, ready: readyText(/Starless Keep/) },
  "campaign-create": {
    edit: false,
    variants: OVERLAY_VARIANTS,
    ready: readyText(/Starless Keep/),
    prepare: async (page) => {
      // The populated realm shows the header "New campaign"; match it (or the
      // empty-state "Create a campaign" if ever empty).
      const trigger = page
        .getByRole("button", { name: /new campaign|create a campaign/i })
        .first();
      if (await trigger.isVisible({ timeout: 4000 }).catch(() => false)) {
        await trigger.click().catch(() => {});
        await page
          .getByRole("dialog")
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => {});
      }
    },
  },
  "campaign-join": {
    edit: false,
    variants: OVERLAY_VARIANTS,
    ready: readyText(/Starless Keep/),
    prepare: async (page) => {
      // The populated realm shows the header "Join" (or empty-state "Join with a link").
      const trigger = page
        .getByRole("button", { name: /^join$|join with a link/i })
        .first();
      if (await trigger.isVisible({ timeout: 4000 }).catch(() => false)) {
        await trigger.click().catch(() => {});
        await page
          .getByRole("dialog")
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => {});
      }
    },
  },
  // Campaign hub: the page <h1> IS the seeded campaign name "The Starless Keep"
  // (a proper noun, never translated), which only renders once the fixture
  // campaign resolves — so it is both locale-invariant and proof the hub body
  // painted (not the loading spinner).
  "campaign-hub": { edit: false, ready: readyText(/starless keep/i) },
  // T4 — the DM's read-only member-sheet view. Under dev-bypass the bypass user
  // (`mock-uid`) IS the seeded campaign's DM, and `member-mara`'s attached
  // character resolves to the team-bard PACK fixture — so the cockpit paints
  // with its proper-noun name (locale-invariant), proof the read-only sheet rendered.
  "campaign-member-sheet": {
    edit: false,
    // The attached hero's first name, derived from the pack fixture at runtime
    // (no name literal ships publicly); a never-matching sentinel when absent.
    ready: readyText(
      new RegExp(firstWord(teamFixtureName("catalion-bard")) || "__pack-absent__", "i")
    ),
  },
  // The unified Party section running an encounter — the INLINE initiative tracker
  // (no overlay/portal). We seed the `d20-dev-encounter` flag so the fixture seeds a
  // mid-combat encounter, RELOAD (the flag is read at boot), then anchor on the
  // seeded combatant's proper-noun name ("Coralino", never translated) so the
  // surface is proof the inline tracker — not just the hub overview — painted,
  // across the i18n + mobile lenses.
  "campaign-hub-encounter": {
    edit: false,
    variants: OVERLAY_VARIANTS,
    overlay: false, // inline tracker, not a modal — skip the overlay-mounted assert
    ready: readyText(/coralino/i),
    prepare: async (page) => {
      await page.addInitScript(() =>
        window.localStorage.setItem("d20-dev-encounter", "1")
      );
      await page.reload();
      await page
        .getByText(/coralino/i)
        .first()
        .waitFor({ timeout: 8000 })
        .catch(() => {});
    },
  },
  // Compendium realm: anchor on the page <h1> by role (the page is synchronous —
  // it reads the bundled SRD, no fetch — so the heading present ⇒ body painted),
  // not the EN "…searchable" header hint.
  compendium: { edit: false, ready: readyByH1 },
  // The URL-addressable content types (`?type=`) — same synchronous page, so the
  // <h1> present ⇒ the chosen type's list painted.
  "compendium-maneuvers": { edit: false, ready: readyByH1 },
  "compendium-metamagic": { edit: false, ready: readyByH1 },
  "compendium-invocations": { edit: false, ready: readyByH1 },
  "compendium-weapon-mastery": { edit: false, ready: readyByH1 },
  // COMPENDIUM-LUX — the deep-linked entry leaf. Anchor on the entry's own
  // masthead title (EN/IT proper noun) so the surface is proof the detail —
  // not just the page chrome — painted.
  "compendium-entry": { edit: false, ready: readyText(/fireball|palla di fuoco/i) },
  // COMPENDIUM-LUX — the facet bar unfolded: same synchronous page, then the
  // prepare opens the Filters disclosure and anchors on the expanded state.
  "compendium-filters": {
    edit: false,
    ready: readyByH1,
    prepare: async (page) => {
      await page.locator(".cmp-facet-toggle").click();
      await page.locator(".cmp-facets:not([data-collapsed])").waitFor({ timeout: 8000 });
    },
  },
  // Settings page (synchronous — reads already-loaded stores). Anchor on its <h1>
  // by role rather than the (now-translated) "Appearance" section heading.
  "settings-page": { edit: false, ready: readyByH1 },
  // Legal & attribution page (static — PageHeader <h1> + InfoCard + CC-BY link).
  // PUBLIC but IN the shell: /legal mounts in a PUBLIC AppShell layout ABOVE the
  // AuthGuard (the SRD/CC-BY attribution must be readable pre-auth; the login footer
  // links it) — so it now carries the full Topbar / realm-nav / footer chrome like
  // every other surface (owner 2026-07-07). The realm bottom-nav IS present, so it is
  // NOT shellless and the m-nav assertion applies (see src/app/router.tsx).
  "legal-page": { edit: false, ready: readyByH1 },
  // 404 page (C1). Anchored on the "404" eyebrow — identical EN+IT, so the
  // ready text is locale-stable across the matrix.
  "not-found": { edit: false, ready: readyText(/404/) },
  // The two error screens (BUG-ENTRY — dev-only crash probes). Anchored on the
  // fallback's role="alert" wrapper (structural, locale-invariant): the alert
  // present ⇒ the themed runic-hero fallback painted (recovery buttons + the
  // crash-report entry with it). It carries no <h1> — the shared RunicEmptyState
  // title is an <h2> and the page's own <h1> died with the crash.
  "error-region": { edit: false, ready: readyByAlert },
  "error-fullscreen": { edit: false, ready: readyByAlert, shellless: true },

  // ─── Global shell overlays ───────────────────────────────────────────────────
  "command-palette": {
    edit: false,
    variants: OVERLAY_VARIANTS,
    ready: readyByName,
    prepare: async (page) => {
      const trigger = page.getByRole("button", { name: /ask the folio/i }).first();
      if (await trigger.isVisible({ timeout: 4000 }).catch(() => false)) {
        await trigger.click().catch(() => {});
        await page
          .getByRole("dialog")
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => {});
      }
    },
  },
  "account-menu": {
    edit: false,
    variants: DESKTOP_OVERLAY_VARIANTS,
    ready: readyByName,
    prepare: async (page) => {
      const trigger = page.getByRole("button", { name: /account/i }).first();
      if (await trigger.isVisible({ timeout: 4000 }).catch(() => false)) {
        await trigger.click().catch(() => {});
        await page
          .getByRole("menu")
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => {});
      }
    },
  },
  // The roster card's overflow ("⋯") row-actions menu, opened on the first card.
  // Locks the OPEN menu as axe-covered (dark/light × desktop/mobile) so the
  // popover can't regress; the visual lens includes a narrow-card mobile variant.
  "roster-card-menu": {
    edit: false,
    variants: OVERLAY_VARIANTS,
    ready: readyByName,
    prepare: async (page) => {
      const trigger = page.getByRole("button", { name: /more actions/i }).first();
      if (await trigger.isVisible({ timeout: 4000 }).catch(() => false)) {
        await trigger.click().catch(() => {});
        await page
          .getByRole("menu")
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => {});
      }
    },
  },
  // OWN-37 — the in-app bug/feature reporter, reached by typing "bug" in the "Ask
  // the Folio" palette. Locks the OPEN reporter (its on-rails pickers + fields) as
  // axe-covered in dark + light. The DETAILS textarea is unique to this dialog (the
  // palette has none), so it's a locale-robust "the reporter painted" signal.
  "report-dialog": {
    edit: false,
    variants: OVERLAY_VARIANTS,
    ready: readyByName,
    prepare: async (page) => {
      const trigger = page.getByRole("button", { name: /ask the folio/i }).first();
      if (await trigger.isVisible({ timeout: 4000 }).catch(() => false)) {
        await trigger.click().catch(() => {});
        await page.keyboard.type("bug");
        await page.keyboard.press("Enter").catch(() => {});
        await page
          .locator('[role="dialog"] textarea')
          .first()
          .waitFor({ timeout: 6000 })
          .catch(() => {});
      }
    },
  },
  // The `?` keyboard-shortcuts reference sheet — opened by the `?` global key.
  // Locks the OPEN sheet (its grouped rows + kbd chips) as axe-covered in dark +
  // light × desktop + mobile.
  "shortcuts-sheet": {
    edit: false,
    variants: OVERLAY_VARIANTS,
    ready: readyByName,
    prepare: async (page) => {
      await page.keyboard.press("?").catch(() => {});
      await page
        .getByRole("dialog")
        .first()
        .waitFor({ timeout: 5000 })
        .catch(() => {});
    },
  },
};

/**
 * Build the full SURFACES array by merging each manifest `{ slug, route }` with
 * its runtime def. Guided-create steps get their stepper-jump `prepare` injected
 * by index here. Throws at load time if a manifest slug has no runtime.
 */
function buildSurfaces(): Surface[] {
  return SURFACE_ROUTES.map(({ slug, route }): Surface => {
    if (slug in GUIDED_STEP_INDEX) {
      const stepIndex = GUIDED_STEP_INDEX[slug] ?? 0;
      return {
        slug,
        route,
        edit: false,
        variants: OVERLAY_VARIANTS,
        ready: readyCreate,
        prepare: async (page) => {
          await gotoGuidedStep(page, stepIndex);
        },
      };
    }
    const runtime = RUNTIME[slug];
    if (!runtime) {
      throw new Error(
        `Surface "${slug}" is declared in surface-manifest.ts but has no runtime ` +
          `definition in surfaces.ts. Add its { edit, ready, prepare?, variants? }.`
      );
    }
    return { slug, route, ...runtime };
  });
}

export const SURFACES: Surface[] = buildSurfaces();
