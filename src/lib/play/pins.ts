/** Pure play transition for pinning an action card to the combat board. */
import type { SessionState } from "@/types/character";

/**
 * Toggle an action's pin. A default-pinned card (a weapon) toggles in the
 * `unpinnedActions` blacklist; any other card in the `pinnedActions` whitelist.
 */
export function togglePinnedAction(
  session: SessionState,
  actionId: string,
  defaultPinned: boolean
): SessionState {
  const toggle = (ids: ReadonlyArray<string>) =>
    ids.includes(actionId) ? ids.filter((id) => id !== actionId) : [...ids, actionId];
  return defaultPinned
    ? { ...session, unpinnedActions: toggle(session.unpinnedActions ?? []) }
    : { ...session, pinnedActions: toggle(session.pinnedActions) };
}
