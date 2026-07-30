/**
 * useLibrary — the ONE listener on the account-level homebrew library
 * (`users/{uid}/library/index`), publishing into `libraryStore`.
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
 * marked loaded with an empty list so the surfaces work in-memory in dev.
 */

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { subscribeLibrary } from "@/lib/library-io";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";

export function useLibrary(): void {
  const uid = useAuthStore((s) => s.user?.uid) ?? null;

  useEffect(() => {
    const { hydrate, reset } = useLibraryStore.getState();
    if (DEV_BYPASS_AUTH) {
      hydrate(null, []);
      return;
    }
    if (!uid) {
      reset();
      return;
    }
    const unsubscribe = subscribeLibrary(
      uid,
      (entries) => hydrate(uid, entries),
      (err) => console.error("Library subscription error", err)
    );
    return () => {
      unsubscribe();
      reset();
    };
  }, [uid]);
}
