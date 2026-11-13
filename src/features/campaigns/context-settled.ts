/**
 * What the open sheet knows about its campaign's fight. The shell reads the user's
 * campaigns first (`usePartyRosterStore.resolvedFor`), and the fight's live status
 * (`useCombatStatusStore.status`) from a second listener that answers later. The pip
 * model comes from the campaigns alone, so it already lists a fight whose status has
 * not arrived. An action that branches on «in a fight or not» waits until this is known,
 * instead of reading «no fight» in that gap (coordinator, 2026-11-13: one signal, no
 * third mechanism; the cast fix #1171 and the sheet roll #1191 use it).
 */
import { useCombatStatusStore } from "./combat-status-store";
import { PARTY_WAIT_MS, partyKnown, usePartyRosterStore } from "./party-roster";

/** The fight of `characterId` is known: the campaigns are read, and either its status is
 *  here or no campaign lists a fight for it. */
export function fightKnown(characterId: string): boolean {
  if (!partyKnown(characterId)) return false;
  const { status, pip } = useCombatStatusStore.getState();
  if (status?.characterId === characterId) return true;
  return !pip?.entries.some((entry) => entry.characterId === characterId);
}

/** Resolves `true` once the fight of `characterId` is known, or `false` after `ms`. */
export function fightKnownSoon(
  characterId: string,
  ms = PARTY_WAIT_MS
): Promise<boolean> {
  if (fightKnown(characterId)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      stopParty();
      stopStatus();
      resolve(fightKnown(characterId));
    };
    const timer = setTimeout(done, ms);
    const check = () => {
      if (fightKnown(characterId)) done();
    };
    const stopParty = usePartyRosterStore.subscribe(check);
    const stopStatus = useCombatStatusStore.subscribe(check);
  });
}
