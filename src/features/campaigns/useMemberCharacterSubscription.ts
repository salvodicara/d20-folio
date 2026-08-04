/**
 * useMemberCharacterSubscription — a DM/admin opens a party member's FULL sheet,
 * read-only, via the member's REAL character document.
 *
 * The unified-codec persistence overhaul removed the denormalized per-member
 * full-sheet COPY (`campaigns/{campId}/sheets/{ownerUid}`): the DM now reads the
 * owner's actual character doc through the SAME `subscribeToCharacter` the owner's
 * cockpit uses — ONE load path for owner + admin + DM (no duplicate content, no
 * divergent code, golden rule 6). `firestore.rules` authorizes the DM read via the
 * live campaign-membership grant (the char's `attachedCampaignId` + the roster).
 *
 * It loads the parsed doc into the SHARED character store via `loadReadonly`, which
 * flips the store's `readonly` flag so the SAME cockpit body renders with every
 * mutator inert. There is NO write path here; the grant is read-only end to end.
 *
 * Offline-first + real-time: a live snapshot listener (offline persistence applies),
 * auto-teardown on unmount. In dev-bypass it resolves the member's character through
 * the SAME dev fixture / scenario seam the owner-edit path uses (no Firestore), so
 * the viewer renders a populated read-only sheet locally + in the visual/a11y suite.
 *
 * The not-found / denied path surfaces a clean error (never a stuck spinner): when
 * the doc is absent or the read is denied, `setError` + `loadReadonly(null)` clear
 * the loading state, and `MemberSheetView` renders a not-found state.
 */

import { useEffect } from "react";
import { useCharacterStore } from "@/stores/characterStore";
import { subscribeToCharacter } from "@/lib/firestore";
import { subscribeCombatState, writeCombatState } from "@/lib/combat-state-io";
import { sessionToCombatState } from "@/lib/combat-state";
import type { CombatState } from "@/types/combat-state";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { resolveDevDoc } from "@/features/campaigns/useMemberCharacterDocs";

/**
 * Subscribe (read-only) to a party member's character document.
 *
 * @param memberUid    The member's uid (the owner of the character) — also the
 *                     Firestore character-collection owner path. `undefined` →
 *                     no-op (clears the store).
 * @param characterId  The member's attached character id (`memberDetails[uid]
 *                     .characterId`). `undefined` → no-op. In dev-bypass it doubles
 *                     as the fixture/scenario id to resolve locally (no Firestore).
 */
export function useMemberCharacterSubscription(
  memberUid: string | undefined,
  characterId: string | undefined
): void {
  const loadReadonly = useCharacterStore((s) => s.loadReadonly);
  const setLoading = useCharacterStore((s) => s.setLoading);
  const setError = useCharacterStore((s) => s.setError);

  useEffect(() => {
    // Dev-bypass: resolve the same persisted parent + combat/state replica the owner
    // uses. The fixture is only the seed; read-only peer views now survive reloads and
    // observe another tab's combat updates like production.
    if (DEV_BYPASS_AUTH) {
      const id = characterId ?? "mock-1";
      const uid = memberUid ?? "mock-uid";
      let cancelled = false;
      let unsubscribeCombat = () => {};
      setLoading(true);
      void resolveDevDoc(id, uid).then((doc) => {
        if (cancelled) return;
        loadReadonly(doc);
        let seeded = false;
        unsubscribeCombat = subscribeCombatState(uid, id, (combat) => {
          if (cancelled) return;
          if (!combat && !seeded) {
            seeded = true;
            void writeCombatState(uid, id, sessionToCombatState(doc.session));
            return;
          }
          useCharacterStore.getState().hydrateCombatState(combat);
        });
        setLoading(false);
      });
      return () => {
        cancelled = true;
        unsubscribeCombat();
      };
    }

    if (!memberUid || !characterId) {
      loadReadonly(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Latest combat-subdoc snapshot (`undefined` = none yet, `null` = doc absent).
    // The tiny combat doc usually lands before the lazy-SRD char parse resolves;
    // whichever arrives second reconciles via `applyCombatHydration` (mirrors the
    // owner-edit `useCharacterSubscription` so the read-only peer sheet shows LIVE
    // HP/conditions, not the C3-stripped parent-doc default).
    let lastCombat: CombatState | null | undefined = undefined;
    const applyCombatHydration = (): void => {
      if (lastCombat === undefined) return; // no combat snapshot yet — wait
      const store = useCharacterStore.getState();
      if (!store.character || store.character.id !== characterId) return;
      // Absent subdoc → the full-HP default (a genuinely fresh/undamaged character); a
      // present subdoc is the sole source of the peer's live HP/conditions/death saves.
      store.hydrateCombatState(lastCombat ?? null);
    };

    const unsubscribe = subscribeToCharacter(
      memberUid,
      characterId,
      (doc) => {
        if (doc) {
          loadReadonly(doc);
          applyCombatHydration();
        } else {
          // Absent / denied — a clean not-found, never a stuck spinner.
          setError("Member character not found");
          loadReadonly(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Member-character subscription error", err);
        setError(err.message);
        setLoading(false);
      }
    );

    // Live listener on the member's `combat/state` subdoc — the live membership grant
    // authorizes every co-member to read it. Hydrate the trio onto the read-only doc on
    // every snapshot (defaulting to full HP when absent).
    const unsubscribeCombat = subscribeCombatState(
      memberUid,
      characterId,
      (combat) => {
        lastCombat = combat;
        applyCombatHydration();
      },
      (err) => {
        console.error("Member combat-state subscription error", err);
      }
    );

    return () => {
      unsubscribe();
      unsubscribeCombat();
      // Reset the store so the next sheet (possibly one the viewer OWNS) starts
      // clean — and crucially resets `readonly` to false on the owner path.
      loadReadonly(null);
    };
  }, [memberUid, characterId, loadReadonly, setLoading, setError]);
}
