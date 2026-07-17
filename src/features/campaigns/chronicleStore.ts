/**
 * Chronicle Store (feature-scoped).
 *
 * Holds the currently-open campaign's chronicle doc — the shared, real-time log.
 * Like `campaignStore` it is Firebase-free: the listener + debounced writes are
 * owned by `useChronicleSubscription` (routed through the §7.1 abstraction) and
 * `campaign-io`. A `null` chronicle is a valid "no chronicle yet" state; the first
 * local edit creates one (which the writer then persists via create-or-merge).
 */

import { create } from "zustand";
import type { ChronicleDoc } from "@/types/campaign";
import { pushVersion } from "@/features/campaigns/chronicle-versions";

const EMPTY_CHRONICLE: ChronicleDoc = {
  text: "",
  lastEditedBy: "",
  lastEditedAt: new Date(0),
  versions: [],
};

export interface ChronicleState {
  chronicle: ChronicleDoc | null;
  loading: boolean;
  error: string | null;

  setChronicle: (doc: ChronicleDoc | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  /** Local edit to the shared text (debounce-persisted by the subscription). */
  setText: (text: string, editedBy: string) => void;

  /**
   * D27 — commit an EDIT SESSION's result: snapshot the text being replaced into
   * the capped version history (so it's restorable) before storing the new text.
   * The caller (Save) passes the editor's display name + an event-time timestamp
   * (never `Date.now()` in render). Debounce-persisted by the subscription.
   */
  commitText: (text: string, editedBy: string, editedByName: string, at: Date) => void;
}

export const useChronicleStore = create<ChronicleState>()((set, get) => ({
  chronicle: null,
  loading: false,
  error: null,

  setChronicle: (doc) => set({ chronicle: doc, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  setText: (text, editedBy) => {
    const base = get().chronicle ?? EMPTY_CHRONICLE;
    set({ chronicle: { ...base, text, lastEditedBy: editedBy } });
  },

  commitText: (text, editedBy, editedByName, at) => {
    const base = get().chronicle ?? EMPTY_CHRONICLE;
    // Snapshot the text we're REPLACING, so it can be restored later.
    const versions = pushVersion(base.versions, {
      timestamp: base.lastEditedAt,
      editedBy: base.lastEditedBy,
      editedByName,
      textSnapshot: base.text,
    });
    set({
      chronicle: { ...base, text, lastEditedBy: editedBy, lastEditedAt: at, versions },
    });
  },
}));
