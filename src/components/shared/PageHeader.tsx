/**
 * PageHeader — the one canonical page header for the folio shell.
 *
 * Replaces the three competing patterns that drifted apart over time
 * (`.page-head`, `.page-title-row`, `.roster-head`). Every top-level page
 * (Roster, Spells, Equipment, Features, Lore, …) renders this single header so
 * the title rubric, hint micro-copy, and right-aligned action slot read as one
 * consistent Illuminated Folio surface.
 *
 * Purely presentational — it emits the documented `.page-head*` classNames
 * (CSS lives in folio.css); it owns no state.
 *
 * Usage:
 *   <PageHeader
 *     title="Spellbook"
 *     hint="Prepared spells auto-derive from your class."
 *     actions={<Button>Add Spell</Button>}
 *   />
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** The page title — the Cinzel `.page-title` ceremonial rubric. Never
   *  italicised: Cinzel ships no italic face, so a synthetic oblique shears
   *  glyph ink outside the paint box (DESIGN.md §3). */
  title: ReactNode;
  /** Optional micro-copy beneath the title. */
  hint?: ReactNode;
  /** Optional right-aligned slot (buttons, filters). */
  actions?: ReactNode;
  /** Optional id forwarded to the heading element (for aria-labelledby). */
  titleId?: string;
  /** Heading tag — defaults to "h2". */
  as?: "h1" | "h2";
  /**
   * Render the header as a framed band (subtle gilt-tinted gradient panel) rather
   * than bare title text. ON by default so every top-level hub opens on the same
   * premium band (owner direction — consistent framed headers, no kitsch). Inner
   * cockpit surfaces that embed a PageHeader can opt out with `framed={false}`.
   */
  framed?: boolean;
}

export function PageHeader({
  title,
  hint,
  actions,
  titleId,
  as = "h2",
  framed = true,
}: PageHeaderProps) {
  const Heading = as;
  return (
    <header className={cn("page-head", framed && "framed")}>
      <div className="page-head-titles">
        <Heading className="page-title" id={titleId}>
          {title}
        </Heading>
        {hint && <p className="page-head-hint">{hint}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}
