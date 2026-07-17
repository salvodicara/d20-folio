/**
 * useIdleMounted — defer mounting HEAVY hidden content until the main thread
 * breathes (the D smoothness fix).
 *
 * The morph-list asks column must be in the DOM through both open states so
 * committing is ONE width animation (the round-6 contract) — but mounting a
 * full spell picker `display:none` INSIDE the expand commit caused a ~280ms
 * long task DURING the unfold. This hook keeps the expand commit tight: it
 * returns `false` on the activating render (the fold animates with only the
 * prose), then flips `true` on the next idle slice — long before a human can
 * read and commit. Deactivating resets (render-adjust, no setState-in-effect),
 * so a reopened row defers again instead of holding stale subtrees.
 */
import { useEffect, useState } from "react";

export function useIdleMounted(active: boolean): boolean {
  const [ready, setReady] = useState(false);
  // Reset on deactivation DURING render (React's endorsed adjust pattern).
  if (!active && ready) {
    setReady(false);
  }
  useEffect(() => {
    if (!active) return;
    // A plain timeout JUST PAST the unfold animation (--m-normal 240ms): an
    // idle callback can fire BETWEEN animation frames and stall the unfold
    // mid-flight — deterministic post-animation scheduling can't.
    const id = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(id);
  }, [active]);
  return active && ready;
}
