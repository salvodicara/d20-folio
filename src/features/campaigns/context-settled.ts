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
 *  live status is here or the pip's primary fight (the only one with a live status) is
 *  not its fight. A turn action needs this
 *  (the live status carries the turn's key); a roll needs only `rollTargetOf`. */
export function fightKnown(characterId: string): boolean {
  if (!partyKnown(characterId)) return false;
  const { status, pip } = useCombatStatusStore.getState();
  if (status?.characterId === characterId) return true;
  // Only the pip's primary fight gets a live status (`useLiveEncounter(uid,
  // primaryId)`): a character in another fight on the account waits for none, or it
  // would wait forever (#1219).
  const primary = pip?.entries.find((entry) => entry.campaignId === pip.primaryId);
  return primary?.characterId !== characterId;
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

/**
 * The fight context of `characterId` in three states. «settled»: the campaigns are read
 * for it and either the fight's live status is for it or no campaign lists a fight for
 * it. «pending»: a reader is mounted and hasn't answered, or a campaign lists its fight
 * whose status hasn't arrived. With no reader mounted (`readerMounted` false) nothing
 * will answer, so an unread character is settled at once. A turn action waits while
 * pending: an action in that window would count on a turn the fight then resets.
 */
export function fightContext(characterId: string): "settled" | "pending" {
  const { status, pip } = useCombatStatusStore.getState();
  if (status?.characterId === characterId) return "settled";
  if (pip?.entries.some((entry) => entry.characterId === characterId)) return "pending";
  if (partyKnown(characterId)) return "settled";
  return usePartyRosterStore.getState().readerMounted ? "pending" : "settled";
}

/** The campaigns are read for `characterId` (its party and campaign clock), or no reader
 *  is mounted to read them. What a rest needs: the campaign clock, never the fight. */
export function campaignsRead(characterId: string): boolean {
  return partyKnown(characterId) || !usePartyRosterStore.getState().readerMounted;
}

/** Resolves `true` once the fight context of `characterId` is settled, or `false` after
 *  `ms` (one wait in all; the caller then refuses with its reason). */
export function fightSettledSoon(
  characterId: string,
  ms = PARTY_WAIT_MS
): Promise<boolean> {
  return settledSoon(() => fightContext(characterId) === "settled", ms);
}

/** Resolves `true` once the campaigns are read for `characterId`, or `false` after `ms`. */
export function campaignsReadSoon(
  characterId: string,
  ms = PARTY_WAIT_MS
): Promise<boolean> {
  return settledSoon(() => campaignsRead(characterId), ms);
}

function settledSoon(settled: () => boolean, ms: number): Promise<boolean> {
  if (settled()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (value: boolean) => {
      clearTimeout(timer);
      stopParty();
      stopStatus();
      resolve(value);
    };
    const timer = setTimeout(() => done(settled()), ms);
    // The shell publishes the party and the pip in two writes of one pass (two
    // effects): between them «party read, no fight listed» would look settled. So a
    // change is judged after the pass, when both writes are in.
    let queued = false;
    const check = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (settled()) done(true);
      });
    };
    const stopParty = usePartyRosterStore.subscribe(check);
    const stopStatus = useCombatStatusStore.subscribe(check);
  });
}
