/**
 * Account + Settings menu.
 *
 * The trigger is the signed-in user's NAME + AVATAR as one clickable unit (owner
 * 2026-06-07 — clicking either opens the menu), so this one menu reads as "your
 * account" and appears identically in the roster topbar AND the sheet header — the
 * user identity + Sign Out are now on every page, not just the roster. The name is
 * surfaced only on very wide screens (C10); on narrow ones the trigger is just the
 * avatar.
 *
 * D17 — the menu and the `/settings` page have SEPARATE purposes (owner, "copy
 * D&D Beyond"): this is an ACCOUNT menu — identity, the two FAST-ACCESS toggles
 * (Theme · Language), then the bridge to the full Settings page, (Admin), and Sign
 * Out. Everything else (motion, and whatever Settings grows to) lives ONLY on the
 * page, so the two surfaces no longer duplicate the same controls.
 */

import { useState, useRef } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Globe, Moon, Sun, Settings, LogOut, ShieldCheck, Bug } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Portrait } from "@/components/shared/Portrait";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { useLocale } from "@/hooks/useLocale";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { openReportAfterPaint } from "@/features/report/open-report";
import { signOut } from "@/lib/auth";

/**
 * `current` is the account-ring anchor flag, computed in `Topbar` (never here —
 * this menu is reused chrome that must not read the location itself): `"settings"`
 * / `"admin"` when you are on that surface, else `null`. It lights the trigger
 * (D2) and marks the matching menu row `aria-current="page"` (D3).
 */
export interface SettingsDropdownProps {
  current: "settings" | "admin" | null;
}

export function SettingsDropdown({ current }: SettingsDropdownProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const { language, toggleLanguage: toggleLang } = useLocale();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Close on outside pointerdown / Escape (shared, capture-phase).
  useDismissOnOutside(open, ref, () => setOpen(false));

  function toggleLanguage() {
    // Delegate the locale switch to the shared hook (one implementation); the
    // dropdown only adds the close-on-select behavior.
    toggleLang();
    setOpen(false);
  }

  function cycleTheme() {
    const order: Array<"dark" | "light" | "system"> = ["dark", "light", "system"];
    const idx = order.indexOf(theme);
    const next = order[(idx + 1) % order.length] ?? "dark";
    setTheme(next);
  }

  function handleLogout() {
    setOpen(false);
    void signOut();
  }

  const ThemeIcon = theme === "dark" ? Moon : Sun;

  // The visible name (shown on wide screens) must be part of the button's ACCESSIBLE
  // name too (WCAG 2.5.3 Label in Name) — so the aria-label leads with it when present.
  const triggerName = profile?.displayName ?? user?.email ?? null;
  // No-truncation rule (owner 2026-06-12: "truncations are a sign of
  // unprofessionality"): xl+ shows the FULL name at natural width; the lg→xl
  // band — where the bar is genuinely tight — shows the first name (an email's
  // local part) instead; below lg the avatar alone carries identity. The full
  // name always lives in the menu head. NEVER a mid-name ellipsis.
  const shortName = triggerName?.split(/[\s@]/, 1)[0] ?? null;
  const accountLabel = t("common.accountSettings");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={triggerName ? `${triggerName} — ${accountLabel}` : accountLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        // The account-ring anchor: lit exactly like a hub tab when the current
        // surface is Settings / Admin (D2). `aria-current` mirrors the hub tabs.
        data-current={current ? "true" : undefined}
        aria-current={current ? "true" : undefined}
        className="acct-trigger"
      >
        {/* The display name — part of the same clickable trigger (owner
            2026-06-07). xl+ carries the full name; lg→xl the first name; below
            lg the avatar alone — never a mid-name ellipsis (owner 2026-06-12). */}
        {triggerName && (
          <>
            <span className="acct-trigger-name hidden text-sm text-text-secondary lg:inline xl:hidden">
              {shortName}
            </span>
            <span className="acct-trigger-name hidden text-sm text-text-secondary xl:inline">
              {triggerName}
            </span>
          </>
        )}
        {/* One avatar primitive (#45/#92): the Google photo, or the deterministic
            per-seed tinted initial — never the static gold "?" again. */}
        <span className="topbar-avatar grid place-items-center overflow-hidden">
          <Portrait
            src={profile?.photoURL}
            remote
            name={profile?.displayName ?? user?.email ?? "?"}
            seed={user?.uid ?? profile?.displayName ?? user?.email ?? "?"}
          />
        </span>
      </button>

      {open && (
        // Branded folio popover: gold top-accent + diamond-rubric Cinzel head +
        // carved elevation (was an un-skinned shadcn-style list).
        <div className="settings-pop popover absolute right-0 top-full z-[300] mt-2 w-[188px]">
          <div className="pop-head acct-head">
            <span className="pop-rubric">{t("common.account")}</span>
            {(profile?.displayName || user?.email) && (
              <div className="acct-id">
                <span className="acct-id-name">
                  {profile?.displayName ?? user?.email}
                </span>
                {profile?.displayName && user?.email && (
                  <span className="acct-id-email">{user.email}</span>
                )}
              </div>
            )}
          </div>
          {/* role="menu" lives on the item list (not the outer popover) so the
              account-identity header isn't a non-menuitem child of the menu. */}
          <div className="pop-body" role="menu" aria-label={t("common.account")}>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={toggleLanguage}
            >
              <Icon as={Globe} decorative />
              {t("settings.language")}: {language.toUpperCase()}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={cycleTheme}
            >
              <Icon as={ThemeIcon} decorative />
              {theme === "dark"
                ? t("settings.darkMode")
                : theme === "light"
                  ? t("settings.lightMode")
                  : t("settings.systemMode")}
            </button>
            <div className="menu-div" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              aria-current={current === "settings" ? "page" : undefined}
              onClick={() => {
                setOpen(false);
                void navigate("/settings");
              }}
            >
              <Icon as={Settings} decorative />
              {t("nav.settings")}
            </button>
            {isAdmin && (
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                aria-current={current === "admin" ? "page" : undefined}
                onClick={() => {
                  setOpen(false);
                  void navigate("/admin");
                }}
              >
                <Icon as={ShieldCheck} decorative />
                {t("nav.admin")}
              </button>
            )}
            {/* The quiet, conventional home of the bug reporter (the ⌘K palette
                action stays). After-paint deferral: the menu must close before
                the screenshot is captured, so it photographs the PAGE. */}
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false);
                openReportAfterPaint();
              }}
            >
              <Icon as={Bug} decorative />
              {t("nav.report")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item danger"
              onClick={handleLogout}
            >
              <Icon as={LogOut} decorative />
              {t("nav.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
