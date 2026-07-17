/**
 * RosterBulkBar — the contextual action bar for roster multi-select (owner
 * 2026-06-07). A floating, carved folio bar pinned to the bottom of the viewport
 * while selection mode is active (the iOS-Photos / Gmail pattern, identical on
 * desktop + mobile):
 *
 *   • a LEAD cluster — Cancel (✕) · "N selected" (a teaching zero-state) · the
 *     Select-all ⇄ Deselect-all toggle;
 *   • an ACTIONS cluster — the data-driven bulk actions (Export · Retire/Restore ·
 *     Delete), bound in `useRosterBulkActions`.
 *
 * On desktop the two clusters sit on one row; on a phone the actions wrap onto a
 * full-width second row of equal ≥44px targets (thumb-first). A PURE VIEW — every
 * action's behaviour lives in the hook; this only renders and reflects `busyKey`
 * (the in-flight action's spinner) / `busy` (the whole bar disabled).
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import type { RosterBulkAction } from "./use-roster-bulk-actions";

export interface RosterBulkBarProps {
  /** How many characters are selected. */
  count: number;
  /** Selectable characters in the current (filtered) view — drives Select-all. */
  total: number;
  /** Are all `total` selected? (Select-all ⇄ Deselect-all). */
  allSelected: boolean;
  /** Toggle all visible characters. */
  onToggleAll: () => void;
  /** Leave selection mode (clears the selection). */
  onCancel: () => void;
  /** The bulk actions to offer (already bound to the selection). */
  actions: RosterBulkAction[];
  /** A bulk action is in flight — disable the bar. */
  busy: boolean;
  /** The key of the in-flight action — pins its spinner only. */
  busyKey: string | null;
}

export function RosterBulkBar({
  count,
  total,
  allSelected,
  onToggleAll,
  onCancel,
  actions,
  busy,
  busyKey,
}: RosterBulkBarProps) {
  const { t } = useTranslation();
  const none = count === 0;
  // Move focus INTO the bar when selection mode opens (it replaces the header
  // actions, which would otherwise drop focus to <body>) so keyboard + SR users land
  // in the new context. RosterPage restores focus to the Select trigger on exit.
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="roster-bulkbar"
      role="region"
      aria-label={t("roster.selectionActions")}
    >
      <div className="rbb-inner">
        <div className="rbb-lead">
          <button
            ref={cancelRef}
            type="button"
            className="rbb-cancel"
            onClick={onCancel}
            disabled={busy}
            aria-label={t("roster.exitSelection")}
          >
            <Icon as={X} size="sm" decorative />
          </button>

          <span className="rbb-count" role="status" aria-live="polite">
            {/* `_zero` teaches the empty selection ("Select characters") instead of a
                dead "0 selected"; `_one`/`_other` carry the live tally. */}
            {t("roster.selectedCount", { count })}
          </span>

          <button
            type="button"
            className="rbb-selectall"
            onClick={onToggleAll}
            disabled={busy || total === 0}
          >
            {allSelected ? t("roster.deselectAll") : t("roster.selectAll")}
          </button>
        </div>

        <span className="rbb-actions">
          {actions.map((action) => (
            <Button
              key={action.key}
              size="sm"
              variant={action.tone === "danger" ? "destructive" : "secondary"}
              onClick={() => void action.run()}
              disabled={busy || none}
              loading={busyKey === action.key}
            >
              <Icon as={action.icon} size="sm" decorative />
              {action.label}
            </Button>
          ))}
        </span>
      </div>
    </div>
  );
}
