/**
 * SectionHeader — the folio sub-section rubric (`.sec-head`: gold diamond ·
 * display-italic title · gold-fading rule · optional meta).
 *
 * The ONE header atom. `<Section>` composes it (header + body); standalone callers
 * that want just the rubric use it directly, so the ~8-line `.sec-head` markup
 * stops being re-declared in every tab/modal (it was hand-rolled in ~15 places plus
 * two private `SectionHeader` copies in LevelUpModal + BioTab). Purely presentational
 * by default — a header is a rubric. The campaign hub's disclosure (the
 * {@link "@/features/campaigns/SectionPanel"} detail toggle) keeps its chevron on a
 * button docked at the card's BOTTOM edge, NOT on this header, because it always
 * shows a fixed panel and only folds the BULKY detail (B5/D4).
 *
 * The one OPT-IN control mode is `disclosure`: for a section whose WHOLE body is
 * on-demand reference (the Play tab's collapsed-by-default combat playbook + rules
 * reference), the header rubric IS the disclosure trigger — the whole row toggles
 * (a stretched-overlay `.sec-toggle` mirroring the UniversalCard whole-row idiom)
 * with a rotating chevron + `aria-expanded`/`aria-controls`. When collapsed the
 * section reads as just this quiet header row; clicking blooms the body in place.
 * (Owner-ratified 2026-07-24 — distinct from the hub's fixed-panel model above.)
 *
 * A NUMERIC section count rides the `count` prop instead: it renders as a struck gilt
 * MEDALLION docked BESIDE the title (between the title and the fading rule), the
 * "illuminated premium" coin (`.sec-count`). That treatment is for COUNTS only — string
 * totals ("120 gp") stay on `meta`, which keeps the far-right `.sec-meta` slot. The two
 * are mutually exclusive in practice (a header is either counting items or showing a
 * total/hint); when `count` is set the header switches to the 4-column `.has-count` grid.
 *
 * Usage:
 *   <SectionHeader title="Spells" />
 *   <SectionHeader title="Choose" as="h3" tight icon={<Glyph/>} meta="3 left" />
 *   <SectionHeader title="Treasury" meta="120 gp" />
 *   <SectionHeader title="Sessions" count={7} />
 */

import type { HTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Opt-in header-as-disclosure config (see the module doc). When present the whole
 * `.sec-head` row becomes the accordion toggle: a stretched-overlay button with a
 * rotating chevron. Mutually exclusive with `count`/`meta` in practice (the toggle
 * takes the trailing slot).
 */
export interface SectionDisclosure {
  /** Whether the disclosed body is currently open. */
  open: boolean;
  /** Toggle the body open/closed. */
  onToggle: () => void;
  /** DOM id of the body region this header controls (`aria-controls`). */
  controlsId: string;
  /** Bilingual accessible name for the toggle, reflecting the current state. */
  label: string;
}

export interface SectionHeaderProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> {
  title: ReactNode;
  /** Optional leading glyph rendered inside the title (e.g. a level-up step icon). */
  icon?: ReactNode;
  /** Optional NUMERIC section count rendered as a struck gilt MEDALLION beside the title
   *  (between the title and the fading rule). For counts only — string totals/hints use
   *  `meta` (far-right). Mutually exclusive with `meta` in practice. */
  count?: number;
  /** Optional trailing meta aligned to the fading rule. */
  meta?: ReactNode;
  /** Tighter top/bottom margins for nested sections. */
  tight?: boolean;
  /** Heading level — defaults to `h3` (a page is `h1`, a `<Section>` is `h2`). */
  as?: "h2" | "h3" | "h4";
  /** Placed on the heading element (so a `<section aria-labelledby>` can target it). */
  id?: string;
  /** Opt-in header-as-disclosure — makes the whole rubric row an accordion toggle. */
  disclosure?: SectionDisclosure;
}

export function SectionHeader({
  title,
  icon,
  count,
  meta,
  tight,
  as: Heading = "h3",
  className,
  id,
  disclosure,
  ...rest
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "sec-head",
        tight && "tight",
        count != null && "has-count",
        disclosure && "is-toggle",
        className
      )}
      {...rest}
    >
      <span className="sec-diamond" aria-hidden />
      <Heading className={cn("sec-title", icon && "flex items-center gap-1.5")} id={id}>
        {icon}
        {title}
      </Heading>
      {count != null ? <span className="sec-count">{count}</span> : null}
      <span className="sec-rule" aria-hidden />
      {meta ? <span className="sec-meta">{meta}</span> : null}
      {disclosure ? (
        // The whole header row is the toggle: this button's `::before` stretches
        // over the `.sec-head` (position: relative) so clicking the rubric blooms
        // the body — the UniversalCard whole-row idiom. The heading stays a real
        // heading sibling (document outline + `aria-labelledby` target intact).
        <button
          type="button"
          className="sec-toggle"
          aria-expanded={disclosure.open}
          aria-controls={disclosure.controlsId}
          aria-label={disclosure.label}
          onClick={disclosure.onToggle}
        >
          <Icon
            as={ChevronDown}
            size="sm"
            decorative
            className={cn("sec-toggle-chevron", disclosure.open && "is-open")}
          />
        </button>
      ) : null}
    </div>
  );
}
