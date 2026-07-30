/**
 * Library Store — the in-memory home of the account-level homebrew library.
 *
 * CUSTOM IS THE LIBRARY: nothing is curated by hand. {@link LibraryState.saveToLibrary}
 * (and its `(kind, idx)` convenience {@link LibraryState.syncFromCharacter}) is called
 * by the CREATE forms and by every sheet-side custom EDIT seam, upserting by kind +
 * name; {@link LibraryState.removeFromLibrary} is the Custom tab's trash — the only
 * deletion, and it STICKS (only a real create/edit ever re-adds an entry). Both apply
 * OPTIMISTICALLY and then hand the whole list to the injected persistence seam, so the
 * Custom tab always reads one list.
 *
 * PERSISTENCE IS INJECTED (`persist`), never imported — the same seam
 * `characterStore.combatPersistence` uses, and for the same reason: `hooks/useLibrary`
 * owns the uid and the `library-io` import, so THIS store (and therefore every card
 * that renders a save affordance) stays Firebase-free and unit-testable with the API
 * key unset. `null` = memory-only (signed out / DEV_BYPASS). The seam DEBOUNCES the
 * Firestore write (`library-io.createLibraryWriter`): per-keystroke edit seams update
 * this store immediately and flush once, ~2 s later.
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
  customDraftAt,
  toLibraryEntry,
  upsertEntry,
  type LibraryDraft,
  type LibraryEntry,
  type LibraryKind,
} from "@/lib/library";
import type { CharacterData } from "@/types/character";

/** What a save attempt did — the caller maps it to a toast. */
export type SaveToLibraryOutcome = "saved" | "updated" | "full" | "unavailable";

/** The injected write seam: persist the WHOLE list (fire-and-forget, offline-safe). */
export type LibraryPersistence = (entries: readonly LibraryEntry[]) => void;

interface LibraryState {
  /** The live library, newest-save-last (upserts keep their original position). */
  entries: LibraryEntry[];
  /** True once the library doc (or its confirmed absence) has been read. */
  loaded: boolean;
  /** Injected by `useLibrary`; `null` = memory-only (signed out / DEV_BYPASS). */
  persist: LibraryPersistence | null;

  /** Hydrate from the live subscription (`useLibrary` only). */
  hydrate: (entries: LibraryEntry[], persist: LibraryPersistence | null) => void;
  /** Drop the library on sign-out / uid change so no entry leaks across accounts. */
  reset: () => void;
  /** Promote a homebrew item to a reusable entry (upsert by kind + name). */
  saveToLibrary: (draft: LibraryDraft) => SaveToLibraryOutcome;
  /**
   * Mirror the character's item at `(kind, idx)` into the library — the shape every
   * sheet-side EDIT seam uses. A no-op for an SRD row, so a caller never branches.
   */
  syncFromCharacter: (data: CharacterData, kind: LibraryKind, idx: number) => void;
  /** Delete one entry by id. */
  removeFromLibrary: (id: string) => void;
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  entries: [],
  loaded: false,
  persist: null,

  hydrate: (entries, persist) => set({ entries, persist, loaded: true }),

  reset: () => set({ entries: [], persist: null, loaded: false }),

  saveToLibrary: (draft) => {
    const { entries, loaded, persist } = get();
    if (!loaded) return "unavailable";
    const { entries: next, replaced } = upsertEntry(
      entries,
      toLibraryEntry(draft, Date.now())
    );
    if (!replaced && next.length > FREE_TIER_LIMITS.libraryEntries) return "full";
    set({ entries: next });
    persist?.(next);
    return replaced ? "updated" : "saved";
  },

  syncFromCharacter: (data, kind, idx) => {
    const draft = customDraftAt(data, kind, idx);
    if (draft) get().saveToLibrary(draft);
  },

  removeFromLibrary: (id) => {
    const { entries, loaded, persist } = get();
    if (!loaded) return;
    const next = entries.filter((e) => e.id !== id);
    if (next.length === entries.length) return;
    set({ entries: next });
    persist?.(next);
  },
}));
