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
import { render, act, cleanup, waitFor } from "@testing-library/react";
import type { CampaignDoc, EncounterState } from "@/types/campaign";
import type { LiveEncounter } from "@/features/campaigns/useLiveEncounter";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";

// The IO seam the producer's real chain calls — captured so the test drives snapshots.
const h = vi.hoisted(() => {
  const state = {
    campaignsCb: null as null | ((c: CampaignDoc[]) => void),
    live: null as LiveEncounter | null,
    /** Hand out a NEW live object on each read, as a re-rendering listener can. */
    fresh: false,
  };
  return {
    state,
    revokePersistentCombatEffectsBySource: vi.fn(() => Promise.resolve()),
    revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
    subscribeToSharedCampaigns: vi.fn((_uid: string, cb: (c: CampaignDoc[]) => void) => {
      state.campaignsCb = cb;
      return () => {};
    }),
  };
});

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  revokePersistentCombatEffectsBySource: h.revokePersistentCombatEffectsBySource,
  revokePersistentCombatEffect: h.revokePersistentCombatEffect,
  subscribeToSharedCampaigns: h.subscribeToSharedCampaigns,
}));
vi.mock("@/features/campaigns/useLiveEncounter", () => ({
  useLiveEncounter: () =>
    h.state.fresh && h.state.live ? { ...h.state.live } : h.state.live,
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => false }));

import { GlobalCombatMount } from "@/features/campaigns/global-combat";
import {
  useCombatStatusStore,
  usePinStore,
  type PipState,
} from "@/features/campaigns/global-combat-context";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import { buildEncounterView } from "@/features/campaigns/encounter-view";
import { addMonster, setHp } from "@/lib/play/encounter";
import { monsterZoneEffect } from "@/lib/zones";
import { useRepeatSaveStore } from "@/features/campaigns/repeat-save-store";
import { useZoneHitStore } from "@/features/campaigns/zone-hit-store";

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
      nextMonsterOrdinal: 1,
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
  h.state.live = null;
  h.state.fresh = false;
  h.subscribeToSharedCampaigns.mockClear();
  h.revokePersistentCombatEffectsBySource.mockClear();
  h.revokePersistentCombatEffect.mockClear();
  useCombatStatusStore.setState({ status: null, pip: null });
  usePinStore.setState({ pin: null });
  useAuthStore.setState({ user: { uid: UID } as never });
  useCharacterStore.setState({ encounterEffectProjection: null });
  useCharacterStore.getState().setCharacter(null);
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

describe("GlobalCombatMount — campaign effect projection", () => {
  function effect(id: string, targetId: string): ActiveCombatEffect {
    return {
      id,
      actor: { kind: "monster", combatantId: "caster" },
      target: {
        kind: "pc",
        combatantId: targetId,
        memberUid: UID,
        characterId: "char-1",
      },
      source: { kind: "spell", id: "heroism", actionId: "spell-heroism" },
      payload: { kind: "grant-group", activeKey: "spell-heroism" },
      duration: { kind: "encounter" },
    };
  }

  it("projects only this PC's active effects and clears them after the encounter", async () => {
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    const encounter = campaign.encounter;
    if (!encounter) throw new Error("expected encounter fixture");
    const own = effect("own", `pc-${UID}`);
    const other = effect("other", "pc-u2");
    const effectOps: CombatEffectOp[] = [
      { id: "apply-own", kind: "apply", effect: own },
      { id: "apply-other", kind: "apply", effect: other },
    ];
    encounter.effectOps = effectOps;
    encounter.order = [`pc-${UID}`];
    h.state.live = {
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
    useCharacterStore.getState().setCharacter({ ...MOCK_CHARACTER, id: "char-1" });

    mount();
    act(() => h.state.campaignsCb?.([campaign]));
    await waitFor(() =>
      expect(useCharacterStore.getState().character?.session.encounterEffects).toEqual([
        own,
      ])
    );

    act(() => h.state.campaignsCb?.([]));
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.encounterEffects
      ).toBeUndefined()
    );
  });
});

describe("GlobalCombatMount — concentration-owned persistent effects", () => {
  function setCharacterConcentration(characterId: string, sourceId: string): void {
    useCharacterStore.getState().setCharacter({
      ...MOCK_CHARACTER,
      id: characterId,
      session: {
        ...MOCK_CHARACTER.session,
        concentration: sourceId as never,
      },
    });
  }

  function activate(campaign: CampaignDoc, currentHp = 20): void {
    const encounter = campaign.encounter;
    if (!encounter) throw new Error("expected encounter fixture");
    encounter.order = [`pc-${UID}`];
    h.state.live = {
      encounter,
      view: buildEncounterView(
        encounter,
        {
          [`pc-${UID}`]: {
            name: "Hero",
            ac: 16,
            maxHp: 20,
            currentHp,
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
    act(() => h.state.campaignsCb?.([campaign]));
  }

  it("primes hydration silently, then revokes the prior source when concentration drops", async () => {
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    setCharacterConcentration("char-1", "heroism");
    mount();
    activate(campaign);
    expect(h.revokePersistentCombatEffectsBySource).not.toHaveBeenCalled();

    act(() => setCharacterConcentration("char-1", ""));
    await waitFor(() =>
      expect(h.revokePersistentCombatEffectsBySource).toHaveBeenCalledWith("c1", {
        actorId: `pc-${UID}`,
        sourceId: "heroism",
      })
    );
  });

  it("dropping Fly tells the table that a target still aloft falls; Heroism says nothing", async () => {
    const toasts = () => useToastStore.getState().toasts.map((toast) => toast.message);
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    setCharacterConcentration("char-1", "heroism");
    mount();
    activate(campaign);
    act(() => setCharacterConcentration("char-1", ""));
    await waitFor(() =>
      expect(h.revokePersistentCombatEffectsBySource).toHaveBeenCalled()
    );
    expect(toasts().some((m) => /falls/i.test(String(m)))).toBe(false);

    act(() => setCharacterConcentration("char-1", "fly"));
    act(() => setCharacterConcentration("char-1", ""));
    await waitFor(() =>
      expect(toasts().some((m) => /Fly ended.*falls/i.test(String(m)))).toBe(true)
    );
  });

  it("a new turn in the fight gives back a once-per-turn use spent in another turn", () => {
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    useCharacterStore.getState().setCharacter({
      ...MOCK_CHARACTER,
      id: "char-1",
      character: {
        ...MOCK_CHARACTER.character,
        classes: [{ classId: "rogue", level: 5 }],
        features: [{ srdId: "rogue-sneak-attack" }],
      },
      session: {
        ...MOCK_CHARACTER.session,
        trackers: { "rogue-sneak-attack": { used: 1 } },
      },
    });
    mount();
    activate(campaign);
    const used = () =>
      useCharacterStore.getState().character?.session.trackers["rogue-sneak-attack"]
        ?.used ?? 0;
    // The first look at the fight only primes: a reload is not a new turn.
    expect(used()).toBe(1);

    const live = h.state.live;
    if (!live) throw new Error("no live fight");
    h.state.live = {
      ...live,
      encounter: { ...live.encounter, currentCombatantId: "monster-1" },
    };
    act(() => h.state.campaignsCb?.([campaign]));
    expect(used()).toBe(0);
  });

  it("clears stale character concentration after an offline knockout", async () => {
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    setCharacterConcentration("char-1", "hold-person");
    mount();
    activate(campaign, 0);
    await waitFor(() =>
      expect(useCharacterStore.getState().character?.session.concentration).toBe("")
    );
  });

  // Design lane, 2026-11-13: rolling into a campaign fight dropped the roller's
  // Concentration. On the first look at a fresh fight the member's live state has not
  // arrived, so the own row reads 0 HP (and 0 max HP): that is no knockout.
  it("keeps concentration while the own row's live state has not arrived (0 HP of 0)", async () => {
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    setCharacterConcentration("char-1", "hypnotic-pattern");
    mount();
    const encounter = campaign.encounter;
    if (!encounter) throw new Error("expected encounter fixture");
    encounter.order = [`pc-${UID}`];
    h.state.live = {
      encounter,
      view: buildEncounterView(encounter, {}, false),
      myCombatState: null,
      myMaxHp: 0,
    };
    act(() => h.state.campaignsCb?.([campaign]));
    // Let every effect run, then the concentration is still held.
    await act(async () => {
      await Promise.resolve();
    });
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      "hypnotic-pattern"
    );
  });

  it("revokes the previous source, not the replacement, on a concentration swap", async () => {
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    setCharacterConcentration("char-1", "heroism");
    mount();
    activate(campaign);

    act(() => setCharacterConcentration("char-1", "bless"));
    await waitFor(() =>
      expect(h.revokePersistentCombatEffectsBySource).toHaveBeenCalledWith("c1", {
        actorId: `pc-${UID}`,
        sourceId: "heroism",
      })
    );
    expect(h.revokePersistentCombatEffectsBySource).not.toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ sourceId: "bless" })
    );
  });

  it("does not infer a drop while there is no encounter or a different character is open", async () => {
    setCharacterConcentration("other-character", "heroism");
    mount();
    act(() => h.state.campaignsCb?.([]));
    act(() => setCharacterConcentration("other-character", ""));
    expect(h.revokePersistentCombatEffectsBySource).not.toHaveBeenCalled();

    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    activate(campaign);
    act(() => setCharacterConcentration("char-1", "bless"));
    await waitFor(() =>
      expect(useCombatStatusStore.getState().status?.characterId).toBe("char-1")
    );
    expect(h.revokePersistentCombatEffectsBySource).not.toHaveBeenCalled();
  });

  it("re-primes instead of revoking across an encounter epoch change", async () => {
    const first = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    setCharacterConcentration("char-1", "heroism");
    mount();
    activate(first);

    const next = campWithEnc("c1", "char-1", 501, { [UID]: 12 }, `pc-${UID}`);
    setCharacterConcentration("char-1", "bless");
    activate(next);
    await waitFor(() => expect(useCombatStatusStore.getState().status?.round).toBe(1));
    expect(h.revokePersistentCombatEffectsBySource).not.toHaveBeenCalled();
  });
});

describe("GlobalCombatMount — the incapacitation sweep", () => {
  const grapple = (actor: string): CombatEffectOp => ({
    id: `op-${actor}-grab`,
    kind: "apply",
    effect: {
      id: `${actor}-grab`,
      actor:
        actor === `pc-${UID}`
          ? { kind: "pc", combatantId: actor, memberUid: UID, characterId: "char-1" }
          : { kind: "monster", combatantId: actor },
      target: { kind: "monster", combatantId: "monster-9" },
      source: { kind: "feature", id: "grapple", actionId: "base-grapple" },
      payload: { kind: "condition", conditionId: "grappled" },
      duration: { kind: "encounter" },
    },
  });
  const pcLive = (currentHp: number) => ({
    [`pc-${UID}`]: {
      name: "Hero",
      ac: 16,
      maxHp: 20,
      currentHp,
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
  });
  function show(
    campaign: CampaignDoc,
    encounter: EncounterState,
    hp: number,
    dm: boolean
  ) {
    h.state.live = {
      encounter,
      view: buildEncounterView(encounter, pcLive(hp), dm),
      myCombatState: null,
      myMaxHp: 20,
    };
    act(() => h.state.campaignsCb?.([{ ...campaign, encounter }]));
  }

  it("my PC falling to 0 ends the grapple it holds; the first look only primes", () => {
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    const encounter = {
      ...(campaign.encounter as EncounterState),
      effectOps: [grapple(`pc-${UID}`)],
    };
    mount();
    show(campaign, encounter, 20, false);
    expect(h.revokePersistentCombatEffect).not.toHaveBeenCalled();
    show(campaign, encounter, 0, false);
    expect(h.revokePersistentCombatEffect).toHaveBeenCalledWith("c1", `pc-${UID}-grab`);
  });

  it("my Hex's target dropping to 0 tells me the curse can move", () => {
    const toasts = () =>
      useToastStore.getState().toasts.map((toast) => String(toast.message));
    useCharacterStore.getState().setCharacter({
      ...MOCK_CHARACTER,
      id: "char-1",
      character: {
        ...MOCK_CHARACTER.character,
        spells: [...MOCK_CHARACTER.character.spells, { srdId: "hex", prepared: true }],
      },
      session: {
        ...MOCK_CHARACTER.session,
        activeFeatures: [...(MOCK_CHARACTER.session.activeFeatures ?? []), "spell-hex"],
      },
    });
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    const withGoblin = addMonster(campaign.encounter as EncounterState, {
      name: "Goblin",
      ac: 15,
      maxHp: 7,
      count: 1,
      initiative: 10,
    });
    const hex: CombatEffectOp = {
      id: "op-hex",
      kind: "apply",
      effect: {
        id: "hex-1",
        actor: {
          kind: "pc",
          combatantId: `pc-${UID}`,
          memberUid: UID,
          characterId: "char-1",
        },
        target: { kind: "monster", combatantId: "monster-1" },
        source: { kind: "spell", id: "hex", actionId: "spell-hex" },
        payload: { kind: "target-mark", activeKey: "spell-hex", scope: "cursed" },
        duration: { kind: "encounter" },
      },
    };
    const encounter = { ...withGoblin, effectOps: [hex] };
    mount();
    show(campaign, encounter, 20, false);
    expect(toasts().some((m) => /Hex: its target dropped/.test(m))).toBe(false);
    show(campaign, setHp(encounter, "monster-1", 0), 20, false);
    expect(toasts().some((m) => /Hex: its target dropped/.test(m))).toBe(true);
  });

  it("the DM's device ends Abjure Foes' Frightened when the monster takes damage", () => {
    const base = campWithEnc("c1", "char-1", 500, {}, "monster-1");
    const campaign: CampaignDoc = {
      ...base,
      dmUid: UID,
      members: [UID],
      memberDetails: { [UID]: { displayName: "GM", characterId: null, role: "dm" } },
    };
    const empty = { ...(campaign.encounter as EncounterState), combatants: [] };
    const withGoblin = addMonster(empty, {
      name: "Goblin",
      ac: 15,
      maxHp: 7,
      count: 1,
      initiative: 10,
    });
    const fear: CombatEffectOp = {
      id: "op-fear",
      kind: "apply",
      effect: {
        id: "fear-1",
        actor: {
          kind: "pc",
          combatantId: "pc-paladin",
          memberUid: "p",
          characterId: "c9",
        },
        target: { kind: "monster", combatantId: "monster-1" },
        source: { kind: "feature", id: "paladin-abjure-foes", actionId: "abjure" },
        payload: { kind: "condition", conditionId: "frightened" },
        duration: { kind: "encounter" },
      },
    };
    const encounter = { ...withGoblin, effectOps: [fear] };
    mount();
    show(campaign, encounter, 20, true);
    expect(h.revokePersistentCombatEffect).not.toHaveBeenCalled();
    show(campaign, setHp(encounter, "monster-1", 4), 20, true);
    expect(h.revokePersistentCombatEffect).toHaveBeenCalledWith("c1", "fear-1");
  });

  it("my Spirit Guardians asks whether the creature that ended its turn is inside", () => {
    useZoneHitStore.setState({ hits: [] });
    useCharacterStore.getState().setCharacter({ ...MOCK_CHARACTER, id: "char-1" });
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, "monster-1");
    const withGoblin = addMonster(campaign.encounter as EncounterState, {
      name: "Goblin",
      ac: 15,
      maxHp: 7,
      count: 1,
      initiative: 10,
    });
    const zone: CombatEffectOp = {
      id: "op-zone",
      kind: "apply",
      effect: {
        id: "zone-1",
        actor: {
          kind: "pc",
          combatantId: `pc-${UID}`,
          memberUid: UID,
          characterId: "char-1",
        },
        target: {
          kind: "pc",
          combatantId: `pc-${UID}`,
          memberUid: UID,
          characterId: "char-1",
        },
        source: { kind: "spell", id: "spirit-guardians", actionId: "cast", castLevel: 3 },
        payload: { kind: "zone", spellId: "spirit-guardians", spared: [`pc-${UID}`] },
        duration: { kind: "encounter" },
      },
    };
    const encounter = {
      ...withGoblin,
      currentCombatantId: "monster-1",
      effectOps: [zone],
    };
    mount();
    show(campaign, encounter, 20, false);
    expect(useZoneHitStore.getState().hits).toEqual([]);
    show(campaign, { ...encounter, currentCombatantId: `pc-${UID}` }, 20, false);
    // The question waits under the zone on Play (PlayZoneHits).
    expect(useZoneHitStore.getState().hits).toMatchObject([
      {
        key: "zone-1:monster-1:end-turn",
        creatureId: "monster-1",
        creatureName: "Goblin",
        kind: "end-turn",
      },
    ]);
  });

  it("a monster's Spirit Guardians asks on the DM's device, sparing its allies", () => {
    useZoneHitStore.setState({ hits: [] });
    const base = campWithEnc("c1", "char-1", 500, {}, "monster-1");
    const campaign: CampaignDoc = {
      ...base,
      dmUid: UID,
      members: [UID],
      memberDetails: { [UID]: { displayName: "GM", characterId: null, role: "dm" } },
    };
    let encounter: EncounterState = {
      ...(campaign.encounter as EncounterState),
      combatants: [],
    };
    for (const name of ["Cultist", "Goblin"]) {
      encounter = addMonster(encounter, {
        name,
        ac: 12,
        maxHp: 9,
        count: 1,
        initiative: 10,
      });
    }
    const zone: CombatEffectOp = {
      id: "op-zone",
      kind: "apply",
      effect: monsterZoneEffect({
        effectId: "zone-m",
        monsterId: "monster-1",
        spellId: "spirit-guardians",
        castLevel: 3,
        saveDc: 13,
        spared: ["monster-1", "monster-2"],
      }),
    };
    const fight = { ...encounter, currentCombatantId: "monster-1", effectOps: [zone] };
    mount();
    show(campaign, fight, 20, true);
    show(campaign, { ...fight, currentCombatantId: "monster-2" }, 20, true);
    // Its allies are spared: no question for the Cultist's turn ending.
    expect(useZoneHitStore.getState().hits).toEqual([]);
    const withPc = {
      ...fight,
      effectOps: [
        {
          ...zone,
          effect: {
            ...zone.effect,
            payload: {
              kind: "zone" as const,
              spellId: "spirit-guardians",
              spared: ["monster-1"],
            },
          },
        },
      ],
    };
    useZoneHitStore.setState({ hits: [] });
    cleanup();
    mount();
    show(campaign, { ...withPc, currentCombatantId: "monster-2" }, 20, true);
    show(campaign, { ...withPc, currentCombatantId: "monster-1" }, 20, true);
    expect(useZoneHitStore.getState().hits).toMatchObject([
      {
        creatureId: "monster-2",
        kind: "end-turn",
        zone: { casterId: "monster-1", saveDc: 13 },
      },
    ]);
  });

  it("Hold Person's repeat save waits on the DM's card when the Goblin's turn ends", () => {
    useRepeatSaveStore.setState({ saves: [] });
    const base = campWithEnc("c1", "char-1", 500, {}, "monster-1");
    const campaign: CampaignDoc = {
      ...base,
      dmUid: UID,
      members: [UID],
      memberDetails: { [UID]: { displayName: "GM", characterId: null, role: "dm" } },
    };
    const empty = { ...(campaign.encounter as EncounterState), combatants: [] };
    const withGoblin = addMonster(empty, {
      name: "Goblin",
      ac: 15,
      maxHp: 7,
      count: 1,
      initiative: 10,
    });
    const held: CombatEffectOp = {
      id: "op-hold",
      kind: "apply",
      effect: {
        id: "hold-1",
        actor: { kind: "pc", combatantId: "pc-bard", memberUid: "p", characterId: "c9" },
        target: { kind: "monster", combatantId: "monster-1" },
        source: { kind: "spell", id: "hold-person", actionId: "spell-hold-person" },
        payload: { kind: "condition", conditionId: "paralyzed" },
        duration: { kind: "encounter" },
      },
    };
    const goblinsTurn = {
      ...withGoblin,
      effectOps: [held],
      currentCombatantId: "monster-1",
    };
    mount();
    show(campaign, goblinsTurn, 20, true);
    expect(useRepeatSaveStore.getState().saves).toEqual([]);
    show(campaign, { ...goblinsTurn, currentCombatantId: "pc-bard" }, 20, true);
    expect(useRepeatSaveStore.getState().saves).toMatchObject([
      {
        id: "hold-1",
        campaignId: "c1",
        conditionId: "paralyzed",
        targetId: "monster-1",
        targetName: "Goblin",
        ability: "WIS",
      },
    ]);
    // The Goblin's next turn starts: the save no longer waits.
    show(campaign, goblinsTurn, 20, true);
    expect(useRepeatSaveStore.getState().saves).toEqual([]);
  });

  it("the DM's device ends a monster's grapple when the monster drops", () => {
    const base = campWithEnc("c1", "char-1", 500, {}, "monster-1");
    // The viewer runs the table: no PC of theirs in this fight.
    const campaign: CampaignDoc = {
      ...base,
      dmUid: UID,
      members: [UID],
      memberDetails: { [UID]: { displayName: "GM", characterId: null, role: "dm" } },
    };
    const empty = { ...(campaign.encounter as EncounterState), combatants: [] };
    const withGoblin = addMonster(empty, {
      name: "Goblin",
      ac: 15,
      maxHp: 7,
      count: 1,
      initiative: 10,
    });
    const encounter = { ...withGoblin, effectOps: [grapple("monster-1")] };
    mount();
    show(campaign, encounter, 20, true);
    expect(h.revokePersistentCombatEffect).not.toHaveBeenCalled();
    show(campaign, setHp(encounter, "monster-1", 0), 20, true);
    expect(h.revokePersistentCombatEffect).toHaveBeenCalledWith("c1", "monster-1-grab");
  });
});

describe("GlobalCombatMount settles in a fight (P0, 2026-11-04)", () => {
  // #682 subscribed the shell listener to the WHOLE open character; its own effects
  // write the character (the encounter effects it projects), so every write re-rendered
  // it and wrote again: «Maximum update depth exceeded», on every sheet, in every fight.
  it("projecting the fight's effects onto the open character does not loop", async () => {
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    const encounter = campaign.encounter;
    if (!encounter) throw new Error("expected encounter fixture");
    encounter.order = [`pc-${UID}`];
    h.state.fresh = true;
    h.state.live = {
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
    useCharacterStore.getState().setCharacter({ ...MOCK_CHARACTER, id: "char-1" });
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args[0]);
    });
    let writes = 0;
    const count = useCharacterStore.subscribe(() => {
      writes += 1;
    });
    try {
      mount();
      act(() => h.state.campaignsCb?.([campaign]));
      await waitFor(() => expect(useCombatStatusStore.getState().status).not.toBeNull());
    } finally {
      count();
      spy.mockRestore();
    }
    expect(errors.filter((e) => String(e).includes("Maximum update depth"))).toEqual([]);
    expect(writes).toBeLessThan(20);
  });
});

describe("GlobalCombatMount — the campaign's table rules", () => {
  it("projects a varying table's rules onto the attached open character, and none for RAW", () => {
    useCharacterStore.getState().setCharacter({ ...MOCK_CHARACTER, id: "char-1" });
    mount();
    const campaign = campWithEnc("c1", "char-1", 500);
    act(() =>
      h.state.campaignsCb?.([
        { ...campaign, tableRules: { potions: { drink: "action" } } },
      ])
    );
    expect(
      useCharacterStore.getState().character?.session.tableRules?.potions.drink
    ).toBe("action");
    act(() => h.state.campaignsCb?.([campaign]));
    expect(useCharacterStore.getState().character?.session).not.toHaveProperty(
      "tableRules"
    );
  });
});

describe("GlobalCombatMount — a sheet opened by URL (deep link)", () => {
  it("reads the attached campaign by subscription, never from the hub's store", () => {
    useCampaignStore.setState({ campaign: null });
    useCharacterStore.getState().setCharacter({ ...MOCK_CHARACTER, id: "char-1" });
    mount();
    const campaign = campWithEnc("c1", "char-1", 500);
    act(() =>
      h.state.campaignsCb?.([
        { ...campaign, tableRules: { potions: { drink: "action" } } },
      ])
    );
    expect(useCampaignStore.getState().campaign).toBeNull();
    expect(
      useCharacterStore.getState().character?.session.tableRules?.potions.drink
    ).toBe("action");
    expect(useCombatStatusStore.getState().pip).not.toBeNull();
  });
});

describe("GlobalCombatMount — ammunition after the fight", () => {
  const withArrows = (spent: number) => ({
    ...MOCK_CHARACTER,
    id: "char-1",
    character: {
      ...MOCK_CHARACTER.character,
      equipment: [{ srdId: "arrows", quantity: 4 }],
    },
    session: { ...MOCK_CHARACTER.session, ammoSpent: { arrows: spent } },
  });
  /** A fight my PC is in, live on this device. */
  const inFight = () => {
    const campaign = campWithEnc("c1", "char-1", 500, { [UID]: 12 }, `pc-${UID}`);
    const encounter = campaign.encounter;
    if (!encounter) throw new Error("expected encounter fixture");
    h.state.live = {
      encounter,
      view: buildEncounterView(encounter, {}, false),
      myCombatState: null,
      myMaxHp: 20,
    };
    return campaign;
  };
  const ammoOffer = () =>
    useToastStore.getState().toasts.find((toast) => toast.action?.label === "Recover");
  const arrows = () =>
    useCharacterStore
      .getState()
      .character?.character.equipment.find(
        (ref) => !("custom" in ref) && ref.srdId === "arrows"
      );

  it("the end of my fight offers half the spent ammunition back, once", () => {
    useToastStore.setState({ toasts: [] });
    useCharacterStore.getState().setCharacter(withArrows(7));
    mount();
    act(() => h.state.campaignsCb?.([inFight()]));
    expect(ammoOffer()).toBeUndefined();
    act(() => h.state.campaignsCb?.([]));
    const offer = ammoOffer();
    expect(offer?.message).toBe(
      "The fight is over: searching the field for a minute recovers 3 pieces of ammunition."
    );
    act(() => offer?.action?.run());
    expect(arrows()?.quantity).toBe(7);
    expect(useCharacterStore.getState().character?.session).not.toHaveProperty(
      "ammoSpent"
    );
  });

  it("says nothing when no piece would come back", () => {
    useToastStore.setState({ toasts: [] });
    useCharacterStore.getState().setCharacter(withArrows(1));
    mount();
    act(() => h.state.campaignsCb?.([inFight()]));
    act(() => h.state.campaignsCb?.([]));
    expect(ammoOffer()).toBeUndefined();
  });
});
