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

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/input";
import { PickerSearch, PickerDetailFooter } from "@/components/sheet/picker-parts";
import { useCompendiumPicker, type PickerMode } from "./useCompendiumPicker";
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
            quantityControl={
              picker.supportsQuantity ? (
                <>
                  <span className="text-sm font-medium text-text-secondary">
                    {t("equipment.quantity")}
                  </span>
                  <NumberStepper
                    value={picker.quantity}
                    onChange={picker.setQuantity}
                    min={picker.quantityStep}
                    max={9999}
                    step={picker.quantityStep}
                    ariaLabel={t("equipment.quantity")}
                  />
                </>
              ) : undefined
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
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PickerSearch
        value={picker.query}
        onChange={picker.setQuery}
        placeholder={spec.searchPlaceholder?.(t)}
        autoFocus={autoFocus}
      />

      {spec.filters.map((g) => (
        <div
          key={g.id}
          className="filters overflow-x-auto border-b border-border-subtle px-4 py-2"
        >
          {g.render(
            picker.filterState[g.id],
            (v) => picker.setFilterValue(g.id, v),
            ctx,
            picker.filterState
          )}
        </div>
      ))}

      <CompendiumResultList picker={picker} spec={spec} />
    </div>
  );
}
