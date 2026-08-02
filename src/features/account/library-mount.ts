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
import { useLibraryStore, type MonsterArtMap } from "@/stores/libraryStore";
import { createLibraryWriter, subscribeLibrary } from "@/lib/library-io";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";

/** Dev-only bestiary art seed (`localStorage["d20-dev-monster-art"]`, the
 *  `d20-dev-encounter` pattern): an owlbear plate (painterly SVG data URI) so the
 *  bypass bestiary can show the UPLOADED-portrait state of the statblock plate —
 *  otherwise every SRD monster renders the tinted-initial fallback. */
function devMonsterArt(): MonsterArtMap {
  try {
    if (window.localStorage.getItem("d20-dev-monster-art") !== "1") return {};
  } catch {
    return {};
  }
  return {
    owlbear: {
      portraitUrl:
        "data:image/svg+xml," +
        encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 300'>` +
            `<defs><radialGradient id='bg' cx='0.5' cy='0.35' r='0.9'>` +
            `<stop offset='0' stop-color='#4a3b26'/><stop offset='0.55' stop-color='#241b10'/>` +
            `<stop offset='1' stop-color='#0e0a06'/></radialGradient>` +
            `<linearGradient id='fur' x1='0' y1='0' x2='0' y2='1'>` +
            `<stop offset='0' stop-color='#6e5636'/><stop offset='1' stop-color='#2c2013'/>` +
            `</linearGradient></defs>` +
            `<rect width='240' height='300' fill='url(#bg)'/>` +
            `<ellipse cx='120' cy='210' rx='85' ry='95' fill='url(#fur)'/>` +
            `<circle cx='120' cy='120' r='62' fill='url(#fur)'/>` +
            `<path d='M74 78l18 26-30 6z' fill='#3a2c19'/>` +
            `<path d='M166 78l-18 26 30 6z' fill='#3a2c19'/>` +
            `<circle cx='96' cy='114' r='13' fill='#f5d76e'/>` +
            `<circle cx='144' cy='114' r='13' fill='#f5d76e'/>` +
            `<circle cx='96' cy='116' r='6' fill='#120d07'/>` +
            `<circle cx='144' cy='116' r='6' fill='#120d07'/>` +
            `<path d='M120 128l-12 22h24z' fill='#c9a44a'/>` +
            `<path d='M108 150q12 10 24 0l-12 16z' fill='#8a6f33'/>` +
            `</svg>`
        ),
    },
  };
}

export function LibraryMount(): null {
  const uid = useAuthStore((s) => s.user?.uid) ?? null;

  useEffect(() => {
    const { hydrate, reset } = useLibraryStore.getState();
    if (DEV_BYPASS_AUTH) {
      hydrate([], devMonsterArt(), null);
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
      (entries, monsterArt) => hydrate(entries, monsterArt, writer.persist),
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
