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
 * Dev path: the same listener runs against the local replica. A missing document is
 * seeded once from the fixture, after which reloads and multiple tabs behave like the
 * production combat subdoc.
 */

import { useEffect, useState } from "react";
import { subscribeCombatState, writeCombatState } from "@/lib/combat-state-io";
import { sessionToCombatState } from "@/lib/combat-state";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { devDeclarations } from "@/features/campaigns/dev-fixture";
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
      const unsubs: Array<() => void> = [];
      const seededDeclarations = devDeclarations();
      for (const { uid, characterId } of current) {
        let seeded = false;
        const unsubscribe = subscribeCombatState(uid, characterId, (combat) => {
          if (combat || seeded) {
            settle(uid, combat);
            return;
          }
          seeded = true;
          void resolveDevDoc(characterId, uid).then((doc) => {
            if (cancelled) return;
            void writeCombatState(
              uid,
              characterId,
              sessionToCombatState(doc.session, 1, seededDeclarations[uid] ?? [])
            );
          });
        });
        unsubs.push(unsubscribe);
      }
      return () => {
        cancelled = true;
        for (const unsubscribe of unsubs) unsubscribe();
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
