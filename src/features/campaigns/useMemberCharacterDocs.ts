/**
 * useMemberCharacterDocs — load EVERY attached party member's full character doc
 * into local component state, for the Party section's at-rest dashboard. This is
 * NOT a rarely-opened DM tool: EVERY member mounts it whenever the campaign hub is
 * open (the live campaign-membership grant authorizes the peer read), so it's
 * one of the hub's most-visited surfaces.
 *
 * Why not {@link useMemberCharacterSubscription}: that hook drives the SINGLE-slot
 * shared `useCharacterStore` (`loadReadonly` overwrites one `character`), so
 * mounting it once per PC would make each instance clobber the others — only the
 * last wins. The dashboard needs N docs at once, so it reads each into a LOCAL
 * `Record<uid, DocState>` here instead, leaving the shared store untouched (the
 * full-sheet path still routes through it via `MemberSheetView`).
 *
 * Read cost / staleness tradeoff (free-tier posture, constitution §2.9): a single
 * ONE-SHOT `getFullCharacter` per member on mount / (uid, characterId)-change —
 * deliberately NOT a standing snapshot listener per member, which across a party of
 * M members would multiply into M×(M-1) live listeners, all re-firing on every
 * teammate's routine auto-save. The cost of that is judged higher than the cost of
 * staleness here, so this hook is intentionally NOT live: everything sourced from
 * it (AC, max HP, passives, senses) is a SNAPSHOT frozen at fetch time and goes
 * stale if a teammate edits their sheet while you keep the section mounted. Only
 * the combat trio (HP/conditions/initiative) is genuinely live, via the separate
 * `combat/state` subdoc listener ({@link "@/features/campaigns/usePartyCombatStates"})
 * merged in by `derivePcLive` — Party.tsx's header comment describing the WHOLE
 * card as "LIVE" overstates this for the non-trio fields. The live membership grant
 * authorizes each read; an absent/denied doc resolves to `{ status: "error" }` (the
 * card falls back to the snapshot, never a stuck spinner). Under dev-bypass it
 * resolves through the SAME fixture/scenario seam {@link useMemberCharacterSubscription}
 * uses (no Firestore).
 */

import { useEffect, useState } from "react";
import { getFullCharacter } from "@/lib/firestore";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { MOCK_CHARACTER } from "@/lib/mock";
import { isDevFixtureId, loadDevFixture } from "@/lib/dev-fixtures";
import { isDevScenarioRouteId } from "@/lib/dev-scenario-id";
import type { CharacterDoc } from "@/types/character";

/** One member's attached character to resolve (uid + the attached character id). */
export interface MemberCharacterRef {
  uid: string;
  characterId: string;
}

/** The per-member load state, keyed by member uid in the returned record. */
export type MemberDocState =
  | { status: "loading" }
  | { status: "ready"; doc: CharacterDoc }
  | { status: "error" };

/** Resolve one member's full doc under dev-bypass through the fixture/scenario seam.
 *  Shared with {@link "@/features/campaigns/usePartyCombatStates"} (whose live combat
 *  listener no-ops under bypass) so both party reads resolve the SAME dev doc. */
export async function resolveDevDoc(characterId: string): Promise<CharacterDoc> {
  if (isDevFixtureId(characterId)) {
    const doc = await loadDevFixture(characterId);
    return doc ?? { ...MOCK_CHARACTER, id: characterId };
  }
  if (isDevScenarioRouteId(characterId)) {
    const { buildDevScenario } = await import("@/lib/dev-scenarios");
    return buildDevScenario(characterId) ?? { ...MOCK_CHARACTER, id: characterId };
  }
  return { ...MOCK_CHARACTER, id: characterId };
}

/**
 * Load the given members' full character docs into a `Record<uid, MemberDocState>`.
 * Re-runs only when the set of `uid:characterId` pairs changes (serialized key), so
 * stat edits inside the resolved docs don't refetch. Stale resolutions after an
 * unmount / ref change are dropped (the `cancelled` guard).
 */
export function useMemberCharacterDocs(
  members: ReadonlyArray<MemberCharacterRef>
): Record<string, MemberDocState> {
  // Resolved load outcomes keyed by the (uid, characterId) PAIR — so a member who
  // swaps their attached character gets a fresh entry (no stale doc). Only the async
  // settle writes here; the loading state is DERIVED below (never a synchronous
  // setState in the effect — `react-hooks/set-state-in-effect`).
  const [resolved, setResolved] = useState<Record<string, MemberDocState>>({});
  // Stable dependency: the ordered (uid, characterId) pairs, JSON-serialized. A new
  // member, a swapped character, or a removed member changes this; a re-render with
  // the same roster does not. The effect reconstructs the refs from this string, so
  // it depends ONLY on the string (no unstable `members` array in the deps).
  const key = JSON.stringify(members.map((m) => [m.uid, m.characterId]));

  useEffect(() => {
    let cancelled = false;
    const current: MemberCharacterRef[] = (JSON.parse(key) as [string, string][]).map(
      ([uid, characterId]) => ({ uid, characterId })
    );
    for (const { uid, characterId } of current) {
      const pair = pairKey(uid, characterId);
      const settle = (state: MemberDocState): void => {
        if (!cancelled) setResolved((prev) => ({ ...prev, [pair]: state }));
      };
      const load = DEV_BYPASS_AUTH
        ? resolveDevDoc(characterId)
        : getFullCharacter(uid, characterId);
      load
        .then((doc) => settle(doc ? { status: "ready", doc } : { status: "error" }))
        .catch(() => settle({ status: "error" }));
    }

    return () => {
      cancelled = true;
    };
  }, [key]);

  // Derive the per-member record: each current member maps to its resolved outcome
  // or `loading` until its one-shot settles (no flash, no stale entry for a member
  // who has left the roster — those keys are simply not read).
  const out: Record<string, MemberDocState> = {};
  for (const m of members) {
    out[m.uid] = resolved[pairKey(m.uid, m.characterId)] ?? { status: "loading" };
  }
  return out;
}

/** A collision-free composite key for the (uid, characterId) pair. */
function pairKey(uid: string, characterId: string): string {
  return `${uid}/${characterId}`;
}
