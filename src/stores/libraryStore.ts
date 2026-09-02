/**
 * Library Store — the in-memory home of the account-level homebrew library.
 *
 * CUSTOM IS THE LIBRARY: nothing is curated by hand. {@link LibraryState.saveToLibrary}
 * (and its `(kind, instanceId)` convenience {@link LibraryState.syncFromCharacter}) is
 * called by the CREATE forms and by every sheet-side custom EDIT seam, upserting by
 * id (the item's own `instanceId`); {@link LibraryState.removeFromLibrary} is the
 * Custom tab's trash — the only deletion, and it STICKS (only a real create/edit ever
 * re-adds an entry). Both apply OPTIMISTICALLY and then hand the whole list to the
 * injected persistence seam, so the Custom tab always reads one list.
 *
 * PERSISTENCE IS INJECTED (`persist`), never imported — the same seam
 * `characterStore.combatPersistence` uses, and for the same reason: `library-mount`
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
  customDraftById,
  toLibraryEntry,
  upsertEntry,
  type LibraryDraft,
  type LibraryEntry,
  type SheetLibraryKind,
} from "@/lib/library";
import type { CharacterData, PortraitCrop } from "@/types/character";

/** What a save attempt did — the caller maps it to a toast. */
export type SaveToLibraryOutcome = "saved" | "updated" | "full" | "unavailable";

/** Fire-and-forget, offline-safe persistence for the whole entry list. */
export type LibraryPersistence = (entries: readonly LibraryEntry[]) => void;

interface LibraryState {
  /** The live library, newest-save-last (upserts keep their original position). */
  entries: LibraryEntry[];
  /** True once the library doc (or its confirmed absence) has been read. */
  loaded: boolean;
  /** Injected by `LibraryMount`; `null` = memory-only (signed out / DEV_BYPASS). */
  persist: LibraryPersistence | null;

  /** Hydrate from the live subscription (`LibraryMount` only). */
  hydrate: (entries: LibraryEntry[], persist: LibraryPersistence | null) => void;
  /** Drop the library on sign-out / uid change so no entry leaks across accounts. */
  reset: () => void;
  /**
   * Promote a homebrew item to a reusable entry (upsert by id — the item's own
   * `instanceId` for a sheet kind, a fresh UUID for a monster template). Returns
   * the outcome plus the saved/updated entry's `id` (`null` when refused), so a
   * caller that just created the entry can find it again without a name-keyed
   * lookup.
   */
  saveToLibrary: (draft: LibraryDraft) => {
    outcome: SaveToLibraryOutcome;
    id: string | null;
  };
  /**
   * Set (or clear, with `null`) the uploaded portrait on a KEPT library entry, by id —
   * a custom monster's face (Part B). No-op for an unknown id. Same debounced persist
   * as every other library write; the entry keeps its id + position.
   */
  setEntryPortrait: (
    id: string,
    portrait: { portraitUrl: string; portraitCrop?: PortraitCrop } | null
  ) => void;
  /**
   * Mirror the character's custom item of `kind` whose `instanceId` matches into the
   * library — the shape every sheet-side EDIT seam uses. A no-op for an SRD row or a
   * gone id, so a caller never branches. Id-keyed, so a rename upserts the SAME
   * entry in place — there is no separate rename-move step to run.
   */
  syncFromCharacter: (
    data: CharacterData,
    kind: SheetLibraryKind,
    instanceId: string
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

export const useLibraryStore = create<LibraryState>()((set, get) => {
  /** Persist the whole entry list after a mutation. */
  const flush = (): void => {
    const { persist, entries } = get();
    persist?.(entries);
  };

  return {
    entries: [],
    loaded: false,
    persist: null,

    hydrate: (entries, persist) => set({ entries, persist, loaded: true }),

    reset: () => set({ entries: [], persist: null, loaded: false }),

    saveToLibrary: (draft) => {
      const { entries, loaded } = get();
      if (!loaded) return { outcome: "unavailable", id: null };
      const entry = toLibraryEntry(draft, Date.now());
      const { entries: next, replaced } = upsertEntry(entries, entry);
      if (!replaced && next.length > FREE_TIER_LIMITS.libraryEntries) {
        return { outcome: "full", id: null };
      }
      set({ entries: next });
      flush();
      return { outcome: replaced ? "updated" : "saved", id: entry.id };
    },

    syncFromCharacter: (data, kind, instanceId) => {
      const draft = customDraftById(data, kind, instanceId);
      if (!draft) return;
      // The outcome is DELIBERATELY ignored here: this is a per-keystroke edit seam, so
      // a cap/limbo notice would fire on every character typed. The create seams (which
      // fire once, on a deliberate act) are where "full" is spoken —
      // `CustomCreationForms`.
      get().saveToLibrary(draft);
    },

    updateEntry: (id, draft) => {
      const { entries, loaded } = get();
      if (!loaded || !entries.some((e) => e.id === id)) return;
      const rewritten = toLibraryEntry(draft, Date.now());
      // The edited entry keeps its id (and its place in the list) even when the
      // draft's own instanceId/UUID would otherwise mint a different one — the
      // Custom tab's pencil is editing THIS entry, not creating a new one.
      const next = entries.map((e) => (e.id === id ? { ...rewritten, id } : e));
      set({ entries: next });
      flush();
    },

    setEntryPortrait: (id, portrait) => {
      const { entries, loaded } = get();
      // Only run when a MONSTER entry with this id exists — a missing id or a non-monster
      // entry is inert (no write, no mutation), so the caller never branches.
      if (!loaded || !entries.some((e) => e.id === id && e.kind === "monster")) return;
      const next = entries.map((e) => {
        if (e.id !== id || e.kind !== "monster") return e;
        const item = { ...e.item };
        if (portrait) {
          item.portraitUrl = portrait.portraitUrl;
          if (portrait.portraitCrop) item.portraitCrop = portrait.portraitCrop;
          else delete item.portraitCrop;
        } else {
          delete item.portraitUrl;
          delete item.portraitCrop;
        }
        return { ...e, item };
      });
      set({ entries: next });
      flush();
    },

    removeFromLibrary: (id) => {
      const { entries, loaded } = get();
      if (!loaded) return;
      const next = entries.filter((e) => e.id !== id);
      if (next.length === entries.length) return;
      set({ entries: next });
      flush();
    },
  };
});
