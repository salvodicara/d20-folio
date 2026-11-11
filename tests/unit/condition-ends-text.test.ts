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
  it.each(["hypnotic-pattern", "modify-memory", "sequester"])("%s", (id) => {
    expect(text(id)).toMatch(/takes (any )?damage/i);
    expect(endsOf(id)).toEqual([{ on: "target-damaged" }]);
  });
});

describe("conditions that end when the caster's side deals damage", () => {
  it.each(["charm-person", "charm-monster", "animal-friendship", "suggestion"])(
    "%s",
    (id) => {
      expect(text(id)).toMatch(
        /(you or (one of )?your allies (deals? damage|damage it))/i
      );
      expect(endsOf(id)).toEqual([{ on: "target-damaged", by: "actor-side" }]);
    }
  );
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
  it.each([["contagion", /until it gets three successes or failures/i]] as const)(
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

describe("a save track that settles into a condition", () => {
  it("flesh-to-stone: three failures turn the target to stone (Petrified)", () => {
    expect(text("flesh-to-stone")).toMatch(
      /keep track of both until the target collects three of a kind/i
    );
    expect(text("flesh-to-stone")).toMatch(
      /fails its saves three times, it is turned to stone and has the petrified condition/i
    );
    expect(endsOf("flesh-to-stone")).toEqual([
      {
        on: "repeat-save",
        ability: "CON",
        at: "target-turn-end",
        track: { successes: 3, failures: 3, settlesInto: "petrified" },
      },
    ]);
  });
});

describe("Sleep (2024): Incapacitated, then Unconscious on a second failed save", () => {
  it("one repeat at the end of its next turn settles it; damage ends it", () => {
    expect(text("sleep")).toMatch(
      /have the Incapacitated condition until the end of its next turn/i
    );
    expect(text("sleep")).toMatch(
      /fails the second save, the target has the Unconscious condition/i
    );
    expect(getSpellById("sleep")?.conditionApplication?.options).toEqual([
      "incapacitated",
    ]);
    expect(endsOf("sleep")).toEqual([
      { on: "target-damaged" },
      {
        on: "repeat-save",
        ability: "WIS",
        at: "target-turn-end",
        track: { successes: 1, failures: 1, settlesInto: "unconscious" },
      },
    ]);
  });
});

describe("Suggestion (2024): Charmed until the caster's side deals damage", () => {
  it("applies Charmed on a failed save", () => {
    expect(getSpellById("suggestion")?.conditionApplication).toMatchObject({
      options: ["charmed"],
      on: "failed-save",
    });
  });
});
