/**
 * The bestiary is not in the offline install (vite.config `assets/lazy/`): it is
 * cached on first use. So a character who needs it at the table (a familiar,
 * summons, a bestiary form: `usesBestiary`) and a campaign table warm it here
 * while online, at idle. Offline later, the picker and the stat blocks open from
 * the cache like everything else. `import()` and `ensureSrdKind` are cached, so a
 * second call costs nothing.
 */
import { useEffect } from "react";
import { ensureSrdKind } from "@/i18n";
import { seedLazyDataCache } from "@/app/lazy-cache-seed";
import { usesBestiary } from "@/lib/play/bestiary-use";
import { useCharacterStore } from "@/stores/characterStore";

/** Once per app session: the cache outlives it, and a second warm-up buys nothing. */
let warmed = false;

function warmBestiary(): void {
  if (warmed) return;
  warmed = true;
  const run = () => {
    void Promise.all([import("@/data/monsters"), ensureSrdKind("monster")])
      // Under the worker already, or seeded through it once it takes control.
      .then(seedLazyDataCache)
      .catch(() => {
        warmed = false; // offline or a failed fetch: the next visit warms it
      });
  };
  if (typeof requestIdleCallback === "function")
    requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}

/** Warm the bestiary for this character when it needs one and the device is online.
 *  Decided in the effect (never per render): only a new character, spell list or
 *  familiar asks again. */
export function useBestiaryWarmup(): void {
  // Narrow selectors: the sheet never re-renders for this hook.
  const id = useCharacterStore((s) => s.character?.id);
  const spells = useCharacterStore((s) => s.character?.character.spells);
  const familiar = useCharacterStore((s) => s.character?.session.familiar);
  useEffect(() => {
    if (warmed || !navigator.onLine) return;
    const live = useCharacterStore.getState().character;
    if (live && live.id === id && usesBestiary(live)) warmBestiary();
  }, [id, spells, familiar]);
}

/** Warm the bestiary for a campaign table (encounters draw from it). */
export function useCampaignBestiaryWarmup(): void {
  useEffect(() => {
    if (navigator.onLine) warmBestiary();
  }, []);
}
