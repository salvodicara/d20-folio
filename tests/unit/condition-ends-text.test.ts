/**
 * When a spell's condition ends early, from each spell's own SRD 5.2.1 text:
 * "At the end of each of its turns, the target repeats the save, ending the spell on
 * itself on a success" (Hold Person) → a repeat save at the end of the target's turn;
 * "The spell ends on a target if it takes damage" (Sleep) → it ends on damage. The
 * fight reads `conditionApplication.ends` (repeat-save prompts, damage ends).
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import en from "@/i18n/en/srd/spells.json";

const text = (id: string) =>
  (en as Record<string, { description?: string }>)[id]?.description ?? "";
const endsOf = (id: string) => getSpellById(id)?.conditionApplication?.ends;

describe("conditions that repeat a save at the end of the target's turns", () => {
  it.each([
    ["hold-person", "WIS"],
    ["hold-monster", "WIS"],
    ["blindness-deafness", "CON"],
    ["tashas-hideous-laughter", "WIS"],
    ["power-word-stun", "CON"],
    ["sunburst", "CON"],
    ["weird", "WIS"],
  ] as const)("%s: %s at the end of each of its turns", (id, ability) => {
    expect(text(id)).toMatch(/at the end of each of its turns/i);
    expect(endsOf(id)).toEqual([{ on: "repeat-save", ability, at: "target-turn-end" }]);
  });
});

describe("conditions that end when the target takes damage", () => {
  it.each(["sleep", "hypnotic-pattern", "modify-memory", "sequester"])("%s", (id) => {
    expect(text(id)).toMatch(/takes (any )?damage/i);
    expect(endsOf(id)).toEqual([{ on: "target-damaged" }]);
  });
});
