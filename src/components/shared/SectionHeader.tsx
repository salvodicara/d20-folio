/**
 * SectionHeader — the folio sub-section rubric (`.sec-head`: gold diamond ·
 * display-italic title · gold-fading rule · optional meta).
 *
 * The ONE header atom. `<Section>` composes it (header + body); standalone callers
 * that want just the rubric use it directly, so the ~8-line `.sec-head` markup
 * stops being re-declared in every tab/modal (it was hand-rolled in ~15 places plus
 * two private `SectionHeader` copies in LevelUpModal + BioTab). Purely presentational
 * and STATIC — a header is a rubric, never a control. The campaign hub's disclosure
 * (the {@link "@/features/campaigns/SectionPanel"} detail toggle) lives on a worded
 * footer button INSIDE the panel, never on this header (B5/D4 — owner: the toggle on
 * the header "is NOT intuitive").
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
import { cn } from "@/lib/utils";

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
  ...rest
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "sec-head",
        tight && "tight",
        count != null && "has-count",
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
    </div>
  );
}
