/**
 * «Impostazioni» on the new frame (D&D Beyond's account settings: short labelled
 * panels). The new UI is dark-only, so there is no theme to pick: the language, the
 * signed-in account with «Esci», and the admin console link for the admin. The same
 * seams the old page used (`useLocale`, `authStore`, `signOut`), one source of truth.
 */
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useLocale } from "@/hooks/useLocale";
import { signOut } from "@/lib/auth";
import { LOCALES } from "@/lib/locale";
import { useAuthStore } from "@/stores/authStore";
import { Button, Chip, Panel } from "@/ui";
import { initialOf } from "@/ui/initial";

export function SettingsScreen() {
  const { t } = useTranslation();
  useDocumentTitle(t("nav.settings"));
  const navigate = useNavigate();
  const { language, setLanguage } = useLocale();
  const isAdmin = useIsAdmin();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const name = profile?.displayName || user?.email || t("settings.noIdentity");
  const email = profile?.displayName ? user?.email : null;
  // a working page: no room band above it, the panels come first
  return (
    <>
      <main id="main" className="f-page f-settings">
        <header className="f-ph">
          <h1>{t("nav.settings")}</h1>
        </header>
        <Panel color="abi" title={t("settings.language")}>
          <p className="f-help">{t("settings.languageHelp")}</p>
          <div className="f-chips" role="group" aria-label={t("settings.language")}>
            {LOCALES.map((code) => (
              <Chip
                key={code}
                pressed={language === code}
                onClick={() => setLanguage(code)}
              >
                {code.toUpperCase()}
              </Chip>
            ))}
          </div>
        </Panel>
        <Panel color="grp" title={t("common.account")}>
          <div className="f-acct">
            <span className="f-av" aria-hidden>
              {initialOf(name)}
            </span>
            <span className="f-acct-id">
              <b>{name}</b>
              {email && <span>{email}</span>}
            </span>
            <Button icon="u-sign-out" onClick={() => void signOut()}>
              {t("nav.signOut")}
            </Button>
          </div>
        </Panel>
        {isAdmin && (
          <Panel color="log" title={t("nav.admin")}>
            <Button icon="u-settings" onClick={() => void navigate("/admin")}>
              {t("settings.openAdmin")}
            </Button>
          </Panel>
        )}
      </main>
    </>
  );
}
