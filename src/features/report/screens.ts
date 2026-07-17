/**
 * screens — the catalogue of app surfaces a report can be filed against, and the
 * auto-detection that maps the current pathname to one of them (OWN-37).
 *
 * Pure (no Firebase, no React) so it's trivially testable. Each surface carries a
 * stable `id` (stored on the report + used to build a GitHub label) and an i18n
 * `labelKey` (resolved in the dialog). Ordered most-specific → least so detection
 * picks the deepest match first.
 *
 * The list mirrors the router (`src/app/router.tsx`); when a new top-level realm
 * ships, add it here so the reporter can target it.
 */

export interface ScreenSpec {
  /** Stable id stored on the report + used for the `screen:<id>` GitHub label. */
  id: string;
  /** i18n key under `report.screens.*`. */
  labelKey: string;
  /** Match the current pathname (most-specific patterns first). */
  match: (pathname: string) => boolean;
}

export const SCREENS: ScreenSpec[] = [
  {
    id: "character-cockpit",
    labelKey: "report.screens.characterCockpit",
    // A character detail route, but NOT the static `/characters/new` wizard.
    match: (p) => /^\/characters\/(?!new$)[^/]+/.test(p),
  },
  {
    id: "character-create",
    labelKey: "report.screens.characterCreate",
    match: (p) => p === "/characters/new",
  },
  {
    id: "roster",
    labelKey: "report.screens.roster",
    match: (p) => p === "/characters" || p === "/",
  },
  {
    id: "campaign-hub",
    labelKey: "report.screens.campaignHub",
    match: (p) => /^\/campaigns\/[^/]+/.test(p),
  },
  {
    id: "campaigns",
    labelKey: "report.screens.campaigns",
    match: (p) => p === "/campaigns",
  },
  {
    id: "compendium",
    labelKey: "report.screens.compendium",
    match: (p) => p.startsWith("/compendium"),
  },
  {
    id: "settings",
    labelKey: "report.screens.settings",
    match: (p) => p.startsWith("/settings"),
  },
  {
    id: "admin",
    labelKey: "report.screens.admin",
    match: (p) => p.startsWith("/admin"),
  },
  {
    id: "login",
    labelKey: "report.screens.login",
    match: (p) => p.startsWith("/login"),
  },
];

/** The catch-all surface when no specific screen matches. */
export const OTHER_SCREEN: ScreenSpec = {
  id: "other",
  labelKey: "report.screens.other",
  match: () => false,
};

/** Detect the surface for a pathname; falls back to "other". */
export function detectScreen(pathname: string): ScreenSpec {
  return SCREENS.find((s) => s.match(pathname)) ?? OTHER_SCREEN;
}

/** Every selectable screen option, including the catch-all. */
export function allScreens(): ScreenSpec[] {
  return [...SCREENS, OTHER_SCREEN];
}
