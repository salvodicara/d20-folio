/**
 * The campaign clock's writers, driven through the screens' own entry points: «Passa
 * il tempo» (`passTimeWithUndo`) and the rests (`useRestCommit`). A campaign character
 * steps the campaign's clock and marks the minute its sheet caught up to; the undo
 * takes the step back. A solo sheet moves its own clock and writes nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  stepCampaignClock: vi.fn(() => Promise.resolve(null)),
  undoCampaignClockStep: vi.fn(() => Promise.resolve(null)),
  setCampaignClockTime: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/features/campaigns/clock-io", () => io);

import {
  atCampaignClock,
  projectedClock,
} from "@/features/campaigns/campaign-clock-projection";
import {
  catchUpCampaignClock,
  clockCatchUpTarget,
  longestTimePass,
  passTimeWithUndo,
} from "@/features/character/pass-time";
import { withCampaignClock } from "@/lib/play/campaign-clock";
import { setActiveState } from "@/lib/play/states";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc, SessionState } from "@/types/character";
import { conc } from "./__helpers__/concentration";
import { makeCharacterDoc } from "./_helpers";

const store = () => useCharacterStore.getState();

beforeEach(() => {
  vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
  vi.clearAllMocks();
  useUndoStore.setState({ characterId: null, past: [], future: [] });
  useAuthStore.setState({ user: { uid: "u1" } as never });
});
afterEach(() => vi.unstubAllEnvs());

describe("«Passa il tempo» on a campaign character", () => {
  it("steps the campaign clock, marks the sheet caught up, and the undo steps back", async () => {
    store().setCharacter(
      withCampaignClock(makeCharacterDoc({}, { clockSeen: 100 }), {
        campaignId: "c1",
        clock: { minute: 100, timeOfDay: 600 },
      })
    );
    passTimeWithUndo(60, "1 hour passes");
    await Promise.resolve();
    expect(io.stepCampaignClock).toHaveBeenCalledWith("c1", 60, "u1");
    expect(store().character?.session.clockSeen).toBe(160);
    expect(store().character?.session.timeOfDay).toBeUndefined();

    expect(useUndoStore.getState().undo()).toBe(true);
    expect(io.undoCampaignClockStep).toHaveBeenCalledWith("c1", "u1", false);
    expect(store().character?.session.clockSeen).toBe(100);
  });

  it("the time the table says it is goes on the campaign, before the step", async () => {
    store().setCharacter(
      withCampaignClock(makeCharacterDoc({}, { clockSeen: 0 }), {
        campaignId: "c1",
        clock: { minute: 0 },
      })
    );
    passTimeWithUndo(60, "1 hour passes", 22 * 60);
    await vi.waitFor(() => expect(io.stepCampaignClock).toHaveBeenCalled());
    expect(io.setCampaignClockTime).toHaveBeenCalledWith("c1", 22 * 60);
    expect(store().character?.session.timeOfDay).toBeUndefined();
  });

  it("more than a day in one step is refused on a campaign, not on a solo sheet", () => {
    const campaignDoc = withCampaignClock(makeCharacterDoc({}, { clockSeen: 0 }), {
      campaignId: "c1",
      clock: { minute: 0 },
    });
    store().setCharacter(campaignDoc);
    expect(longestTimePass(campaignDoc)).toBe(1440);
    passTimeWithUndo(1441, "a day and a minute pass");
    expect(io.stepCampaignClock).not.toHaveBeenCalled();
    expect(store().character?.session.clockSeen).toBe(0);
    expect(longestTimePass(makeCharacterDoc({}))).toBe(Number.POSITIVE_INFINITY);
  });

  it("a solo sheet moves its own clock and writes no campaign", () => {
    store().setCharacter(makeCharacterDoc({}, { timeOfDay: 600 }));
    passTimeWithUndo(60, "1 hour passes");
    expect(io.stepCampaignClock).not.toHaveBeenCalled();
    expect(store().character?.session.timeOfDay).toBe(660);
  });
});

describe("the owner's sheet catches up to the campaign clock", () => {
  function armored(session: Partial<SessionState>): CharacterDoc {
    const doc = makeCharacterDoc(
      {
        classes: [{ classId: "wizard", level: 9 }],
        spells: [
          { srdId: "mage-armor", prepared: true },
          { srdId: "bane", prepared: true },
        ],
        spellSlots: [{ level: 1, total: 4 }],
      },
      session
    );
    const lit = setActiveState(doc, "spell-mage-armor", true, 0);
    if (!lit) throw new Error("Mage Armor did not light");
    return { ...doc, session: lit };
  }
  const at = (doc: CharacterDoc, minute: number) =>
    withCampaignClock(doc, { campaignId: "c1", clock: { minute } });

  it("after the DM's 9 hours the stored sheet loses Mage Armor and logs the stretch", () => {
    store().setCharacter(at(armored({ clockSeen: 0 }), 540));
    expect(clockCatchUpTarget(store())).toBe(540);
    catchUpCampaignClock();
    const doc = store().character;
    expect(doc?.session.activeFeatures ?? []).not.toContain("spell-mage-armor");
    expect(doc?.session.clockSeen).toBe(540);
    expect(clockCatchUpTarget(store())).toBeNull();
    expect(doc?.session.logEntries.at(-1)?.event).toMatchObject({
      kind: "time-passes",
      minutes: 540,
    });
  });

  it("a held Concentration that ran out ends through the store teardown", () => {
    store().setCharacter(at(armored({ clockSeen: 0, concentration: conc("bane") }), 10));
    catchUpCampaignClock();
    expect(store().character?.session.concentration).toBe("");
  });

  it("a sheet that never caught up adopts the minute, losing nothing", () => {
    store().setCharacter(at(armored({}), 5_000));
    expect(clockCatchUpTarget(store())).toBe(5_000);
    catchUpCampaignClock();
    expect(store().character?.session.activeFeatures).toContain("spell-mage-armor");
    expect(store().character?.session.clockSeen).toBe(5_000);
  });

  it("a read-only view stores nothing", () => {
    store().loadReadonly(at(armored({ clockSeen: 0 }), 540));
    expect(clockCatchUpTarget(store())).toBeNull();
    catchUpCampaignClock();
    expect(store().character?.session.clockSeen).toBe(0);
  });
});

describe("a viewer who isn't the owner reads the sheet at the campaign clock", () => {
  const stored = () => {
    const doc = makeCharacterDoc(
      {
        classes: [{ classId: "wizard", level: 9 }],
        spells: [{ srdId: "mage-armor", prepared: true }],
        spellSlots: [{ level: 1, total: 4 }],
      },
      { clockSeen: 0 }
    );
    const lit = setActiveState(doc, "spell-mage-armor", true, 0);
    if (!lit) throw new Error("Mage Armor did not light");
    return { ...doc, session: lit };
  };
  const nineHoursOn = { id: "c1", gameClock: { minute: 540 } };

  it("the DM's read-only sheet shows Mage Armor over 9 hours on, before its owner opens it", () => {
    const doc = stored();
    store().loadReadonly(doc);
    store().setCampaignClock(doc.id, projectedClock(nineHoursOn));
    expect(store().character?.session.activeFeatures ?? []).not.toContain(
      "spell-mage-armor"
    );
  });

  it("the party's docs are read at the clock too", () => {
    const read = atCampaignClock(stored(), nineHoursOn);
    expect(read.session.activeFeatures ?? []).not.toContain("spell-mage-armor");
    expect(
      atCampaignClock(stored(), { id: "c1", gameClock: { minute: 420 } }).session
        .activeFeatures
    ).toContain("spell-mage-armor");
  });

  it("without this release's rules nothing is projected", () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "false");
    expect(projectedClock(nineHoursOn)).toBeNull();
    expect(atCampaignClock(stored(), nineHoursOn).session.activeFeatures).toContain(
      "spell-mage-armor"
    );
  });
});
