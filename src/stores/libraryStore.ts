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
  isEntryNamed,
  libraryEntryName,
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
   *
   * `previousName` is the item's identity field as it read BEFORE this edit. Identity
   * is (kind, name), so a rename would otherwise upsert a second entry and strand the
   * old-named one forever: when it changed, the stale entry is removed in the same
   * motion — a rename MOVES the template, never duplicates it. Pass it from every seam
   * that can touch the name/title; omit it where the field can't change.
   */
  syncFromCharacter: (
    data: CharacterData,
    kind: LibraryKind,
    idx: number,
    previousName?: string
  ) => void;
  /**
   * Edit a KEPT entry in place, by id — the Custom tab's pencil. Id-keyed, not
   * name-keyed, so the entry survives a rename with its identity intact (the caller
   * knows exactly which entry it opened). Same strip semantics as every other write
   * (`toLibraryEntry`), so an edited template can't grow play state.
   */
  updateEntry: (id: string, draft: LibraryDraft) => void;
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

  syncFromCharacter: (data, kind, idx, previousName) => {
    const draft = customDraftAt(data, kind, idx);
    if (!draft) return;
    // The outcome is DELIBERATELY ignored here: this is a per-keystroke edit seam, so
    // a cap/limbo notice would fire on every character typed. The create seams (which
    // fire once, on a deliberate act) are where "full" is spoken —
    // `CustomCreationForms`.
    const outcome = get().saveToLibrary(draft);
    // Only MOVE the entry once the new name actually landed; if the upsert was refused
    // (cap reached / library not hydrated) dropping the old one would lose it outright.
    if (outcome !== "saved" && outcome !== "updated") return;
    if (previousName === undefined) return;
    const stale = get().entries.find((e) => isEntryNamed(e, kind, previousName));
    // The lookup IS the rename check: when the name did not change, the entry found
    // under `previousName` is the one just upserted, so there is nothing to move.
    if (!stale || isEntryNamed(stale, kind, libraryEntryName(draft))) return;
    get().removeFromLibrary(stale.id);
  },

  updateEntry: (id, draft) => {
    const { entries, loaded, persist } = get();
    if (!loaded || !entries.some((e) => e.id === id)) return;
    const rewritten = toLibraryEntry(draft, Date.now());
    const next = entries
      // The edited entry keeps its id and its place in the list.
      .map((e) => (e.id === id ? { ...rewritten, id } : e))
      // A rename ONTO another kept entry's name would leave two rows sharing one
      // (kind, name) identity — the second unreachable by every name-keyed upsert.
      // The edit absorbs it.
      .filter(
        (e) => e.id === id || !isEntryNamed(e, draft.kind, libraryEntryName(draft))
      );
    set({ entries: next });
    persist?.(next);
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
