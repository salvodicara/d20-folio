/**
 * RailSection — the shared cockpit rail rubric (folio `.rail-head` recipe): a
 * rotated gold diamond, a micro mono-uppercase heading, and a gold-fading rule.
 *
 * Extracted so the Left HUD, Right HUD, the center "This Turn" region, and the
 * re-homed ResourceRail all render ONE identical rubric instead of four
 * near-duplicate copies (Constitution §4.5/§4.8 — reusable patterns, no
 * one-offs). The heading is an `<h2>` so the cockpit's heading order stays
 * h1 (identity) → h2 (sections); the diamond + rule are decorative.
 */

import type { ReactNode } from "react";

export function RailSection({
  rubric,
  action,
  children,
}: {
  /** The uppercase section title (already localized by the caller). May carry a
   *  `GlossaryTip` wrapper (P2) so a rail rubric can gloss its D&D term. */
  rubric: ReactNode;
  /** Optional trailing control rendered in the rubric row (e.g. a filter). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="rail-head">
        <span className="rh-diamond" aria-hidden />
        <h2 className="m-0 font-mono text-xs font-bold uppercase tracking-wider text-text-secondary">
          {rubric}
        </h2>
        <span className="rh-rule" aria-hidden />
        {action}
      </div>
      {children}
    </section>
  );
}
