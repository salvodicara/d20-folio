/**
 * A table that varies Exhaustion (edge-case M16): the penalty per level on D20 Tests
 * and on Speed comes from its rules, everywhere the sheet derives them, never a mix
 * of RAW and table numbers.
 */
import { describe, expect, it } from "vitest";
import { composeTurnLimiters } from "@/lib/views/combat-action-view";
import { deriveCharacter } from "@/lib/views/derive-character";
import { effectiveTableRules } from "@/lib/table-rules";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const soft = effectiveTableRules({
  tableRules: { exhaustion: { d20PerLevel: -1, speedFtPerLevel: -10 } },
});

function tired(rules?: typeof soft): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "fighter", level: 5 });
  return {
    ...doc,
    session: { ...doc.session, exhaustion: 2, ...(rules ? { tableRules: rules } : {}) },
  };
}

describe("Exhaustion by the table's rules", () => {
  it("every D20 Test and the Speed follow them", () => {
    const fresh = deriveCharacter(makeCharacterDoc({ classId: "fighter", level: 5 }));
    const raw = deriveCharacter(tired());
    const table = deriveCharacter(tired(soft));
    // RAW: −2 per level → −4; the table: −1 per level → −2.
    expect(fresh.initiativeBonus - raw.initiativeBonus).toBe(4);
    expect(fresh.initiativeBonus - table.initiativeBonus).toBe(2);
    const str = (sheet: typeof fresh) =>
      sheet.saves.find((save) => save.ability === "STR")?.bonus ?? NaN;
    expect(str(fresh) - str(raw)).toBe(4);
    expect(str(fresh) - str(table)).toBe(2);
    // RAW: −5 ft per level → −10; the table: −10 ft per level → −20.
    expect(fresh.walkingSpeedFt - raw.walkingSpeedFt).toBe(10);
    expect(fresh.walkingSpeedFt - table.walkingSpeedFt).toBe(20);
  });

  it("the turn banner names the table's numbers", () => {
    const [limiter] = composeTurnLimiters({
      conditions: [],
      facts: {},
      attackRollState: "none",
      exhaustion: { level: 2, rules: soft },
    }).filter((l) => l.kind === "exhaustion");
    expect(limiter).toMatchObject({ level: 2, d20Penalty: 2, speedPenaltyFt: 20 });
  });
});

describe("death at the table's maximum", () => {
  it("a 4-level table: the track stops at 4, which is death", async () => {
    const { setExhaustion } = await import("@/lib/play/vitals");
    const { diedOfExhaustion } = await import("@/lib/character-status");
    const short = effectiveTableRules({ tableRules: { exhaustion: { maxLevel: 4 } } });
    const doc = makeCharacterDoc({ classId: "fighter", level: 5 });
    const ruled = {
      ...doc,
      session: { ...doc.session, exhaustion: 3, tableRules: short },
    };
    const next = setExhaustion(ruled, 5);
    expect(next?.exhaustion).toBe(4);
    expect(next && diedOfExhaustion(next)).toBe(true);
    expect(diedOfExhaustion({ exhaustion: 4 })).toBe(false);
  });

  it("a track longer than 6 is not accepted yet (the stored world knows 0–6)", async () => {
    const { conformTableRules } = await import("@/lib/table-rules");
    expect(conformTableRules({ exhaustion: { maxLevel: 10 } })).toEqual({});
    expect(conformTableRules({ exhaustion: { maxLevel: 5 } })).toEqual({
      exhaustion: { maxLevel: 5 },
    });
  });
});
