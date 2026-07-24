import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
  Navigate,
} from "react-router";
import { lazy } from "react";
import { AppShell } from "./AppShell";
import { importCockpit, importCampaigns } from "./route-prefetch";
import { ensureSrdKind } from "@/i18n";
import { AuthGuard } from "@/components/shared/AuthGuard";
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary";
import { LoginPage } from "./routes/login";
import { RosterPage } from "@/features/roster/RosterPage";
import { NotFoundPage } from "./routes/not-found";
import { CrashProbe } from "./routes/crash-probe";
import { UndoToasts } from "@/components/sheet/UndoToasts";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

// CODE-SPLIT — the heavy flows stay lazy so they don't bloat the initial bundle.
// Creation is re-homed to `features/creation` (Phase 3C); admin is re-homed to
// `features/account` (Phase 6) and stays lazy — it's admin-only, so it must never
// weigh on the player's initial bundle. The realm stubs load eagerly.
const CreationWizard = lazy(() =>
  import("@/features/creation/CreationWizard").then((m) => ({
    default: m.CreationWizard,
  }))
);
const AdminPage = lazy(() =>
  import("@/features/account/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const AdminSheetView = lazy(() =>
  import("@/features/account/AdminSheetView").then((m) => ({
    default: m.AdminSheetView,
  }))
);
// The level-up wizard is its own lazy route (wizard-F full-screen flow).
const LevelUpWizard = lazy(() =>
  import("@/features/leveling/LevelUpWizard").then((m) => ({
    default: m.LevelUpWizard,
  }))
);
// N-C — code-split every heavy NON-landing route so the initial load (login →
// roster) no longer ships the cockpit, the campaign realm, the compendium codex,
// or settings. Each loads on demand and is cached by the browser + the service
// worker, so the first visit costs one fetch and every later nav is instant. The
// roster + login stay eager (they ARE the landing).
const CharacterCockpit = lazy(() =>
  importCockpit().then((m) => ({ default: m.CharacterCockpit }))
);
const CampaignsListPage = lazy(() =>
  importCampaigns().then((m) => ({ default: m.CampaignsListPage }))
);
const CampaignHubPage = lazy(() =>
  import("@/features/campaigns/CampaignHubPage").then((m) => ({
    default: m.CampaignHubPage,
  }))
);
// T4 — the DM's read-only view of a party member's full character sheet.
const MemberSheetView = lazy(() =>
  import("@/features/campaigns/MemberSheetView").then((m) => ({
    default: m.MemberSheetView,
  }))
);
const JoinCampaignRoute = lazy(() =>
  import("@/features/campaigns/JoinCampaignRoute").then((m) => ({
    default: m.JoinCampaignRoute,
  }))
);
const CompendiumPage = lazy(() =>
  // D-2 load-before-render gate: resolve the lazy `monster` catalogue for every
  // loaded locale IN PARALLEL with the route chunk, so the codex's Monsters wing
  // never renders a raw name key. Kept here (not as a specs-barrel top-level await,
  // which would make that barrel async and fragment the eager closure — see
  // picker/specs/index.ts). `ensureSrdKind` marks the kind resident, so a later
  // language switch carries the corpus across without re-gating.
  Promise.all([
    import("@/features/compendium/CompendiumPage"),
    ensureSrdKind("monster"),
  ]).then(([m]) => ({ default: m.CompendiumPage }))
);
const SettingsPage = lazy(() =>
  import("@/features/account/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
// Legal — a public colophon leaf (low-traffic, linked from the footer + login), so it
// stays LAZY like every other non-landing route: its section-rail scroll-spy must not
// weigh on the initial bundle. Mounted inside AppShell, whose one persistent Suspense
// boundary catches it (a cold visit surfaces the loader briefly, then caches).
const LegalPage = lazy(() =>
  import("./routes/legal").then((m) => ({ default: m.LegalPage }))
);
// DEV-ONLY living type specimen of the Gilded Plate system (BG3-identity
// epic) — lazy like every route; the prod branch is a stub so Rolldown drops
// the chunk from production builds entirely.
const SpecimensPage = import.meta.env.DEV
  ? lazy(() => import("./routes/specimens").then((m) => ({ default: m.SpecimensPage })))
  : () => null;

// A DATA router (createBrowserRouter), not the legacy <BrowserRouter><Routes> — the
// data router is what enables `useBlocker` (the creation-wizard "discard your new
// character?" navigation guard) and any future loaders/actions. The route TREE is
// unchanged; `createRoutesFromElements` accepts the same `<Route>` JSX. The heavy
// routes are `React.lazy`; ONE persistent Suspense boundary lives in AppShell around
// its <Outlet> (fallback: FolioLoader region), so the shell chrome AND the boundary
// stay mounted across every navigation — the previous page keeps painting until the
// next chunk resolves (no per-route boundary that blanks + flashes on the first
// eager→lazy leg). Only a genuinely cold fetch surfaces the loader (~250ms delay).
const router = createBrowserRouter(
  createRoutesFromElements(
    // ROOT error net — a fullscreen, recoverable fallback for anything that throws
    // before/around the shell (login, the auth guard). React Router catches route
    // render errors itself, so an `errorElement` here (not just the React
    // <ErrorBoundary> around <RouterProvider>) is what stops the bare white
    // "Unexpected Application Error!" screen.
    <Route errorElement={<RouteErrorBoundary variant="fullscreen" />}>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Legal & attribution — PUBLIC (the SRD/CC-BY attribution must read
          pre-auth; the login footer links it) yet mounted INSIDE the shell so it
          carries the SAME Topbar / realm-nav / footer chrome as every other
          surface — no page may stand outside the shell (owner 2026-07-07: a
          chrome-less page "feels so different from all the rest"). AppShell is
          realm-agnostic and degrades gracefully with no signed-in user (its
          account cluster + combat pip are `{user && …}`, GlobalCombatMount
          no-ops without a uid), so the SAME layout route the protected tree uses
          is simply mounted a second time here, ABOVE the AuthGuard — no new
          layout mechanism. Its own in-shell error net mirrors the protected one,
          so a render fault shows the recoverable region panel with the nav intact. */}
      <Route element={<AppShell />}>
        <Route errorElement={<RouteErrorBoundary variant="region" />}>
          <Route path="/legal" element={<LegalPage />} />
        </Route>
      </Route>

      {/* DEV-ONLY crash probe (fullscreen): throws directly under the ROOT error
          net, so the fullscreen fallback (+ its crash-report entry) is a drivable,
          a11y/visual-covered surface. Stripped from the prod bundle. */}
      {import.meta.env.DEV && <Route path="/_crash-root" element={<CrashProbe />} />}

      {/* DEV-ONLY typography specimens: three font-trio sections for the
          BG3-identity epic, screenshot-driven owner pick. Public (outside the
          auth guard) so it can be captured without a session; stripped from
          the prod bundle by the same DEV fold as the crash probes. */}
      {import.meta.env.DEV && <Route path="/_specimens" element={<SpecimensPage />} />}

      {/* Protected — the new flat-hub shell */}
      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          {/* In-shell error net — a render crash on any surface (e.g. a malformed
              character doc) shows a recoverable panel in the content area while the
              persistent nav stays mounted, so the user can simply walk away from
              the broken surface instead of being stranded on a white screen. */}
          <Route errorElement={<RouteErrorBoundary variant="region" />}>
            {/* The roster is canonical at /characters; `/` redirects there. */}
            <Route index element={<Navigate to="/characters" replace />} />
            <Route path="/characters" element={<RosterPage />} />
            {/* Creation — static `new` ranks above the dynamic `:characterId`. */}
            <Route path="/characters/new" element={<CreationWizard />} />
            {/* Character cockpit — tab is in-view state, not a sub-route. */}
            <Route path="/characters/:characterId" element={<CharacterCockpit />} />
            {/* Level-up — the full-screen wizard-F flow (own route so it gets the
                useBlocker leave-confirm + beforeunload, like creation). */}
            <Route path="/characters/:characterId/level-up" element={<LevelUpWizard />} />
            {/* Campaigns */}
            <Route path="/campaigns" element={<CampaignsListPage />} />
            <Route path="/campaigns/:campaignId" element={<CampaignHubPage />} />
            {/* T4 — DM reads a party member's full sheet, read-only. */}
            <Route
              path="/campaigns/:campaignId/sheets/:memberUid"
              element={<MemberSheetView />}
            />
            {/* Shareable invite link (#33) — auto-joins, then redirects to the hub. */}
            <Route path="/join/:code" element={<JoinCampaignRoute />} />
            {/* Compendium */}
            <Route path="/compendium" element={<CompendiumPage />} />
            {/* Settings */}
            <Route path="/settings" element={<SettingsPage />} />
            {/* Admin — role-gated console, lazy + admin-only. */}
            <Route path="/admin" element={<AdminPage />} />
            {/* Admin reads ANY user's character, read-only (admin override grant). */}
            <Route
              path="/admin/users/:uid/characters/:charId"
              element={<AdminSheetView />}
            />
            {/* DEV-ONLY crash probe (region): throws inside the IN-SHELL error
                net, so the region fallback (+ its crash-report entry) is a
                drivable, a11y/visual-covered surface. Stripped from prod. */}
            {import.meta.env.DEV && <Route path="/_crash" element={<CrashProbe />} />}
            {/* Catch-all — recoverable 404 inside the shell. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Route>
  )
);

export function AppRouter() {
  return (
    <>
      <RouterProvider router={router} />
      {/* Global overlays — store-driven, no router context needed, so they sit
          beside the provider (lifted out of the old router body in the data-router
          swap). */}
      <UndoToasts />
      <ConfirmDialog />
    </>
  );
}
