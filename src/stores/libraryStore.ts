/**
 * Library Store — the in-memory home of the account-level homebrew library.
 *
 * Holds the live `LibraryEntry[]` (hydrated by the ONE subscription in
 * `hooks/useLibrary.ts`, which also injects the owning `uid`) and the two mutations
 * every surface goes through: {@link LibraryState.saveToLibrary} from a custom item's
 * card, {@link LibraryState.removeFromLibrary} from the settings manager. Both apply
 * OPTIMISTICALLY and then persist the whole list through `library-io.writeLibrary`
 * (offline-queueable), so the picker and the manager always read one list.
 *
 * Mutations refuse to run until `loaded` is true: the write is a FULL-DOC overwrite,
 * so writing from an unhydrated store would erase the user's library.
 *
 * Emits OUTCOMES, never strings — `"saved" | "updated" | "full" | "unavailable"` — so
 * the store stays i18n-free (the toasts-as-data contract) and the caller picks the
 * message.
 */

import { create } from "zustand";
import { FREE_TIER_LIMITS } from "@/lib/limits";
import {
  toLibraryEntry,
  upsertEntry,
  type LibraryDraft,
  type LibraryEntry,
} from "@/lib/library";
import { writeLibrary } from "@/lib/library-io";

/** What a save attempt did — the caller maps it to a toast. */
export type SaveToLibraryOutcome = "saved" | "updated" | "full" | "unavailable";

interface LibraryState {
  /** The live library, newest-save-last (upserts keep their original position). */
  entries: LibraryEntry[];
  /** True once the library doc (or its confirmed absence) has been read. */
  loaded: boolean;
  /** The owning uid, injected by `useLibrary` — `null` while signed out / in dev bypass. */
  uid: string | null;

  /** Hydrate from the live subscription (`useLibrary` only). A `null` uid is the
   *  DEV_BYPASS case: the list is usable in memory, no write is attempted. */
  hydrate: (uid: string | null, entries: LibraryEntry[]) => void;
  /** Drop the library on sign-out / uid change so no entry leaks across accounts. */
  reset: () => void;
  /** Promote a character's custom item to a reusable entry (upsert by kind + name). */
  saveToLibrary: (draft: LibraryDraft) => SaveToLibraryOutcome;
  /** Delete one entry by id. */
  removeFromLibrary: (id: string) => void;
}

/** Persist the whole list; a rejected write is logged, never swallowed silently. */
function persist(uid: string | null, entries: LibraryEntry[]): void {
  if (!uid) return;
  void writeLibrary(uid, entries).catch((err: unknown) =>
    console.error("Library write failed", err)
  );
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  entries: [],
  loaded: false,
  uid: null,

  hydrate: (uid, entries) => set({ uid, entries, loaded: true }),

  reset: () => set({ uid: null, entries: [], loaded: false }),

  saveToLibrary: (draft) => {
    const { entries, loaded, uid } = get();
    if (!loaded) return "unavailable";
    const { entries: next, replaced } = upsertEntry(
      entries,
      toLibraryEntry(draft, Date.now())
    );
    if (!replaced && next.length > FREE_TIER_LIMITS.libraryEntries) return "full";
    set({ entries: next });
    persist(uid, next);
    return replaced ? "updated" : "saved";
  },

  removeFromLibrary: (id) => {
    const { entries, loaded, uid } = get();
    if (!loaded) return;
    const next = entries.filter((e) => e.id !== id);
    if (next.length === entries.length) return;
    set({ entries: next });
    persist(uid, next);
  },
}));
