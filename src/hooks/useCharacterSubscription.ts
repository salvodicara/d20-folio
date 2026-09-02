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
import {
  subscribeCombatState,
  writeCombatState,
  writeCombatTurnEconomy,
} from "@/lib/combat-state-io";
import {
  nonCombatSessionChanged,
  combatTrioDiffers,
  sessionToCombatState,
} from "@/lib/combat-state";
import { loadLogFromIDB } from "@/lib/log-persistence";
import { diagnosticsLog, setDiagnosticsContext } from "@/lib/diagnostics";
import { normalizeLogEntry } from "@/lib/sanitize-session";
import { normalizeLogEntryConcentration } from "@/lib/concentration";
import { sessionToPlayStateV1 } from "@/lib/session-state-codec";
import type { CharacterDoc, LogEntry } from "@/types/character";
import type { CombatState, CombatPersistence } from "@/types/combat-state";
import { effectiveAC, effectiveMaxHp } from "@/lib/aggregate-character";
import { DEV_BYPASS_AUTH as IMPORTED_DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { MOCK_CHARACTER, MOCK_COMBAT_ROUND } from "@/lib/mock";
import { isDevFixtureId, loadDevFixture } from "@/lib/dev-fixtures";
import { isDevScenarioRouteId } from "@/lib/dev-scenario-id";
import {
  readDevDocument,
  subscribeDevDocument,
  writeDevDocument,
} from "@/lib/dev-document-store";
import {
  DEV_CHARACTER_COLLECTION,
  devCharacterDocumentId,
  mergeDevCharacterParent,
  projectDevCharacterParent,
  type DevCharacterParent,
} from "@/lib/dev-character-document";
import {
  createAttachedCampaignTracker,
  refreshAttachedSheets,
  type AttachedCampaignTracker,
} from "@/features/campaigns/refresh-attached-sheets";

// Keep unit-test mocking and dev dogfood intact, while letting the production build
// erase the local document-replica path (and its fixture-only dependencies).
function devBypassEnabled(): boolean {
  return import.meta.env.PROD ? false : IMPORTED_DEV_BYPASS_AUTH;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalJson(record[key])])
    );
  }
  return value;
}

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
   * True while the combat-mutable slice is being hydrated from the `combat/state`
   * subdoc into the in-memory session. The parent-doc auto-save subscriber checks it
   * (alongside `isFromServerRef`) so a combat-doc echo never re-persists the parent
   * doc (the snapshot → save → snapshot loop). The combat slice itself no longer has a
   * blanket writer: each store mutator self-persists its op through the injected
   * {@link CombatPersistence} (see below), so there is exactly ONE write per op.
   */
  const isFromCombatRef = useRef(false);

  // Set up subscription (or load mock in dev bypass mode)
  useEffect(() => {
    // Correlation id (ADR-0008): every breadcrumb/report logged while this character
    // is open is stamped with its id; cleared (both branches below) on unmount/switch.
    setDiagnosticsContext({ characterId });
    // Dev bypass: fixtures are only the initial seed. The same parent + combat/state
    // document split then runs through the local replica, including optimistic echoes,
    // reload survival, and cross-tab updates.
    if (devBypassEnabled()) {
      const id = characterId ?? "mock-1";
      const uid = user?.uid ?? "mock-uid";
      const storageId = devCharacterDocumentId(uid, id);
      let cancelled = false;
      let unsubscribeParent = () => {};
      let unsubscribeCombat = () => {};

      const activate = (seed: CharacterDoc, seedRound = 1): void => {
        if (cancelled) return;
        setLoading(true);
        let persisted = readDevDocument<DevCharacterParent>(
          DEV_CHARACTER_COLLECTION,
          storageId
        );
        // A new replica crosses the ownership boundary child-first, then exposes the
        // marked parent. There is never an observable marked parent without its complete
        // play document. Existing unmarked replicas remain legacy-compatible.
        if (!persisted) {
          const markedSeed = { ...seed, playStateVersion: 1 as const };
          void writeCombatState(
            uid,
            id,
            sessionToCombatState(markedSeed.session, seedRound)
          );
          persisted = projectDevCharacterParent(markedSeed);
          writeDevDocument(DEV_CHARACTER_COLLECTION, storageId, persisted);
        }

        let quarantined = false;
        let persistenceEnabled = true;
        let pendingState: CombatState | null = null;
        let playWriteQueued = false;
        const writeComplete = (state: CombatState): void => {
          if (!persistenceEnabled) return;
          const marked = useCharacterStore.getState().character?.playStateVersion === 1;
          if (!marked) {
            void writeCombatState(uid, id, state);
            return;
          }
          pendingState = state;
          if (playWriteQueued) return;
          playWriteQueued = true;
          queueMicrotask(() => {
            playWriteQueued = false;
            const next = pendingState;
            pendingState = null;
            if (next && persistenceEnabled) void writeCombatState(uid, id, next);
          });
        };
        useCharacterStore.getState().setCombatPersistence({
          write: writeComplete,
          writeTurnEconomy: (round, turnEconomy) =>
            void writeCombatTurnEconomy(uid, id, round, turnEconomy),
        });

        let latestParent: DevCharacterParent | undefined;
        let latestCombat: CombatState | null | undefined;
        const quarantine = (message: string): void => {
          if (quarantined) return;
          quarantined = true;
          persistenceEnabled = false;
          pendingState = null;
          useCharacterStore.getState().setCombatPersistence(null);
          useCharacterStore.getState().setParentPersistenceFlush(null);
          setCharacter(null);
          setError(message);
          setLoading(false);
        };
        const publish = (): void => {
          if (quarantined || !latestParent) return;
          const current = useCharacterStore.getState().character;
          let parent: CharacterDoc;
          try {
            parent = mergeDevCharacterParent(
              current?.id === id ? current : seed,
              latestParent
            );
          } catch (error) {
            quarantine(error instanceof Error ? error.message : String(error));
            return;
          }
          if (parent.playStateVersion === 1 && latestCombat === undefined) return;
          isFromServerRef.current = true;
          let loaded: boolean;
          try {
            loaded =
              latestCombat === undefined
                ? (setCharacter(parent), true)
                : useCharacterStore
                    .getState()
                    .loadCharacterWithCombat(parent, latestCombat, false);
          } catch (error) {
            quarantine(error instanceof Error ? error.message : String(error));
            return;
          } finally {
            isFromServerRef.current = false;
          }
          if (!loaded) {
            quarantine("Invalid play state");
            return;
          }
          setLoading(false);
        };

        unsubscribeParent = subscribeDevDocument<DevCharacterParent>(
          DEV_CHARACTER_COLLECTION,
          storageId,
          (parent) => {
            if (quarantined) return;
            if (!parent) {
              quarantine("Character not found");
              return;
            }
            latestParent = parent;
            publish();
          }
        );
        unsubscribeCombat = subscribeCombatState(
          uid,
          id,
          (combat) => {
            if (quarantined) return;
            latestCombat = combat;
            publish();
          },
          (err) => {
            if (quarantined) return;
            latestCombat = undefined;
            quarantine(err.message);
          }
        );
      };

      const cleanup = (): void => {
        cancelled = true;
        unsubscribeParent();
        unsubscribeCombat();
        useCharacterStore.getState().setCombatPersistence(null);
        useCharacterStore.getState().setParentPersistenceFlush(null);
        setCharacter(null);
        setDiagnosticsContext({ characterId: undefined });
      };

      // A `team-<kebab>` id loads one of the 6 real team fixtures (async — the
      // importer + JSON are lazy chunks). Every other id keeps the unchanged
      // synchronous MOCK path so existing previews/tests are untouched.
      if (isDevFixtureId(id)) {
        setLoading(true);
        void loadDevFixture(id).then((doc) => {
          activate(doc ?? { ...MOCK_CHARACTER, id });
        });
        return cleanup;
      }
      // A `scn-<name>` id BUILDS one of the registered dev scenarios (any
      // class/subclass/level) from a concise spec — the general counterpart of
      // the frozen team fixtures, for self-validating a mechanic in the running
      // app. See `lib/dev-scenarios.ts`.
      if (isDevScenarioRouteId(id)) {
        // The scenario builder + the engine it pulls are dev-only — lazy-import so
        // they never weigh on the eager cockpit bundle (mirrors the fixture path).
        setLoading(true);
        void import("@/lib/dev-scenarios").then(({ buildDevScenario }) => {
          activate(buildDevScenario(id) ?? { ...MOCK_CHARACTER, id });
        });
        return cleanup;
      }
      activate({ ...MOCK_CHARACTER, id }, MOCK_COMBAT_ROUND);
      return cleanup;
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
    // Slot/tracker mutators request this AFTER their synchronous composite action.
    // The microtask in characterStore lets the autosave subscriber arm the latest
    // full payload first, then this flush makes the play resource durable immediately.
    useCharacterStore
      .getState()
      .setParentPersistenceFlush(() => void debouncedSaveRef.current?.flush());
    // The combat-mutable slice persists to its own `combat/state` subdoc (not the
    // parent char doc), through the injected persistence seam below.
    const uid = user.uid;
    // Marked play writes are microtask-coalesced: a synchronous command that changes
    // HP + resources + concentration + log emits one complete child write, not one per
    // store mutator. Legacy combat-only writes retain their immediate behavior.
    const logWrite = (err: unknown): void => {
      console.error("Combat-state write failed", err);
    };
    let persistenceEnabled = true;
    let pendingPlayWrite: CombatState | null = null;
    let playWriteQueued = false;
    const writeCompletePlayState = (state: CombatState): void => {
      if (!persistenceEnabled) return;
      const marked = useCharacterStore.getState().character?.playStateVersion === 1;
      if (!marked) {
        void writeCombatState(uid, characterId, state).catch(logWrite);
        return;
      }
      pendingPlayWrite = state;
      if (playWriteQueued) return;
      playWriteQueued = true;
      queueMicrotask(() => {
        playWriteQueued = false;
        const next = pendingPlayWrite;
        pendingPlayWrite = null;
        if (next && persistenceEnabled) {
          void writeCombatState(uid, characterId, next).catch(logWrite);
        }
      });
    };
    const persistence: CombatPersistence = {
      write: writeCompletePlayState,
      writeTurnEconomy: (round, turnEconomy) =>
        void writeCombatTurnEconomy(uid, characterId, round, turnEconomy).catch(logWrite),
    };
    useCharacterStore.getState().setCombatPersistence(persistence);
    // T4 — the lazy attached-campaign resolver for the DM-sheet fan-out (one
    // membership-scoped read on the first save; nothing until the owner edits).
    attachedCampaignsRef.current = createAttachedCampaignTracker(user.uid, characterId);

    let lastParent: CharacterDoc | null | undefined = undefined;
    let lastCombat: CombatState | null | undefined = undefined;
    let idbRestoreStarted = false;
    let quarantined = false;

    const quarantine = (message: string): void => {
      if (quarantined) return;
      diagnosticsLog("error", "character.quarantine", { message });
      quarantined = true;
      persistenceEnabled = false;
      pendingPlayWrite = null;
      debouncedSaveRef.current?.cancel();
      debouncedSaveRef.current = null;
      attachedCampaignsRef.current = null;
      useCharacterStore.getState().setCombatPersistence(null);
      useCharacterStore.getState().setParentPersistenceFlush(null);
      setCharacter(null);
      setError(message);
      setLoading(false);
    };

    const restoreLocalLog = (loaded: CharacterDoc): void => {
      if (idbRestoreStarted || loaded.session.logEntries.length !== 0) return;
      idbRestoreStarted = true;
      void loadLogFromIDB(loaded.id).then((entries) => {
        if (quarantined || !entries || entries.length === 0) return;
        const current = useCharacterStore.getState().character;
        if (
          !current ||
          current.id !== loaded.id ||
          current.session.logEntries.length !== 0
        ) {
          return;
        }
        const logEntries = entries
          .map(normalizeLogEntry)
          .filter((entry): entry is LogEntry => entry !== null)
          .map(normalizeLogEntryConcentration);
        useCharacterStore.getState().updateSession({ logEntries });
      });
    };

    const publishResolvedPair = (): void => {
      if (quarantined) return;
      if (lastParent === undefined) return;
      if (lastParent === null) {
        quarantine("Character not found");
        return;
      }
      const marked = lastParent.playStateVersion === 1;
      if (marked && lastCombat === undefined) return;
      if (marked && lastCombat === null) {
        quarantine("Invalid play state: missing-v1-combat-state");
        return;
      }

      isFromServerRef.current = true;
      isFromCombatRef.current = true;
      let loaded: boolean;
      try {
        loaded =
          lastCombat === undefined
            ? (setCharacter(lastParent), true)
            : useCharacterStore
                .getState()
                .loadCharacterWithCombat(lastParent, lastCombat, false);
      } catch (error) {
        quarantine(error instanceof Error ? error.message : String(error));
        return;
      } finally {
        isFromCombatRef.current = false;
        isFromServerRef.current = false;
      }
      if (!loaded) {
        quarantine("Invalid play state");
        return;
      }
      const current = useCharacterStore.getState().character;
      if (current) restoreLocalLog(current);
      setLoading(false);
    };

    // REMOTE-CHANGE FENCE (§5.4) — whether an incoming combat snapshot materially
    // differs from the OPEN character's live trio (the state a snapshot-leg undo
    // restores). Compared against the current store so an identical server confirm of
    // our OWN edit is a no-op. The comparison is the pure exported `combatTrioDiffers`.
    const combatMateriallyDiffers = (combat: CombatState | null): boolean => {
      const cur = useCharacterStore.getState().character;
      if (!cur || cur.id !== characterId || !combat) return false;
      if (combatTrioDiffers(cur.session, combat)) return true;
      if (cur.playStateVersion !== 1) return false;
      if (!combat.playState) return true;
      return (
        JSON.stringify(canonicalJson(sessionToPlayStateV1(cur.session))) !==
        JSON.stringify(canonicalJson(combat.playState))
      );
    };

    const unsubscribe = subscribeToCharacter(
      user.uid,
      characterId,
      (doc) => {
        if (quarantined) return;
        lastParent = doc;
        publishResolvedPair();
      },
      (err) => {
        if (quarantined) return;
        // A12 — surface subscription errors (permission denied, network) instead
        // of silently leaving the sheet stuck on "loading".
        console.error("Character subscription error", err);
        lastParent = undefined;
        quarantine(err.message);
      }
    );

    // Live listener on the `combat/state` subdoc — hydrate the trio into the
    // session on every snapshot (defaulting to full HP when the doc is absent).
    const unsubscribeCombat = subscribeCombatState(
      user.uid,
      characterId,
      (combat, meta) => {
        if (quarantined) return;
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
        publishResolvedPair();
      },
      (err) => {
        if (quarantined) return;
        console.error("Combat-state subscription error", err);
        lastCombat = undefined;
        quarantine(err.message);
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
      useCharacterStore.getState().setParentPersistenceFlush(null);
      attachedCampaignsRef.current = null;
      setCharacter(null);
      setDiagnosticsContext({ characterId: undefined });
    };
  }, [user, characterId, setCharacter, setLoading, setError]);

  // Legacy parents retain their noncombat session save. A v1 parent persists only
  // build/cache/meta; every SessionState mutation is routed to the complete child.
  useEffect(() => {
    const unsubscribe = useCharacterStore.subscribe((state, prevState) => {
      // Ignore changes that originated from an incoming server / combat snapshot.
      if (isFromServerRef.current || isFromCombatRef.current) return;

      if (
        !state.character ||
        !prevState.character ||
        state.character.id !== prevState.character.id
      ) {
        return;
      }

      const marked = state.character.playStateVersion === 1;
      const sessionChanged = prevState.character.session !== state.character.session;
      const buildChanged = state.character.character !== prevState.character.character;
      const cacheChanged =
        marked &&
        sessionChanged &&
        (effectiveAC(prevState.character.character, prevState.character.session) !==
          effectiveAC(state.character.character, state.character.session) ||
          effectiveMaxHp(prevState.character.character, prevState.character.session) !==
            effectiveMaxHp(state.character.character, state.character.session));
      const parentChanged =
        buildChanged ||
        cacheChanged ||
        (!marked &&
          nonCombatSessionChanged(prevState.character.session, state.character.session));

      // In v1 every mutable SessionState field lives in the complete child. Explicit
      // combat mutators call the same seam; its microtask coalescer collapses both
      // routes into one write for a composite command.
      if (marked && sessionChanged) state.persistPlayState();

      if (parentChanged) {
        if (devBypassEnabled()) {
          // Persist the same parent/non-combat projection production sends to Firestore.
          const uid = useAuthStore.getState().user?.uid ?? "mock-uid";
          writeDevDocument(
            DEV_CHARACTER_COLLECTION,
            devCharacterDocumentId(uid, state.character.id),
            projectDevCharacterParent(state.character)
          );
          // Simulate save status transitions in dev bypass mode.
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
          // combat slice (HP/conditions/held dice/initiative/death saves) is omitted from the parent doc at
          // the Firestore serialization boundary (`toStoredPayload`) — it lives ONLY in
          // the `combat/state` subdoc (the writer below).
          debouncedSaveRef.current.save({
            ...state.character,
            character:
              charData.ac === stampedAc ? charData : { ...charData, ac: stampedAc },
          });
        }
      }

      // T4 fan-out reflects the complete live sheet and therefore follows any
      // session/build edit even when a marked session edit correctly skips the parent.
      if (sessionChanged || buildChanged) {
        const owner = useAuthStore.getState().user?.uid;
        const tracker = attachedCampaignsRef.current;
        if (owner && tracker) {
          const charData = state.character.character;
          const stampedAc = effectiveAC(charData, state.character.session);
          const acStamped =
            charData.ac === stampedAc ? charData : { ...charData, ac: stampedAc };
          void refreshAttachedSheets(tracker, owner, {
            ...state.character,
            character: acStamped,
          });
        }
      }
    });

    return unsubscribe;
  }, []);

  // Explicit combat mutators and the v1 session subscriber share one microtask-coalesced
  // complete writer. Inbound snapshots stay behind the hydration guards and never echo.

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
