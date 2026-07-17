/// <reference types="node" />
/**
 * Guard: visual-coverage can't silently rot.
 *
 * The e2e visual suites (`tests/e2e/visual-full.spec.ts` + the polish harness
 * `_polish-shots.spec.ts`) screenshot a SURFACE LIST declared once in
 * `tests/e2e/surface-manifest.ts`. The recurring failure mode is: someone adds a
 * NEW route/page to `src/app/router.tsx` and forgets to add its screenshot
 * surface, so the new screen ships with ZERO visual coverage and nobody notices
 * until it regresses.
 *
 * This pure unit test (no Playwright, no Firebase) statically enumerates the
 * routes declared in `src/app/router.tsx`, resolves them to concrete paths
 * (`:characterId` → `mock-1`, matching the mock the harness uses), and asserts
 * each navigable route has at least one surface in the manifest whose `route`
 * matches it. If a route has no surface, the test fails with the exact route +
 * the rule to fix it. The reverse direction is also checked: every surface
 * `route` must resolve to a real router route (no stale surfaces pointing at
 * deleted routes).
 *
 * ── Rewrite interregnum (Phase 1) ────────────────────────────────────────────
 * The shell mounts the new flat-hub Character realms (`/characters/:characterId`,
 * `/campaigns`, `/compendium`, `/settings`), and the surface manifest now covers
 * them with real surfaces (the re-homed cockpit tabs + creation + shell overlays).
 * Cockpit tabs are in-view `?tab=` STATE on the bare character route (Phase 3C),
 * not sub-routes, so the reverse check resolves a surface by its PATH (the query
 * string is dropped). See docs/CONTRIBUTING.md → "Visual surface coverage".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SURFACE_ROUTES } from "../e2e/surface-manifest";

const here = dirname(fileURLToPath(import.meta.url));
const ROUTER = resolve(here, "../../src/app/router.tsx");

/**
 * Routes that are intentionally NOT in the visual surface list, each with a
 * reason. Keep this list SHORT and justified — it's the only escape hatch. (The
 * Phase-1 realm stubs are now COVERED by real surfaces in surface-manifest.ts, so
 * they are no longer exempt.)
 */
const EXEMPT_ROUTES: { route: string; reason: string }[] = [
  {
    route: "/",
    reason:
      'Index route is a redirect (`<Navigate to="/characters">`), not a rendered ' +
      "surface — the roster is canonical at /characters (covered by the `home` " +
      "surface). `/` carries no visual baseline of its own.",
  },
  {
    route: "/login",
    reason:
      "Unreachable under the dev-bypass the harness uses (a mock user is injected at " +
      "boot, so /login redirects to /). Covered by its own RTL/visual baseline.",
  },
  {
    route: "/admin",
    reason:
      "Admin-only console gated on the user's admin role (features/account/AdminPage); not " +
      "part of the player-facing surface inventory, so it carries no visual baseline.",
  },
  {
    route: "/admin/users/:uid/characters/:charId",
    reason:
      "Admin-only read-only sheet (features/account/AdminSheetView) reached from the admin " +
      "console drill-down; gated on the admin role like /admin, so it carries no player-facing " +
      "visual baseline. It reuses the already-covered read-only CockpitView render path.",
  },
  {
    route: "/_specimens",
    reason:
      "Dev-only typography specimen page for the BG3-identity epic (owner picks a font " +
      "trio from ad-hoc screenshots). DEV-gated like the crash probes and TEMPORARY — " +
      "removed once the owner picks; it is not a product surface, so it carries no " +
      "visual baseline.",
  },
  {
    route: "/join/:code",
    reason:
      "Shareable-invite landing (features/campaigns/JoinCampaignRoute): a transient " +
      "auto-join that redirects to the campaign hub on success, so it has no stable " +
      "rendered surface of its own (only a spinner / recoverable error). The hub it " +
      "lands on (/campaigns/:campaignId) carries the visual baseline.",
  },
];

/**
 * Parse the `path="..."` of every `<Route>` in router.tsx, plus the implicit
 * index route. We keep this deliberately simple (regex over the JSX source) —
 * the router file is small and hand-authored, and a heavier AST parse would drag
 * the React/JSX toolchain into the unit suite for no real gain.
 *
 * The new shell uses ABSOLUTE paths only (character tabs are in-view `?tab=`
 * state, not nested routes), so there are no relative child segments to join.
 */
function parseRouterRoutes(src: string): string[] {
  const routes = new Set<string>();

  // 1) Every explicit absolute path="/..." (incl. the legacy redirect splat
  //    path="/characters/:characterId/*").
  for (const m of src.matchAll(/<Route\s+[^>]*\bpath="(\/[^"]*)"/g)) {
    const p = m[1];
    if (p) routes.add(p);
  }

  // 2) The home destination is an index route (no `path` attribute), so the
  //    regex above misses it. Detect any `<Route index …>` and add "/".
  if (/<Route\s+index\b/.test(src)) {
    routes.add("/");
  }

  // 3) The catch-all `path="*"` (404) is not `/`-prefixed, so (1) misses it.
  //    Record it as the literal "*" so coverage can resolve the not-found surface.
  if (/<Route\s+[^>]*\bpath="\*"/.test(src)) {
    routes.add("*");
  }

  return [...routes];
}

/** The single concrete path the not-found visual surface navigates to in order
 *  to exercise the `path="*"` catch-all (kept in sync with surface-manifest.ts).
 *  Only THIS path is allowed to resolve via the catch-all — a stale surface at
 *  any other unknown path still trips the orphan check. */
const NOT_FOUND_PROBE = "/this-page-does-not-exist";

/** Concretise a route pattern the way the harness navigates it: `:characterId` /
 *  `:campaignId` resolve as `mock-1`; the T4 member-sheet `:memberUid` resolves as
 *  `member-mara` (a dev-fixture campaign member with an attached fixture sheet). */
function concretise(route: string): string {
  return route
    .replace(/:characterId/g, "mock-1")
    .replace(/:campaignId/g, "mock-1")
    .replace(/:memberUid/g, "member-mara");
}

/** A surface covers a route iff its (already-concrete) `route` equals the
 *  concretised router route. The `*` catch-all is covered by the dedicated
 *  not-found surface (which navigates to the NOT_FOUND_PROBE path). */
function isCovered(route: string): boolean {
  if (route === "*") {
    return SURFACE_ROUTES.some((s) => s.route === NOT_FOUND_PROBE);
  }
  const target = concretise(route);
  return SURFACE_ROUTES.some((s) => s.route === target);
}

describe("visual surface coverage — router ↔ surface manifest", () => {
  const src = readFileSync(ROUTER, "utf8");
  const routerRoutes = parseRouterRoutes(src);
  const exemptSet = new Set(EXEMPT_ROUTES.map((e) => e.route));

  it("parses a sane set of routes from router.tsx (sanity)", () => {
    // Guard the guard: if the regex stops matching (router refactor), this trips
    // before the coverage assertion silently passes on an empty set.
    expect(routerRoutes).toContain("/");
    expect(routerRoutes).toContain("/characters/new");
    expect(routerRoutes).toContain("/characters/:characterId");
    expect(routerRoutes).toContain("/campaigns");
    expect(routerRoutes).toContain("/compendium");
    expect(routerRoutes).toContain("/settings");
    expect(routerRoutes.length).toBeGreaterThanOrEqual(9);
  });

  it("every navigable router route has a visual surface (or a documented exemption)", () => {
    const uncovered = routerRoutes
      .filter((r) => !exemptSet.has(r))
      .filter((r) => !isCovered(r));

    if (uncovered.length > 0) {
      const lines = uncovered.map((r) => `  ${r}  (→ ${concretise(r)})`).join("\n");
      throw new Error(
        `These router routes have NO visual surface in tests/e2e/surface-manifest.ts:\n${lines}\n\n` +
          `Fix: add a { slug, route } entry to SURFACE_ROUTES (+ its ready/prepare in ` +
          `tests/e2e/surfaces.ts), OR add the route to EXEMPT_ROUTES here WITH a reason.\n` +
          `Rule: new page/form/wizard/modal → add its screenshot surface. ` +
          `See docs/CONTRIBUTING.md → "Visual surface coverage".`
      );
    }
    expect(uncovered).toEqual([]);
  });

  it("every surface route resolves to a real router route (no stale surfaces)", () => {
    // The concrete routes the router can serve (with :characterId → mock-1).
    const concreteRouter = new Set(routerRoutes.map(concretise));

    // A legacy `/characters/:id/<tab>` deep link resolves via the redirect splat
    // (`/characters/:characterId/*` → `/characters/:characterId`), so a surface
    // under that prefix still RESOLVES even while its canonical surface is
    // repointed (Step 3B). Treat a router splat route (`…/*`) as matching any
    // path at or below its prefix.
    //
    // The cockpit tabs are in-view `?tab=` STATE on the bare character route
    // (blueprint §6.2), not sub-routes — a surface like
    // `/characters/mock-1?tab=spells` is the SAME router route with view state,
    // so resolve a surface by its PATH (the query string is not part of routing).
    function routerResolves(surfaceRoute: string): boolean {
      // Path-only (drop the `?query`) without an index access, so the result is a
      // plain `string` under both the lint + typecheck configs.
      const qIdx = surfaceRoute.indexOf("?");
      const path = qIdx === -1 ? surfaceRoute : surfaceRoute.slice(0, qIdx);
      if (concreteRouter.has(path)) return true;
      // A `/characters/<id>` surface resolves to the `/characters/:characterId`
      // route for ANY single-segment id, not just the harness `mock-1` — dev-only
      // scenario routes (`scn-battlemaster-fighter`) the engine builds on the fly
      // still navigate that same route. Match the router's :characterId pattern
      // against any concrete single-segment id (`concretise` already substituted
      // `mock-1`, so re-pattern it to recognise the family).
      for (const rr of routerRoutes) {
        if (!rr.includes(":")) continue;
        const re = new RegExp(
          `^${rr.replace(/:[A-Za-z]+/g, "[^/]+").replace(/\*/g, ".*")}$`
        );
        if (re.test(path)) return true;
      }
      // The not-found probe resolves ONLY via the `path="*"` catch-all — and
      // only this exact path, so a stale surface at any other unknown path is
      // still flagged as an orphan.
      if (path === NOT_FOUND_PROBE && concreteRouter.has("*")) return true;
      for (const rr of concreteRouter) {
        if (rr.endsWith("/*")) {
          const prefix = rr.slice(0, -2);
          if (path === prefix || path.startsWith(`${prefix}/`)) return true;
        }
      }
      return false;
    }

    const surfaceRoutes = [...new Set(SURFACE_ROUTES.map((s) => s.route))];
    const orphans = surfaceRoutes.filter((r) => !routerResolves(r));

    if (orphans.length > 0) {
      const lines = orphans.map((r) => `  ${r}`).join("\n");
      throw new Error(
        `These surface routes point at routes that no longer exist in router.tsx:\n${lines}\n\n` +
          `Fix: update or remove the stale entry in tests/e2e/surface-manifest.ts.`
      );
    }
    expect(orphans).toEqual([]);
  });

  it("exemptions are justified (each has a non-empty reason)", () => {
    for (const e of EXEMPT_ROUTES) {
      expect(e.reason.trim().length, `${e.route} needs a reason`).toBeGreaterThan(10);
    }
  });
});
