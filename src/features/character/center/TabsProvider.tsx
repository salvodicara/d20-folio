/**
 * TabsProvider — the SINGLE owner of the cockpit's primary-tab state.
 *
 * Tab selection is in-view STATE (blueprint §6.2), never a sub-route: `activeTab`
 * is LOCAL state mirrored to an optional `?tab=` query param for deep-linking.
 * The param is read once at mount to seed the initial tab and rewritten (replace,
 * no history spam) on each switch — never read back into state, so a switch is a
 * pure-local render with no router round-trip into state.
 *
 * Lifting this state into a scoped provider (mirroring `TurnEconomyProvider`) is
 * the render-isolation seam (§7.2): the strip and the body can live in different
 * parts of the center column yet a switch re-renders only those two consumers,
 * never the cockpit root or the persistent Left/Right HUD.
 */

import { useId, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { TabsContext, TAB_IDS } from "./useTabs";

export function TabsProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // T4 — a DM viewing a member's sheet lands on FEATURES (the character's makeup),
  // not Combat (the live-play turn-economy loop, which is irrelevant to a reviewer
  // and would otherwise greet them with inert action buttons).
  const readonly = useSheetReadonly();

  // Seed the initial tab from the deep-link once (lazy initializer — the param is
  // NOT a live binding; the URL is written on switch, never read back into state,
  // which keeps tab switching a pure-local render with no router re-render).
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get("tab");
    // W6 — default to the combat tab (renamed from "play"); a stale `?tab=play`
    // deep-link is no longer a valid id and gracefully falls through to here. The
    // read-only DM view defaults to "features" instead.
    if (TAB_IDS.some((id) => id === requested)) return requested as string;
    return readonly ? "features" : "combat";
  });

  /** Select a tab: update local state (render) + mirror to `?tab=` (deep-link). */
  function selectTab(id: string): void {
    setActiveTab(id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true }
    );
  }

  const uid = useId();

  return (
    <TabsContext.Provider value={{ activeTab, selectTab, uid }}>
      {children}
    </TabsContext.Provider>
  );
}
