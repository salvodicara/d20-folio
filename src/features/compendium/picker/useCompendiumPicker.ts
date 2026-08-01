/**
 * useCompendiumPicker — the shared engine behind the Compendium page and the
 * five "Add-X" sheet modals. It owns the *behavior* (query, faceted filtering,
 * bilingual search, list↔detail selection, already-added dedup, commit) for one
 * {@link CompendiumPickerSpec}; the spec owns the per-type facts and the picker
 * components own the markup. No JSX lives here, so it composes into either host.
 *
 * Browse mode is character-agnostic (the full SRD, no add); add mode binds the
 * active character as the commit target and the source of filter defaults.
 */

import { useState, useMemo, useCallback, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/hooks/useLocale";
import { useScrollMemory } from "@/hooks/useScrollMemory";
import { useCharacterStore } from "@/stores/characterStore";
import { rankedSearch } from "@/lib/search";
import type { CompendiumPickerSpec, PickerCtx } from "./types";

export type PickerMode = "add" | "browse";

/**
 * P9 §3 mobile — how many facet groups are actively NARROWING the pool (their
 * value differs from the spec initial). Value-compare, not reference: a facet
 * toggled away and back (a fresh-but-equal object) counts as clean.
 */
export function countActiveFacets(
  filters: readonly { id: string; initial: unknown }[],
  state: Record<string, unknown>
): number {
  return filters.filter((g) => JSON.stringify(state[g.id]) !== JSON.stringify(g.initial))
    .length;
}

/**
 * The RESULT-SET identity — a stable primitive that changes when (and only when)
 * the user narrows the pool: the trimmed query plus each facet's value, serialized
 * in spec order (stable key order). The scroll-memory reset key is derived from
 * THIS, never from the `filtered` ARRAY: `filtered` gets a fresh reference on every
 * character-store write (the ~2s auto-save write-back, a session tick) because the
 * memo closes over `ctx`, which holds the whole character — so keying the reset on
 * the array snapped a mid-scroll list back to the top on unrelated store churn even
 * though the visible rows were byte-identical. Keying it on the query+facet identity
 * resets scroll on a real result-set change and leaves it alone on store churn.
 */
export function resultSetKey(
  query: string,
  filters: readonly { id: string }[],
  filterState: Record<string, unknown>
): string {
  return JSON.stringify([
    query.trim(),
    filters.map((g) => [g.id, filterState[g.id]] as const),
  ]);
}

export interface CompendiumPickerApi<T> {
  ctx: PickerCtx;
  query: string;
  setQuery: (q: string) => void;
  filterState: Record<string, unknown>;
  setFilterValue: (id: string, v: unknown) => void;
  filtered: T[];
  count: number;
  selected: T | null;
  select: (entry: T) => void;
  clearSelection: () => void;
  isAdded: (entry: T) => boolean;
  /**
   * COMPENDIUM-NAV — attach to the results' scroll container. The picker
   * remembers the list's depth across the list↔detail swap (select snapshots,
   * remount restores — Back lands exactly where the reader left off) and
   * resets to the top when the result set changes. One seam, every host.
   */
  attachListScroll: (el: HTMLElement | null) => void;
  /** P9 — one tap back to the full pool: clears the query AND every facet to its
   *  initial value (the no-match leaf's "start over" action). */
  reset: () => void;
  /** Commit the entry (add mode); no-ops if already added. Clears the detail. */
  add: (entry: T) => void;
  /** D55 — add-time quantity for the open detail (1 unless the user steps it up). */
  quantity: number;
  setQuantity: (n: number) => void;
  /** Whether this spec wants the add-time quantity stepper. */
  supportsQuantity: boolean;
  /** The stepper's step + minimum for the open detail (bundle size for ammo). */
  quantityStep: number;
  /** The stepper's maximum for the open detail (default 9999; a spec cap otherwise). */
  quantityMax: number;
}

export function useCompendiumPicker<T>(
  spec: CompendiumPickerSpec<T>,
  opts: {
    mode: PickerMode;
    initialQuery?: string;
    initialSelectedId?: string;
    /**
     * CONTROLLED selection (the Compendium page): the selected entry id lives in
     * the URL (`?sel=`) so browser Back/Forward walks the list↔entry loop. When
     * `onSelectedIdChange` is provided the hook stops owning the selection —
     * it derives `selected` from `selectedId` and reports every change upward.
     * The add-modals omit it and keep their local selection.
     */
    selectedId?: string | null;
    onSelectedIdChange?: (id: string | null) => void;
  }
): CompendiumPickerApi<T> {
  const { mode, selectedId, onSelectedIdChange } = opts;
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const storeCharacter = useCharacterStore((s) => s.character);
  // Browse is global (no character); add binds the active character.
  const character = mode === "add" ? storeCharacter : null;

  const ctx = useMemo<PickerCtx>(
    () => ({ t, locale, character, mode }),
    [t, locale, character, mode]
  );

  // `initialQuery` seeds the search (re-seeded by the reset block below) (e.g. the command palette deep-links to an
  // entry via `?q=`); the user can edit/clear it normally afterward.
  const [query, setQuery] = useState(opts.initialQuery ?? "");
  const [filterState, setFilterState] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(spec.filters.map((g) => [g.id, g.initial]))
  );
  // `initialSelectedId` opens straight on an entry's DETAIL (the command palette
  // deep-links a compendium hit to its page this way, OWN-25e). It seeds the
  // selection once from the FULL data (independent of facets, which start open);
  // the user navigates normally afterward. In CONTROLLED mode the selection is
  // derived from `selectedId` instead (the URL is the single source of truth).
  const controlled = onSelectedIdChange != null;
  const [localSelected, setLocalSelected] = useState<T | null>(() => {
    const id = opts.initialSelectedId;
    return id ? (spec.data.find((e) => spec.getId(e) === id) ?? null) : null;
  });
  // D55 — the add-time quantity for the open detail (reset to 1 on each select).
  const [quantity, setQuantity] = useState(1);
  // Reset per-type state when the SPEC (or a seeded deep-link query) changes —
  // the render-time derive-from-props pattern, replacing the old remount-by-key
  // of the whole browser: remounting also recreated the type ribbon and zeroed
  // its scroll position on every selection (the "tab row jumps" the owner
  // reported, grilled 2026-07-31). State resets here; the list DOM resets via
  // the keyed `.cmp-body`; the ribbon persists.
  //
  // THE CONTRACT (crash #7): a render-phase setState re-renders, but the
  // CURRENT pass still finishes executing with the OLD state — so everything
  // downstream must read the PASS-LOCAL `eff*` values below, never the raw
  // state. The shipped crash: the spell facet predicates ran against another
  // type's filter shapes ("value.conc" of undefined) in exactly that pass.
  const resetKey = `${spec.id}:${opts.initialQuery ?? ""}`;
  const [prevReset, setPrevReset] = useState(resetKey);
  const stale = resetKey !== prevReset;
  if (stale) {
    setPrevReset(resetKey);
    setQuery(opts.initialQuery ?? "");
    setFilterState(Object.fromEntries(spec.filters.map((g) => [g.id, g.initial])));
    setLocalSelected(null);
    setQuantity(1);
  }
  const effQuery = stale ? (opts.initialQuery ?? "") : query;
  const effFilterState = stale
    ? Object.fromEntries(spec.filters.map((g) => [g.id, g.initial]))
    : filterState;
  const effLocalSelected = stale ? null : localSelected;
  const controlledSelected = useMemo(() => {
    if (!controlled || !selectedId) return null;
    return spec.data.find((e) => spec.getId(e) === selectedId) ?? null;
  }, [controlled, selectedId, spec]);
  const selected = controlled ? controlledSelected : effLocalSelected;
  const setSelected = useCallback(
    (entry: T | null) => {
      if (controlled) onSelectedIdChange(entry == null ? null : spec.getId(entry));
      else setLocalSelected(entry);
    },
    [controlled, onSelectedIdChange, spec]
  );

  const setFilterValue = useCallback((id: string, v: unknown) => {
    setFilterState((prev) => ({ ...prev, [id]: v }));
  }, []);

  // P9 — the no-match leaf's one-tap "start over": query gone, every facet back
  // to its spec-declared initial.
  const reset = useCallback(() => {
    setQuery("");
    setFilterState(Object.fromEntries(spec.filters.map((g) => [g.id, g.initial])));
  }, [spec]);

  // PERF — decouple typing from filtering. The input stays controlled on the
  // IMMEDIATE `effQuery` (returned as `query`, so keystrokes paint instantly), but
  // the heavy `filtered` recompute + list reconcile is driven by a DEFERRED copy:
  // React keeps the stale list on screen while the low-priority re-filter runs, and
  // a burst of keystrokes coalesces into one filter pass instead of one per key.
  const deferredQuery = useDeferredValue(effQuery);

  const filtered = useMemo(() => {
    let result = [...spec.data];
    for (const g of spec.filters) {
      const v = effFilterState[g.id];
      result = result.filter((e) => g.predicate(e, v, ctx, effFilterState));
    }
    // NAME-PRIORITY ranking (fb4 — the SAME `rankedSearch` primitive the wizard
    // pickers use): an entry whose NAME matches outranks one that matches only in
    // its DESCRIPTION, so "pozione guarigione" surfaces "Pozione di Guarigione"
    // FIRST, not third under items that merely mention it in their body text. An
    // empty query returns the faceted pool untouched (natural/data order); order is
    // stable WITHIN each tier. `descOf` is the FULL corpus (name + description) so
    // for queries ≥ DESC_QUERY_MIN chars the ranked SET equals the old flat filter —
    // tier 2 only ever sees non-name hits, so this REORDERS without dropping any
    // (matching the command palette's own name/gloss partition); shorter queries are
    // name-only (rankedSearch's noise gate), matching the wizard pickers.
    // Join a spec's candidate array into ONE haystack (Array.join renders null/
    // undefined as ""; interstitial whitespace is irrelevant to the tokenizer).
    const corpus = (cands: Array<string | null | undefined>) => cands.join(" ");
    return [
      ...rankedSearch(
        deferredQuery.trim(),
        result,
        (e) => corpus(spec.nameText(e, ctx)),
        (e) => corpus(spec.searchText(e, ctx))
      ),
    ];
  }, [spec, effFilterState, deferredQuery, ctx]);

  const existingIds = useMemo(() => {
    if (mode !== "add" || !character || !spec.existingIds) return null;
    return spec.existingIds(character);
  }, [mode, character, spec]);

  const isAdded = useCallback(
    (entry: T) => existingIds?.has(spec.getId(entry)) ?? false,
    [existingIds, spec]
  );

  // COMPENDIUM-NAV — resets on a real query/facet change, NOT on store churn; see
  // resultSetKey. Keyed on the DEFERRED query so scroll resets in lock-step with the
  // list the reader actually sees (the memo above is deferred too), never a frame early.
  // RAW scrollTop (no row anchor): the list is virtualized against a spacer of the
  // FULL height, so a scroll offset maps to a stable position and restores exactly —
  // the anchor workaround (for content-visibility's estimate-then-realize height
  // drift) is obsolete, and it read the wrong row now that only a window is mounted.
  const { attach: attachListScroll, save: saveListScroll } = useScrollMemory(
    resultSetKey(deferredQuery, spec.filters, effFilterState)
  );

  // Opening a detail seeds the stepper at one step (1, or one bundle for ammo).
  // Selecting SEALS the list position first (synchronously, pre-commit).
  const select = useCallback(
    (entry: T) => {
      saveListScroll();
      setSelected(entry);
      setQuantity(spec.quantityStep?.(entry) ?? 1);
    },
    [spec, setSelected, saveListScroll]
  );
  const clearSelection = useCallback(() => {
    setSelected(null);
    setQuantity(1);
  }, [setSelected]);

  const add = useCallback(
    (entry: T) => {
      if (existingIds?.has(spec.getId(entry))) return;
      spec.onAdd?.(entry, ctx, spec.supportsQuantity ? quantity : undefined);
      setSelected(null);
      setQuantity(1);
    },
    [existingIds, spec, ctx, quantity, setSelected]
  );

  return {
    ctx,
    query: effQuery,
    setQuery,
    filterState: effFilterState,
    setFilterValue,
    filtered,
    count: filtered.length,
    selected,
    select,
    clearSelection,
    isAdded,
    attachListScroll,
    reset,
    add,
    quantity,
    setQuantity,
    supportsQuantity: spec.supportsQuantity ?? false,
    // The stepper's step + minimum for the open detail (one bundle for ammo).
    quantityStep: selected && spec.quantityStep ? spec.quantityStep(selected) : 1,
    // The stepper's maximum for the open detail (a spec cap, else the 9999 default).
    quantityMax: selected && spec.quantityMax ? spec.quantityMax(selected) : 9999,
  };
}
