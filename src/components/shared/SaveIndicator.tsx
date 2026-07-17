/**
 * SaveIndicator
 *
 * Compact indicator that shows the current save status.
 * States: Saved (green check), Saving... (spinner), Pending (yellow dot), Offline (gray), Error (red)
 * Placed in the sheet header near the settings button.
 */

import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useSaveStore, type SaveStatus } from "@/stores/saveStore";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  SaveStatus,
  {
    colorClass: string;
    labelKey: string;
    fallback: string;
  }
> = {
  saved: { colorClass: "text-success", labelKey: "save.saved", fallback: "Saved" },
  pending: { colorClass: "text-warning", labelKey: "save.pending", fallback: "Unsaved" },
  saving: { colorClass: "text-info", labelKey: "save.saving", fallback: "Saving..." },
  error: { colorClass: "text-error", labelKey: "save.error", fallback: "Error" },
  offline: {
    colorClass: "text-text-secondary",
    labelKey: "save.offline",
    fallback: "Offline",
  },
};

export function SaveIndicator() {
  const { t } = useTranslation();
  const status = useSaveStore((s) => s.status);
  const config = STATUS_CONFIG[status];
  const label = t(config.labelKey, config.fallback);

  // A compact STATUS PIP that reads at a glance + names itself on hover:
  //   • synced  → a brilliant green pip (with a soft glow)
  //   • syncing → a spinning ring
  //   • pending → amber pip      • error → red pip      • offline → grey pip
  // The pip's colour comes from `config.colorClass` (currentColor); `.save-dot`
  // paints itself in currentColor + a matching halo. Hover/focus shows the word
  // via the title tooltip (kept text-free in the chrome so it never competes).
  if (status === "saving") {
    return (
      <span
        className={cn("save-ind save-ind--dot", config.colorClass)}
        title={label}
        aria-label={label}
        role="status"
        data-state="saving"
      >
        <Loader2 className="save-spin h-3.5 w-3.5 animate-spin" aria-hidden />
      </span>
    );
  }

  return (
    <span
      className={cn("save-ind save-ind--dot", config.colorClass)}
      title={label}
      aria-label={label}
      role="status"
      data-state={status}
    >
      <span className="save-dot" aria-hidden />
    </span>
  );
}
