import { describe, expect, it } from "vitest";

import {
  combatEventToPlayEvent,
  createCharacterLogMirror,
  createMemorySessionLogStore,
  createSessionRecorder,
} from "@/lib/session-log";
import type { CombatEvent } from "@/types/combat-log";
import type { LogEntry } from "@/types/character";
import type { ConcentrationRef } from "@/types/ids";

const ME = "pc-ana";
const entry = (id: string, ts: number, event: CombatEvent): LogEntry => ({
  id,
  ts,
  event,
});

describe("combatEventToPlayEvent", () => {
  it("records what the sheet knows, with the character as actor or target", () => {
    expect(
      combatEventToPlayEvent({ kind: "hp-damage", amount: 14, current: 6, max: 20 }, ME)
    ).toEqual({
      kind: "damage",
      amount: 14,
      target: ME,
    });
    expect(
      combatEventToPlayEvent(
        {
          kind: "action-use",
          action: { custom: "Longsword" },
          effect: "attack",
          slot: "action",
        },
        ME
      )
    ).toEqual({
      kind: "action",
      actor: ME,
      source: { custom: "Longsword" },
      slot: "action",
    });
    expect(
      combatEventToPlayEvent(
        {
          kind: "reaction-use",
          action: { custom: "Hellish Rebuke" },
          effect: "damage",
          targets: ["monster-1"],
        },
        ME
      )
    ).toEqual({
      kind: "action",
      actor: ME,
      source: { custom: "Hellish Rebuke" },
      slot: "reaction",
      targets: ["monster-1"],
    });
    expect(
      combatEventToPlayEvent(
        { kind: "concentration-start", spell: "bless" as ConcentrationRef },
        ME
      )
    ).toEqual({ kind: "concentration", spell: "bless", started: true, actor: ME });
    expect(combatEventToPlayEvent({ kind: "rest", restKind: "short" }, ME)).toEqual({
      kind: "rest",
      rest: "short",
      actor: ME,
    });
  });

  it("a follow-up line on another creature records target, amount, actor and source", () => {
    const source = { custom: "Cure Wounds" };
    expect(
      combatEventToPlayEvent(
        {
          kind: "effect-given",
          effect: "heal",
          target: "pc-aria",
          targetName: "Aria",
          amount: 8,
          source,
        },
        ME
      )
    ).toEqual({
      kind: "heal",
      amount: 8,
      target: "pc-aria",
      actor: ME,
      source,
      provenance: "manual",
    });
    expect(
      combatEventToPlayEvent(
        {
          kind: "effect-given",
          effect: "damage",
          target: "monster-1",
          targetName: "Goblin",
          amount: 9,
          source,
        },
        ME
      )
    ).toMatchObject({ kind: "damage", amount: 9, target: "monster-1", actor: ME });
    expect(
      combatEventToPlayEvent(
        {
          kind: "effect-given",
          effect: "temp-hp",
          target: "pc-aria",
          targetName: "Aria",
          amount: 5,
        },
        ME
      )
    ).toMatchObject({ kind: "temp-hp", amount: 5, target: "pc-aria", actor: ME });
    expect(
      combatEventToPlayEvent(
        {
          kind: "effect-given",
          effect: "condition",
          target: "monster-1",
          targetName: "Goblin",
          conditionId: "paralyzed",
          source,
        },
        ME
      )
    ).toEqual({
      kind: "condition",
      conditionId: "paralyzed",
      gained: true,
      target: "monster-1",
      source,
    });
  });

  it("a follow-up line on myself keeps the sheet line and adds actor and source", () => {
    const source = { custom: "Cure Wounds" };
    expect(
      combatEventToPlayEvent(
        { kind: "hp-heal", amount: 8, current: 18, max: 20, source },
        ME
      )
    ).toEqual({
      kind: "heal",
      amount: 8,
      target: ME,
      actor: ME,
      source,
      provenance: "manual",
    });
    expect(
      combatEventToPlayEvent({ kind: "condition-gain", conditionId: "prone", source }, ME)
    ).toEqual({
      kind: "condition",
      conditionId: "prone",
      gained: true,
      target: ME,
      source,
    });
  });

  it("records an effect running out as the end of a status", () => {
    expect(
      combatEventToPlayEvent({ kind: "effect-expired", sourceId: "rage" }, ME)
    ).toEqual({
      kind: "status",
      sourceId: "rage",
      started: false,
      actor: ME,
    });
  });

  it("skips what the session already knows or cannot express", () => {
    expect(combatEventToPlayEvent({ kind: "turn-end", round: 2 }, ME)).toBeNull();
    expect(combatEventToPlayEvent({ kind: "legacy", text: "old line" }, ME)).toBeNull();
  });
});

describe("createCharacterLogMirror", () => {
  it("records new sheet lines once and retracts an undone one", async () => {
    const store = createMemorySessionLogStore();
    const now = () => new Date(2026, 9, 8, 20, 0);
    const recorder = createSessionRecorder({ store, uid: "ana", now });
    const mirror = createCharacterLogMirror({ recorder, characterId: "c1", actor: ME });
    const hit = entry("h", 5, { kind: "hp-damage", amount: 14, current: 6, max: 20 });
    const turn = entry("t", 6, { kind: "turn-end", round: 2 });

    await mirror.added(hit);
    await mirror.added(turn);
    await mirror.removed("t");
    await mirror.removed("h");
    await mirror.removed("h");

    expect(store.items("2026-10-08").map((i) => [i.type, i.id])).toEqual([
      ["event", "pc:c1:h"],
      ["retract", "pc:c1:h:x"],
    ]);
  });

  it("records a completed detail as a correction of the recorded line", async () => {
    const store = createMemorySessionLogStore();
    const now = () => new Date(2026, 9, 8, 20, 0);
    const recorder = createSessionRecorder({ store, uid: "ana", now });
    const mirror = createCharacterLogMirror({ recorder, characterId: "c1", actor: ME });
    const cast = entry("b", 5, {
      kind: "action-use",
      action: { custom: "Bless" },
      effect: "spell-cast",
      slot: "action",
    });
    await mirror.added(cast);
    await mirror.corrected({
      ...cast,
      event: { ...cast.event, targets: ["pc-bo"] } as CombatEvent,
    });
    await mirror.corrected(entry("never", 6, { kind: "rest", restKind: "short" }));
    const items = store.items("2026-10-08");
    expect(items.map((i) => i.type)).toEqual(["event", "correct"]);
    expect(items[1]).toMatchObject({ target: "pc:c1:b", event: { targets: ["pc-bo"] } });
  });
});
