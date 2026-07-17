/**
 * Campaign Store (feature-scoped).
 *
 * Holds the currently-open campaign document in memory — the world-layer
 * counterpart to `characterStore`. Lives in `features/campaigns/` (NOT
 * `src/stores/`) so the immutable store layer stays untouched per the rewrite
 * plan. It is intentionally Firebase-free: the real-time listener + debounced
 * writes are owned by `useCampaignSubscription` (which routes through the shared
 * `app/_data/firestore-subscriptions` abstraction) and by `campaign-io`.
 *
 * Derived values (treasury totals, member count) are computed client-side per
 * ARCHITECTURE.md (free-tier NFR) (§4 — derive in the browser, no server recompute).
 */

import { create } from "zustand";
import type {
  CampaignDoc,
  CampaignTreasury,
  EncounterState,
  SharedNote,
  TreasuryLogEntry,
} from "@/types/campaign";
import type { PortraitCrop } from "@/types/character";

export interface CampaignState {
  /** The currently-open campaign (null if none loaded). */
  campaign: CampaignDoc | null;
  /** Whether the campaign is loading from Firestore. */
  loading: boolean;
  /** Error message if loading / a listener failed. */
  error: string | null;

  // Shared notes — a SEPARATE live slice (the `/campaigns/{id}/notes` subcollection,
  // NOT a field on the campaign doc), because the soft-reveal read gate is enforced
  // per-note by firestore.rules. Fed by `useCampaignNotesSubscription`.
  /** The shared notes the current viewer is allowed to see (DM: all; player: revealed). */
  notes: SharedNote[];
  /** Whether the notes subscription is still loading its first snapshot. */
  notesLoading: boolean;
  /** Error message if the notes listener failed (e.g. read denied / offline). */
  notesError: string | null;

  // Listener-facing setters (mirror characterStore) ──────────────────────────
  setCampaign: (doc: CampaignDoc | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** Replace the notes slice from the live subscription snapshot. */
  setNotes: (notes: SharedNote[]) => void;
  setNotesLoading: (loading: boolean) => void;
  setNotesError: (error: string | null) => void;

  // Shared-artifact mutations (debounce-persisted by useCampaignSubscription) ─
  /** Rename the campaign (DM-gated in the UI; debounce-persisted). */
  setName: (name: string) => void;
  /** N4 — set/clear the custom banner (url + crop); optimistic store update. */
  setBanner: (bannerUrl: string | null, bannerCrop: PortraitCrop | null) => void;
  /** Replace the treasury totals. */
  setTreasury: (treasury: CampaignTreasury) => void;
  /** Append a treasury ledger entry (the running record of add/remove). */
  addTreasuryLogEntry: (entry: TreasuryLogEntry) => void;
  /**
   * TREASURY-UX — truly undo a transaction: delete the ledger entry at `index`
   * AND reverse its coin movement in the same state update, so the balance and
   * the record stay consistent and persist together in ONE debounced write
   * (`selectCampaignSave` ships `treasury` + `treasuryLog` whenever either
   * reference changes). Supersedes the old record-only delete/edit, which
   * "cancelled" the history while leaving the wrong coins in the pot.
   */
  cancelTreasuryLogEntry: (index: number) => void;
  /**
   * Optimistically add or replace a note in the local `notes` slice (by id). The
   * actual persistence is a per-note write-through (`setCampaignNote`) the caller
   * fires alongside; the live subscription then reconciles. Under dev bypass (no
   * Firestore) this optimistic update is the only thing that moves the UI.
   */
  upsertNote: (note: SharedNote) => void;
  /** Optimistically remove a note from the local `notes` slice by id. */
  removeNote: (noteId: string) => void;
  /**
   * Set (or clear) the DM's live encounter — optimistic store update; the change
   * rides the SAME debounced campaign writer as the other shared artifacts. Pass
   * `null` to end the encounter. DM/admin-gated at the call site AND in firestore.rules.
   */
  setEncounter: (encounter: EncounterState | null) => void;
}

export const useCampaignStore = create<CampaignState>()((set, get) => ({
  campaign: null,
  loading: false,
  error: null,
  notes: [],
  notesLoading: false,
  notesError: null,

  setCampaign: (doc) => set({ campaign: doc, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setNotes: (notes) => set({ notes, notesError: null, notesLoading: false }),
  setNotesLoading: (notesLoading) => set({ notesLoading }),
  setNotesError: (notesError) => set({ notesError, notesLoading: false }),

  setName: (name) => {
    const { campaign } = get();
    if (!campaign) return;
    set({ campaign: { ...campaign, name } });
  },

  setBanner: (bannerUrl, bannerCrop) => {
    const { campaign } = get();
    if (!campaign) return;
    set({ campaign: { ...campaign, bannerUrl, bannerCrop } });
  },

  setTreasury: (treasury) => {
    const { campaign } = get();
    if (!campaign) return;
    set({ campaign: { ...campaign, treasury } });
  },

  addTreasuryLogEntry: (entry) => {
    const { campaign } = get();
    if (!campaign) return;
    set({
      campaign: { ...campaign, treasuryLog: [...campaign.treasuryLog, entry] },
    });
  },

  cancelTreasuryLogEntry: (index) => {
    const { campaign } = get();
    if (!campaign) return;
    const entry = campaign.treasuryLog[index];
    if (!entry) return;
    set({
      campaign: {
        ...campaign,
        treasury: reverseTreasuryEntry(campaign.treasury, entry),
        treasuryLog: campaign.treasuryLog.filter((_, i) => i !== index),
      },
    });
  },

  upsertNote: (note) => {
    const { notes } = get();
    const exists = notes.some((n) => n.id === note.id);
    set({
      notes: exists ? notes.map((n) => (n.id === note.id ? note : n)) : [...notes, note],
    });
  },

  removeNote: (noteId) => {
    // Drop the note from the subscription-fed slice AND — when present — from the
    // LEGACY `campaign.sharedNotes` read-fallback array, so deleting a not-yet-
    // migrated note disappears instantly (the durable array eviction rides
    // `evictLegacyNote`). A no-op on the array when it's absent (post-migration).
    const { notes, campaign } = get();
    set({
      notes: notes.filter((n) => n.id !== noteId),
      ...(campaign?.sharedNotes
        ? {
            campaign: {
              ...campaign,
              sharedNotes: campaign.sharedNotes.filter((n) => n.id !== noteId),
            },
          }
        : {}),
    });
  },

  setEncounter: (encounter) => {
    const { campaign } = get();
    if (!campaign) return;
    set({ campaign: { ...campaign, encounter } });
  },
}));

// ─── Client-side derivation (NFR §4 — derive in the browser) ──────────────────

/**
 * Transitional READ-FALLBACK (rule 10). Union the live subscription notes (the new
 * `notes` / `dmNotes` subcollections) with the LEGACY `campaign.sharedNotes` array so
 * the live users' pre-migration notes render with ZERO migration. The subcollection
 * copy WINS on an id collision (a note that was migrated, or edited/pinned/hidden into
 * the subcollection, shadows its stale legacy twin). Every surviving legacy note is
 * forced VISIBLE (`dmOnly: false`): the hide flag is net-new, so no live note is
 * hidden — a stray persisted flag must never hide one. Pure; deleted with
 * `scripts/migrate-shared-notes.ts` once the array is gone everywhere.
 */
export function mergeSharedNotes(
  subscriptionNotes: SharedNote[],
  legacy: SharedNote[] | undefined
): SharedNote[] {
  if (!legacy || legacy.length === 0) return subscriptionNotes;
  const seen = new Set(subscriptionNotes.map((n) => n.id));
  const legacyVisible = legacy
    .filter((n) => !seen.has(n.id))
    .map((n) => ({ ...n, dmOnly: false }));
  return [...subscriptionNotes, ...legacyVisible];
}

/**
 * Pure: the treasury after REVERSING one logged transaction (an "add" takes its
 * coins back out; a "remove" returns them). Floors at 0 per metal — coins already
 * spent can't go negative; undoing an over-spent "add" returns what's still there.
 */
export function reverseTreasuryEntry(
  treasury: CampaignTreasury,
  entry: Pick<TreasuryLogEntry, "amount" | "currency" | "type">
): CampaignTreasury {
  const delta = entry.type === "add" ? -entry.amount : entry.amount;
  return {
    ...treasury,
    [entry.currency]: Math.max(0, treasury[entry.currency] + delta),
  };
}

/** Number of members in the campaign (0 when none loaded). The DM IS a member. */
export function campaignMemberCount(campaign: CampaignDoc | null): number {
  return campaign ? campaign.members.length : 0;
}

/**
 * Party size — members MINUS the DM (0 when none loaded). The single source for
 * every PARTY-framed count: there is exactly one DM (`dmUid`), so this drops them
 * from the "party"-labeled surfaces while `campaignMemberCount` keeps the truthful
 * DM-inclusive membership stat. A DMPC stays excluded from party-size yet still
 * fights (accepted); a solo DM reads 0.
 */
export function campaignPartySize(campaign: CampaignDoc | null): number {
  return campaign ? campaign.members.filter((uid) => uid !== campaign.dmUid).length : 0;
}

/** Total treasury value expressed in copper pieces (the common denominator). */
export function treasuryTotalCp(treasury: CampaignTreasury): number {
  return (
    treasury.pp * 1000 +
    treasury.gp * 100 +
    treasury.ep * 50 +
    treasury.sp * 10 +
    treasury.cp
  );
}

/** Total treasury value expressed in gold pieces (1 gp = 100 cp). */
export function treasuryTotalGp(treasury: CampaignTreasury): number {
  return treasuryTotalCp(treasury) / 100;
}
