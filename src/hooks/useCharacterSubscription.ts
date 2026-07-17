/**
 * useCharacterSubscription Hook
 *
 * Subscribes to real-time updates on a single character document.
 * Syncs data into the character store and sets up auto-save for mutations.
 * Restores action log from IndexedDB if Firestore data has no log entries.
 *
 * In dev bypass mode, loads the mock character directly (no Firestore).
 *
 * ── Sync design ──────────────────────────────────────────────────────────────
 * Auto-save watches BOTH session AND character.character changes.  When either
 * changes, both fields are saved together — this prevents the common race
 * condition where a session save triggers a Firestore snapshot that carries
 * stale character.character data and silently overwrites a pending local edit.
 *
 * isFromServerRef guards the store subscriber: when setCharacter() is called
 * from an incoming Firestore snapshot the flag is true, so the subscriber
 * skips the save and does not create an infinite loop.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import {
  subscribeToCharacter,
  createDebouncedSave,
  saveStatusCallbacks,
  type DebouncedSaveHandle,
} from "@/lib/firestore";
import { subscribeCombatState, writeCombatState } from "@/lib/combat-state-io";
import {
  nonCombatSessionChanged,
  combatTrioDiffers,
  sessionToCombatState,
} from "@/lib/combat-state";
import { loadLogFromIDB } from "@/lib/log-persistence";
import { normalizeLogEntry } from "@/lib/sanitize-session";
import { normalizeLogEntryConcentration } from "@/lib/concentration";
import type { LogEntry } from "@/types/character";
import type { CombatState, CombatPersistence } from "@/types/combat-state";
import { effectiveAC } from "@/lib/aggregate-character";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { MOCK_CHARACTER, MOCK_COMBAT_ROUND } from "@/lib/mock";
import { isDevFixtureId, loadDevFixture } from "@/lib/dev-fixtures";
import { isDevScenarioRouteId } from "@/lib/dev-scenario-id";
import {
  createAttachedCampaignTracker,
  refreshAttachedSheets,
  type AttachedCampaignTracker,
} from "@/features/campaigns/refresh-attached-sheets";

/**
 * Subscribe to a character document in Firestore.
 * Loads the character into the store and auto-saves mutations.
 *
 * @param characterId - The Firestore document ID of the character
 */
export function useCharacterSubscription(characterId: string | undefined): void {
  const user = useAuthStore((s) => s.user);
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const setLoading = useCharacterStore((s) => s.setLoading);
  const setError = useCharacterStore((s) => s.setError);
  const debouncedSaveRef = useRef<DebouncedSaveHandle | null>(null);
  /**
   * T4 — per-character resolver for "which campaigns is this hero attached to?".
   * Lazily resolved on the FIRST auto-save (one membership-scoped read), then the
   * fan-out refreshes the DM-readable sheet + lite party snapshot only in those
   * campaigns. Null when there is no signed-in owner (dev-bypass / unauthed).
   */
  const attachedCampaignsRef = useRef<AttachedCampaignTracker | null>(null);

  /**
   * True while setCharacter() is being called from an incoming Firestore
   * snapshot.  The auto-save subscriber checks this flag and skips saving
   * server-sourced state changes to avoid infinite loops.
   */
  const isFromServerRef = useRef(false);

  /**
   * True while the combat-mutable trio is being hydrated from the `combat/state`
   * subdoc into the in-memory session. The parent-doc auto-save subscriber checks it
   * (alongside `isFromServerRef`) so a combat-doc echo never re-persists the parent
   * doc (the snapshot → save → snapshot loop). The combat trio itself no longer has a
   * blanket writer: each store mutator self-persists its op through the injected
   * {@link CombatPersistence} (see below), so there is exactly ONE write per op.
   */
  const isFromCombatRef = useRef(false);

  // Set up subscription (or load mock in dev bypass mode)
  useEffect(() => {
    // Dev bypass: load mock character directly, no Firestore
    if (DEV_BYPASS_AUTH) {
      const id = characterId ?? "mock-1";
      // A `team-<kebab>` id loads one of the 6 real team fixtures (async — the
      // importer + JSON are lazy chunks). Every other id keeps the unchanged
      // synchronous MOCK path so existing previews/tests are untouched.
      if (isDevFixtureId(id)) {
        setLoading(true);
        let cancelled = false;
        void loadDevFixture(id).then((doc) => {
          if (cancelled) return;
          setCharacter(doc ?? { ...MOCK_CHARACTER, id });
          setLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }
      // A `scn-<name>` id BUILDS one of the registered dev scenarios (any
      // class/subclass/level) from a concise spec — the general counterpart of
      // the frozen team fixtures, for self-validating a mechanic in the running
      // app. See `lib/dev-scenarios.ts`.
      if (isDevScenarioRouteId(id)) {
        // The scenario builder + the engine it pulls are dev-only — lazy-import so
        // they never weigh on the eager cockpit bundle (mirrors the fixture path).
        setLoading(true);
        let cancelled = false;
        void import("@/lib/dev-scenarios").then(({ buildDevScenario }) => {
          if (cancelled) return;
          setCharacter(buildDevScenario(id) ?? { ...MOCK_CHARACTER, id });
          setLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }
      setCharacter({ ...MOCK_CHARACTER, id });
      // Dev-bypass loads no `combat/state` subdoc, so the mock's persisted SOLO round
      // (Lyra is mid-combat at round 5) would never reach the turn engine — it would
      // read the round-1 default. Mirror prod: hydrate a combat state derived from the
      // mock session + its canonical round, so the meter seeds `combatStore.round` like
      // a real loaded character. Round-trips the trio identically (same HP/conditions),
      // so only the round differs from the default.
      useCharacterStore
        .getState()
        .hydrateCombatState(
          sessionToCombatState(MOCK_CHARACTER.session, MOCK_COMBAT_ROUND)
        );
      setLoading(false);
      return;
    }

    if (!user || !characterId) {
      setCharacter(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Create debounced save for auto-persistence
    debouncedSaveRef.current = createDebouncedSave(user.uid, characterId);
    // The combat-mutable trio persists to its own `combat/state` subdoc (not the
    // parent char doc), through the injected persistence seam below.
    const uid = user.uid;
    // Inject the (uid, charId)-bound combat-state persistence. The store computes the
    // optimistic NEXT combat state for every op and persists THAT whole object through
    // `writeCombatState` — an offline-queueable `setDoc(merge)`, so a damage / heal /
    // condition / death-save taken OFFLINE is durably queued and replayed on reconnect
    // (the old `runTransaction` path REJECTED offline and silently dropped the edit).
    // Owner writes are always authorized; a transient/network failure is logged (the
    // live subscription reconciles), never thrown.
    const logWrite = (err: unknown): void => {
      console.error("Combat-state write failed", err);
    };
    const persistence: CombatPersistence = {
      write: (state) => void writeCombatState(uid, characterId, state).catch(logWrite),
    };
    useCharacterStore.getState().setCombatPersistence(persistence);
    // T4 — the lazy attached-campaign resolver for the DM-sheet fan-out (one
    // membership-scoped read on the first save; nothing until the owner edits).
    attachedCampaignsRef.current = createAttachedCampaignTracker(user.uid, characterId);

    // Latest combat-subdoc snapshot (`undefined` = none yet, `null` = doc absent).
    // Held so whichever of the char load / combat snapshot arrives SECOND can
    // reconcile — the char-doc parse is async (lazy SRD), so the tiny combat doc
    // usually lands first, before there's a character to hydrate.
    let lastCombat: CombatState | null | undefined = undefined;
    const applyCombatHydration = () => {
      if (lastCombat === undefined) return; // no combat snapshot yet — wait
      const store = useCharacterStore.getState();
      if (!store.character || store.character.id !== characterId) return;
      // Behind the from-combat guard so hydrating the trio never echoes back out as
      // a save (to either doc). An ABSENT subdoc (`lastCombat === null`) hydrates the
      // full-HP default (a genuinely fresh/undamaged character).
      isFromCombatRef.current = true;
      store.hydrateCombatState(lastCombat ?? null);
      isFromCombatRef.current = false;
    };

    // REMOTE-CHANGE FENCE (§5.4) — whether an incoming combat snapshot materially
    // differs from the OPEN character's live trio (the state a snapshot-leg undo
    // restores). Compared against the current store so an identical server confirm of
    // our OWN edit is a no-op. The comparison is the pure exported `combatTrioDiffers`.
    const combatMateriallyDiffers = (combat: CombatState | null): boolean => {
      const cur = useCharacterStore.getState().character;
      if (!cur || cur.id !== characterId || !combat) return false;
      return combatTrioDiffers(cur.session, combat);
    };

    const unsubscribe = subscribeToCharacter(
      user.uid,
      characterId,
      (doc) => {
        if (doc) {
          // Mark as server-sourced so the store subscriber skips the save.
          // `subscribeToCharacter` already returns a FULLY-PARSED doc through the
          // unified codec (`parseCharacterEnvelope` → rehydrate + conform the
          // race-trait pip remap + the weapon-action-id normalization + AC stamp),
          // so the cockpit consumes it directly — ONE parse path (no double work).
          isFromServerRef.current = true;
          setCharacter(doc);
          isFromServerRef.current = false;
          // Re-apply the combat trio onto the freshly-loaded character (the combat
          // snapshot may have arrived before there was a character to hydrate).
          applyCombatHydration();

          // Restore action log from IndexedDB if Firestore data has no entries
          if (doc.session.logEntries.length === 0) {
            void loadLogFromIDB(doc.id).then((entries) => {
              if (entries && entries.length > 0) {
                const current = useCharacterStore.getState().character;
                if (
                  current &&
                  current.id === doc.id &&
                  current.session.logEntries.length === 0
                ) {
                  // Route IDB-restored entries through the SAME GR10 boundary as the
                  // Firestore path (sanitize-session): a pre-refactor IDB log carries
                  // legacy `actionName`/`riderName` (no `action`/`rider`), which would
                  // crash the id-ref combat-log view and round-trip the bad shape back
                  // to Firestore on the next auto-save. Conform-on-read here.
                  const logEntries = entries
                    .map(normalizeLogEntry)
                    .filter((e): e is LogEntry => e !== null)
                    // SRD-aware conform of a legacy concentration-row `event.spell` (a bare
                    // NAME from a pre-id IDB log) so it can never reach the strict
                    // concentrationLabel resolver. The SRD-free `normalizeLogEntry` can't do
                    // this; the ONE shared helper the codec read path also uses (golden rule
                    // 6b) — symmetric boundaries across Firestore / JSON-import / IDB.
                    .map(normalizeLogEntryConcentration);
                  useCharacterStore.getState().updateSession({ logEntries });
                }
              }
            });
          }
        } else {
          setError("Character not found");
          setCharacter(null);
        }
        setLoading(false);
      },
      (err) => {
        // A12 — surface subscription errors (permission denied, network) instead
        // of silently leaving the sheet stuck on "loading".
        console.error("Character subscription error", err);
        setError(err.message);
        setLoading(false);
      }
    );

    // Live listener on the `combat/state` subdoc — hydrate the trio into the
    // session on every snapshot (defaulting to full HP when the doc is absent).
    const unsubscribeCombat = subscribeCombatState(
      user.uid,
      characterId,
      (combat, meta) => {
        // REMOTE-CHANGE FENCE (§5.4): a SERVER-originated combat update (another
        // device / god-mode) that materially differs from the live trio drops the
        // own-sheet undo stack — a snapshot-leg reverse-applier would otherwise clobber
        // the remote writer (single-writer subdoc, no CAS). Our OWN optimistic echo
        // carries `hasPendingWrites`, so it never trips this; an identical server
        // confirm has no material diff. A character SWITCH is fenced separately by the
        // hydrate effect — this is only the same-character server update.
        if (!meta.hasPendingWrites && combatMateriallyDiffers(combat)) {
          useUndoStore.getState().clear();
        }
        lastCombat = combat;
        applyCombatHydration();
      },
      (err) => {
        console.error("Combat-state subscription error", err);
      }
    );

    return () => {
      unsubscribe();
      unsubscribeCombat();
      // Flush any pending debounced save before tearing the handle down.
      // Without this, an edit made within the debounce window (~2s) is
      // silently lost when the user navigates away or closes the tab.
      const pending = debouncedSaveRef.current;
      if (pending) void pending.flush();
      debouncedSaveRef.current = null;
      // Clear the injected persistence so a later (uid/char)-less render never writes
      // to a stale subdoc; the trio mutators fall back to optimistic-only.
      useCharacterStore.getState().setCombatPersistence(null);
      attachedCampaignsRef.current = null;
      setCharacter(null);
    };
  }, [user, characterId, setCharacter, setLoading, setError]);

  // Auto-save the PARENT character doc on a NON-combat change. The combat trio
  // (HP / conditions / initiative / death saves) is stripped from this payload —
  // it persists to the `combat/state` subdoc instead (the subscriber below) — and a
  // trio-ONLY change is skipped here entirely, so an HP tap never writes the parent.
  useEffect(() => {
    const unsubscribe = useCharacterStore.subscribe((state, prevState) => {
      // Ignore changes that originated from an incoming server / combat snapshot.
      if (isFromServerRef.current || isFromCombatRef.current) return;

      if (
        state.character &&
        prevState.character &&
        state.character.id === prevState.character.id &&
        (nonCombatSessionChanged(prevState.character.session, state.character.session) ||
          state.character.character !== prevState.character.character)
      ) {
        if (DEV_BYPASS_AUTH) {
          // Simulate save status transitions in dev bypass mode
          saveStatusCallbacks.onPending();
          setTimeout(() => {
            saveStatusCallbacks.onSaving();
            setTimeout(() => {
              saveStatusCallbacks.onSaved();
            }, 300);
          }, 500);
        } else if (debouncedSaveRef.current) {
          // Stamp the denormalized AC snapshot with the SAME grant-aware formula
          // the cockpit renders, so the roster glance reads a fresh, correct AC
          // WITHOUT importing the SRD engine. Computed only for the persisted
          // payload — the store keeps render-deriving AC live, so this never loops
          // (the snapshot value isn't read back into the store). One source: rule 6.
          const charData = state.character.character;
          const stampedAc = effectiveAC(charData, state.character.session);
          // Always save both together to prevent snapshot-overwrite races. The combat
          // trio (HP/conditions/initiative/death saves) is omitted from the parent doc at
          // the Firestore serialization boundary (`toStoredPayload`) — it lives ONLY in
          // the `combat/state` subdoc (the writer below).
          debouncedSaveRef.current.save({
            session: state.character.session,
            character:
              charData.ac === stampedAc ? charData : { ...charData, ac: stampedAc },
          });
          // T4 — fan the fresh sheet out to every campaign this hero is attached
          // to (DM-readable full copy + lite party snapshot), so the DM sees
          // reasonably-live data. Fire-and-forget + self-swallowing: it never
          // blocks/fails the character save and never loops (it writes CAMPAIGN
          // docs, which the character store does not read back). The owner + id
          // are stable for the lifetime of this character subscription.
          const owner = useAuthStore.getState().user?.uid;
          const tracker = attachedCampaignsRef.current;
          if (owner && tracker) {
            const acStamped =
              charData.ac === stampedAc ? charData : { ...charData, ac: stampedAc };
            void refreshAttachedSheets(tracker, owner, {
              ...state.character,
              character: acStamped,
            });
          }
        }
      }
    });

    return unsubscribe;
  }, []);

  // NB: the combat trio (HP / conditions / initiative / death saves) is NOT persisted by
  // a blanket store subscriber. Each trio mutator self-persists the WHOLE resulting state
  // through the injected `CombatPersistence.write` (see the subscribe effect above) — one
  // offline-queueable `setDoc(merge)` per op (whole-object last-write-wins; a fresh
  // subscription-hydrated base makes different-field / different-time edits compose). The
  // inbound reconcile is unchanged: a write lands → `subscribeCombatState` snapshot →
  // `hydrateCombatState` (guarded by `isFromCombatRef`, so it never re-persists).

  // Flush any pending debounced PARENT-doc save when the tab is closed / reloaded /
  // navigated away from. Without this, an edit made within the debounce
  // window (~2s) before a tab close is silently lost — the in-memory store
  // state is correct but never persisted. `pagehide` fires more reliably
  // than `beforeunload` on mobile Safari. (Combat-state writes are immediate, not
  // debounced, so they need no flush.)
  useEffect(() => {
    function flush() {
      const pending = debouncedSaveRef.current;
      if (pending) void pending.flush();
    }
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);
}
