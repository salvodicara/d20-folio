/**
 * CompendiumPicker — the embeddable list↔detail body the five "Add-X" sheet
 * modals (Spell · Feature · Equipment · Magic Item) compose, and the read-only
 * counterpart the Compendium page reuses. It renders the shared search + facet
 * rail + results + detail surface (on `components/sheet/picker-parts`) and drives
 * it all through {@link useCompendiumPicker} + a per-type spec — so each modal is
 * now a thin wrapper, not its own bespoke browser.
 *
 * It does NOT own a `ModalShell`: the host modal owns the shell + title (kept in
 * sync via `onDetailTitle`, exactly as the old embeddable bodies were), so the
 * SRD/Custom tab switchers stay at the host level.
 */

import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PickerSearch, PickerDetailFooter } from "@/components/sheet/picker-parts";
import {
  useCompendiumPicker,
  countActiveFacets,
  type PickerMode,
} from "./useCompendiumPicker";
import { CompendiumDetailBody } from "./detail";
import { CompendiumResultList } from "./ResultList";
import type { CompendiumPickerSpec } from "./types";

interface CompendiumPickerProps<T> {
  spec: CompendiumPickerSpec<T>;
  mode: PickerMode;
  /** Close the host modal (used when `spec.closeOnAdd`). */
  onClose?: () => void;
  /** Report the open entry's name so the host `ModalShell` title can reflect it. */
  onDetailTitle?: (title: string | null) => void;
  autoFocus?: boolean;
}

export function CompendiumPicker<T>({
  spec,
  mode,
  onClose,
  onDetailTitle,
  autoFocus,
}: CompendiumPickerProps<T>) {
  const { t } = useTranslation();
  const picker = useCompendiumPicker(spec, { mode });
  const { ctx, selected } = picker;

  // Facets are ON-DEMAND (owner, 2026-08-01: "i filtri dovrebbero essere
  // mostrati su richiesta… la gente potrebbe direttamente usare la barra di
  // ricerca") — the same disclosure grammar as the Compendium codex, with the
  // gilt tally keeping an active-but-collapsed facet visible.
  const [facetsOpen, setFacetsOpen] = useState(false);
  const facetsId = useId();
  const activeFacets = countActiveFacets(spec.filters, picker.filterState);

  // Keep the host modal title in sync with the open detail (parity with the old
  // embeddable bodies, which did this imperatively on select / back).
  useEffect(() => {
    onDetailTitle?.(selected ? spec.getName(selected, ctx) : null);
  }, [selected, spec, ctx, onDetailTitle]);

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selected) {
    const added = picker.isAdded(selected);
    const view = spec.detail(selected, ctx, { added });
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <CompendiumDetailBody view={view} locale={ctx.locale} />
        {mode === "add" ? (
          <PickerDetailFooter
            alreadyAdded={added}
            onAdd={() => {
              picker.add(selected);
              if (spec.closeOnAdd) onClose?.();
            }}
            onBack={() => picker.clearSelection()}
            addLabel={spec.addLabel?.(ctx)}
            quantity={
              picker.supportsQuantity
                ? {
                    value: picker.quantity,
                    onChange: picker.setQuantity,
                    min: picker.quantityStep,
                    max: picker.quantityMax,
                    step: picker.quantityStep,
                  }
                : undefined
            }
          />
        ) : (
          <div className="border-t border-border px-4 py-3">
            <Button variant="secondary" block onClick={() => picker.clearSelection()}>
              {t("common.back")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────────
  // A facet whose `render` returns null is contextually hidden (e.g. the
  // magic-only Rarity/Attunement axes while browsing mundane gear) — skip its
  // strip entirely so no empty bordered row is left behind. All-hidden = no
  // disclosure either.
  const facetStrips = spec.filters
    .map((g) => ({
      id: g.id,
      chips: g.render(
        picker.filterState[g.id],
        (v) => picker.setFilterValue(g.id, v),
        ctx,
        picker.filterState
      ),
    }))
    .filter((s) => s.chips != null);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PickerSearch
        value={picker.query}
        onChange={picker.setQuery}
        placeholder={spec.searchPlaceholder?.(t)}
        autoFocus={autoFocus}
      />

      {facetStrips.length > 0 && (
        <>
          <div className="flex border-b border-border-subtle px-4 py-1.5">
            <button
              type="button"
              className="fchip cmp-facet-toggle"
              aria-expanded={facetsOpen}
              aria-controls={facetsId}
              onClick={() => setFacetsOpen((v) => !v)}
            >
              <Icon as={SlidersHorizontal} size="xs" decorative />
              {t("compendium.filters")}
              {activeFacets > 0 && (
                <span className="cmp-facet-count">{activeFacets}</span>
              )}
              <Icon as={ChevronDown} size="xs" decorative className="cmp-facet-caret" />
            </button>
          </div>
          {/* `hidden` (not unmount) keeps the aria-controls target real and the
              chip rows' scroll positions intact across a close/reopen. */}
          <div id={facetsId} hidden={!facetsOpen}>
            {facetStrips.map((s) => (
              <div
                key={s.id}
                className="filters overflow-x-auto border-b border-border-subtle px-4 py-2"
              >
                {s.chips}
              </div>
            ))}
          </div>
        </>
      )}

      <CompendiumResultList picker={picker} spec={spec} />
    </div>
  );
}
