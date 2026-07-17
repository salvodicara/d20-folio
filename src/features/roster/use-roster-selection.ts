/**
 * useRosterSelection — the roster's multi-select state (owner 2026-06-07).
 *
 * A small, view-local state machine for the "Select → bulk action" mode (the
 * iOS-Photos / Google-Photos / Gmail pattern, identical on desktop + mobile): a
 * `selecting` flag plus the set of chosen character ids. The roster enters the
 * mode via the toolbar "Select" button or a long-press / ⌘-click on a card, taps
 * cards to toggle them, and leaves via Cancel (or after a bulk action completes).
 *
 * Pure view state — no Firestore, no business logic (the bulk action lives in
 * `useRosterBulkActions`, the delete in `deleteCharactersAndDetach`). React-rules
 * clean: state only, no refs-in-render, no effects.
 */

import { useCallback, useMemo, useState } from "react";

export interface RosterSelection {
  /** Whether selection mode is active (cards are toggles, the bulk bar shows). */
  selecting: boolean;
  /** The chosen character ids. */
  selectedIds: ReadonlySet<string>;
  /** How many are selected. */
  count: number;
  /** Is this id selected? */
  isSelected: (id: string) => boolean;
  /** Enter selection mode, optionally selecting `id` (long-press / ⌘-click entry). */
  enter: (id?: string) => void;
  /** Leave selection mode and clear every selection. */
  cancel: () => void;
  /** Toggle one id (in or out of the set). */
  toggle: (id: string) => void;
  /** Are ALL of `ids` selected? (drives the Select-all ⇄ Deselect-all control). */
  allSelected: (ids: readonly string[]) => boolean;
  /** Select all of `ids` if any is unselected, else clear them (toggle-all). */
  toggleAll: (ids: readonly string[]) => void;
}

export function useRosterSelection(): RosterSelection {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const enter = useCallback((id?: string) => {
    setSelecting(true);
    if (id) setSelectedIds((prev) => new Set(prev).add(id));
  }, []);

  const cancel = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = useCallback(
    (ids: readonly string[]) => ids.length > 0 && ids.every((id) => selectedIds.has(id)),
    [selectedIds]
  );

  const toggleAll = useCallback((ids: readonly string[]) => {
    setSelectedIds((prev) => {
      const everySelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (everySelected) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      selecting,
      selectedIds,
      count: selectedIds.size,
      isSelected,
      enter,
      cancel,
      toggle,
      allSelected,
      toggleAll,
    }),
    [selecting, selectedIds, isSelected, enter, cancel, toggle, allSelected, toggleAll]
  );
}
