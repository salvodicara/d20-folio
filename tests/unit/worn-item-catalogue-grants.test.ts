/**
 * Worn / held magic items declare the static benefits their SRD text names.
 *
 * Every case comes from the English catalogue text (src/i18n/en/srd/
 * magic-items.json): a phrase that names a standing benefit an existing Grant
 * kind can carry must be matched by that grant somewhere in the item's grant
 * tree (top level, `while-active` or a `choice-grant-bundle` option). Consumables
 * (potions, scrolls) are out of scope: their benefit is a one-shot, not a worn one.
 */
import { describe, expect, it } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import type { SrdMagicItemData } from "@/data/types";
import type { Grant } from "@/lib/grants";
import { srd } from "../_harness/loc";

const CONSUMABLE_TYPES = new Set(["potion", "scroll"]);

/** Every grant in the tree, nested toggles and bundle options included. */
function allGrants(grants: ReadonlyArray<Grant> | undefined): Grant[] {
  return (grants ?? []).flatMap((g): Grant[] => [
    g,
    ...("grants" in g && Array.isArray(g.grants) ? allGrants(g.grants as Grant[]) : []),
    ...(g.type === "choice-grant-bundle"
      ? g.options.flatMap((o) => allGrants(o.grants))
      : []),
  ]);
}

const wornItems: ReadonlyArray<{
  item: SrdMagicItemData;
  text: string;
  grants: Grant[];
  // Public SRD items only: the private pack curates its own items' grants.
}> = SRD_MAGIC_ITEMS.filter(
  (item) => item.source === "SRD" && !CONSUMABLE_TYPES.has(item.type)
).map((item) => ({
  item,
  text: srd("magic-item", item.id, "description", "en"),
  grants: allGrants(item.grants),
}));

/** Items whose text matches `re`, with the match. */
function matching(re: RegExp) {
  return wornItems.flatMap((w) => {
    const m = re.exec(w.text);
    return m ? [{ ...w, m }] : [];
  });
}

const DAMAGE_LIST =
  /Resistance to ((?:[A-Z][a-z]+)(?:(?:, and |, | and )[A-Z][a-z]+)*) damage/;

describe("worn magic items declare what their text grants", () => {
  describe("'Resistance to X damage' → damage-resistance X", () => {
    const cases = matching(DAMAGE_LIST);
    it("finds the catalogue cases", () => expect(cases.length).toBeGreaterThan(5));
    for (const { item, grants, m } of cases) {
      // Every clause in the text (Ring of Elemental Command names one per plane).
      const types = [...m.input.matchAll(new RegExp(DAMAGE_LIST, "g"))]
        .flatMap((x) => (x[1] ?? "").split(/, and |, | and /))
        .map((t) => t.toLowerCase());
      it(`${item.id}: ${types.join(", ")}`, () => {
        const declared = grants.flatMap((g) =>
          g.type === "damage-resistance" ? [g.damageType as string] : []
        );
        for (const t of types) expect(declared).toContain(t);
      });
    }
  });

  describe("'attack rolls … Disadvantage against you' → incoming-attack-disadvantage", () => {
    const cases = matching(
      /[Aa]ttack rolls against you have Disadvantage|attack rolls have Disadvantage against you/
    );
    it("finds the catalogue cases", () => expect(cases.length).toBeGreaterThan(1));
    for (const { item, grants } of cases) {
      it(item.id, () => {
        expect(grants.some((g) => g.type === "incoming-attack-disadvantage")).toBe(true);
      });
      // The rail shows the line under "Adv." at rail width: a compact phrase
      // like Blur's, with the item's fine print left to its description.
      (item.grants ?? []).forEach((g, index) => {
        if (g.type !== "incoming-attack-disadvantage") return;
        it(`${item.id}: its rail line is compact`, () => {
          for (const locale of ["en", "it"] as const) {
            const line = srd(
              "magic-item",
              `${item.id}.grants.${index}`,
              "description",
              locale
            );
            expect(line.length).toBeLessThanOrEqual(64);
          }
        });
      });
    }
  });

  describe("'you know <Language>' → language", () => {
    const cases = matching(/you know ([A-Z][a-z]+)/);
    it("finds the catalogue cases", () => expect(cases.length).toBeGreaterThan(0));
    for (const { item, grants, m } of cases) {
      it(`${item.id}: ${m[1]}`, () => {
        expect(grants.some((g) => g.type === "language" && g.language === m[1])).toBe(
          true
        );
      });
    }
  });

  describe("'Advantage on <Ability> (<Skill>) checks' → advantage-on that check", () => {
    const cases = matching(
      /Advantage on (?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) \((\w+)\) checks/
    );
    it("finds the catalogue cases", () => expect(cases.length).toBeGreaterThan(5));
    for (const { item, grants, m } of cases) {
      const skill = (m[1] ?? "").toLowerCase();
      it(`${item.id}: ${skill}`, () => {
        expect(
          grants.some(
            (g) =>
              g.type === "advantage-on" &&
              g.rollType === "check" &&
              g.vs.startsWith(skill)
          )
        ).toBe(true);
      });
    }
  });

  describe("'Advantage on saves against spells' → advantage-on save vs spells", () => {
    const cases = matching(/Advantage on sav(?:es|ing throws) (?:against|vs) spells/);
    it("finds the catalogue cases", () => expect(cases.length).toBeGreaterThan(3));
    for (const { item, grants } of cases) {
      it(item.id, () => {
        expect(
          grants.some(
            (g) =>
              g.type === "advantage-on" &&
              g.rollType === "save" &&
              g.vs.startsWith("spells")
          )
        ).toBe(true);
      });
    }
  });

  describe("'can breathe underwater / in any environment' → air-and-water-breathing", () => {
    const cases = matching(/can breathe (?:underwater|normally in any environment)/);
    it("finds the catalogue cases", () => expect(cases.length).toBeGreaterThan(1));
    for (const { item, grants } of cases) {
      it(item.id, () => {
        expect(grants.some((g) => g.type === "air-and-water-breathing")).toBe(true);
      });
    }
  });

  describe("'+N bonus to spell attack rolls' → spell-attack-bonus N", () => {
    const cases = matching(/\+(\d) (?:bonus )?to spell attack(?: roll)?s/);
    it("finds the catalogue cases", () => expect(cases.length).toBeGreaterThan(1));
    for (const { item, grants, m } of cases) {
      it(`${item.id}: +${m[1]}`, () => {
        expect(
          grants.some((g) => g.type === "spell-attack-bonus" && g.amount === Number(m[1]))
        ).toBe(true);
      });
    }
  });

  describe("'Unarmed Strikes to deal XdY <Type> damage' → unarmed-strike-die", () => {
    const cases = matching(/Unarmed Strikes to deal (\d+d\d+) ([A-Z][a-z]+) damage/);
    it("finds the catalogue cases", () => expect(cases.length).toBeGreaterThan(0));
    for (const { item, grants, m } of cases) {
      it(`${item.id}: ${m[1]} ${m[2]}`, () => {
        expect(
          grants.some(
            (g) =>
              g.type === "unarmed-strike-die" &&
              g.die === m[1] &&
              g.damageType === (m[2] ?? "").toLowerCase() &&
              // An Unarmed Strike adds the Strength modifier to its damage.
              g.damageAbility === "STR"
          )
        ).toBe(true);
      });
    }
  });

  // Standing defensive benefits no numeric kind expresses (a 2d8 reduction of
  // one damage type, a +2 AC that only counts against ranged attacks) ride a
  // `defense-note` reminder line in the rail's Defenses section.
  describe("conditional defensive benefits → defense-note", () => {
    const cases = matching(
      /reduces the damage you take by|bonus to Armor Class against ranged attack rolls/
    );
    it("finds the catalogue cases", () => expect(cases.length).toBe(2));
    for (const { item, grants } of cases) {
      it(item.id, () => {
        expect(grants.some((g) => g.type === "defense-note")).toBe(true);
      });
    }
  });
});
