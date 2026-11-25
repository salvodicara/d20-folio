/**
 * «A new version of d20 Folio is needed» (#1320): the blocking screen shown once the
 * shape gate closes (a migration moved a document past what this client knows). It
 * says honestly what happened to the unsaved edits (kept / could not be kept), cannot
 * be dismissed (every write is fenced anyway), and never reloads on its own.
 *
 * The reload asks the service worker for the new code first and marks itself in
 * sessionStorage: if the next page still finds a newer sheet, the app update has not
 * arrived yet (the window between a migration and its deploy), so it says «not ready
 * yet» instead of looping. Pattern source: the «a new version is available — reload»
 * dialogs of Google Docs and Figma, in our worked-bronze modal.
 */
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { shapeGateState, subscribeShapeGate } from "@/lib/shape-gate";

const RELOAD_MARK = "folio.shapeReloadAt";
/** A gate that closes this soon after our own reload means the update is not out yet. */
const NOT_READY_WINDOW_MS = 10 * 60 * 1000;

function reloadedRecently(now: number): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_MARK));
    return Number.isFinite(at) && at > 0 && now - at < NOT_READY_WINDOW_MS;
  } catch {
    return false;
  }
}

function markReload(now: number): void {
  try {
    sessionStorage.setItem(RELOAD_MARK, String(now));
  } catch {
    // Blocked storage: the next pass simply shows the ordinary screen again.
  }
}

/** Ask the service worker for the new code, then reload the page. */
async function reloadForNewShape(): Promise<void> {
  try {
    if ("serviceWorker" in navigator)
      await (await navigator.serviceWorker.getRegistration())?.update();
  } catch {
    // No worker or no network: the reload still fetches what the server has.
  }
  window.location.reload();
}

export function ShapeGateScreen({
  reload = reloadForNewShape,
}: {
  reload?: () => unknown;
}) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(subscribeShapeGate, shapeGateState, shapeGateState);
  // Read once, when the page starts: our own reload marks itself just before it.
  const [afterOurReload] = useState(() => reloadedRecently(Date.now()));
  if (!state.closed) return null;
  const notReady = state.rescue === "none" && afterOurReload;
  const title = t(notReady ? "pwa.shapeGate.notReadyTitle" : "pwa.shapeGate.title");
  const body = t(notReady ? "pwa.shapeGate.notReady" : `pwa.shapeGate.${state.rescue}`);
  const onReload = (): void => {
    markReload(Date.now());
    void reload();
  };
  return (
    <div className="wb scrim" data-html2canvas-ignore="true">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="shape-gate-title"
        aria-describedby="shape-gate-body"
        className="modal sm"
      >
        <div className="modal-head">
          <h2 id="shape-gate-title" className="modal-title">
            {title}
          </h2>
        </div>
        <div className="modal-body">
          <p id="shape-gate-body" className="text-sm text-text-secondary">
            {body}
          </p>
        </div>
        <div className="modal-foot">
          <Button onClick={onReload} disabled={state.rescue === "saving"} autoFocus>
            <Icon as={RefreshCw} size="sm" decorative />
            {t(notReady ? "errorBoundary.retry" : "pwa.reload")}
          </Button>
        </div>
      </div>
    </div>
  );
}
