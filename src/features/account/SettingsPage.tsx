/**
 * SettingsPage — the full `/settings` destination (Phase 6).
 *
 * A PURE VIEW: it reads the shipped preference seams (`useUIStore` theme,
 * `useLocale` language, `authStore` identity) and dispatches to them — the SAME
 * seams the Topbar `SettingsDropdown` uses, so there is ONE source of truth and
 * no forked persistence. The dropdown stays the quick-access surface; this is
 * the full page (the rewrite intentionally makes `/settings` a real page, not the
 * design source's slide-out panel).
 *
 * Composed from shipped folio primitives — `.sec-head` section headers, the
 * shared `.set-row`/`.sr-*` labelled-row recipe (promoted into folio.css, T9/S3),
 * the `Segmented` control, `Button`, `InfoCard` — plus Tailwind
 * layout. It still does NOT emit the design source's slide-out panel chrome
 * (`.set-panel` / `.set-scrim`) or its bespoke `.theme-swatches` / `.swatch` /
 * `.acct` / `.signout` classes: this is a full page, not the source's overlay.
 *
 * Deferred (no shipped persistence path — intentionally NOT built, see the slice
 * report): a Data section (account-level export-all / import-all / delete-account
 * — only per-character JSON ops ship, and they already live on the roster), the
 * AI Assistant / BYOK section (unwired), and About/install. The Admin section is
 * a LINK only — re-homing the admin UI is a separate Phase-6 slice.
 */

import type { ComponentType, ReactNode } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ShieldCheck, LogOut, Palette, Languages } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Portrait } from "@/components/shared/Portrait";
import { Section } from "@/components/shared/Section";
import { InfoCard } from "@/components/shared/InfoCard";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { useLocale } from "@/hooks/useLocale";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { signOut } from "@/lib/auth";

/**
 * One labelled setting row, on the shared `.set-row` recipe (folio.css): an
 * engraved icon badge + name + italic help on the left, the control on the right.
 */
function SettingRow({
  icon,
  name,
  help,
  control,
}: {
  icon?: ComponentType<{ className?: string }>;
  name: ReactNode;
  help?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="set-row">
      {icon ? (
        <span className="sr-icon" aria-hidden>
          <Icon as={icon} size="sm" decorative />
        </span>
      ) : null}
      <div className="sr-text">
        <span className="sr-name">{name}</span>
        {help ? <span className="sr-help">{help}</span> : null}
      </div>
      <div className="sr-ctrl">{control}</div>
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t("nav.settings"));
  const navigate = useNavigate();

  // The SAME seams the dropdown uses — no forked state, no new persistence.
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const { language, setLanguage } = useLocale();
  const isAdmin = useIsAdmin();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const displayName = profile?.displayName ?? null;
  const email = user?.email ?? null;
  const identityName = displayName ?? email ?? t("settings.noIdentity");

  return (
    <main id="main" className="page-shell py-8">
      <PageHeader as="h1" crest title={t("nav.settings")} hint={t("settings.hint")} />

      {/* The framed header spans the shared page-shell width (consistent with every
          other hub); the settings form itself sits in a centered, readable column
          under it. */}
      <div className="on-art-scope mx-auto max-w-3xl">
        {/* ── Appearance: theme · language ──────────────────────────────────── */}
        <Section title={t("settings.appearance")}>
          {/* Seated in the SAME .info-card recipe as the Account card below, so the
              appearance rows read as a composed tile instead of floating bare on the
              page (the two .set-rows divide inside the one card). */}
          <InfoCard>
            <SettingRow
              icon={Palette}
              name={t("settings.theme")}
              help={t("settings.themeHelp")}
              control={
                <Segmented<"dark" | "light" | "system">
                  aria-label={t("settings.theme")}
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: "dark", label: t("settings.darkMode") },
                    { value: "light", label: t("settings.lightMode") },
                    { value: "system", label: t("settings.systemMode") },
                  ]}
                />
              }
            />
            <SettingRow
              icon={Languages}
              name={t("settings.language")}
              help={t("settings.languageHelp")}
              control={
                <Segmented<"en" | "it">
                  aria-label={t("settings.language")}
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: "en", label: "EN" },
                    { value: "it", label: "IT" },
                  ]}
                />
              }
            />
          </InfoCard>
        </Section>

        {/* ── Account: the signed-in identity ───────────────────────────────── */}
        <Section title={t("common.account")}>
          <InfoCard className="flex items-center gap-3">
            {/* One avatar primitive (#45/#92): Google photo or the per-seed tinted
                initial — consistent with the topbar + roster + admin. */}
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full">
              <Portrait
                src={profile?.photoURL}
                remote
                name={identityName}
                seed={user?.uid ?? identityName}
              />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-display font-bold text-text-primary">
                {identityName}
              </span>
              {displayName && email ? (
                <span className="truncate font-mono text-xs text-text-secondary">
                  {email}
                </span>
              ) : null}
            </div>
          </InfoCard>
        </Section>

        {/* ── Admin: link only (the re-home is a later slice) ───────────────── */}
        {isAdmin ? (
          <Section title={t("nav.admin")}>
            <Button
              variant="secondary"
              onClick={() => void navigate("/admin")}
              className="w-full justify-center sm:w-auto"
            >
              <Icon as={ShieldCheck} size="sm" decorative />
              {t("settings.openAdmin")}
            </Button>
          </Section>
        ) : null}

        {/* ── Sign out ──────────────────────────────────────────────────────── */}
        {/* Quiet register: signing out is SAFE and reversible — the filled
            danger dress is reserved for destructive acts (register rule). */}
        <div className="mt-10 border-t border-dashed border-border-subtle pt-6">
          <Button
            variant="secondary"
            onClick={() => void signOut()}
            className="w-full justify-center sm:w-auto"
          >
            <Icon as={LogOut} size="sm" decorative />
            {t("nav.signOut")}
          </Button>
        </div>
      </div>
    </main>
  );
}
