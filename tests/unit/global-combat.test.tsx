/**
 * GlobalCombatMount — the pip PRODUCER wiring, end-to-end. This mounts the REAL producer
 * and drives its ONE Firestore IO seam (`subscribeToSharedCampaigns`), so the whole chain
 * runs for real — `viewerActiveEncounters` (which derives each entry's roll-state off the
 * campaign doc's `encounterInit` table, the initiative SSOT) → `buildPipModel`.
 *
 * There are NO per-encounter subdoc listeners anymore (the deleted `useViewerRollStates`):
 * "has the viewer rolled?" is a PURE derivation from the same cheap shared-campaigns
 * snapshot, so a fresh fight reds in the SAME tick the doc arrives (no loading window, no
 * fresh-vs-reload heuristic), a reload into a rolled fight is quiet in the same tick, and
 * two fights can never bleed states (each row reads its own doc's table).
 *
 * `useLiveEncounter` is mocked to `null`: it feeds only the primary's view (the roller's
 * bonus display), never the pip's `needs-roll` state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import type { CampaignDoc } from "@/types/campaign";

// The IO seam the producer's real chain calls — captured so the test drives snapshots.
const h = vi.hoisted(() => {
  const state = {
    campaignsCb: null as null | ((c: CampaignDoc[]) => void),
  };
  return {
    state,
    subscribeToSharedCampaigns: vi.fn((_uid: string, cb: (c: CampaignDoc[]) => void) => {
      state.campaignsCb = cb;
      return () => {};
    }),
  };
});

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  subscribeToSharedCampaigns: h.subscribeToSharedCampaigns,
}));
vi.mock("@/features/campaigns/useLiveEncounter", () => ({
  useLiveEncounter: () => null,
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => false }));

import { GlobalCombatMount } from "@/features/campaigns/global-combat";
import {
  useCombatStatusStore,
  usePinStore,
  type PipState,
} from "@/features/campaigns/global-combat-context";
import { useAuthStore } from "@/stores/authStore";

const UID = "u1";

/** A campaign with `uid` as a PC in a GATHERING encounter (or a custom pointer). The
 *  viewer's roll (or its absence) rides the doc's `encounterInit` table — the SSOT. */
function campWithEnc(
  id: string,
  charId: string,
  epoch: number,
  encounterInit: Record<string, number> = {},
  currentCombatantId: string | null = null
): CampaignDoc {
  const at = new Date(0);
  return {
    id,
    name: `Camp ${id}`,
    createdAt: at,
    updatedAt: at,
    createdBy: "dm-other",
    dmUid: "dm-other",
    members: ["dm-other", UID],
    memberDetails: {
      "dm-other": { displayName: "GM", characterId: null, role: "dm" },
      // No `character` snapshot needed — the PC (and its id) comes off the encounter
      // combatant; the pip STATE never depends on the denormalized hero name.
      [UID]: { displayName: "You", characterId: charId, role: "player" },
    },
    status: "active",
    inviteCode: id,
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
    encounter: {
      round: 1,
      currentCombatantId,
      epoch,
      status: "active",
      combatants: [{ kind: "pc", id: `pc-${UID}`, memberUid: UID, characterId: charId }],
    },
    encounterInit,
  };
}

/** The primary entry's current PipState from the published model (or null). */
function primaryState(): PipState | null {
  const { pip } = useCombatStatusStore.getState();
  if (!pip) return null;
  return pip.entries.find((e) => e.campaignId === pip.primaryId)?.state ?? null;
}
function stateOf(cid: string): PipState | null {
  return (
    useCombatStatusStore.getState().pip?.entries.find((e) => e.campaignId === cid)
      ?.state ?? null
  );
}

/** Record EVERY published primary state so we can assert what the viewer would SEE over the
 *  whole sequence (no intermediate flash), not just the settled value. */
let published: (PipState | null)[] = [];
let unsub: (() => void) | null = null;

beforeEach(() => {
  h.state.campaignsCb = null;
  h.subscribeToSharedCampaigns.mockClear();
  useCombatStatusStore.setState({ status: null, pip: null });
  usePinStore.setState({ pin: null });
  useAuthStore.setState({ user: { uid: UID } as never });
  published = [];
  unsub = useCombatStatusStore.subscribe((s) => {
    published.push(
      s.pip
        ? (s.pip.entries.find((e) => e.campaignId === s.pip?.primaryId)?.state ?? null)
        : null
    );
  });
});

afterEach(() => {
  unsub?.();
  cleanup();
});

function mount() {
  render(<GlobalCombatMount />);
}

describe("GlobalCombatMount — pip roll-state producer wiring (encounterInit-derived)", () => {
  it("(i) a FRESH fight (empty encounterInit) reds in the SAME tick the doc arrives — no wait, no flash", () => {
    mount();
    act(() => h.state.campaignsCb?.([campWithEnc("c1", "char-1", 500, {})]));
    expect(primaryState()).toBe("needs-roll");
    // The viewer never saw a quiet-gathering frame before the red (no loading window).
    expect(published.filter((s) => s !== null)).toEqual(
      published.filter((s) => s === "needs-roll")
    );
  });

  it("(ii) a RELOAD into an already-rolled gathering is QUIET in the same tick — never a false red", () => {
    mount();
    act(() => h.state.campaignsCb?.([campWithEnc("c1", "char-1", 500, { [UID]: 12 })]));
    expect(primaryState()).toBe("gathering");
    expect(published).not.toContain("needs-roll");
  });

  it("(iii) TWO fights — each row reads its OWN doc's table; a pin switch never bleeds", () => {
    mount();
    act(() =>
      h.state.campaignsCb?.([
        campWithEnc("c1", "char-1", 100, {}), // owes a roll
        campWithEnc("c2", "char-2", 200, { [UID]: 12 }), // already rolled
      ])
    );
    // Primary = most recent (c2, rolled → quiet); the secondary keeps its OWN red.
    expect(stateOf("c2")).toBe("gathering");
    expect(stateOf("c1")).toBe("needs-roll");
    // Pin the other fight — the states MUST NOT swap or bleed.
    act(() => usePinStore.setState({ pin: "c1" }));
    expect(stateOf("c1")).toBe("needs-roll");
    expect(stateOf("c2")).toBe("gathering");
  });

  it("(iv) rolling lands in the doc → the SAME snapshot flips the red to quiet", () => {
    mount();
    act(() => h.state.campaignsCb?.([campWithEnc("c1", "char-1", 500, {})]));
    expect(primaryState()).toBe("needs-roll");
    // The write echoes (latency-compensated locally, or the server snapshot): the table
    // now carries the roll — the pip flips quiet with no other source involved.
    act(() => h.state.campaignsCb?.([campWithEnc("c1", "char-1", 500, { [UID]: 15 })]));
    expect(primaryState()).toBe("gathering");
  });
});
