/**
 * useBackWithFallback — the canonical Back for a MANY-PARENTS leaf (D4).
 *
 * The back grammar has three cases (DESIGN.md §Navigation):
 *   1. A leaf with a UNIQUE structural parent → a NAMED Back to that parent
 *      ("Back to campaign", the compendium leaf's "Back"). NEVER `navigate(-1)`.
 *   2. A MANY-PARENTS leaf (`/legal`, linked from every footer + the login page) →
 *      history-back-with-fallback: go back if there IS history, else land on a
 *      sane home. That is THIS hook.
 *   3. An ANCHORED page (realms, the ring pages) → NO Back button at all; the
 *      persistent anchor is the way out.
 *
 * Extracted from the inline recipe legal.tsx hand-rolled, so the next many-parents
 * leaf reuses it instead of copying a divergent variant (golden rule 3, one seam).
 * A fresh-tab deep link has `history.length === 1` (no prior entry to return to),
 * so it falls back; otherwise it steps back to wherever the reader came from.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router";

/** Returns a Back handler: `navigate(-1)` when there is history, else `fallback`. */
export function useBackWithFallback(fallback: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    if (window.history.length > 1) void navigate(-1);
    else void navigate(fallback);
  }, [navigate, fallback]);
}
