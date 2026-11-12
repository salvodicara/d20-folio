/**
 * The layout route for the new UI's screens (behind VITE_NEW_UI): the `src/ui` AppShell
 * wired to the router, the account and the app-wide renderless services the old shell
 * also runs (combat status, homebrew library, scroll restore). Old screens keep the old
 * shell until each is rebuilt.
 */
import { lazy, Suspense } from "react";
import { Link, Outlet, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/ui/AppShell";
import { initialOf } from "@/ui/initial";
import { NewToasts } from "./NewToasts";
import { CombatPip } from "@/domains/combat/ui/CombatPip";
import { ScrollRestorer } from "./ScrollRestorer";
import { useAfterLoad } from "./use-after-load";
import { useAuthStore } from "@/stores/authStore";
import { signOut } from "@/lib/auth";

const GlobalCombatMount = lazy(() =>
  import("@/features/campaigns/global-combat").then((m) => ({
    default: m.GlobalCombatMount,
  }))
);
const LibraryMount = lazy(() =>
  import("@/features/account/library-mount").then((m) => ({ default: m.LibraryMount }))
);

export function NewAppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  // The fight producer brings the rules engine: it starts once the page has loaded,
  // so the screen's own code and data come first on a slow phone.
  const background = useAfterLoad();
  // A Google account always has a name; the email stands in when it doesn't.
  const name = user?.displayName || user?.email || "";
  return (
    <AppShell
      skipLabel={t("common.skipToMain")}
      home="/characters"
      homeLabel={t("shell.home")}
      nav={[
        { to: "/characters", label: t("nav.characters") },
        { to: "/campaigns", label: t("nav.campaigns") },
        { to: "/compendium", label: t("nav.compendium") },
      ]}
      navLabel={t("nav.primary")}
      searchLabel={t("shell.search")}
      status={<CombatPip />}
      onSearch={(q) =>
        void navigate(q ? `/compendium?q=${encodeURIComponent(q)}` : "/compendium")
      }
      menuLabel={t("shell.menu")}
      account={{
        label: t("shell.account"),
        initial: initialOf(name),
        name,
        email: user?.email ?? undefined,
        actions: [
          {
            label: t("nav.settings"),
            icon: "u-settings",
            onSelect: () => void navigate("/settings"),
          },
          { label: t("nav.signOut"), icon: "u-sign-out", onSelect: () => void signOut() },
        ],
      }}
      footer={
        <>
          <span>Folio · {t("legal.terms.unofficialT")}</span>
          {/* the prototype's legal links: each to its own section of the legal page */}
          <nav className="f-foot-links" aria-label={t("legal.link")}>
            <Link to="/legal#privacy">{t("legal.footer.privacy")}</Link>
            <Link to="/legal#terms">{t("legal.footer.terms")}</Link>
            <Link to="/legal#attribution">{t("legal.footer.srd")}</Link>
          </nav>
        </>
      }
    >
      <ScrollRestorer />
      <Suspense fallback={null}>
        {background && <GlobalCombatMount />}
        <LibraryMount />
      </Suspense>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      <NewToasts />
    </AppShell>
  );
}
