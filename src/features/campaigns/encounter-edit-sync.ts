/**
 * The DM's encounter edit log (`encounter-edit-log.ts`) wired to the campaign store and
 * the server, for the open campaign:
 *
 * - `editEncounter` logs a pure reducer and shows the result at once;
 * - a short pause later every waiting edit goes out as ONE transaction, replayed onto
 *   the server's newest fight (`rebaseEncounterEdits`), so a burst of clicks is one
 *   write and a concurrent change is kept;
 * - `encounterFromServer` puts the waiting edits back over every snapshot, so the
 *   screen never drops one;
 * - with no network, or when the transaction fails, the fight is written whole, as the
 *   old autosave did: queued offline, never an error on screen.
 */
import { diagnosticsLog } from "@/lib/diagnostics/logger";
import type { EncounterState } from "@/types/campaign";

import {
  readServerEncounter,
  rebaseEncounterEdits,
  writeWholeEncounter,
} from "./campaign-io";
import { useCampaignStore } from "./campaignStore";
import {
  beginSend,
  logEdit,
  logRead,
  logSnapshot,
  openEditLog,
  replayEdits,
  sendDone,
  shownFight,
  snapshotNeedsRead,
  type EncounterEdit,
  type EncounterEditLog,
} from "./encounter-edit-log";

/** Long enough to gather a burst of clicks into one write, short enough to feel live. */
const SEND_DELAY_MS = 300;

interface EditSync {
  campaignId: string;
  log: EncounterEditLog;
  /** The fight last put in the store by this log. */
  shown: EncounterState | null | undefined;
  timer: ReturnType<typeof setTimeout> | null;
  /** Bumped when the log is reopened, so a send from before is ignored. */
  generation: number;
}

let sync: EditSync | null = null;

function storeFight(campaignId: string): EncounterState | null | undefined {
  const campaign = useCampaignStore.getState().campaign;
  return campaign?.id === campaignId ? (campaign.encounter ?? null) : undefined;
}

function show(s: EditSync): void {
  const fight = shownFight(s.log);
  s.shown = fight;
  if (storeFight(s.campaignId) === undefined) return;
  if (storeFight(s.campaignId) !== fight) useCampaignStore.getState().setEncounter(fight);
}

function syncFor(campaignId: string): EditSync {
  if (sync?.campaignId !== campaignId) {
    if (sync) closeEncounterEdits(sync.campaignId);
    sync = {
      campaignId,
      log: openEditLog(storeFight(campaignId) ?? null),
      shown: undefined,
      timer: null,
      generation: 0,
    };
  }
  return sync;
}

function schedule(s: EditSync): void {
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    s.timer = null;
    void send(s);
  }, SEND_DELAY_MS);
}

/**
 * Write a batch: one transaction replayed onto the server's newest fight; with no
 * network, or when it fails, the whole fight as this device sees it (`base` with the
 * batch), queued while offline as the old autosave was. Resolves with what was written.
 */
async function writeBatch(
  campaignId: string,
  base: EncounterState | null,
  batch: readonly EncounterEdit[]
): Promise<EncounterState | null> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("offline");
    }
    return await rebaseEncounterEdits(campaignId, batch);
  } catch (error) {
    diagnosticsLog("warn", "campaign.encounter-edit-fallback", {
      message: String(error),
    });
    const written = replayEdits(base, batch);
    if (written) {
      writeWholeEncounter(campaignId, written).catch((failure: unknown) => {
        diagnosticsLog("error", "campaign.encounter-write-failed", {
          message: String(failure),
        });
      });
    }
    return written;
  }
}

async function send(s: EditSync): Promise<void> {
  const begun = beginSend(s.log);
  if (!begun) return;
  s.log = begun.log;
  const { generation } = s;
  const written = await writeBatch(s.campaignId, begun.log.server, begun.batch);
  if (sync !== s || s.generation !== generation) return;
  const done = sendDone(s.log, written);
  s.log = done.log;
  show(s);
  if (done.recheck) readBack(s);
  if (s.log.waiting.length > 0) schedule(s);
}

/** Read the server's fight directly and take it (`logRead`): after a snapshot the log
 *  could not trust, because it may be older than this device's last write. */
function readBack(s: EditSync): void {
  const { generation } = s;
  readServerEncounter(s.campaignId)
    .then((fight) => {
      if (sync !== s || s.generation !== generation) return;
      s.log = logRead(s.log, fight);
      show(s);
    })
    .catch(() => {
      // The next snapshot brings the server's fight anyway.
    });
}

/**
 * The DM changes the fight: `apply` is the same pure reducer the screen used before,
 * shown at once and sent shortly after with whatever else is waiting.
 */
export function editEncounter(
  campaignId: string,
  apply: (fight: EncounterState) => EncounterState
): void {
  const s = syncFor(campaignId);
  const live = storeFight(campaignId);
  if (!live) return;
  // The fight changed outside the log (a new fight, a turn passed): start from it.
  if (live !== s.shown) reopen(s, live);
  const before = shownFight(s.log);
  if (!before || apply(before) === before) return;
  s.log = logEdit(s.log, { epoch: before.epoch, apply });
  show(s);
  schedule(s);
}

/**
 * Start over from `fight`. The waiting edits are sent first, replayed onto the server's
 * fight like any batch (an edit from a fight that has ended changes nothing there); a
 * batch already out still lands, and its answer no longer moves the screen.
 */
function reopen(s: EditSync, fight: EncounterState | null): void {
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  const waiting = s.log.waiting;
  if (waiting.length > 0) {
    void writeBatch(s.campaignId, shownFight({ ...s.log, waiting: [] }), waiting);
  }
  s.log = openEditLog(fight);
  s.shown = undefined;
  s.generation += 1;
}

/**
 * The fight on screen changed outside the log and outside a snapshot: a fight started
 * or ended, a member removed, a turn passed (each written by its own move). That change
 * was made over the fight on screen, so the screen keeps it; the log sends its waiting
 * edits, which the move's own write does not carry, and starts over from it.
 */
export function handOverEncounterEdits(campaignId: string): void {
  if (sync?.campaignId === campaignId) reopen(sync, storeFight(campaignId) ?? null);
}

/** A server snapshot of the fight → the fight to show (the waiting edits over it). */
export function encounterFromServer(
  campaignId: string,
  fight: EncounterState | null
): EncounterState | null {
  if (sync?.campaignId !== campaignId) return fight;
  if (snapshotNeedsRead(sync.log, fight)) readBack(sync);
  sync.log = logSnapshot(sync.log, fight);
  const shown = shownFight(sync.log);
  sync.shown = shown;
  return shown;
}

/** Whether `fight` is the one this log put on screen: the old autosave must not write it. */
export function isEditLogFight(
  campaignId: string,
  fight: EncounterState | null | undefined
): boolean {
  return (
    sync?.campaignId === campaignId && sync.shown !== undefined && fight === sync.shown
  );
}

/**
 * The campaign closes (navigation, page hidden): whatever still waits is written whole
 * right away, queued if offline, as the old autosave's flush did.
 */
export function closeEncounterEdits(campaignId: string): void {
  if (sync?.campaignId !== campaignId) return;
  const s = sync;
  sync = null;
  if (s.timer) clearTimeout(s.timer);
  if (s.log.waiting.length === 0) return;
  const fight = shownFight(s.log);
  if (!fight) return;
  writeWholeEncounter(campaignId, fight).catch((failure: unknown) => {
    diagnosticsLog("error", "campaign.encounter-write-failed", {
      message: String(failure),
    });
  });
}
