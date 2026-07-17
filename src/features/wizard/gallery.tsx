/**
 * Wizard F gallery — B's plaque GALLERY + HERO ALTAR for small identity pools
 * (classes · species · backgrounds · subclasses · the multiclass fork). ONE
 * `PlaqueCard` primitive serves every gallery choice (owner round-2 condition);
 * the chosen option is enthroned in the hero altar above the grid, where its
 * full text and every caused decision live (detail on selected, literally
 * elevated). No search, no facets — these pools are small (golden rule 19).
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Sparkles, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";

/** THE one gallery card — every choice kind renders THIS plaque. */
export function PlaqueCard({
  glyph,
  name,
  gloss,
  eyebrow,
  badge,
  chosen,
  onClick,
  clampGloss = false,
}: {
  /** The carved seal glyph; omit for kinds with no app glyph (species/background). */
  glyph?: ReactNode;
  name: string;
  gloss?: string;
  eyebrow: string;
  badge?: string;
  chosen: boolean;
  onClick: () => void;
  /** Clamp a LONG prose gloss (subclass feature excerpts) to three lines; an
   *  identity gloss (class tips) always reads IN FULL (owner 2026-06-11). */
  clampGloss?: boolean;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={chosen}
      className="wiz-card"
      data-chosen={chosen ? "" : undefined}
      data-clamp={clampGloss ? "" : undefined}
      onClick={onClick}
    >
      {chosen && (
        <span className="wiz-card-wax" aria-hidden>
          <Icon as={Check} size="xs" decorative />
        </span>
      )}
      {glyph != null && (
        <span className="wiz-card-seal" aria-hidden>
          {glyph}
        </span>
      )}
      <span className="wiz-card-name">{name}</span>
      {gloss && <span className="wiz-card-gloss">{gloss}</span>}
      <span className="wiz-card-foot">
        <span>{eyebrow}</span>
        {badge && <span className="wiz-card-badge">{badge}</span>}
      </span>
    </button>
  );
}

/** The plaque grid (listbox semantics; the cards are its options). */
export function PlaqueGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wiz-grid" role="listbox" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * The hero ALTAR — the enthroned selected option: gold ceremony, the wax seal,
 * description LEFT, caused asks RIGHT (stacked on mobile). `asks` renders the
 * cascading decisions the choice causes (subclass fork, lineage, trait
 * preview); pass `asksQuiet` for the one-line "nothing to decide yet" state.
 */
export function WizardHero({
  glyph,
  eyebrow,
  name,
  body,
  asks,
  asksHead,
  onClear,
}: {
  glyph: ReactNode;
  eyebrow: string;
  name: string;
  /** The lede / prose under the name (left column). */
  body: ReactNode;
  /** The caused-asks column content (right), when the choice asks more. */
  asks?: ReactNode;
  /** The asks column heading line (e.g. "Level 3 asks a decision"). */
  asksHead?: string;
  /** Release the choice (omit when the choice is mandatory — no deselect). */
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="wiz-hero" aria-label={name}>
      {onClear && (
        <button
          type="button"
          className="wiz-hero-x"
          aria-label={t("wizard.removeChoice")}
          onClick={onClear}
        >
          <Icon as={X} size="sm" decorative />
        </button>
      )}
      <div className="wiz-hero-seal" aria-hidden>
        {glyph}
      </div>
      <div className="wiz-hero-main">
        <p className="wiz-hero-eyebrow">{eyebrow}</p>
        <h3 className="wiz-hero-name">{name}</h3>
        {body}
      </div>
      {/* The asks column renders ONLY when the choice actually asks something
          — a "nothing to decide" line is noise (only-and-all-necessary). */}
      {asks != null && (
        <div className="wiz-asks wiz-hero-asks">
          {asksHead && (
            <p className="wiz-asks-head">
              <Icon as={Sparkles} size="xs" decorative />
              {asksHead}
            </p>
          )}
          {asks}
        </div>
      )}
    </section>
  );
}

/** The empty altar — "nothing chosen yet; browse the gallery below". */
export function WizardHeroEmpty() {
  const { t } = useTranslation();
  return (
    <section className="wiz-hero empty" aria-label={t("wizard.emptyHero")}>
      <p className="wiz-hero-empty-line">{t("wizard.emptyHero")}</p>
      <p className="wiz-hero-empty-sub">{t("wizard.emptyHeroSub")}</p>
    </section>
  );
}
