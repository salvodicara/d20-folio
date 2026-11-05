/**
 * A spell offered as a pick reads at a glance, like a spell row on the sheet:
 * its name, one facts line (level · school · casting time · range), the
 * Concentration and Ritual marks, and its effect: damage dice and type, the Hit
 * Points it heals, or the condition it applies. No prose: the full text is on tap.
 * The list narrows by a search and by spell level.
 */
import { describe, expect, it } from "vitest";

import { filterSpellRows, spellPickRows } from "@/domains/spells/spell-pick-rows";

const row = (id: string, locale: "it" | "en" = "it") => spellPickRows([id], locale)[0];

describe("spellPickRows", () => {
  it("Fireball: level 3, Evocation, its damage as dice and type", () => {
    expect(row("fireball")).toMatchObject({
      name: "Palla di Fuoco",
      level: 3,
      school: "Invocazione",
      concentration: false,
      effect: "8d6\u00a0Fuoco",
    });
  });

  it("Cure Wounds: the Hit Points it heals, as the sheet writes it", () => {
    expect(row("cure-wounds")?.effect).toBe("2d8\u00a0PF");
  });

  it("Charm Person: the condition it applies", () => {
    expect(row("charm-person", "en")?.effect).toBe("Charmed");
  });

  it("Alarm: a Ritual with no effect to tag, only its facts", () => {
    expect(row("alarm")).toMatchObject({ ritual: true, effect: null });
  });

  it("Bless is Concentration", () => {
    expect(row("bless", "en")?.concentration).toBe(true);
  });

  it("an unknown id is left out", () => {
    expect(spellPickRows(["no-such-spell"], "en")).toEqual([]);
  });
});

describe("filterSpellRows", () => {
  const rows = spellPickRows(["alarm", "bless", "fireball", "light"], "en");
  it("by level", () => {
    expect(filterSpellRows(rows, "", 3).map((r) => r.id)).toEqual(["fireball"]);
    expect(filterSpellRows(rows, "", null)).toHaveLength(4);
  });
  it("by name, in either language", () => {
    expect(filterSpellRows(rows, "fire", null).map((r) => r.id)).toEqual(["fireball"]);
    expect(
      filterSpellRows(spellPickRows(["fireball"], "it"), "fireball", null)
    ).toHaveLength(1);
  });
});
