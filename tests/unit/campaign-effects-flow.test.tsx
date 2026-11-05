/**
 * The campaign's effects out of a fight, through the real shell listener
 * (`GlobalCombatMount`) with its IO seams captured: a buff another member left on my
 * character projects onto my open sheet while the campaign clock is before its end;
 * my Concentration ending out of a fight ends what it held there, and its undo brings
 * the same effects back; a fight's end moves what I left that outlasts it to the
 * campaign, with the same identity.
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveEncounter } from "@/features/campaigns/useLiveEncounter";
import type { CampaignEffectDoc } from "@/lib/play/campaign-effects";
import type { CampaignDoc } from "@/types/campaign";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";

const h = vi.hoisted(() => ({
  campaignsCb: null as null | ((c: CampaignDoc[]) => void),
  effectsCb: null as null | ((docs: CampaignEffectDoc[]) => void),
  live: null as LiveEncounter | null,
  writeCampaignEffects: vi.fn(() => Promise.resolve()),
  setCampaignEffectsEnded: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  revokePersistentCombatEffectsBySource: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  subscribeToSharedCampaigns: vi.fn((_uid: string, cb: (c: CampaignDoc[]) => void) => {
    h.campaignsCb = cb;
    return () => {};
  }),
}));
vi.mock("@/features/campaigns/campaign-effects-io", () => ({
  subscribeCampaignEffects: vi.fn(
    (_id: string, cb: (docs: CampaignEffectDoc[]) => void) => {
      h.effectsCb = cb;
      return () => {};
    }
  ),
  writeCampaignEffects: h.writeCampaignEffects,
  setCampaignEffectsEnded: h.setCampaignEffectsEnded,
}));
vi.mock("@/features/campaigns/useLiveEncounter", () => ({
  useLiveEncounter: () => h.live,
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => false }));

import { GlobalCombatMount } from "@/features/campaigns/global-combat";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { buildEncounterView } from "@/features/campaigns/encounter-view";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";

const UID = "u1";
const me: CombatantRef = {
  kind: "pc",
  combatantId: `pc-${UID}`,
  memberUid: UID,
  characterId: "char-1",
};
const bren: CombatantRef = {
  kind: "pc",
  combatantId: "pc-u2",
  memberUid: "u2",
  characterId: "char-2",
};

function campaign(minute: number, withFight = false): CampaignDoc {
  const at = new Date(0);
  return {
    id: "c1",
    name: "Camp",
    createdAt: at,
    updatedAt: at,
    createdBy: "dm",
    dmUid: "dm",
    members: ["dm", UID, "u2"],
    memberDetails: {
      dm: { displayName: "GM", characterId: null, role: "dm" },
      [UID]: { displayName: "You", characterId: "char-1", role: "player" },
      u2: { displayName: "Bren", characterId: "char-2", role: "player" },
    },
    status: "active",
    inviteCode: "c1",
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
    gameClock: { minute },
    ...(withFight
      ? {
          encounter: {
            nextMonsterOrdinal: 1,
            round: 3,
            currentCombatantId: `pc-${UID}`,
            epoch: 7,
            status: "active" as const,
            order: [`pc-${UID}`],
            combatants: [
              {
                kind: "pc" as const,
                id: `pc-${UID}`,
                memberUid: UID,
                characterId: "char-1",
              },
            ],
          },
          encounterInit: { [UID]: 12 },
        }
      : {}),
  };
}

function armor(
  id: string,
  actor: CombatantRef,
  target: CombatantRef,
  duration: ActiveCombatEffect["duration"]
): ActiveCombatEffect {
  return {
    id,
    actor,
    target,
    source: { kind: "spell", id: "mage-armor", actionId: "spell-mage-armor" },
    payload: { kind: "grant-group", activeKey: "spell-mage-armor" },
    duration,
  };
}

function open(concentration = "") {
  useCharacterStore.getState().setCharacter({
    ...MOCK_CHARACTER,
    id: "char-1",
    session: { ...MOCK_CHARACTER.session, concentration: concentration as never },
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
  h.campaignsCb = null;
  h.effectsCb = null;
  h.live = null;
  h.writeCampaignEffects.mockClear();
  h.setCampaignEffectsEnded.mockClear();
  useCombatStatusStore.setState({ status: null, pip: null });
  useAuthStore.setState({ user: { uid: UID } as never });
  useCharacterStore.setState({ encounterEffectProjection: null });
  useCharacterStore.getState().setCharacter(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("a buff left on my character out of a fight", () => {
  it("projects onto my sheet while the campaign clock is before its end", async () => {
    open();
    render(<GlobalCombatMount />);
    act(() => h.campaignsCb?.([campaign(100)]));
    const fromBren = armor("a1", bren, me, { kind: "game-clock", untilMinute: 480 });
    act(() => h.effectsCb?.([fromBren]));
    await waitFor(() =>
      expect(useCharacterStore.getState().character?.session.encounterEffects).toEqual([
        fromBren,
      ])
    );
    act(() => h.campaignsCb?.([campaign(480)]));
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.encounterEffects
      ).toBeUndefined()
    );
  });
});

describe("my Concentration out of a fight", () => {
  it("ending it ends what it held on the campaign; its undo brings the same effects back", async () => {
    open("bless");
    render(<GlobalCombatMount />);
    act(() => h.campaignsCb?.([campaign(0)]));
    act(() =>
      h.effectsCb?.([
        armor("b1", me, bren, {
          kind: "game-clock",
          untilMinute: 1,
          concentration: { actorId: `pc-${UID}`, sourceId: "bless" },
        }),
      ])
    );
    act(() => open(""));
    await waitFor(() =>
      expect(h.setCampaignEffectsEnded).toHaveBeenCalledWith(
        "c1",
        ["b1"],
        "concentration"
      )
    );
    act(() => open("bless"));
    await waitFor(() =>
      expect(h.setCampaignEffectsEnded).toHaveBeenCalledWith("c1", ["b1"], null)
    );
  });
});

describe("a fight's end", () => {
  it("moves what I left that outlasts it to the campaign, with the same identity", async () => {
    open();
    const fight = campaign(100, true);
    const encounter = fight.encounter;
    if (!encounter) throw new Error("expected a fight");
    const left = armor("m1", me, bren, {
      kind: "turn-boundary",
      combatantId: `pc-${UID}`,
      round: 4801,
      phase: "turn-end",
    });
    encounter.effectOps = [{ id: "op-m1", kind: "apply", effect: left }];
    h.live = {
      encounter,
      view: buildEncounterView(
        encounter,
        {
          [`pc-${UID}`]: {
            name: "Hero",
            ac: 16,
            maxHp: 20,
            currentHp: 20,
            tempHp: 0,
            conditions: [],
            initiative: 12,
            initiativeBonus: 2,
            initiativeRoll: 10,
            raceId: undefined,
            classes: undefined,
            portraitUrl: null,
            portraitCrop: null,
          },
        },
        false
      ),
      myCombatState: null,
      myMaxHp: 20,
    };
    render(<GlobalCombatMount />);
    act(() => h.campaignsCb?.([fight]));
    await waitFor(() => expect(useCombatStatusStore.getState().status).not.toBeNull());
    h.live = null;
    act(() => h.campaignsCb?.([campaign(100)]));
    await waitFor(() =>
      expect(h.writeCampaignEffects).toHaveBeenCalledWith("c1", [
        { ...left, duration: { kind: "game-clock", untilMinute: 100 + 479 } },
      ])
    );
  });
});
