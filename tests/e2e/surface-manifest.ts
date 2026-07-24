/**
 * Pure surface manifest — the SINGLE SOURCE OF TRUTH for "every user-facing
 * surface the visual suite covers", reduced to just `{ slug, route }`.
 *
 * Why a separate file from `surfaces.ts`? `surfaces.ts` imports `@playwright/test`
 * (its `Surface.ready`/`prepare` fields take a Playwright `Page`), and we do NOT
 * want to drag the Playwright runtime into the Vitest unit suite. This file has
 * ZERO Playwright dependency, so the route-coverage guard
 * (`tests/unit/route-coverage.guard.test.ts`) can import it and cross-check it
 * against `src/app/router.tsx` without loading a browser test framework.
 *
 * `surfaces.ts` derives its full (function-bearing) `SURFACES` array FROM this
 * manifest, so the two can never drift: every visual/polish surface is declared
 * here once, and the route field used by the guard is the same string the
 * screenshot specs navigate to.
 *
 * ── Phase-1 (rewrite interregnum) ────────────────────────────────────────────
 * This is the NEW flat-hub Character shell: the roster + the character cockpit
 * (identity stub) + the re-mounted creation wizard + the campaign/compendium/
 * settings realm stubs + the two global shell overlays. The pre-rewrite per-tab
 * sheet surfaces (combat/spells/…/HP/modals) are RETIRED here while their screens
 * are stubs; the specs that drove them were quarantined and their surfaces
 * returned as each tab was rebuilt (Phase 3C/4).
 *
 * ── The rule (also in docs/CONTRIBUTING.md) ──────────────────────────────────
 * Add a new page / form / wizard step / modal / drawer / scenario state →
 * add a `SurfaceRoute` entry here (and its `ready`/`prepare` in surfaces.ts).
 * Add a new ROUTE to router.tsx → it MUST have at least one manifest entry whose
 * `route` resolves to that route pattern, or the guard test goes red.
 */

/** Slug + route for one captured surface. `route` is the path the spec visits. */
export interface SurfaceRoute {
  /** Filename slug — visual baseline is `<slug>-<locale>-<theme>-<device>.png`. */
  readonly slug: string;
  /** Route the spec navigates to (may be shared by several surface states). */
  readonly route: string;
}

/**
 * The guided-create wizard steps. Each is the SAME route (`/characters/new`) in
 * a different stepper state — declared once here, expanded into per-step
 * surfaces (with their stepper-jump `prepare`) in surfaces.ts. The creation
 * wizard is re-mounted verbatim during the rewrite, so these still apply.
 */
const GUIDED_STEP_SLUGS = [
  "create-guided",
  "create-guided-race",
  "create-guided-background",
  "create-guided-skills",
  "create-guided-spells",
  "create-guided-equipment",
  "create-guided-bgasi",
  "create-guided-abilities",
  "create-guided-review",
] as const;

/**
 * Every surface, as pure data. Grouped by kind for readability; order is not
 * load-bearing. Each `route` MUST be reachable from `src/app/router.tsx`.
 */
export const SURFACE_ROUTES: readonly SurfaceRoute[] = [
  // ─── Shell realms (Phase-1: stubs + re-mounted creation) ─────────────────────
  { slug: "home", route: "/characters" }, // My Characters roster (canonical; `/` redirects here)
  { slug: "character", route: "/characters/mock-1" }, // character cockpit (Play tab — default)
  // Cockpit tabs — in-view `?tab=` STATE on the same character route (each is a
  // re-homed sheet domain; the surface captures that tab's center panel).
  { slug: "character-bio", route: "/characters/mock-1?tab=bio" }, // Bio tab (lore + notes)
  { slug: "character-features", route: "/characters/mock-1?tab=features" }, // Features tab
  { slug: "character-inventory", route: "/characters/mock-1?tab=inventory" }, // Inventory tab
  { slug: "character-spells", route: "/characters/mock-1?tab=spells" }, // Spells tab
  { slug: "character-edit", route: "/characters/mock-1" }, // cockpit in EDIT mode — frame + banner (#60)
  // P2 — the glossary POPOVER open on a cockpit vital (the AC label trigger):
  // the shared GlossaryTip overlay state, swept for a11y + locale completeness.
  { slug: "glossary-popover", route: "/characters/mock-1" },
  // The Weapon Mastery re-pick MODAL (Features tab, edit mode) — a martial-class
  // surface the locale-sweep otherwise never opens. Loaded on the maneuver-Fighter
  // Fighter dev scenario (has Weapon Mastery; the Bard mock does not), so the IT
  // sweep asserts the picker's mastery-property notes are localized, never raw
  // English tokens. Closes the "engine fact rendered raw inside an unopened modal"
  // lock gap that leaked "TOPPLE"/"VEX" into the IT picker.
  {
    slug: "weapon-mastery-picker",
    route: "/characters/scn-battlemaster-fighter?tab=features",
  },
  // The maneuver-Fighter's PLAY tab — surfaces the Second Wind heal chip,
  // which the IT locale-sweep asserts reads "1d10 + livello da Guerriero", never
  // the English "Fighter level" the OLD prose-regex leaked (HEAL-SEAM P1). The
  // Bard mock has no class-level heal chip, so without this surface the leak
  // class is never rendered under the sweep.
  {
    slug: "fighter-second-wind-chip",
    route: "/characters/scn-battlemaster-fighter",
  },
  { slug: "create", route: "/characters/new" }, // creation wizard (re-mounted)
  ...GUIDED_STEP_SLUGS.map((slug): SurfaceRoute => ({ slug, route: "/characters/new" })),
  // The full-screen level-up wizard (wizard F). `level-up` is the Hit Points
  // step on the Bard mock (hp + spells steps); `level-up-boon` drives an
  // ASI-level character (Rogue 7→8) to the boon step's feat morph list.
  { slug: "level-up", route: "/characters/mock-1/level-up" },
  { slug: "level-up-boon", route: "/characters/scn-soulknife-rogue/level-up" },
  // P7 — the SUBCLASS step's hero altar (the chosen oath enthroned with its
  // granted features + bonus spells) on a subclass-due Paladin 2→3.
  {
    slug: "level-up-subclass",
    route: "/characters/scn-blessed-paladin-2/level-up",
  },
  // B5 — the spell SWAP step (its own orb on swap-capable casters).
  { slug: "level-up-swap", route: "/characters/mock-1/level-up" },
  { slug: "campaigns", route: "/campaigns" }, // campaigns realm
  { slug: "campaign-create", route: "/campaigns" }, // create-campaign modal
  { slug: "campaign-join", route: "/campaigns" }, // join-campaign modal
  // The campaign hub — the unified Party section rests on the party OVERVIEW by
  // default (the dev fixture seeds no encounter).
  { slug: "campaign-hub", route: "/campaigns/mock-1" },
  // The SAME hub with a running encounter: the Party section becomes the inline
  // initiative tracker. The prepare seeds the `d20-dev-encounter` flag + reloads so
  // the dev fixture seeds a mid-combat encounter — both states sweep on one route.
  { slug: "campaign-hub-encounter", route: "/campaigns/mock-1" },
  // T4 — the DM's read-only full-sheet view of a party member. `member-mara` is a
  // dev-fixture campaign member whose attached character resolves to a real
  // dev-fixture sheet (College of Lore bard) under dev-bypass.
  { slug: "campaign-member-sheet", route: "/campaigns/mock-1/sheets/member-mara" },
  { slug: "compendium", route: "/compendium" }, // compendium realm (default: spells)
  // The content types are URL-addressable (`?type=`); each is its own a11y surface so
  // the new maneuver/metamagic/invocation views stay covered (coverage-must-not-rot).
  { slug: "compendium-maneuvers", route: "/compendium?type=maneuver" },
  { slug: "compendium-metamagic", route: "/compendium?type=metamagic" },
  { slug: "compendium-invocations", route: "/compendium?type=invocation" },
  { slug: "compendium-weapon-mastery", route: "/compendium?type=weapon-mastery" },
  // COMPENDIUM-LUX — one entry's READ view (`?sel=` deep link): the illuminated
  // masthead (seal · eyebrow · Cinzel title) is its own surface.
  { slug: "compendium-entry", route: "/compendium?type=spell&sel=fireball" },
  // COMPENDIUM-LUX — the facet bar UNFOLDED (it starts collapsed behind the
  // Filters disclosure at every width, so the chips need their own swept state).
  { slug: "compendium-filters", route: "/compendium" },
  // The bestiary — the Monsters section list + one full statblock leaf. Both enroll
  // in a11y (axe serious/critical = 0 × both themes) + i18n-sweep automatically.
  { slug: "compendium-monsters", route: "/compendium?type=monster" },
  { slug: "compendium-monster-entry", route: "/compendium?type=monster&sel=skeleton" },
  { slug: "settings-page", route: "/settings" }, // settings page
  { slug: "legal-page", route: "/legal" }, // legal & attribution (linked from the footer)
  // 404 catch-all (C1). The probe path is an unknown route the `path="*"` route
  // resolves to the recoverable NotFoundPage; the route-coverage guard maps the
  // catch-all to this single surface.
  { slug: "not-found", route: "/this-page-does-not-exist" },
  // The two error screens (BUG-ENTRY), reached via the dev-only crash probes:
  // the in-shell REGION fallback (nav survives) + the FULLSCREEN root-net
  // fallback. Both carry recovery actions and the pre-filled crash-report entry.
  { slug: "error-region", route: "/_crash" },
  { slug: "error-fullscreen", route: "/_crash-root" },

  // ─── Global shell overlays ───────────────────────────────────────────────────
  { slug: "command-palette", route: "/characters" }, // "Ask the Folio" palette
  { slug: "account-menu", route: "/characters" }, // account + theme dropdown (topbar)
  { slug: "roster-card-menu", route: "/characters" }, // roster card overflow ("⋯") row-actions menu
  { slug: "report-dialog", route: "/characters" }, // OWN-37 bug/feature reporter (palette → "bug")
  { slug: "shortcuts-sheet", route: "/characters" }, // the `?` keyboard-shortcuts reference
];
