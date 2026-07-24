/**
 * CompendiumDetailBody — the shared read/detail scaffold the picker renders
 * around a spec's structured {@link PickerDetailView}. ONE detail layout for
 * every type: an eyebrow badge strip · a soft warning banner · a 2-column meta
 * grid · a description · type-specific extras. The spec supplies the facts; this
 * owns the chrome (and the scroll region the host's flex column scrolls inside).
 */

import { AlertTriangle } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import type { Locale, PickerDetailView } from "./types";

export function CompendiumDetailBody({
  view,
  locale,
}: {
  view: PickerDetailView;
  /** When present, the DESCRIPTION's prose is run through `highlightRulesText` —
   *  the BG3 colour grammar (damage phrases in their type's ink, condition names
   *  in theirs, values in the lit special register). The meta grid stays
   *  untouched (range/duration already live there as labelled fields). Omitted ⇒
   *  the description renders plain. */
  locale?: Locale;
}) {
  return (
    // `overscroll-contain` — momentum stays inside the read column (no page chain).
    // `tabIndex={0}` — a long, interaction-free body (e.g. a monster statblock) makes
    // this a scrollable region with no focusable child; keyboard users need to focus
    // it to arrow-scroll (WCAG scrollable-region-focusable). Harmless where the body
    // already carries focusable content.
    <div
      tabIndex={0}
      className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      {view.eyebrow && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.65rem] font-bold uppercase tracking-wider text-text-secondary">
          {view.eyebrow}
        </div>
      )}

      {view.warning && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
          <Icon
            as={AlertTriangle}
            size="sm"
            className="mt-0.5 shrink-0 text-warning"
            decorative
          />
          <div className="text-xs text-warning">{view.warning}</div>
        </div>
      )}

      {view.meta && view.meta.length > 0 && (
        <div className="cmp-meta mb-4 grid grid-cols-2 gap-2 rounded-xl p-3">
          {view.meta.map((field, i) => (
            <div key={i}>
              <div className="text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
                {/* P2 — a spec may flag a field with a glossary term id; the
                    label then glosses itself (rubric = the label, when plain). */}
                {field.term && typeof field.label === "string" ? (
                  <GlossaryTip term={field.term} rubric={field.label} />
                ) : (
                  field.label
                )}
              </div>
              <div className="text-[0.78rem] font-medium text-text-primary">
                {field.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The ONE description seam: every spec passes the plain SRD string and
          inline markdown (**bold**, *italic*) renders here — paragraph/line
          breaks are handled by the renderer (no `whitespace-pre-wrap`). */}
      {view.description != null && (
        <InlineMarkdown
          text={view.description}
          className="cmp-prose mb-4"
          highlight={locale ? highlightRulesText(locale) : undefined}
        />
      )}

      {view.extras}
    </div>
  );
}
