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

describe("conditions that end when the caster's side deals damage", () => {
  it.each(["charm-person", "charm-monster", "animal-friendship"])("%s", (id) => {
    expect(text(id)).toMatch(/(you or (one of )?your allies (deals? damage|damage it))/i);
    expect(endsOf(id)).toEqual([{ on: "target-damaged", by: "actor-side" }]);
  });
});

describe("repeat saves outside the end of the target's turn", () => {
  it.each(["dominate-beast", "dominate-person", "dominate-monster"])(
    "%s: WIS whenever the target takes damage",
    (id) => {
      expect(text(id)).toMatch(/whenever the target takes damage, it repeats the save/i);
      expect(endsOf(id)).toEqual([
        { on: "repeat-save", ability: "WIS", at: "target-damaged" },
      ]);
    }
  );

  it("tashas-hideous-laughter: WIS at its turn end, and on damage with Advantage", () => {
    expect(text("tashas-hideous-laughter")).toMatch(
      /at the end of each of its turns and each time it takes damage/i
    );
    expect(text("tashas-hideous-laughter")).toMatch(
      /advantage on the save if .* damage/i
    );
    expect(endsOf("tashas-hideous-laughter")).toEqual([
      { on: "repeat-save", ability: "WIS", at: "target-turn-end" },
      { on: "repeat-save", ability: "WIS", at: "target-damaged", advantage: true },
    ]);
  });

  it("conjure-elemental: DEX at the start of each of the target's turns", () => {
    expect(text("conjure-elemental")).toMatch(
      /at the start of each of its turns, the restrained target repeats the save/i
    );
    expect(endsOf("conjure-elemental")).toEqual([
      { on: "repeat-save", ability: "DEX", at: "target-turn-start" },
    ]);
  });

  it("ottos-irresistible-dance: WIS when the target spends its action", () => {
    expect(text("ottos-irresistible-dance")).toMatch(
      /can take an action to collect itself and repeat the save/i
    );
    expect(endsOf("ottos-irresistible-dance")).toEqual([
      { on: "repeat-save", ability: "WIS", at: "target-action" },
    ]);
  });

  it("fear: WIS at its turn end, only out of the caster's sight", () => {
    expect(text("fear")).toMatch(
      /ends its turn in a space where it doesn't have line of sight to you/i
    );
    expect(endsOf("fear")).toEqual([
      {
        on: "repeat-save",
        ability: "WIS",
        at: "target-turn-end",
        when: "out-of-actor-sight",
      },
    ]);
  });
});

describe("three-of-a-kind save tracks", () => {
  it.each([
    ["contagion", /until it gets three successes or failures/i],
    ["flesh-to-stone", /keep track of both until the target collects three of a kind/i],
  ] as const)(
    "%s: CON at the end of its turns, three successes or three failures",
    (id, raw) => {
      expect(text(id)).toMatch(raw);
      expect(endsOf(id)).toEqual([
        {
          on: "repeat-save",
          ability: "CON",
          at: "target-turn-end",
          track: { successes: 3, failures: 3 },
        },
      ]);
    }
  );
});
