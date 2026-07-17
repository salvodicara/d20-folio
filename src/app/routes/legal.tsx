/**
 * LegalPage — the Legal & Attribution colophon (`/legal`).
 *
 * THE COLOPHON SPREAD (owner 2026-07-09/10: three verdicts against a swimming prose
 * column — "still wastes a lot of space. Do it properly and SOTA!"): the page is set
 * as the folio's colophon plate — the credits leaf of a fine bound game edition —
 * composed to EARN the full leaf width at desktop instead of centring one measure in
 * dead parchment:
 *
 *   1. THE ENGRAVED PLAQUES (Attribution) — the required SRD 5.2.1 AND SRD 5.1
 *      CC-BY-4.0 attribution statements (the shipped prose draws on both documents;
 *      each license requires its own exact statement), reproduced VERBATIM (English
 *      on EN; WotC's own official Italian statements on IT), are the ceremonial
 *      centrepiece: a centred chapter-head ornament (the site-footer's
 *      diamond-on-fading-rule grammar) + title, then two stacked full-width engraved
 *      plates whose inscriptions centre at a capped measure — the OBJECTS span the
 *      leaf, the text keeps its measure.
 *   2. THE TWIN LICENSE COLUMNS (Licenses) — the two governing licenses (SRD content
 *      under CC-BY-4.0 · the app under MIT) set as two equal text columns divided by
 *      a vertical fading thread: the two-column deed register.
 *   3. THE BOTTOM REGISTER (Trademarks · The App) — two compact side-by-side sections,
 *      each under its own standard `.sec-head` rubric whose fading rule runs to its
 *      column edge.
 *
 * The spread compresses the page to roughly one viewport at desktop, so the former
 * sticky "On this page" rail lost its job (orientation on a long page) and was
 * deleted with its scroll-spy. Below the register breakpoint the spread stacks into
 * a clean single column; the plaque stays the featured head.
 *
 * Mounts in the PUBLIC AppShell (above the AuthGuard) so the required attribution
 * is readable pre-auth; the login footer links here. Owns its own `<main id="main">`
 * landmark + the page `<h1>` like every other surface. The clickable license links
 * live in the Licenses columns so the quoted statement stays pristine.
 */

import { useTranslation } from "react-i18next";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useBackWithFallback } from "@/hooks/useBackWithFallback";

const SRD_URL = "https://www.dndbeyond.com/srd";
const SRD51_URL = "https://dnd.wizards.com/resources/systems-reference-document";
const CCBY_URL = "https://creativecommons.org/licenses/by/4.0/legalcode";
const MIT_URL = "https://opensource.org/license/mit";

/** A gilt outbound link with the shared trailing external-link glyph. */
function OutLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="set-link inline-flex items-center gap-1.5"
    >
      {label}
      <Icon as={ExternalLink} size="xs" decorative />
    </a>
  );
}

export function LegalPage() {
  const { t } = useTranslation();
  useDocumentTitle(t("legal.title"));
  // Legal is a MANY-PARENTS leaf (linked from every footer + the login page), so
  // Back is history-back-with-fallback — the shared canonical hook, not an inline
  // copy. A fresh-tab deep link (no history) falls back to "/" (login when
  // signed out). Legal keeps a Back even though it is anchored (the footer),
  // because that anchor sits below the fold on tall pages (D4 exception).
  const goBack = useBackWithFallback("/");
  return (
    <main id="main" className="page-shell py-8">
      <PageHeader
        as="h1"
        framed
        crest
        title={t("legal.title")}
        hint={t("legal.subtitle")}
        actions={
          <Button variant="ghost" onClick={goBack}>
            <Icon as={ArrowLeft} size="sm" decorative />
            {t("common.back")}
          </Button>
        }
      />

      <article className="tome-leaf-surface colophon">
        {/* ── The engraved plaques — the two required verbatim CC-BY attributions
               (SRD 5.2.1 + SRD 5.1), the spread's ceremonial centrepiece ── */}
        <section id="attribution" className="colophon-hero">
          <span className="colophon-hero-rule" aria-hidden />
          <h2 className="colophon-hero-title">{t("legal.attribution.heading")}</h2>
          <blockquote className="colophon-statement">
            {t("legal.attribution.statement")}
          </blockquote>
          <blockquote className="colophon-statement">
            {t("legal.attribution.statement51")}
          </blockquote>
          <p className="colophon-note">{t("legal.attribution.note")}</p>
        </section>

        {/* ── Licenses — the two governing licenses as twin deed columns ── */}
        <section id="licenses" className="colophon-sec">
          <SectionHeader as="h2" tight title={t("legal.licenses.heading")} />
          <p className="colophon-body">{t("legal.licenses.intro")}</p>
          <dl className="colophon-licenses">
            <div className="colophon-license">
              <dt>{t("legal.licenses.srdTerm")}</dt>
              <dd>
                <p className="colophon-body">{t("legal.licenses.srdDesc")}</p>
                <p className="colophon-links">
                  <OutLink href={CCBY_URL} label={t("legal.links.ccby")} />
                  <OutLink href={SRD_URL} label={t("legal.links.srd")} />
                  <OutLink href={SRD51_URL} label={t("legal.links.srd51")} />
                </p>
              </dd>
            </div>
            <div className="colophon-license">
              <dt>{t("legal.licenses.appTerm")}</dt>
              <dd>
                <p className="colophon-body">{t("legal.licenses.appDesc")}</p>
                <p className="colophon-links">
                  <OutLink href={MIT_URL} label={t("legal.links.mit")} />
                </p>
              </dd>
            </div>
          </dl>
        </section>

        {/* ── The bottom register — Trademarks · The App, side by side at desktop ── */}
        <div className="colophon-register">
          {/* ── Trademarks — nominative use + the allowed compatibility statement ── */}
          <section id="trademarks" className="colophon-sec">
            <SectionHeader as="h2" tight title={t("legal.trademarks.heading")} />
            <p className="colophon-body">{t("legal.trademarks.body")}</p>
            <p className="colophon-body">{t("legal.trademarks.compatible")}</p>
          </section>

          {/* ── The App — what d20 Folio is ── */}
          <section id="app" className="colophon-sec">
            <SectionHeader as="h2" tight title={t("legal.app.heading")} />
            <p className="colophon-body">{t("legal.app.body")}</p>
            <p className="colophon-body">{t("legal.app.editions")}</p>
          </section>
        </div>
      </article>
    </main>
  );
}
