/**
 * The private pack's painted icons (`@pack/icon-art`, `"<kind>/<id>"` → URL), loaded
 * the first time an icon renders: a separate chunk, so neither the map nor the
 * runtime pack's wait joins the first paint. Empty in the public (SRD-only) build.
 */
import { useSyncExternalStore } from "react";

let icons: Readonly<Record<string, string>> | null = null;
let loading = false;
const listeners = new Set<() => void>();

function load() {
  if (loading) return;
  loading = true;
  void import("@pack/icon-art")
    .then((m) => {
      icons = m.packIconArt;
    })
    .catch(() => {
      icons = {};
    })
    .finally(() => {
      for (const l of listeners) l();
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

/** The pack's icon map once loaded, `null` until then. */
export function usePackIcons(): Readonly<Record<string, string>> | null {
  return useSyncExternalStore(
    subscribe,
    () => icons,
    () => null
  );
}
