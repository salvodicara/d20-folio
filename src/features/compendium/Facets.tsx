/**
 * CompendiumFacets — the Compendium codex's FACET LEDGER (OWN-5 /
 * COMPENDIUM-LUX v2). The active spec's own facets (level / class / school /
 * rarity · type …) rendered straight from `spec.filters` via the same
 * `FilterChip` the cockpit add-modals use, so the page never re-implements a
 * facet. The TYPE selector lives up in the ribbon (`.cmp-ribbon`).
 *
 * Layout (owner, 2026-07-10: the open wrap-wall panel buried the results and a
 * scroll attempt failed silently): a compact LEDGER — one aligned rubric rail
 * (LEVEL · CLASS · SCHOOL, a subgrid column shared by every group) with the
 * group's chips wrapping beside it — inside a bounded scroll valve
 * (`.cmp-facet-scroll`, max-height + overflow-y) so filtering can never bury
 * the index. The valve rarely engages (the ledger is compact by design), but
 * when it must, scrolling WORKS and the clipped edge fades as the cue — the
 * scroll instinct is honored, never provoked.
 *
 * Purely presentational: it reads the picker's filter state and reports clicks
 * back to the picker. No data, no business logic. Collapsed by default at EVERY
 * width behind the index head's "Filters" disclosure (`collapsed`) — the list
 * is the surface; the ledger unfolds on demand through the app's single
 * `grid-template-rows: 0fr → 1fr` reveal (inert while closed).
 */

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useOverflowFadeY } from "@/hooks/useOverflowFade";
import type { CompendiumPickerApi } from "./picker/useCompendiumPicker";
import type { AnyCompendiumSpec } from "./picker/specs";

interface FacetsProps {
  spec: AnyCompendiumSpec;
  picker: CompendiumPickerApi<unknown>;
  /** Collapsed (the Filters disclosure closed) — folds the ledger shut. */
  collapsed?: boolean;
  /** DOM id so the "Filters" toggle's aria-controls points here. */
  id?: string;
}

export function CompendiumFacets({ spec, picker, collapsed, id }: FacetsProps) {
  const { t } = useTranslation();
  // The bounded scroll valve: fade whichever edge still hides chips.
  const scrollRef = useRef<HTMLDivElement>(null);
  const fade = useOverflowFadeY(scrollRef);
  return (
    <div
      id={id}
      className="cmp-facets"
      data-collapsed={collapsed ? "true" : undefined}
      // Closed = out of the tab order + the a11y tree while the reveal animates.
      inert={collapsed || undefined}
      aria-label={t("compendium.filters")}
    >
      <div className="cmp-facets-reveal">
        <div className="cmp-facet-ledger">
          <div ref={scrollRef} className="cmp-facet-scroll" data-fade={fade || undefined}>
            {spec.filters.map((g) => (
              <div
                key={g.id}
                className="cmp-facet-group"
                data-group={g.id}
                role="group"
                aria-label={g.label ? g.label(t) : undefined}
              >
                {g.label && <span className="cmp-facet-label">{g.label(t)}</span>}
                <div className="cmp-facet-chips">
                  {g.render(
                    picker.filterState[g.id],
                    (v) => picker.setFilterValue(g.id, v),
                    picker.ctx,
                    picker.filterState
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
