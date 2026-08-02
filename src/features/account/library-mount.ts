/**
 * library-mount — the ONE listener on the account-level homebrew library
 * (`users/{uid}/library/index`), publishing into `libraryStore` and INJECTING its
 * write seam (this module owns the uid + the `library-io` import, so the store — and
 * the create forms and sheet edit handlers that upsert through it — stay Firebase-free).
 *
 * {@link LibraryMount} is a RENDERLESS component mounted ONCE at `AppShell`, and
 * LAZY-loaded there (the `GlobalCombatMount` pattern) so this module and its
 * store/model/IO graph stay OUT of the always-eager entry bundle — the P3 budget the
 * bundle guard pins. Nothing else is eager-reachable: every other consumer (the Custom
 * tab, the create forms, the sheet edit seams) already lives in the lazy cockpit chunk.
 *
 * It is mounted app-wide because custom IS the library: an upsert fires wherever
 * homebrew is created or edited (any add-modal, the spells tab, the inventory tab), and
 * each write is a FULL-DOC overwrite — the list must be hydrated everywhere, from
 * exactly one listener (golden rule 24 — listener restraint). Every consumer reads
 * `useLibraryStore`, never Firestore.
 *
 * Honors the listener contract (docs/ARCHITECTURE.md): the subscription tears down on
 * unmount and on uid change, resetting the store so no entry survives a sign-out, and
 * FLUSHING the debounced writer first so a pending edit is never dropped. Under
 * `DEV_BYPASS_AUTH` there is no real listener — the store is marked loaded with an empty
 * list and NO persistence, so the surfaces work in memory.
 */

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { createLibraryWriter, subscribeLibrary } from "@/lib/library-io";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";

export function LibraryMount(): null {
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
    // DEBOUNCED: the per-keystroke edit seams update the store immediately and flush
    // one whole-doc write per burst (`setDoc` durably queues offline and replays).
    const writer = createLibraryWriter(uid);
    const unsubscribe = subscribeLibrary(
      uid,
      (entries) => hydrate(entries, writer.persist),
      (err) => console.error("Library subscription error", err)
    );
    return () => {
      unsubscribe();
      writer.flush();
      reset();
    };
  }, [uid]);

  return null;
}
