/**
 * useCharacters Hook
 *
 * Subscribes to the character list for the current user via Firestore onSnapshot.
 * The list updates in real time — any add, delete or update is reflected immediately
 * without a manual refetch.
 *
 * TWO-TIER read (mirrors the party dashboard): the HEAVY parent char docs (name · AC ·
 * max HP · portrait · class breakdown) stream via `subscribeToCharacters`; the tiny,
 * moment-to-moment combat trio (current/temp HP · conditions · death saves) lives in
 * each character's `combat/state` SUBDOC — the SINGLE source the cockpit/encounter/DM
 * read — and gets a dedicated live listener here (`useRosterCombatStates`), folded onto
 * each tile through the shared `applyCombatToRosterDoc` hydration seam. So a roster HP
 * bar updates live on every HP tap and can never drift from the open sheet.
 *
 * In dev bypass mode, returns the mock character directly (no Firestore call); the
 * subdoc listeners are no-ops there, so the tile reads the mock's live session HP.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { subscribeToCharacters } from "@/lib/firestore";
import { subscribeCombatState } from "@/lib/combat-state-io";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { MOCK_CHARACTER } from "@/lib/mock";
import {
  rosterProjectionFromDoc,
  applyCombatToRosterDoc,
  type RosterCharacterDoc,
} from "@/lib/character-cache";
import { applyCombatToSession, sessionToCombatState } from "@/lib/combat-state";
import type { CombatState } from "@/types/combat-state";

interface UseCharactersResult {
  /** The SRD-free roster projection (NOT the full `CharacterDoc`) — the list reads
   *  only the projected fields; the cockpit opens the full parsed character. */
  characters: RosterCharacterDoc[];
  loading: boolean;
  error: string | null;
  /** Per-tile HP-hydration bit keyed by character id — `true` once the tile's
   *  `combat/state` subdoc has SETTLED (present or confirmed-absent), so its
   *  `session.hp` is the REAL value rather than the full-HP placeholder
   *  `cacheToRosterDoc` seeds. The roster card gates its HP readout on this so the
   *  gold fill first-PAINTS at the real width instead of painting a full-HP bar that
   *  then slides down. Optional: a synchronous caller / test double may omit it, in
   *  which case the card treats its session HP as already authoritative. */
  hpReady?: Record<string, boolean>;
}

/**
 * Dev-bypass-only faithful repro of the PROD two-phase roster HP hydration. In prod
 * the parent character docs stream FIRST (the roster paints each tile at the full-HP
 * placeholder `cacheToRosterDoc` seeds), then each `combat/state` subdoc resolves a
 * beat later and folds the REAL HP in. Under `d20-dev-hp-hydrate-delay` we reproduce
 * that sequence in a real browser: seed the mock tile at full HP, then emit its real
 * (wounded) combat state after {@link HP_HYDRATE_DELAY_MS} — driving the exact
 * `applyCombatToRosterDoc` + `combatStates[id]` seam prod uses (so the placeholder→real
 * fold, and on unfixed code the width slide, is exercised). Compile-time dead in prod
 * (guarded by `DEV_BYPASS_AUTH` → `import.meta.env.DEV`).
 */
const HP_HYDRATE_DELAY_FLAG = "d20-dev-hp-hydrate-delay";
const HP_HYDRATE_DELAY_MS = 600;

/**
 * How long to wait for a SERVER-confirmed (or non-empty) roster snapshot before the
 * empty-from-cache limbo becomes a recoverable error. Long enough to absorb a slow
 * cold fetch, short enough to offer recovery when the Firestore SDK is wedged (the
 * "Clear site data" incident). Only ever reached when the local cache is empty AND the
 * server never confirms — a normally-online user settles in one round trip; a
 * returning offline user with cached characters renders them immediately and never
 * arms this. */
const ROSTER_SERVER_CONFIRM_TIMEOUT_MS = 10_000;
function devHpHydrateDelay(): boolean {
  return DEV_BYPASS_AUTH && window.localStorage.getItem(HP_HYDRATE_DELAY_FLAG) === "1";
}

export function useCharacters(): UseCharactersResult {
  const user = useAuthStore((s) => s.user);
  // Dev-bypass ONLY: `d20-dev-empty-roster=1` in localStorage renders the EMPTY
  // roster (the P2 first-run onboarding state), which is otherwise unreachable in
  // the preview (the mock character always seeds). Compile-time dead in prod.
  const [characters, setCharacters] = useState<RosterCharacterDoc[]>(() => {
    if (!DEV_BYPASS_AUTH || window.localStorage.getItem("d20-dev-empty-roster") === "1") {
      return [];
    }
    // Project the mock to the EXACT roster shape the real subscription streams
    // (the SRD-free `RosterCharacterDoc`), so dev + prod render identical types.
    const doc = rosterProjectionFromDoc({ ...MOCK_CHARACTER, id: "mock-1" });
    // Faithful two-phase repro (`d20-dev-hp-hydrate-delay`): start the tile at the
    // FULL-HP placeholder `cacheToRosterDoc` seeds in prod, so the delayed real HP
    // (emitted by `useRosterCombatStates` below) visibly folds in.
    return devHpHydrateDelay()
      ? [
          {
            ...doc,
            session: applyCombatToSession(doc.session, null, doc.character.hp.max),
          },
        ]
      : [doc];
  });
  // Tracks which uid's snapshot has arrived; used to derive loading state
  // without calling setState synchronously inside the effect.
  const [loadedUid, setLoadedUid] = useState<string | null>(
    DEV_BYPASS_AUTH ? "bypass" : null
  );
  const [error, setError] = useState<string | null>(null);

  // loading = authenticated user present but we haven't received their first snapshot yet
  const loading = !DEV_BYPASS_AUTH && !!user && loadedUid !== user.uid;

  // Dev-bypass ONLY: `d20-dev-roster=1` swaps the lone mock for the FULL roster
  // gallery (many classes/levels, portraits vs monograms, a long name, HP bands,
  // retired + fallen tiles) — the grid/filter/bulk states are unreachable on a
  // one-tile roster. Lazy-imported through the same seam every scenario consumer
  // uses, so the SRD-heavy builder never weighs on the roster bundle.
  useEffect(() => {
    if (!DEV_BYPASS_AUTH || window.localStorage.getItem("d20-dev-roster") !== "1") return;
    let alive = true;
    void import("@/lib/dev-scenarios").then(({ buildDevRosterDocs }) => {
      if (alive) setCharacters(buildDevRosterDocs().map(rosterProjectionFromDoc));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (DEV_BYPASS_AUTH || !user) return;
    const uid = user.uid;
    let settled = false;

    // Boot-resilience (the 2026-07-09 "Clear site data" incident): after the local
    // Firestore cache is wiped mid-session, the first snapshot fires from the EMPTY
    // cache (`fromCache: true`, zero docs) before the server answers — and if the SDK
    // is left wedged by the mid-session wipe, the server answer may never arrive. An
    // empty-from-cache result is NOT authoritative while ONLINE, so we DON'T settle on
    // it (the roster keeps showing the loader, never the misleading first-run "create
    // your first character" screen). If no authoritative answer lands within the
    // timeout, surface the recoverable error state (Retry reloads → a fresh Firestore
    // instance, which is what actually unwedges the SDK). A settled empty answer is
    // the TRUE first-run state; a non-empty cache answer renders immediately
    // (offline-first).
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setError("connection-timeout");
      setLoadedUid(uid);
    }, ROSTER_SERVER_CONFIRM_TIMEOUT_MS);

    const unsubscribe = subscribeToCharacters(
      uid,
      (docs, fromCache) => {
        // Authoritative = a server-confirmed snapshot, OR any non-empty result (a
        // returning offline user's cached characters), OR a genuinely OFFLINE
        // cache-empty answer (the cache IS the best available truth offline — same
        // semantics as `listSharedCampaigns`, which only server-confirms while
        // online; no error, no eternal loader). An ONLINE empty-from-cache snapshot
        // is ignored for settling — we keep waiting for the server (or the timeout).
        const authoritative = !fromCache || docs.length > 0 || !navigator.onLine;
        setCharacters(docs);
        if (!authoritative) return;
        settled = true;
        window.clearTimeout(timer);
        setLoadedUid(uid);
        setError(null);
      },
      (err) => {
        settled = true;
        window.clearTimeout(timer);
        setError(err.message);
        setLoadedUid(uid); // stop loading spinner even on error
      }
    );

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [user]);

  // Fold each character's LIVE combat subdoc onto its tile (current/temp HP + the
  // fallen-hero death-save track). The subscription is a no-op under DEV_BYPASS, so
  // the mock/fixtures render their session HP directly (the same values a real subdoc
  // would carry); in prod it gives the roster live HP updates on every tap.
  const combatStates = useRosterCombatStates(user?.uid, characters);
  const hydrated = useMemo(
    () => characters.map((c) => applyCombatToRosterDoc(c, combatStates[c.id])),
    [characters, combatStates]
  );
  // Per-tile HP-hydration bit — `true` once the tile's `combat/state` subdoc has
  // SETTLED (`combatStates[id] !== undefined`: present OR confirmed-absent), so its
  // `session.hp` is the REAL value, not the full-HP placeholder `cacheToRosterDoc`
  // seeds. The card gates its HP number + gold fill on this so the fill first-PAINTS at
  // the real width (no placeholder→real slide, no full-HP frame). Under dev-bypass the
  // projection is synchronous (session HP already real) so every tile is ready from
  // first paint — EXCEPT under the repro flag, which deliberately drives the real
  // placeholder→settled transition.
  const syncReady = DEV_BYPASS_AUTH && !devHpHydrateDelay();
  const hpReady = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const c of characters) {
      out[c.id] = syncReady || combatStates[c.id] !== undefined;
    }
    return out;
  }, [characters, combatStates, syncReady]);

  return { characters: hydrated, loading, error, hpReady };
}

/**
 * Subscribe LIVE to every roster character's own `combat/state` subdoc, keyed by
 * character id. Mirrors {@link usePartyCombatStates} (which does the same for a
 * campaign's members) — one listener per character, ALL torn down on unmount / roster
 * change (the effect re-runs only when the sorted `(uid, ids)` set changes). A no-op
 * under `DEV_BYPASS_AUTH` (`subscribeCombatState` returns a no-op listener there), so
 * the state map stays empty and every tile keeps its baseline session HP.
 *
 *  - `CombatState` — the subdoc resolved;
 *  - `null` — the subdoc is ABSENT (tile keeps its full-HP / legacy-fallback baseline);
 *  - `undefined` — not yet resolved (baseline shows until the listener settles).
 */
function useRosterCombatStates(
  uid: string | undefined,
  docs: readonly RosterCharacterDoc[]
): Record<string, CombatState | null | undefined> {
  const [states, setStates] = useState<Record<string, CombatState | null>>({});
  const ids = docs.map((d) => d.id);
  // Stable dependency: uid + the SORTED id list (a new/removed character changes it;
  // a re-render with the same roster does not).
  const key = uid ? JSON.stringify([uid, [...ids].sort()]) : "";

  useEffect(() => {
    if (key === "") return;
    let cancelled = false;
    const [scopeUid, list] = JSON.parse(key) as [string, string[]];
    const unsubs = list.map((id) =>
      subscribeCombatState(
        scopeUid,
        id,
        (combat) => {
          if (!cancelled) setStates((prev) => ({ ...prev, [id]: combat }));
        },
        (err) => console.error("Roster combat-state subscription error", err)
      )
    );
    return () => {
      cancelled = true;
      for (const unsub of unsubs) unsub();
    };
  }, [key]);

  // Dev-bypass repro (`d20-dev-hp-hydrate-delay`): the real subscription above is a
  // no-op under DEV_BYPASS, so simulate the prod subdoc landing a beat AFTER the parent
  // docs — emit each tile's REAL (wounded) combat state after the delay. This flips
  // `combatStates[id]` undefined→present exactly as prod does, exercising the full-HP
  // placeholder → real fold (and, on unfixed code, the width slide) in a real browser.
  // Compile-time dead in prod (guarded by DEV_BYPASS_AUTH inside `devHpHydrateDelay`).
  useEffect(() => {
    if (!devHpHydrateDelay() || ids.length === 0) return;
    const timer = window.setTimeout(() => {
      const settled = sessionToCombatState(MOCK_CHARACTER.session);
      setStates((prev) => ({
        ...prev,
        ...Object.fromEntries(ids.map((id) => [id, settled])),
      }));
    }, HP_HYDRATE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `ids` derives from `key`; depending on `key` keeps this stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Project to the current roster's ids only (no stale entry for a departed member).
  return useMemo(() => {
    const out: Record<string, CombatState | null | undefined> = {};
    for (const id of ids) out[id] = states[id];
    return out;
    // `ids` is derived from `key`; depending on `key` + `states` keeps this stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, states]);
}
