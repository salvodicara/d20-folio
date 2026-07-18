/**
 * open-report — orchestrates OPENING the bug reporter so the screenshot captures
 * the SCREEN, not the dialog (OWN-37).
 *
 * The capture must happen BEFORE the dialog paints. We can't reliably hide a
 * Radix dialog mid-render, so instead we invert the order: capture first, then
 * flip the global `reportOpen` flag. The captured screenshot — and any optional
 * form prefill an entry point provides (the crash screen's error context) — is
 * parked in this module's tiny store and the dialog claims it on mount via
 * `takePendingScreenshot` / `takePendingPrefill`.
 *
 * Exposed as plain functions (callable from the command palette, the account
 * menu, or the crash screen) so EVERY entry point opens the reporter the same way.
 */

import { useUIStore } from "@/stores/uiStore";
import { captureScreenshot, type Screenshot } from "./capture-screenshot";
import type { ReportPrefill } from "./types";

let pending: Screenshot | null = null;
let pendingPrefill: ReportPrefill | null = null;

/** The dialog calls this once on mount to claim (and clear) the parked capture. */
export function takePendingScreenshot(): Screenshot | null {
  const shot = pending;
  pending = null;
  return shot;
}

/** The dialog calls this once on mount to claim (and clear) the parked prefill. */
export function takePendingPrefill(): ReportPrefill | null {
  const prefill = pendingPrefill;
  pendingPrefill = null;
  return prefill;
}

/**
 * Open the reporter. Captures the current screen first (best-effort — a failed
 * capture just opens the dialog with no screenshot), then opens the dialog. The
 * click/keystroke that calls this is the user gesture, so capture is allowed.
 */
export async function openReport(prefill?: ReportPrefill): Promise<void> {
  pendingPrefill = prefill ?? null;
  pending = await captureScreenshot();
  useUIStore.getState().setReportOpen(true);
}

/**
 * Open the reporter AFTER the launching chrome has painted away. For entry
 * points inside SENTINEL-FREE dismissable chrome (the account menu — a Radix
 * dropdown with no overlay-history entry and no html2canvas-ignore mark): defer
 * across two animation frames so html2canvas photographs the SCREEN, not the
 * menu mid-unmount.
 *
 * NOT for chrome that carries a Back sentinel (the command palette): raising the
 * reporter while the palette's sentinel-retiring `history.back()` is still in
 * flight lets the landing traversal consume the reporter's OWN fresh sentinel —
 * those launchers go through `retireTopOverlayThen(() => void openReport())`
 * instead (and the palette needs no paint deferral: its overlay is
 * `excludeFromCapture`).
 */
export function openReportAfterPaint(prefill?: ReportPrefill): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => void openReport(prefill));
  });
}
