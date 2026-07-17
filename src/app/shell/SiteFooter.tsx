/**
 * SiteFooter — a minimal, premium colophon at the foot of every page (D32/D39/D41).
 *
 * A quiet sign-off: a centered gold diamond + hairline rule, then one colophon row —
 * the wordmark · the build version · a discreet link to the full Legal & Attribution
 * page (the required SRD 5.2.1 / CC-BY-4.0 + WotC trademark text lives there, one
 * click away, rather than as boilerplate on every page — owner 2026-06-08). Rendered
 * once in the AppShell as the last child of the sticky-footer flex column: it rides to
 * the BOTTOM of the viewport on short pages — shown without forcing a scroll — and is
 * pushed below the fold on tall pages.
 */

import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";

export function SiteFooter() {
  const { t } = useTranslation();
  // The colophon leaf (`/legal`) is anchored HERE (D1): its footer link is the
  // "you are here" marker when you're reading the legal page.
  const onLegal = useLocation().pathname === "/legal";
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-inner">
        <span className="site-footer-rule" aria-hidden>
          <span className="site-footer-diamond" />
        </span>
        <p className="site-footer-colophon">
          <span className="site-footer-brand">d20 Folio</span>
          <span className="site-footer-sep" aria-hidden>
            ·
          </span>
          <span className="site-footer-ver">v{__APP_VERSION__}</span>
          <span className="site-footer-sep" aria-hidden>
            ·
          </span>
          <Link
            to="/legal"
            className="site-footer-link"
            aria-current={onLegal ? "page" : undefined}
          >
            {t("legal.link")}
          </Link>
        </p>
      </div>
    </footer>
  );
}
