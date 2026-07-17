/**
 * Topbar — the flat global hub (D&D-Beyond-style), per docs/PRODUCT_CONSTITUTION.md (nav IA).
 *
 * Brand · My Characters / Campaigns / Compendium · ⌕ Ask the Folio · account menu.
 * Realms are flat topbar peers (nav ≠ data hierarchy). Theme/appearance live in
 * the reused `SettingsDropdown` (account menu) — driven by the immutable
 * `uiStore`, so the theme toggle works without any store change. On mobile the hub
 * tabs collapse (the bottom nav becomes the realm switcher); the brand, palette
 * trigger, and account menu stay. i18n keys carry inline EN defaults with the EN+IT
 * `nav.*` / `palette.*` translations shipped.
 */

import { lazy, Suspense } from "react";
import { NavLink, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { shortcutLabel } from "@/lib/platform";
import { realmTarget } from "@/lib/realm-memory";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { BrandMark } from "@/components/ui/brand-mark";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { SettingsDropdown } from "@/components/sheet/SettingsDropdown";
import { SaveIndicator } from "@/components/shared/SaveIndicator";
import { useAuthStore } from "@/stores/authStore";

// Lazy — non-critical chrome that renders nothing out of combat. The pip itself is now
// LIGHT (the light pip model + the router + the Popover atom — no firebase/engine graph;
// the heavy producer lazy-mounts in AppShell), but keeping it off the eager entry bundle
// costs nothing and trims first paint.
const CombatPip = lazy(() =>
  import("./CombatPip").then((m) => ({ default: m.CombatPip }))
);

export interface TopbarProps {
  /** Opens the global "Ask the Folio" command palette. */
  onOpenPalette: () => void;
}

interface HubLink {
  to: string;
  label: string;
}

/** A full-height hub tab. Active = gold underline + deep-gold ink (AA-safe
 *  `--accent-text`) + semibold; resting = quiet secondary that gains a subtle
 *  underline + brightens on hover (one consistent hover idiom across the bar). */
function hubLinkClass({ isActive }: { isActive: boolean }): string {
  const base = "inline-flex items-center border-b-2 px-3 text-sm transition-colors";
  return isActive
    ? `${base} border-accent font-semibold text-accent-text`
    : `${base} border-transparent font-medium text-text-secondary hover:border-border-subtle hover:text-text-primary`;
}

export function Topbar({ onOpenPalette }: TopbarProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { pathname } = useLocation();
  // Hide the ⌘K hint chip on coarse pointers (touch): it hints a keyboard most
  // phone users don't have, and on some widths it leaked a stray `Ctrl K` chip.
  // Shortcuts still WORK on tablets with a hardware keyboard — only the chip hides.
  // Routed through the shared coarse-pointer seam (the same one that gates the
  // palette's `?` shortcuts entry points).
  const coarsePointer = useCoarsePointer();

  // The "account ring" surfaces (`/settings`, `/admin`, `/admin/users/…`) are
  // anchored to the account cluster, not a realm tab — so the avatar lights just
  // like a hub tab when you're on one (the anchor rule, DESIGN.md §Navigation).
  // Computed HERE (never inside the reused SettingsDropdown) and passed down.
  const ringCurrent: "settings" | "admin" | null = pathname.startsWith("/settings")
    ? "settings"
    : pathname.startsWith("/admin")
      ? "admin"
      : null;

  const hub: HubLink[] = [
    { to: "/characters", label: t("nav.characters") },
    { to: "/campaigns", label: t("nav.campaigns") },
    { to: "/compendium", label: t("nav.compendium") },
  ];

  return (
    <header className="topbar">
      <NavLink to="/characters" className="topbar-brand" aria-label={t("app.name")}>
        <BrandMark variant="gilt" size="md" />
      </NavLink>

      {/* Hub tabs are desktop chrome; below md they'd overflow the bar, so they
          collapse and the always-visible "Ask the Folio" trigger becomes the
          mobile navigator (it lists every realm). */}
      <nav aria-label={t("nav.primary")} className="hidden self-stretch md:flex">
        {hub.map((link) => (
          // No `end`: each realm link stays active across its whole subtree —
          // "Characters" highlights on /characters, /characters/new and
          // /characters/:id; "Campaigns" on /campaigns and /campaigns/:id (#17).
          <NavLink key={link.to} to={realmTarget(link.to)} className={hubLinkClass}>
            {link.label}
          </NavLink>
        ))}
      </nav>

      {/* INIT-1 — the flexible gap that pushes the search + account cluster to the right
          edge ALSO hosts the persistent global combat pip (3 escalating tiers; loud when my
          initiative is missing). Because the pip lives in this `flex:1` region (right-aligned
          beside the search), its appearance/clearing is absorbed by slack — the search and
          account stay anchored and DON'T shift. Renders nothing out of combat. */}
      <div className="topbar-spacer flex items-center justify-end">
        {user && (
          <Suspense fallback={null}>
            <CombatPip />
          </Suspense>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        aria-label={t("palette.trigger")}
        aria-keyshortcuts="Meta+K Control+K"
        className="topbar-ask"
      >
        <Icon as={Search} size="sm" decorative className="topbar-ask-icon" />
        <span className="hidden sm:inline">{t("palette.trigger")}</span>
        {!coarsePointer && (
          <Kbd aria-hidden className="ml-1 hidden sm:inline-block">
            {shortcutLabel("K")}
          </Kbd>
        )}
      </button>

      {user && (
        <div className="topbar-user">
          {/* Session undo/redo lives on the sheet's fob family (BinderFob /
              MobileSignet), since the stack is page-scoped by design. It no
              longer lives in the global topbar. */}
          {/* Global offline-first sync state (C3): a compact synced/saving/
              pending/error/offline pip that names itself on hover. */}
          <SaveIndicator />
          {/* Name + avatar are ONE clickable account trigger (owner 2026-06-07) —
              the name lives inside the SettingsDropdown button now, so clicking
              either opens the menu. */}
          <SettingsDropdown current={ringCurrent} />
        </div>
      )}
    </header>
  );
}
