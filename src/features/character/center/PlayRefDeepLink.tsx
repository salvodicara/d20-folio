/**
 * PlayRefDeepLink — the cockpit-side consumer of the ⌘K palette's "jump to a Play
 * tab reference" request (`uiStore.pendingPlayRef`). Rendered INSIDE `TabsProvider`
 * (so it can drive `selectTab`) but OUTSIDE `TabBody` (which only mounts the active
 * panel), so it reacts whether or not the Combat tab is currently showing.
 *
 * On a request it switches to the Combat tab, opens the target reference section
 * (`playbook` / `rules`), scrolls its header into view, then clears the request.
 * Renders nothing.
 */

import { useEffect } from "react";
import { useUIStore } from "@/stores/uiStore";
import { useTabs } from "./useTabs";
import { PLAY_REF_ANCHOR, type PlayRefSection } from "./play-reference";

export function PlayRefDeepLink() {
  // `selectTab` is memoized (stable) in TabsProvider, so the effect runs only when a
  // new request lands — never on an unrelated re-render.
  const { selectTab } = useTabs();
  const pending = useUIStore((s) => s.pendingPlayRef);

  useEffect(() => {
    if (!pending) return;
    const section = pending as PlayRefSection;
    selectTab("combat");
    useUIStore.getState().setPlayRefOpen(section, true);
    // Wait for the Combat panel + the now-open section to mount/lay out, THEN bring
    // its header into view (a real browser lays out over two frames; jsdom fires the
    // stubbed rAF synchronously). Clearing here (not synchronously) keeps this run's
    // scroll from being cancelled by the clear-triggered re-render.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .getElementById(PLAY_REF_ANCHOR[section])
          ?.scrollIntoView({ block: "start" });
        useUIStore.getState().clearPlayRef();
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [pending, selectTab]);

  return null;
}
