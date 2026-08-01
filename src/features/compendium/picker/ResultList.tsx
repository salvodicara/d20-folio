/**
 * CompendiumResultList — the shared, scrollable results list (count + rows +
 * empty state) rendered from a picker api + its spec. Used by BOTH the modal
 * `CompendiumPicker` and the Compendium page, so the row markup (and the
 * already-added override) lives in exactly one place. Rows are `PickerRow`s; the
 * spec supplies leading / name / meta / warning, the picker supplies "added".
 */

import { useTranslation } from "react-i18next";
import { ModalScroll } from "@/components/ui/modal-head";
import { PickerRow } from "@/components/sheet/picker-parts";
import type { CompendiumPickerApi } from "./useCompendiumPicker";
import type { CompendiumPickerSpec } from "./types";

/**
 * PERF — the most rows we ever mount at once. The pools are large (≈330 monsters,
 * ≈420 spells) and rendering dominates a keystroke (a 0-result query is instant), so
 * a full reconcile of every row on each edit is the cost. Capping the MOUNTED rows to
 * a screenful-plus keeps cold modal-open and every keystroke cheap without a
 * virtualization dependency; the truthful full `count` still shows, and a quiet
 * "refine to see more" footer keeps the hidden rows honest (they exist, narrow to
 * reach them). No behavior change for the shown rows — same markup, same keyboard nav.
 */
const RESULT_CAP = 60;

interface ResultListProps<T> {
  picker: CompendiumPickerApi<T>;
  spec: CompendiumPickerSpec<T>;
  /**
   * `bare` (the Compendium codex page) drops this list's own count line + scroll
   * wrapper + empty `<p>`: the tome head owns the count and the page owns the
   * scrolling `.cmp-list` + the on-brand empty leaf (and attaches the picker's
   * scroll memory to its own wrapper). The add-modals keep the default
   * (self-contained list with its count + scroll + the picker's scroll memory).
   */
  bare?: boolean;
}

export function CompendiumResultList<T>({
  picker,
  spec,
  bare = false,
}: ResultListProps<T>) {
  const { t } = useTranslation();
  // Alias the callback ref out of the api object BEFORE the JSX: a `ref=` usage
  // marks its source as a ref, and later `picker.*` reads would trip the
  // Rules-of-React lint if the object itself carried it.
  const { attachListScroll } = picker;
  const total = picker.filtered.length;
  const capped = total > RESULT_CAP;
  const shown = capped ? picker.filtered.slice(0, RESULT_CAP) : picker.filtered;
  const rows = shown.map((entry) => (
    <CompendiumResultRow
      key={spec.getId(entry)}
      entry={entry}
      picker={picker}
      spec={spec}
    />
  ));
  // The "there are more" affordance — shown whenever the pool overflows the cap, so a
  // reader is never misled into thinking the list ends at 60. Carries the truthful
  // full total and tells them the lever (refine the query / facets).
  const moreFooter = capped ? (
    <p className="pick-more" role="status">
      {t("common.refineToSeeMore", { count: total })}
    </p>
  ) : null;

  if (bare) {
    // The page wraps this in `.cmp-list` (its own scroll + padding) and renders
    // its own empty leaf, so here we emit the rows only (plus the overflow note).
    return (
      <div className="flex flex-col">
        {rows}
        {moreFooter}
      </div>
    );
  }

  return (
    // `data-variant="codex"` opts the cockpit add-modal rows into the SAME elevated
    // codex-row treatment the Compendium page uses (carved tile · seal · verdict),
    // so adding a spell/item/feat from the sheet matches the browse experience.
    // `overscroll-contain` keeps wheel/touch momentum from chaining to the page.
    <ModalScroll className="flex-1" data-variant="codex" ref={attachListScroll}>
      <div className="mb-1 px-2 font-mono text-[length:var(--text-micro)] uppercase tracking-wider text-text-secondary">
        {t("common.items", { count: picker.count })}
      </div>
      <div className="flex flex-col gap-1">
        {rows}
        {total === 0 && <p className="opt-empty">{t("common.noResults")}</p>}
        {moreFooter}
      </div>
    </ModalScroll>
  );
}

/**
 * One result row — the spec's row view plus, when the spec declares a verdict and
 * the entry isn't already-added, the right-aligned codex classifier chip (OWN-5).
 * The chip composes into the SAME `trailing` slot the warning badge uses, so it
 * shows in the cockpit add-modals too (one elevated row family, every surface).
 */
function CompendiumResultRow<T>({
  entry,
  picker,
  spec,
}: {
  entry: T;
  picker: CompendiumPickerApi<T>;
  spec: CompendiumPickerSpec<T>;
}) {
  const { t } = useTranslation();
  const added = picker.isAdded(entry);
  const base = spec.row(entry, picker.ctx);
  const verdict = added ? undefined : spec.verdict?.(entry, picker.ctx);
  const style: Record<string, string> = {};
  if (verdict?.tone) style["--vd"] = verdict.tone;

  return (
    <PickerRow
      leading={base.leading}
      name={base.name}
      meta={base.meta}
      state={added ? "added" : base.state}
      // Entries are the spec's own data objects, so identity marks the row whose
      // reading leaf is open (the spread's seated selection; no-op in add mode,
      // where an open detail replaces the list).
      current={picker.selected === entry}
      trailing={
        added ? (
          <span className="pick-trail" data-tone="added">
            {t("common.added")}
          </span>
        ) : (
          <>
            {base.trailing}
            {verdict && (
              <span className="cmp-verdict" style={style}>
                {verdict.label}
              </span>
            )}
          </>
        )
      }
      onClick={() => picker.select(entry)}
      disabled={added}
      ariaLabel={spec.getName(entry, picker.ctx)}
    />
  );
}
