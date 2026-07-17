/**
 * usePartyCombatStates — subscribe LIVE to every attached party member's tiny
 * `combat/state` subdoc, returning their moment-to-moment combat trio (current/temp
 * HP · conditions · initiative · death saves) keyed by member uid.
 *
 * Two-tier party read (free-tier posture, constitution §2.9): the HEAVY parent char
 * doc (name · AC · max HP · passives · senses · portrait) changes rarely and is loaded
 * ONE-SHOT by {@link useMemberCharacterDocs}; the moment-to-moment trio changes every
 * turn, so it gets a dedicated live listener on the small subdoc here. C5's
 * campaign-membership READ grant (derived LIVE from the char's `attachedCampaignId`
 * + the campaign roster in firestore.rules) authorizes every co-member to read each teammate's
 * `combat/state` ({@link subscribeCombatState}). The caller merges the two through
 * `applyCombatToSession` before deriving the at-a-glance card.
 *
 * Lifecycle (gotcha 4 — N standing `onSnapshot`s): one listener per ref, ALL torn down
 * on unmount / roster change / character swap (the effect re-runs only when the
 * serialized `(uid, characterId)` set changes; the cleanup unsubscribes every one).
 *
 * Dev path: `subscribeCombatState` is a no-op under `DEV_BYPASS_AUTH` (no real
 * listener), so under bypass the hook resolves each ref's dev fixture doc ONCE and
 * projects its in-memory session as the "live" combat ({@link sessionToCombatState}) —
 * keeping the e2e / screenshot harness rendering live HP/conditions with no Firestore.
 */

import { useEffect, useState } from "react";
import { subscribeCombatState } from "@/lib/combat-state-io";
import { sessionToCombatState } from "@/lib/combat-state";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { resolveDevDoc } from "@/features/campaigns/useMemberCharacterDocs";
import type { MemberCharacterRef } from "@/features/campaigns/useMemberCharacterDocs";
import type { CombatState } from "@/types/combat-state";

/**
 * Live combat state per member uid:
 *  - `CombatState` — the subdoc resolved (or the dev-projected session);
 *  - `null` — the subdoc is ABSENT (caller defaults to full HP);
 *  - `undefined` — not yet resolved (still loading; caller shows a skeleton, NOT 0 HP).
 */
export function usePartyCombatStates(
  refs: ReadonlyArray<MemberCharacterRef>
): Record<string, CombatState | null | undefined> {
  const [states, setStates] = useState<Record<string, CombatState | null>>({});
  // Stable dependency: the ordered (uid, characterId) pairs, JSON-serialized (same
  // pattern as useMemberCharacterDocs). A new/removed member or a swapped character
  // changes this; a re-render with the same roster does not.
  const key = JSON.stringify(refs.map((r) => [r.uid, r.characterId]));

  useEffect(() => {
    let cancelled = false;
    const current: MemberCharacterRef[] = (JSON.parse(key) as [string, string][]).map(
      ([uid, characterId]) => ({ uid, characterId })
    );
    const settle = (uid: string, state: CombatState | null): void => {
      if (!cancelled) setStates((prev) => ({ ...prev, [uid]: state }));
    };

    if (DEV_BYPASS_AUTH) {
      // No real listeners under bypass — project each dev fixture doc's session once.
      // (Encounter initiative is NOT here: it rides the dev campaign's `encounterInit`
      // table, the same doc production reads — the initiative SSOT.)
      for (const { uid, characterId } of current) {
        void resolveDevDoc(characterId).then((doc) =>
          settle(uid, sessionToCombatState(doc.session))
        );
      }
      return () => {
        cancelled = true;
      };
    }

    const unsubs = current.map(({ uid, characterId }) =>
      subscribeCombatState(
        uid,
        characterId,
        (combat) => settle(uid, combat),
        (err) => console.error("Party combat-state subscription error", err)
      )
    );
    return () => {
      cancelled = true;
      for (const unsub of unsubs) unsub();
    };
  }, [key]);

  // Derive the per-member record: each current member maps to its resolved live state
  // or `undefined` until its listener settles (no stale entry for a departed member).
  const out: Record<string, CombatState | null | undefined> = {};
  for (const r of refs) out[r.uid] = states[r.uid];
  return out;
}
