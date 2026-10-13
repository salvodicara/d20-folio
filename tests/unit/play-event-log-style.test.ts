/** A session line wears the same row style as the sheet's own line for the same fact. */
import { describe, expect, it } from "vitest";
import { eventLogStyle, playEventLogStyle } from "@/lib/views/combat-log-view";
import type { CombatEvent } from "@/types/combat-log";

const sheet = (event: Partial<CombatEvent> & { kind: CombatEvent["kind"] }) =>
  eventLogStyle(event as CombatEvent);

describe("playEventLogStyle", () => {
  it("damage, heal and temp HP match the sheet rows", () => {
    expect(playEventLogStyle({ kind: "damage", amount: 5 })).toEqual(
      sheet({ kind: "hp-damage" })
    );
    expect(playEventLogStyle({ kind: "heal", amount: 5 })).toEqual(
      sheet({ kind: "hp-heal" })
    );
    expect(playEventLogStyle({ kind: "temp-hp", amount: 5 })).toEqual(
      sheet({ kind: "temp-hp-gain" })
    );
  });

  it("a gained or lost condition matches the sheet rows", () => {
    expect(
      playEventLogStyle({ kind: "condition", conditionId: "prone", gained: true })
    ).toEqual(sheet({ kind: "condition-gain" }));
    expect(
      playEventLogStyle({ kind: "condition", conditionId: "prone", gained: false })
    ).toEqual(sheet({ kind: "condition-loss" }));
  });

  it("an action takes its slot's colour, as the sheet's action row does", () => {
    const bonus = playEventLogStyle({ kind: "action", slot: "bonus" });
    const reaction = playEventLogStyle({ kind: "action", slot: "reaction" });
    expect(bonus.borderColor).toBe(
      sheet({ kind: "action-use", effect: "generic", slot: "bonus" } as never).borderColor
    );
    expect(reaction.borderColor).toBe(
      sheet({ kind: "action-use", effect: "generic", slot: "reaction" } as never)
        .borderColor
    );
    expect(bonus.borderColor).not.toBe(reaction.borderColor);
  });

  it("death saves and rests match the sheet rows", () => {
    expect(playEventLogStyle({ kind: "death-save", outcome: "failure" })).toEqual(
      sheet({ kind: "death-save" })
    );
    expect(playEventLogStyle({ kind: "rest", rest: "long" })).toEqual(
      sheet({ kind: "rest" })
    );
  });
});
