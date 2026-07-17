/**
 * useTabs — the context seam for the cockpit's primary tab bar. The single owner
 * (`TabsProvider`) holds the `activeTab` state + the `?tab=` deep-link mirror;
 * both the relocatable `TabStrip` (the `role=tablist` buttons) and the `TabBody`
 * (the `role=tabpanel`s) consume the same instance through `useTabs()`.
 *
 * Lifting tab state into a SCOPED provider (mirroring `useTurnEconomy`) is the
 * render-isolation seam (§7.2): a tab switch re-renders only the provider's two
 * consumers (the strip's active indicator + the body), so the strip can sit in
 * the command zone and the body below it WITHOUT either one re-rendering the
 * cockpit root or the persistent Left/Right HUD.
 *
 * Pure (non-component) module — the context, its hook, the valid-id set, and the
 * ARIA id helpers live here so `TabsProvider.tsx` can stay a components-only file
 * (React Fast-Refresh), mirroring the `useTurnEconomy` / `TurnEconomyProvider`
 * split.
 */

import { createContext, useContext } from "react";

/** The shared tab API surface consumed by `TabStrip` + `TabBody`. */
export interface TabsApi {
  /** The currently selected tab id (one of `TAB_IDS`). */
  activeTab: string;
  /** Select a tab: update state (render) + mirror to `?tab=` (deep-link). */
  selectTab: (id: string) => void;
  /** A stable instance id seeding the WAI-ARIA tab/panel id pairs. */
  uid: string;
}

export const TabsContext = createContext<TabsApi | null>(null);

/** Stable tab order + the set of valid `?tab=` deep-link ids. */
export const TAB_IDS = ["combat", "spells", "inventory", "features", "bio"] as const;

/** The DOM id of a tab button (the `aria-labelledby` target of its panel). */
export function tabDomId(uid: string, id: string): string {
  return `${uid}-tab-${id}`;
}

/** The DOM id of a tab panel (the `aria-controls` target of its tab). */
export function panelDomId(uid: string, id: string): string {
  return `${uid}-panel-${id}`;
}

/** Consume the shared tab API. Throws if no provider is mounted. */
export function useTabs(): TabsApi {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("useTabs must be used within a <TabsProvider>");
  }
  return ctx;
}
