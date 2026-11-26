/**
 * What a reader may do with one line of the fight's live feed on the new screen (the
 * classic Combat Chronicle's rules): the DM undoes a monster's HP or condition line
 * through the engine; the author or the DM strikes a line from the record; «Chi ha
 * colpito?» is asked of the DM on any open hit and of a player only on a hit their own
 * hero took, and a player is never offered a hidden creature. The feed's undo and the
 * move's own toast undo never give the same HP back twice, in either order.
 */
import { describe, expect, it } from "vitest";

import { feedLineActions, strikerChoices } from "@/domains/combat/feed-line-actions";
import { planMonsterHp, planUndoBeats } from "@/features/campaigns/combat-lifecycle";
import { addMonster, beginEncounterTurns, startEncounter } from "@/lib/play/encounter";
import type { FeedLine } from "@/lib/session-log";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const fight = (): EncounterState => {
  let state = startEncounter({}, [], 1_000);
  state = addMonster(state, {
    ac: 13,
    count: 2,
    initiative: 12,
    maxHp: 10,
    name: "Goblin",
  });
  state = {
    ...state,
    combatants: [
      ...state.combatants.map((c) => (c.id === "monster-2" ? { ...c, hidden: true } : c)),
      { kind: "pc", id: "pc-ana", initiative: 9, conditions: [] },
      { kind: "pc", id: "pc-bo", initiative: 8, conditions: [] },
    ] as EncounterState["combatants"],
  };
  return beginEncounterTurns(state, ["monster-1"]);
};

const table = (encounter: EncounterState | null = fight()) =>
  ({
    id: "camp",
    dmUid: "dm",
    memberDetails: {},
    encounterInit: {},
    encounter,
  }) as unknown as CampaignDoc;

const hitGoblin = (state: EncounterState, amount: number) => {
  const plan = planMonsterHp(table(state), {
    uid: "dm",
    campaignId: "camp",
    monsterId: "monster-1",
    change: { kind: "damage", parts: [{ amount }] },
  });
  if (!plan?.patch.encounter) throw new Error("the hit did not land");
  return { state: plan.patch.encounter, eventIds: plan.eventIds };
};

const goblinHp = (state: EncounterState | null | undefined) => {
  const goblin = state?.combatants.find((c) => c.id === "monster-1");
  return goblin?.kind === "monster" ? goblin.hp.current : undefined;
};

const lineFor = (state: EncounterState, beatId: string, by = "dm"): FeedLine => {
  const event = { kind: "damage", target: "monster-1", amount: 3 } as FeedLine["event"];
  return { id: `enc:${state.epoch}:ev:${beatId}`, by, event, logged: event };
};

const dm = { uid: "dm", isDm: true };
const ana = { uid: "ana", isDm: false };
const bo = { uid: "bo", isDm: false };

describe("a feed line's actions", () => {
  it("the DM undoes a monster's hit; a player cannot", () => {
    const { state, eventIds } = hitGoblin(fight(), 4);
    const line = lineFor(state, eventIds[0] ?? "");
    expect(feedLineActions(line, dm, state).undo).toBe(eventIds[0]);
    expect(feedLineActions(line, ana, state).undo).toBeNull();
  });

  it("the author or the DM strikes a line; another player cannot", () => {
    const note = {
      kind: "note",
      text: "Ana ducks",
      actor: "pc-ana",
    } as FeedLine["event"];
    const line: FeedLine = { id: "n1", by: "ana", event: note, logged: note };
    const state = fight();
    expect(feedLineActions(line, ana, state).retract).toBe(true);
    expect(feedLineActions(line, dm, state).retract).toBe(true);
    expect(feedLineActions(line, bo, state).retract).toBe(false);
  });

  it("«Chi ha colpito?» is the DM's on any open hit, a player's only on their own hero", () => {
    const open = { kind: "damage", target: "pc-ana", amount: 5 } as FeedLine["event"];
    const line: FeedLine = { id: "d1", by: "dm", event: open, logged: open };
    const state = fight();
    expect(feedLineActions(line, dm, state).ask).toBe(true);
    expect(feedLineActions(line, ana, state).ask).toBe(true);
    expect(feedLineActions(line, bo, state).ask).toBe(false);
  });

  it("a player is never offered a hidden creature as the striker", () => {
    const open = { kind: "damage", target: "pc-ana", amount: 5 } as FeedLine["event"];
    const line: FeedLine = { id: "d1", by: "dm", event: open, logged: open };
    const state = fight();
    const forAna = strikerChoices(line, state, ana, null);
    expect([...forAna.primary, ...forAna.more]).not.toContain("monster-2");
    expect(forAna.primary).toContain("monster-1");
    const forDm = strikerChoices(line, state, dm, null);
    expect(forDm.primary).toContain("monster-2");
    // The target is never its own striker; its own side waits behind «Altri».
    expect([...forDm.primary, ...forDm.more]).not.toContain("pc-ana");
    expect(forDm.more).toContain("pc-bo");
  });
});

describe("the feed's undo and the toast's undo", () => {
  it("feed first, then toast: the HP comes back once", () => {
    const first = hitGoblin(fight(), 4); // 10 → 6
    const second = hitGoblin(first.state, 3); // 6 → 3
    const beat = second.eventIds[0] ?? "";
    const fed = planUndoBeats(table(second.state), {
      uid: "dm",
      campaignId: "camp",
      eventIds: [beat],
    });
    expect(goblinHp(fed?.encounter)).toBe(6);
    const toasted = planUndoBeats(table(fed?.encounter ?? null), {
      uid: "dm",
      campaignId: "camp",
      eventIds: second.eventIds,
    });
    expect(goblinHp(toasted?.encounter)).toBe(6);
  });

  it("toast first: the line has no undo left", () => {
    const first = hitGoblin(fight(), 4);
    const second = hitGoblin(first.state, 3);
    const toasted = planUndoBeats(table(second.state), {
      uid: "dm",
      campaignId: "camp",
      eventIds: second.eventIds,
    });
    const after = toasted?.encounter ?? second.state;
    expect(goblinHp(after)).toBe(6);
    const line = lineFor(after, second.eventIds[0] ?? "");
    expect(feedLineActions(line, dm, after).undo).toBeNull();
  });
});
