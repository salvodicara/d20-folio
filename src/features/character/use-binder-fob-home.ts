/**
 * useBinderFobHome — the ONE seam answering "is the Binder's Fob this
 * viewport's management home?" (owner-ratified, 2026-07-11): fine pointer AND
 * ≥768px. The fob (`BinderFob`) gates ON this query and the Signet
 * (`MobileSignet`) gates OFF it, so exactly ONE management home ever renders —
 * the fixed coin chain on desktop, the Signet coin on compact/coarse mobile.
 * Both are fixed and detached from the masthead, so the tools are reachable at
 * every scroll depth by construction (no floating deep-scroll exit).
 */

import { useMediaQuery } from "@/hooks/useMediaQuery";

const FOB_HOME = "(pointer: fine) and (min-width: 768px)";

export function useBinderFobHome(): boolean {
  return useMediaQuery(FOB_HOME);
}
