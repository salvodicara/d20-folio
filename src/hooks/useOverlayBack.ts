/**
 * useOverlayBack — wires an overlay's open/close into the shared
 * `overlay-history` mechanism so the hardware / gesture Back button (and desktop
 * Alt-←) closes the overlay and stays on the page, instead of navigating away.
 *
 * Mounted inside the ModalShell / Dialog / lightbox primitives, so EVERY consumer
 * inherits the behaviour with zero per-dialog wiring. Esc / scrim / close-button
 * dismissal is unchanged (Radix owns it); this only adds the Back affordance.
 */

import { useEffect, useRef } from "react";
import { pushOverlayEntry } from "@/lib/overlay-history";

export function useOverlayBack(open: boolean, onClose: () => void): void {
  // Keep the latest onClose without re-pushing the entry on every render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    return pushOverlayEntry(() => closeRef.current());
  }, [open]);
}
