/**
 * useRosterBulkActions — the data-layer orchestrator behind the roster's
 * multi-select action bar (owner 2026-06-07).
 *
 * Mirrors `useRosterActions` (the per-card menu) but operates on the SELECTED set,
 * returning a DATA-DRIVEN list of bulk actions (`RosterBulkAction[]`) that the
 * `RosterBulkBar` renders as a pure view. Today it ships:
 *
 *   • **Export** — pack the whole selection into one re-importable `.zip`
 *     (`downloadCharactersZip`; fflate lazy-loaded). Read-only, so it stays IN
 *     selection mode (export-then-delete works without re-selecting).
 *   • **Retire / Restore** — CONTEXTUAL status flips. Retire shows only when the
 *     selection contains active characters (acts on that subset); Restore only when
 *     it contains retired/dead ones. A button is never an inert no-op.
 *   • **Delete** — the confirmed cascade (`deleteCharactersAndDetach`).
 *
 * A new bulk operation slots in by adding one entry. Mutating actions leave
 * selection mode when something actually changed (`onDone`); the loading spinner is
 * pinned to the single in-flight action via `busyKey`, and the whole bar disables
 * while any action runs. The roster's `useCharacters()` is a live listener, so the
 * grid reflects every change with no manual refetch.
 */

import { useCallback, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Download, Archive, ArchiveRestore } from "lucide-react";
import type { CharacterDoc } from "@/types/character";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { getFullCharacter } from "@/lib/firestore";
import { deleteCharactersAndDetach } from "./delete-character";
import { setCharactersStatus } from "./bulk-status";
import { rosterToast } from "./roster-toast";

export interface RosterBulkAction {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Destructive styling (gilt → vermilion). */
  tone?: "danger";
  /** Perform the action over the current selection. */
  run: () => Promise<void>;
}

export interface RosterBulkActions {
  actions: RosterBulkAction[];
  /** Any bulk action is in flight (disable the whole bar). */
  busy: boolean;
  /** The key of the single in-flight action (pins its spinner), or null. */
  busyKey: string | null;
}

/**
 * @param selectedDocs The character docs currently selected.
 * @param onDone        Called after a MUTATING action settles with at least one
 *                      change (the roster leaves selection mode).
 */
export function useRosterBulkActions(
  selectedDocs: readonly RosterCharacterDoc[],
  onDone: () => void
): RosterBulkActions {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const count = selectedDocs.length;

  // Contextual partitions — Retire acts on the active subset, Restore on the rest
  // (retired/dead). Derived so each action shows only when it has work to do.
  const activeIds = useMemo(
    () => selectedDocs.filter((d) => d.status === "active").map((d) => d.id),
    [selectedDocs]
  );
  const inactiveIds = useMemo(
    () => selectedDocs.filter((d) => d.status !== "active").map((d) => d.id),
    [selectedDocs]
  );

  // Run `fn` while pinning the bar's spinner to `key` and disabling the bar.
  const withBusy = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await fn();
    } finally {
      setBusyKey(null);
    }
  }, []);

  const exportAll = useCallback(
    () =>
      withBusy("export", async () => {
        if (count === 0 || !uid) return;
        try {
          // The roster list carries only the SRD-free projection (#106); re-read the
          // FULL parsed character for each selected id so the archive is faithful,
          // not truncated. Parallel reads (each is a cache-warm getDoc + lazy parse).
          const full = (
            await Promise.all(selectedDocs.map((d) => getFullCharacter(uid, d.id)))
          ).filter((d): d is CharacterDoc => d !== null);
          if (full.length === 0) throw new Error("no characters to export");
          // Lazy — the zip codec + the SRD-resolving character-io graph load only
          // when a bulk export actually runs, never on the roster bundle (#59/#78).
          const { downloadCharactersZip } = await import("@/lib/character-io");
          const { portraitsDropped } = await downloadCharactersZip(full);
          // The .zip download IS the feedback, but a count toast confirms the batch.
          rosterToast(t("roster.bulkExported", { count: full.length }));
          // Never silent: warn if any character's portrait couldn't be embedded.
          if (portraitsDropped > 0) {
            rosterToast(
              t("roster.bulkExportPortraitsDropped", { count: portraitsDropped })
            );
          }
        } catch {
          rosterToast(t("roster.bulkExportFailed"));
        }
        // Read-only: stay in selection so export-then-(retire/delete) needs no re-pick.
      }),
    [withBusy, count, uid, selectedDocs, t]
  );

  const flipStatus = useCallback(
    async (
      key: string,
      ids: readonly string[],
      status: CharacterDoc["status"],
      okOne: string,
      okOther: string,
      partial: string,
      failed: string
    ) => {
      if (!uid || ids.length === 0) return;
      await withBusy(key, async () => {
        const { changed, failed: failedCount } = await setCharactersStatus(
          uid,
          ids,
          status
        );
        if (changed === 0) {
          rosterToast(t(failed));
        } else if (failedCount > 0) {
          rosterToast(t(partial, { changed, failed: failedCount }));
        } else {
          rosterToast(t(changed === 1 ? okOne : okOther, { count: changed }));
        }
        if (changed > 0) onDone();
      });
    },
    [uid, withBusy, t, onDone]
  );

  const retire = useCallback(
    () =>
      flipStatus(
        "retire",
        activeIds,
        "retired",
        "roster.bulkRetired_one",
        "roster.bulkRetired_other",
        "roster.bulkRetirePartial",
        "roster.bulkRetireFailed"
      ),
    [flipStatus, activeIds]
  );

  const restore = useCallback(
    () =>
      flipStatus(
        "restore",
        inactiveIds,
        "active",
        "roster.bulkRestored_one",
        "roster.bulkRestored_other",
        "roster.bulkRestorePartial",
        "roster.bulkRestoreFailed"
      ),
    [flipStatus, inactiveIds]
  );

  const remove = useCallback(async () => {
    if (!uid || count === 0) return;
    // Confirm BEFORE marking the bar busy, so its controls stay live under the dialog.
    const ok = await useConfirmStore.getState().confirm({
      title: t("roster.bulkDeleteTitle", { count }),
      message: t("roster.bulkDeleteMessage", { count }),
      confirmLabel: t("roster.bulkDeleteConfirm", { count }),
      tone: "danger",
    });
    if (!ok) return;
    await withBusy("delete", async () => {
      try {
        const ids = selectedDocs.map((d) => d.id);
        const { deleted, failed } = await deleteCharactersAndDetach(uid, ids);
        if (failed > 0) {
          rosterToast(t("roster.bulkDeletePartial", { deleted, failed }));
        } else {
          rosterToast(t("roster.bulkDeleted", { count: deleted }));
        }
        // Only leave selection mode if something actually went — on a wholesale
        // failure (deleted===0) keep the selection so the user can retry it.
        if (deleted > 0) onDone();
      } catch {
        // A pre-flight failure (e.g. the campaign-list read) — nothing was deleted,
        // so keep the selection so the user can retry.
        rosterToast(t("roster.bulkDeleteAllFailed"));
      }
    });
  }, [uid, count, selectedDocs, t, withBusy, onDone]);

  const actions = useMemo<RosterBulkAction[]>(() => {
    const list: RosterBulkAction[] = [
      {
        key: "export",
        label: t("roster.bulkExport"),
        icon: Download,
        run: exportAll,
      },
    ];
    // Contextual status flips — show each only when it has characters to act on.
    if (activeIds.length > 0) {
      list.push({
        key: "retire",
        label: t("roster.retire"),
        icon: Archive,
        run: retire,
      });
    }
    if (inactiveIds.length > 0) {
      list.push({
        key: "restore",
        label: t("roster.restore"),
        icon: ArchiveRestore,
        run: restore,
      });
    }
    list.push({
      key: "delete",
      label: t("roster.bulkDelete"),
      icon: Trash2,
      tone: "danger",
      run: remove,
    });
    return list;
  }, [t, exportAll, retire, restore, remove, activeIds.length, inactiveIds.length]);

  return { actions, busy: busyKey !== null, busyKey };
}
