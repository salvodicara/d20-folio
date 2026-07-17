/**
 * AppShell — the global shell for the "Illuminated Folio — Evolved" rewrite.
 *
 * Carries ONLY global chrome: the flat-hub Topbar, the "Ask the Folio"
 * CommandPalette, the mobile bottom-nav, and the routed <Outlet>. The character
 * cockpit / HUDs are composed INSIDE the character route (not here) — this shell is
 * realm-agnostic (see docs/ARCHITECTURE.md). Realm navigation is
 * the topbar tabs (desktop) + bottom nav (mobile); there is no breadcrumb (the
 * flat-hub model + self-naming detail pages made a drill-down crumb redundant).
 *
 * Renders <Outlet> directly with NO <main> wrapper — each page owns its own
 * `<main id="main">` landmark (the skip-link target), so the shell adds no second one.
 */

import { useEffect, useState, lazy, Suspense } from "react";
import { Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { Topbar } from "./shell/Topbar";
import { CommandPalette } from "./shell/CommandPalette";
import { ScrollRestorer } from "./ScrollRestorer";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useUIStore } from "@/stores/uiStore";

// The `?` shortcuts sheet is on-demand chrome — lazy so its Dialog + registry never
// weigh the eager entry bundle (the GlobalCombatMount pattern). Suspense fallback is
// nothing; it renders only while shortcutsOpen.
const ShortcutsSheet = lazy(() =>
  import("@/components/shared/ShortcutsSheet").then((m) => ({
    default: m.ShortcutsSheet,
  }))
);

// INIT-2 — the shell-level combat status subscription is RENDERLESS and lazy-loaded, so
// its campaign+engine import graph never weighs the always-eager entry bundle. It
// publishes into the light `combatStatusStore` the pip + sheet region read.
const GlobalCombatMount = lazy(() =>
  import("@/features/campaigns/global-combat").then((m) => ({
    default: m.GlobalCombatMount,
  }))
);
import { ImportCharacterHost } from "@/features/roster/ImportCharacterHost";
import { MobileBottomNav } from "./shell/MobileBottomNav";
import { SiteFooter } from "./shell/SiteFooter";
import { prefetchLikelyRoutes } from "./route-prefetch";
// DEV-ONLY (remove before release): the act-as-member sandbox dock. Behind
// `import.meta.env.DEV` (statically false in prod) so the import is dead-code-eliminated.
import { DevActAsDock } from "./shell/DevActAsDock";

export function AppShell() {
  const { t } = useTranslation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const shortcutsOpen = useUIStore((s) => s.shortcutsOpen);
  // Sticky-mount latch: the sheet's chunk stays off the eager bundle (nothing loads
  // until the first `?`), but once opened the sheet STAYS mounted so closing drives
  // Radix's data-state="closed" exit animation — a conditional unmount tore it down
  // the same tick and the sheet SNAPPED away while every other overlay fades out.
  // Adjust-state-during-render (no effect), the SectionPanel precedent.
  const [shortcutsEverOpened, setShortcutsEverOpened] = useState(false);
  if (shortcutsOpen && !shortcutsEverOpened) setShortcutsEverOpened(true);

  // The ONE global keyboard listener: ⌘K/Ctrl+K (toggle palette), `/` (open
  // palette), and the `g`-prefixed go-to sequences. Route-scoped accelerators
  // (cockpit ⌘E, encounter ←/→) stay in their own route hooks.
  useGlobalShortcuts({ setPaletteOpen });

  // Warm the likely-next route chunks during idle (F22) so the first navigation to
  // the cockpit / campaigns / compendium is instant instead of a cold fetch.
  useEffect(() => {
    prefetchLikelyRoutes();
  }, []);

  return (
    // A sticky-footer flex column: the content grows to fill the viewport so the
    // legal footer sits at the BOTTOM of the screen (visible without forcing a
    // scroll on short pages — D40 reversed per owner 2026-06-07: showing the
    // footer is fine, and we avoid manufactured scroll), and is simply pushed
    // below the fold on tall pages. The bottom padding clears EVERY fixed bottom
    // bar so a page's last row is never occluded: the mobile bottom-nav (below
    // md, where the nav shows) PLUS the PWA dock (`--pwa-banner-h`, the offline
    // strip / install prompt's measured height, published by PWABanner — 0 when
    // hidden, so the padding collapses with it). Border-box: the padding eats
    // into the min-h-screen column, so short pages stay scroll-free. The realm
    // nav shows on EVERY route — the wizards included (owner fb3, 2026-06-11:
    // "the wizards are routes, not jails"); their pager cluster floats above it.
    <div className="app-canvas flex min-h-screen flex-col text-text-primary pb-[calc(var(--m-nav-h)+var(--safe-bottom)+var(--pwa-banner-h,0px))] md:pb-[var(--pwa-banner-h,0px)]">
      {/* Native-feeling cross-page scroll + focus restoration (renderless). */}
      <ScrollRestorer />

      <a href="#main" className="skip-link">
        {t("common.skipToMain")}
      </a>

      {/* INIT-2 — the renderless, lazy combat-status subscription (publishes to the
          light store the pip + sheet region read). Suspense fallback is nothing. */}
      <Suspense fallback={null}>
        <GlobalCombatMount />
      </Suspense>

      <Topbar onOpenPalette={() => setPaletteOpen(true)} />

      {/* Pages own their `<main id="main">` landmark (matches the legacy shell).
          No breadcrumb: the flat-hub topbar tabs (desktop) + bottom nav (mobile)
          carry realm navigation, and detail pages name themselves in their own
          header — a drill-down crumb was redundant (owner removed it).

          `flex-1` makes the content grow to fill the column, so the footer below
          rides to the bottom of the viewport on short pages (shown, no forced
          scroll) and is pushed below the fold on tall ones. */}
      <div className="flex flex-1 flex-col">
        {/* ONE persistent Suspense boundary for the whole routed area. Every heavy
            route is `React.lazy`, and React.lazy ALWAYS suspends on a fresh
            boundary's first render — so a per-route boundary (the old `suspend()`
            wrapper) blanked the content on the first eager→lazy navigation
            (roster→campaigns) even with the chunk prefetched, then flashed the
            loader. Hoisting the boundary HERE, above the <Outlet>, means it stays
            mounted across every navigation: under React Router v7's startTransition
            the previous page keeps painting until the next one is ready, so a warm
            leg shows no blank/loader frame and only a genuinely cold fetch surfaces
            the FolioLoader (which still waits ~250ms before appearing). The shell
            chrome (Topbar/nav/footer) sits OUTSIDE this boundary, so it never
            unmounts. The region errorElement route renders THROUGH this Outlet, so
            a chunk-load failure or render fault still lands in the recoverable
            region panel with the nav intact. */}
        <Suspense fallback={<FolioLoader variant="region" />}>
          <Outlet />
        </Suspense>
      </div>

      {/* Discreet global legal-attribution footer (D32). */}
      <SiteFooter />

      {/* Global "Ask the Folio" palette. The other global overlays (UndoToasts,
          ConfirmDialog) are lifted here from the router body during the Step-2
          router swap. */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {/* The `?` keyboard-shortcuts reference. Open state lives in uiStore, so the
          `?` key, the palette action, and the footer chip all drive this one sheet.
          Mounted on FIRST open (lazy chunk never loads at startup), then kept
          mounted so closing plays the shared overlay exit animation. */}
      {shortcutsEverOpened && (
        <Suspense fallback={null}>
          <ShortcutsSheet />
        </Suspense>
      )}

      {/* The global bug / feature reporter (OWN-37) is mounted in App.tsx — at the
          app root, OUTSIDE the error nets — so the crash screens can open it too. */}

      {/* Hosts the shared character-import flow globally so the palette's "Import"
          action can launch it from any page (OWN-28d). Renders nothing visible. */}
      <ImportCharacterHost />

      {/* Phone realm switcher (hidden from md up). */}
      <MobileBottomNav />

      {/* DEV-ONLY (remove before release): the act-as-member sandbox dock. The
          `import.meta.env.DEV` gate folds to `false` in prod, so the JSX + its import
          are dead-code-eliminated and the dock never ships. */}
      {import.meta.env.DEV && <DevActAsDock />}
    </div>
  );
}
