/**
 * What the open sheet knows about its campaign's fight. The shell reads the user's
 * campaigns first (`usePartyRosterStore.resolvedFor`), and the fight's live status
 * (`useCombatStatusStore.status`) from a second listener that answers later. The pip
 * model comes from the campaigns alone, so it already lists a fight whose status has
 * not arrived. An action that branches on «in a fight or not» waits for the campaigns
 * (`partyKnownSoon`, the signal the cast fix #1171 uses), never reads «no fight» before
 * them, and needs the live status only for what only it holds.
 */
import { useCombatStatusStore } from "./combat-status-store";
import { PARTY_WAIT_MS, partyKnown, usePartyRosterStore } from "./party-roster";

/** Where a sheet's initiative roll goes. */
export type RollTarget =
  | { kind: "fight"; campaignId: string; uid: string; firstRoll: boolean }
  | { kind: "solo" };

/**
 * The fight of `characterId` (the live status, or the pip's entry before the status
 * arrives), solo when no campaign lists one, `null` while the campaigns are unread.
 */
export function rollTargetOf(characterId: string, uid: string): RollTarget | null {
  if (!partyKnown(characterId)) return null;
  const { status, pip } = useCombatStatusStore.getState();
  if (status?.characterId === characterId)
    return {
      kind: "fight",
      campaignId: status.campaignId,
      uid,
      firstRoll: status.initiativeRoll === null,
    };
  const entry = pip?.entries.find((e) => e.characterId === characterId);
  if (entry)
    return {
      kind: "fight",
      campaignId: entry.campaignId,
      uid,
      firstRoll: entry.state === "needs-roll",
    };
  return { kind: "solo" };
}

/** The fight of `characterId` is known in full: the campaigns are read, and either its
 *  live status is here or no campaign lists a fight for it. A turn action needs this
 *  (the live status carries the turn's key); a roll needs only `rollTargetOf`. */
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
