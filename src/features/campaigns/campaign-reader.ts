/**
 * The shell says a campaign reader is coming. `GlobalCombatMount` reads the campaigns,
 * but it loads lazily, after the sheet is already clickable, so the shell that renders
 * it sets the flag eagerly: from the first frame, an action that depends on the fight
 * waits for the reader (`fightContext`) instead of acting before it exists. Under the
 * dev bypass no campaign is read, so nothing waits. Eager-safe: no engine imports.
 */
import { useEffect } from "react";

import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { usePartyRosterStore } from "./party-roster";

/** Call in the shell that renders `GlobalCombatMount`; `renders` says whether it does. */
export function useCampaignReader(renders: boolean): void {
  useEffect(() => {
    const set = usePartyRosterStore.getState().setReaderMounted;
    set(renders && !DEV_BYPASS_AUTH);
    return () => set(false);
  }, [renders]);
}
