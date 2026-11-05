/**
 * The campaign clock: one truth per scope. A character in a campaign reads its time of
 * day and its countdowns from the campaign's clock through `clockFor`; a solo sheet
 * keeps its own. Countdowns are derived on read (`docAtClock`): the stored timer minus
 * the campaign minutes since the sheet last caught up (`clockSeen`), so any viewer sees
 * Mage Armor expired right after the DM moves the clock, before its owner opens the
 * sheet. Cases: Mage Armor (8 hours), Bane (Concentration, up to 1 minute).
 */
import { describe, expect, it } from "vitest";
import {
  advanceCampaignClock,
  clockFor,
  conformCampaignClock,
  docAtClock,
  MAX_CLOCK_STEP,
  setCampaignTimeOfDay,
  stepBackCampaignClock,
  withCampaignClock,
} from "@/lib/play/campaign-clock";
import { setActiveState } from "@/lib/play/states";
import { passTime } from "@/lib/play/time";
import { deriveStatuses } from "@/lib/status";
import type { CharacterDoc, CustomEquipment, SessionState } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

function wizard(session: Partial<SessionState> = {}): CharacterDoc {
  return makeCharacterDoc(
    {
      classes: [{ classId: "wizard", level: 9 }],
      spells: [{ srdId: "mage-armor", prepared: true }],
      spellSlots: [{ level: 1, total: 4 }],
    },
    { hp: { current: 40, temp: 0 }, ...session }
  );
}

function armored(session: Partial<SessionState> = {}): CharacterDoc {
  const doc = wizard(session);
  const lit = setActiveState(doc, "spell-mage-armor", true, 0);
  if (!lit) throw new Error("Mage Armor did not light");
  return { ...doc, session: lit };
}

const lit = (doc: CharacterDoc) =>
  deriveStatuses(doc).some((status) => status.key === "spell-mage-armor");

describe("clockFor: which clock a character reads", () => {
  it("a solo sheet reads its own time of day, with nothing elapsed", () => {
    expect(clockFor(wizard({ timeOfDay: 600 }))).toEqual({
      scope: "sheet",
      timeOfDay: 600,
      elapsedMinutes: 0,
    });
  });

  it("a campaign character reads the campaign's time, not its sheet's", () => {
    const doc = withCampaignClock(wizard({ timeOfDay: 600, clockSeen: 100 }), {
      campaignId: "c1",
      clock: { minute: 160, timeOfDay: 1200 },
    });
    expect(clockFor(doc)).toEqual({
      scope: "campaign",
      campaignId: "c1",
      minute: 160,
      timeOfDay: 1200,
      elapsedMinutes: 60,
    });
  });

  it("a campaign with no time of day set has none, whatever the sheet says", () => {
    const doc = withCampaignClock(wizard({ timeOfDay: 600 }), {
      campaignId: "c1",
      clock: { minute: 0 },
    });
    expect(clockFor(doc).timeOfDay).toBeUndefined();
  });

  it("a sheet that never caught up has nothing elapsed (it adopts the campaign minute)", () => {
    const doc = withCampaignClock(armored(), {
      campaignId: "c1",
      clock: { minute: 5_000 },
    });
    expect(clockFor(doc).elapsedMinutes).toBe(0);
    expect(lit(docAtClock(doc))).toBe(true);
  });
});

describe("docAtClock: countdowns derived on read", () => {
  it("the DM advances 9 hours: a viewer sees Mage Armor expired before its owner opens the sheet", () => {
    const stored = armored({ clockSeen: 0 });
    const clock = advanceCampaignClock({ minute: 0 }, 540, "dm-uid");
    if (!clock) throw new Error("the clock did not advance");
    const viewed = docAtClock(withCampaignClock(stored, { campaignId: "c1", clock }));
    expect(lit(stored)).toBe(true);
    expect(lit(viewed)).toBe(false);
    expect(viewed.session.clockSeen).toBe(540);
  });

  it("7 hours later Mage Armor is still on, with an hour left", () => {
    const viewed = docAtClock(
      withCampaignClock(armored({ clockSeen: 0 }), {
        campaignId: "c1",
        clock: { minute: 420 },
      })
    );
    expect(lit(viewed)).toBe(true);
    expect(viewed.session.effectTimers?.["spell-mage-armor"]?.roundsLeft).toBe(600);
  });

  it("a solo sheet is read as stored", () => {
    const doc = armored({ clockSeen: 0 });
    expect(docAtClock(doc)).toBe(doc);
  });
});

describe("dawn on the campaign clock", () => {
  const rod: CustomEquipment = {
    custom: true,
    name: "Dawn Rod",
    quantity: 1,
    equipped: true,
    instanceId: customInstanceId("Dawn Rod"),
    charges: { current: 0, max: 7, recovery: "dawn" },
  };
  const holding = (session: Partial<SessionState>): CharacterDoc => {
    const base = wizard(session);
    return { ...base, character: { ...base.character, equipment: [rod] } };
  };
  const charges = (doc: CharacterDoc) => {
    const item = doc.character.equipment[0];
    return item && "custom" in item ? item.charges?.current : undefined;
  };

  it("the minutes caught up count from the time the sheet last saw: 05:00 to 07:00 crosses dawn", () => {
    const doc = withCampaignClock(holding({ clockSeen: 0 }), {
      campaignId: "c1",
      clock: { minute: 120, timeOfDay: 7 * 60 },
    });
    expect(charges(docAtClock(doc))).toBe(7);
  });

  it("07:00 to 09:00 crosses none", () => {
    const doc = withCampaignClock(holding({ clockSeen: 0 }), {
      campaignId: "c1",
      clock: { minute: 120, timeOfDay: 9 * 60 },
    });
    expect(charges(docAtClock(doc))).toBe(0);
  });

  it("a campaign character's time pass reads the campaign's time, not its sheet's", () => {
    const doc = withCampaignClock(holding({ timeOfDay: 22 * 60, clockSeen: 0 }), {
      campaignId: "c1",
      clock: { minute: 0, timeOfDay: 8 * 60 },
    });
    expect(charges(passTime(doc, 60) ?? doc)).toBe(0);
    expect(passTime(doc, 60)?.session.timeOfDay ?? 22 * 60).toBe(22 * 60);
  });
});

describe("the campaign clock's writes", () => {
  it("steps forward and records who stepped, by how much", () => {
    expect(advanceCampaignClock({ minute: 100, timeOfDay: 1430 }, 60, "u1")).toEqual({
      minute: 160,
      timeOfDay: 50,
      last: { by: "u1", minutes: 60 },
    });
    expect(advanceCampaignClock(undefined, 480, "u1")).toEqual({
      minute: 480,
      last: { by: "u1", minutes: 480 },
    });
  });

  it("never steps back, by nothing, or by more than a long rest's day", () => {
    expect(MAX_CLOCK_STEP).toBe(1440);
    expect(advanceCampaignClock({ minute: 100 }, 0, "u1")).toBeNull();
    expect(advanceCampaignClock({ minute: 100 }, -10, "u1")).toBeNull();
    expect(advanceCampaignClock({ minute: 100 }, 1441, "u1")).toBeNull();
    expect(advanceCampaignClock({ minute: 100 }, 1440, "u1")?.minute).toBe(1540);
  });

  it("an undo steps back the last step, by its writer or the DM only", () => {
    const clock = { minute: 160, timeOfDay: 50, last: { by: "u1", minutes: 60 } };
    expect(stepBackCampaignClock(clock, "u1", false)).toEqual({
      minute: 100,
      timeOfDay: 1430,
    });
    expect(stepBackCampaignClock(clock, "dm", true)).toEqual({
      minute: 100,
      timeOfDay: 1430,
    });
    expect(stepBackCampaignClock(clock, "u2", false)).toBeNull();
    expect(stepBackCampaignClock({ minute: 100 }, "u1", false)).toBeNull();
  });
});

describe("the table sets the time of day", () => {
  it("moves the time, not the minute or the last step", () => {
    const clock = { minute: 160, timeOfDay: 50, last: { by: "u1", minutes: 60 } };
    expect(setCampaignTimeOfDay(clock, 600)).toEqual({ ...clock, timeOfDay: 600 });
    expect(setCampaignTimeOfDay(undefined, 600)).toEqual({ minute: 0, timeOfDay: 600 });
    expect(setCampaignTimeOfDay(clock, 50)).toBeNull();
    expect(setCampaignTimeOfDay(clock, 1440)).toBeNull();
  });
});

describe("the stored clock at the campaign's read boundary", () => {
  it("keeps a well-formed clock and drops what is malformed", () => {
    expect(
      conformCampaignClock({
        minute: 90,
        timeOfDay: 600,
        last: { by: "u1", minutes: 30 },
      })
    ).toEqual({ minute: 90, timeOfDay: 600, last: { by: "u1", minutes: 30 } });
    expect(
      conformCampaignClock({ minute: 90, timeOfDay: 1440, last: { by: "" } })
    ).toEqual({ minute: 90 });
    expect(conformCampaignClock({ minute: -1 })).toBeUndefined();
    expect(conformCampaignClock("noon")).toBeUndefined();
  });
});
