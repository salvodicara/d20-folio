import { useTranslation } from "react-i18next";
import type { IdentityWorkspaceProps } from "./IdentityWorkspace";

import { accountSections, accountLabel, type AccountSection } from "./navigation";
export function AccountNavigation({
  section,
  navigate,
  menu = false,
}: {
  section: string;
  navigate: (section: AccountSection) => void;
  menu?: boolean;
}) {
  const { t } = useTranslation("common");
  const label = (key: string) => t(`identity.${key}`);
  const group = (sections: readonly AccountSection[]) =>
    sections.map((id) => (
      <button
        key={id}
        aria-current={section === id ? "page" : undefined}
        onClick={() => navigate(id)}
      >
        {label(accountLabel(id))}
      </button>
    ));
  return (
    <aside
      className={`identity-settings-sidebar${menu ? " identity-settings-menu" : ""}`}
    >
      {!menu && <h2>{label("account")}</h2>}
      <nav aria-label={label("accountSettings")}>
        <div className="identity-settings-group">
          <span>{label("personalGroup")}</span>
          {group(accountSections.slice(0, 3))}
        </div>
        <div className="identity-settings-group">
          <span>{label("privacyDataGroup")}</span>
          {group(accountSections.slice(3, 6))}
        </div>
        <div className="identity-settings-group identity-settings-support">
          {group(["support"])}
        </div>
      </nav>
      {!menu && (
        <label className="identity-mobile-settings">
          {label("section")}
          <select
            aria-label={label("accountSection")}
            value={section}
            onChange={(e) => navigate(e.target.value as AccountSection)}
          >
            <optgroup label={label("personalGroup")}>
              {accountSections.slice(0, 3).map((id) => (
                <option key={id} value={id}>
                  {label(accountLabel(id))}
                </option>
              ))}
            </optgroup>
            <optgroup label={label("privacyDataGroup")}>
              {accountSections.slice(3, 6).map((id) => (
                <option key={id} value={id}>
                  {label(accountLabel(id))}
                </option>
              ))}
            </optgroup>
            <option value="support">{label("support")}</option>
          </select>
        </label>
      )}
    </aside>
  );
}

export function IdentityAccount({
  p,
  section,
  navigate,
  name,
  setName,
  locale,
  changeLocale,
}: {
  p: IdentityWorkspaceProps;
  section: AccountSection;
  navigate: (page: AccountSection | "campaign" | "characters" | "invite") => void;
  name: string;
  setName: (value: string) => void;
  locale: "en" | "it";
  changeLocale: (locale: "en" | "it") => void;
}) {
  const { t } = useTranslation("common");
  const label = (key: string) => t(`identity.${key}`);
  return (
    <div className="identity-settings-layout">
      <div>
        <AccountNavigation section={section} navigate={navigate} />
        <div className="identity-campaign-settings">
          <p>{label("campaignSettings")}</p>
          <button onClick={() => navigate("campaign")}>
            {label("manageCampaignLink")}
          </button>
        </div>
      </div>
      <div className="identity-settings-content">
        <header className="identity-settings-heading">
          <p>{label("account")}</p>
          <h1>{label(accountLabel(section))}</h1>
        </header>
        {section === "account" && (
          <>
            <form
              className="identity-settings-section"
              onSubmit={(e) => {
                e.preventDefault();
                void p.onSaveProfile(name, locale).catch(() => {});
              }}
            >
              <h2>{label("personalInformation")}</h2>
              <div className="identity-profile-summary">
                <span className="identity-avatar">{p.displayName.slice(0, 1)}</span>
                <div>
                  <strong>{p.displayName}</strong>
                  <p>{label("profileIntro")}</p>
                </div>
              </div>
              <label>
                {label("displayName")}
                <input
                  value={name}
                  maxLength={80}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <p className="identity-field-help">{label("characterNameHelp")}</p>
              <div className="identity-actions">
                <button className="identity-primary" disabled={p.busy}>
                  {label("saveChanges")}
                </button>
                <button
                  type="button"
                  disabled={p.busy}
                  onClick={() => void p.onSignOut().catch(() => {})}
                >
                  {label("signOut")}
                </button>
              </div>
            </form>
            <section className="identity-settings-section">
              <h2>{label("yourCampaigns")}</h2>
              <p>{label("membershipsIntro")}</p>
              <ul className="identity-list">
                {p.campaigns.map((c) => (
                  <li key={c.id}>
                    <div>
                      <strong>{c.name}</strong>
                      <small>{label(c.dmUid === p.uid ? "dm" : "player")}</small>
                    </div>
                    <button
                      aria-label={t("identity.openCampaign", { name: c.name })}
                      onClick={() => {
                        p.onNavigateCampaign(c.id);
                        navigate("campaign");
                      }}
                    >
                      {label("enter")}
                    </button>
                  </li>
                ))}
              </ul>
              {!p.campaigns.length && <p>{label("noCampaigns")}</p>}
              <div className="identity-actions">
                <button onClick={() => navigate("characters")}>
                  {label("openCharacters")}
                </button>
                <button onClick={() => navigate("invite")}>{label("enterInvite")}</button>
              </div>
            </section>
          </>
        )}
        {section === "preferences" && (
          <>
            <section className="identity-settings-section">
              <h2>{label("gameplay")}</h2>
              <fieldset
                className="identity-dice-preference"
                disabled={p.loading || p.busy || !p.onSaveDiceMode}
              >
                <legend>{label("preferredDice")}</legend>
                {(["digital", "physical"] as const).map((mode) => (
                  <label key={mode}>
                    <input
                      type="radio"
                      name="dice"
                      value={mode}
                      checked={(p.diceMode ?? "digital") === mode}
                      onChange={() => void p.onSaveDiceMode?.(mode).catch(() => {})}
                    />
                    <span>
                      <strong>{label(mode + "Dice")}</strong>
                      <small>{label(mode + "DiceDescription")}</small>
                    </span>
                  </label>
                ))}
                <p className="identity-field-help">{label("dicePreferenceHelp")}</p>
              </fieldset>
            </section>
            <section className="identity-settings-section">
              <h2>{label("language")}</h2>
              <div className="identity-setting-row">
                <label htmlFor="account-language">{label("appLanguage")}</label>
                <select
                  id="account-language"
                  disabled={p.busy}
                  value={locale}
                  onChange={(e) => changeLocale(e.target.value as "en" | "it")}
                >
                  <option value="it">Italiano</option>
                  <option value="en">English</option>
                </select>
              </div>
            </section>
            <p className="identity-field-help">{label("accountAutosave")}</p>
            <p className="identity-field-help">{label("diceFuture")}</p>
          </>
        )}
        {section === "privacy" && (
          <section className="identity-settings-section">
            <h2>{label("privacyAccess")}</h2>
            <p>{label("privacyAccount")}</p>
            <h3>{label("privacyCharactersTitle")}</h3>
            <p>{label("privacyCharacters")}</p>
            <h3>{label("privacyNotesTitle")}</h3>
            <p>{label("privacyNotes")}</p>
            <h3>{label("privacyRevocationTitle")}</h3>
            <p>{label("privacyRevocation")}</p>
          </section>
        )}
        {section === "recovery" && (
          <section className="identity-settings-section">
            <h2>{label("recoverOriginals")}</h2>
            <p>{label("recoveryAvailable")}</p>
            <button onClick={() => navigate("characters")}>
              {label("openCharacters")}
            </button>
            <p className="identity-field-help">{label("recoveryFuture")}</p>
          </section>
        )}
        {section === "notifications" && (
          <section className="identity-settings-section">
            <h2>{label("sessionReminders")}</h2>
            <p>{label("notificationsFuture")}</p>
          </section>
        )}
        {section === "offlineData" && (
          <section className="identity-settings-section">
            <h2>{label("offlineAvailableTitle")}</h2>
            <p>{label("offlineAvailable")}</p>
            <p>{label("offlineFuture")}</p>
          </section>
        )}
        {section === "support" && (
          <section className="identity-settings-section">
            <h2>{label("supportTitle")}</h2>
            <p>{label("supportFuture")}</p>
          </section>
        )}
      </div>
    </div>
  );
}
