/**
 * useLibrary — the ONE listener on the account-level homebrew library
 * (`users/{uid}/library/index`), publishing into `libraryStore` and INJECTING its
 * write seam (this hook owns the uid + the `library-io` import, so the store and every
 * card that renders a save affordance stay Firebase-free).
 *
 * Mounted ONCE, app-wide, by `AppShell`: the save affordances live on the character
 * sheet while the pickers and the settings manager live elsewhere, and a save is a
 * FULL-DOC overwrite — so the library must be hydrated wherever a save can happen, and
 * exactly one listener may exist for it (golden rule 24 — listener restraint). Every
 * consumer reads `useLibraryStore`, never Firestore.
 *
 * Honors the listener contract (docs/ARCHITECTURE.md): a `use*` hook that tears the
 * subscription down on unmount and on uid change, resetting the store so no entry
 * survives a sign-out. Under `DEV_BYPASS_AUTH` there is no real listener — the store is
 * marked loaded with an empty list and NO persistence, so the surfaces work in memory.
 */

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useLibraryStore, type LibraryPersistence } from "@/stores/libraryStore";
import { subscribeLibrary, writeLibrary } from "@/lib/library-io";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";

export function useLibrary(): void {
  const uid = useAuthStore((s) => s.user?.uid) ?? null;

  useEffect(() => {
    const { hydrate, reset } = useLibraryStore.getState();
    if (DEV_BYPASS_AUTH) {
      hydrate([], null);
      return;
    }
    if (!uid) {
      reset();
      return;
    }
    // Fire-and-forget: `setDoc` durably queues offline and replays on reconnect, so a
    // rejection is a real failure worth logging, never a silent drop.
    const persist: LibraryPersistence = (entries) =>
      void writeLibrary(uid, entries).catch((err: unknown) =>
        console.error("Library write failed", err)
      );
    const unsubscribe = subscribeLibrary(
      uid,
      (entries) => hydrate(entries, persist),
      (err) => console.error("Library subscription error", err)
    );
    return () => {
      unsubscribe();
      reset();
    };
  }, [uid]);
}
