/**
 * The layout route for the new UI's screens (behind VITE_NEW_UI): the `src/ui` AppShell
 * wired to the router, the account and the app-wide renderless services the old shell
 * also runs (combat status, homebrew library, scroll restore). Old screens keep the old
 * shell until each is rebuilt.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Outlet, useMatch, useNavigate } from "react-router";
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
// ⌘K reads the roster and the compendium: it loads on first open, never at first paint.
const SearchPalette = lazy(() => import("@/domains/search/ui/SearchPalette"));
const LibraryMount = lazy(() =>
  import("@/features/account/library-mount").then((m) => ({ default: m.LibraryMount }))
);

export function NewAppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  // The fight producer brings the rules engine. On a character sheet it starts at once:
  // Play reads the live fight and the session log stamps each line with its round (the
  // sheet loads the engine anyway). Elsewhere it starts once the page has loaded, so the
  // screen's own code and data come first on a slow phone; it reads the stored fight
  // when it starts, so nothing that began meanwhile is missed.
  const onSheet = useMatch("/characters/:characterId/*") !== null;
  const afterLoad = useAfterLoad();
  const background = onSheet || afterLoad;
  // A Google account always has a name; the email stands in when it doesn't.
  const name = user?.displayName || user?.email || "";
  // ⌘K / Ctrl+K anywhere, or the header's search, opens the app's search.
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
      searchLabel={t("palette.title")}
      status={<CombatPip />}
      onSearch={() => setSearching(true)}
      menuLabel={t("shell.menu")}
      // a public page read before sign-in (/legal) has no account to show
      account={
        user
          ? {
              label: t("shell.account"),
              initial: initialOf(name),
              name,
              email: user.email ?? undefined,
              actions: [
                {
                  label: t("nav.settings"),
                  icon: "u-settings",
                  onSelect: () => void navigate("/settings"),
                },
                {
                  label: t("nav.signOut"),
                  icon: "u-sign-out",
                  onSelect: () => void signOut(),
                },
              ],
            }
          : undefined
      }
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
      {searching && (
        <Suspense fallback={null}>
          <SearchPalette open onClose={() => setSearching(false)} />
        </Suspense>
      )}
    </AppShell>
  );
}
