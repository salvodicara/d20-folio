/**
 * «Note legali» on the new frame: the required SRD 5.2.1 and SRD 5.1 CC-BY-4.0
 * statements first and verbatim, then the licenses, trademarks, the app, and the
 * privacy policy and terms behind a disclosure each (D&D Beyond's legal pages: a plain
 * reading column of short headed sections). The footer's links open at their section
 * (#attribution, #privacy, #terms). Public: it reads before sign-in.
 */
import { useEffect } from "react";
import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";

import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Panel } from "@/ui";

const SRD_URL = "https://www.dndbeyond.com/srd";
const SRD51_URL = "https://dnd.wizards.com/resources/systems-reference-document";
const CCBY_URL = "https://creativecommons.org/licenses/by/4.0/legalcode";
const CCBY3_URL = "https://creativecommons.org/licenses/by/3.0/";
const AGPL_URL = "https://www.gnu.org/licenses/agpl-3.0.html";
const GAME_ICONS_URL = "https://game-icons.net";

function Out({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

const PRIVACY = [
  "collect",
  "use",
  "where",
  "sharing",
  "errors",
  "retention",
  "rights",
  "children",
  "changes",
] as const;
const TERMS = [
  "service",
  "content",
  "conduct",
  "unofficial",
  "liability",
  "law",
] as const;

export function LegalScreen() {
  const { t } = useTranslation();
  useDocumentTitle(t("legal.title"));
  // A footer link names its section (#privacy, #terms, #attribution): open there.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView();
  }, [hash]);
  return (
    <main id="main" className="f-page f-legal">
      <header className="f-ph">
        <div>
          <h1>{t("legal.title")}</h1>
          <p>{t("legal.subtitle")}</p>
        </div>
      </header>
      <section id="attribution">
        <Panel color="cmp" title={t("legal.attribution.heading")}>
          <blockquote>{t("legal.attribution.statement")}</blockquote>
          <blockquote>{t("legal.attribution.statement51")}</blockquote>
          <p className="f-help">{t("legal.attribution.note")}</p>
        </Panel>
      </section>
      <section id="licenses">
        <Panel color="log" title={t("legal.licenses.heading")}>
          <p>{t("legal.licenses.intro")}</p>
          <dl>
            <dt>{t("legal.licenses.srdTerm")}</dt>
            <dd>
              <p>{t("legal.licenses.srdDesc")}</p>
              <p className="f-legal-links">
                <Out href={CCBY_URL} label={t("legal.links.ccby")} />
                <Out href={SRD_URL} label={t("legal.links.srd")} />
                <Out href={SRD51_URL} label={t("legal.links.srd51")} />
              </p>
            </dd>
            <dt>{t("legal.licenses.appTerm")}</dt>
            <dd>
              <p>{t("legal.licenses.appDesc")}</p>
              <p className="f-legal-links">
                <Out href={AGPL_URL} label={t("legal.links.agpl")} />
              </p>
            </dd>
          </dl>
          <p>
            {t("legal.licenses.iconsDesc")}{" "}
            <Out href={GAME_ICONS_URL} label={t("legal.links.gameIcons")} /> ·{" "}
            <Out href={CCBY3_URL} label={t("legal.links.ccby3")} />
          </p>
        </Panel>
      </section>
      <section id="trademarks">
        <Panel color="log" title={t("legal.trademarks.heading")}>
          <p>
            <b>{t("legal.trademarks.disclaimer")}</b>
          </p>
          <p>{t("legal.trademarks.body")}</p>
          <p>{t("legal.trademarks.compatible")}</p>
        </Panel>
      </section>
      <section id="app">
        <Panel color="log" title={t("legal.app.heading")}>
          <p>{t("legal.app.body")}</p>
          <p>{t("legal.app.editions")}</p>
        </Panel>
      </section>
      <Clauses id="privacy" doc="privacy" keys={PRIVACY} />
      <Clauses id="terms" doc="terms" keys={TERMS} />
    </main>
  );
}

/** A policy: its date and an open/close disclosure over its headed clauses. */
function Clauses({
  id,
  doc,
  keys,
}: {
  id: string;
  doc: "privacy" | "terms";
  keys: ReadonlyArray<string>;
}) {
  const { t } = useTranslation();
  return (
    <section>
      <Panel color="log" title={t(`legal.${doc}.heading`)}>
        <details id={id} className="f-legal-doc">
          <summary>
            <span className="f-help">{t(`legal.${doc}.effective`)}</span>
            <span className="f-legal-open">{t(`legal.${doc}.openLabel`)}</span>
            <span className="f-legal-close">{t(`legal.${doc}.closeLabel`)}</span>
          </summary>
          <p>{t(`legal.${doc}.intro`)}</p>
          <dl>
            {keys.map((k) => (
              <div key={k}>
                <dt>{t(`legal.${doc}.${k}T`)}</dt>
                <dd>{t(`legal.${doc}.${k}D`)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Panel>
    </section>
  );
}
