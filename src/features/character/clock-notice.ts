/**
 * A rest's campaign clock step that did not land (#1277). The step is a transaction on
 * the campaign, which always fails offline; before, only a diagnostics warning said so,
 * and the table's clock drifted in silence. The player now hears that the rest is saved
 * but the clock did not move.
 */
import { diagnosticsLog } from "@/lib/diagnostics";
import { useToastStore } from "@/stores/toastStore";

export function reportClockNotMoved(error: unknown): void {
  diagnosticsLog("warn", "play.campaign-clock-write-failed", { message: String(error) });
  useToastStore.getState().showToast({
    intent: { kind: "clock-not-moved", offline: !navigator.onLine },
    duration: 8000,
  });
}
