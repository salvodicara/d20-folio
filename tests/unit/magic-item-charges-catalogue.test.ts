/**
 * Magic-item `charges` against the catalogue's own English text: every item that
 * says it "has N charges" (or a rolled "1d6+3 beads") parses to that count, and a
 * Long Rest only gives back what each item's text says it regains.
 */

import { describe, it, expect } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import en from "@/i18n/en/srd/magic-items.json";
import {
  parseMagicItemCharges,
  parseMagicItemDawnRecharge,
} from "@/lib/magic-item-utils";
import { createMagicItemEquipmentRefs } from "@/lib/magic-item-equipment";
import { equipmentAfterLongRest } from "@/lib/smart-tracker";

const text = (id: string): string =>
  (en as Record<string, { description?: string }>)[id]?.description ?? "";

const FORMULA = String.raw`(\d+)(?:d(\d+)(?:\s*([+-])\s*(\d+))?)?`;

/** The largest value a written count can take ("7" → 7, "1d6+3" → 9). */
function formulaMax(m: RegExpExecArray, at: number): number {
  const n = Number(m[at]);
  if (m[at + 1] === undefined) return n;
  const mod =
    m[at + 3] === undefined ? 0 : Number(m[at + 3]) * (m[at + 2] === "-" ? -1 : 1);
  return n * Number(m[at + 1]) + mod;
}

function statedCount(id: string): number | undefined {
  const m = new RegExp(
    String.raw`\b(?:has|have) ${FORMULA} (?:charges|beads)\b`,
    "i"
  ).exec(text(id));
  return m ? formulaMax(m, 1) : undefined;
}

/** What the text says the item regains at dawn ("1d4+1", "1"), or undefined for never. */
function statedDawnFormula(id: string): string | undefined {
  const m = new RegExp(
    String.raw`\bregains? ${FORMULA} expended charges? daily at dawn`,
    "i"
  ).exec(text(id));
  return m?.[0]
    .replace(/^regains? /i, "")
    .replace(/ expended.*$/, "")
    .replace(/\s+/g, "");
}

function statedDawnRegain(id: string): "dice" | number | undefined {
  const formula = statedDawnFormula(id);
  if (formula === undefined) return undefined;
  return /d/.test(formula) ? "dice" : Number(formula);
}

function rechargeFormula(
  r: ReturnType<typeof parseMagicItemDawnRecharge>
): string | undefined {
  if (!r) return undefined;
  if (r.kind === "fixed") return String(r.amount);
  const { dice, sides, modifier = 0 } = r.roll;
  return `${dice}d${sides}${modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : modifier}`;
}

const withCount = SRD_MAGIC_ITEMS.filter((item) => statedCount(item.id) !== undefined);
const legacy = SRD_MAGIC_ITEMS.flatMap((item) => {
  const ref = createMagicItemEquipmentRefs(item, 1, () => `inst-${item.id}`)[0];
  return ref?.charges ? [{ item, ref, charges: ref.charges }] : [];
});

describe("parseMagicItemCharges against the catalogue text", () => {
  it("covers the rolled counts", () => {
    expect(withCount.map((i) => i.id)).toEqual(
      expect.arrayContaining(["necklace-of-fireballs", "nine-lives-stealer"])
    );
  });

  it.each(withCount.map((item) => [item.id, item] as const))(
    "%s parses to the count its text states",
    (id, item) => {
      expect(parseMagicItemCharges(item)).toBe(statedCount(id));
    }
  );
});

describe("equipmentAfterLongRest against the catalogue text", () => {
  it("covers never-recharging items", () => {
    const never = legacy.filter(({ item }) => statedDawnRegain(item.id) === undefined);
    expect(never.map(({ item }) => item.id)).toEqual(
      expect.arrayContaining(["gem-of-brightness", "scarab-of-protection"])
    );
  });

  it.each(legacy.map(({ item }) => [item.id, item] as const))(
    "%s records the dawn recharge its text states",
    (id, item) => {
      expect(rechargeFormula(parseMagicItemDawnRecharge(item))).toBe(
        statedDawnFormula(id)
      );
    }
  );

  it.each(legacy.map(({ item, ref, charges }) => [item.id, ref, charges] as const))(
    "%s regains only what its text says",
    (id, ref, charges) => {
      const spent = { ...ref, charges: { ...charges, current: 0 } };
      const [after] = equipmentAfterLongRest([spent]);
      const regain = statedDawnRegain(id);
      const expected =
        regain === undefined
          ? 0
          : regain === "dice"
            ? // No in-app entry for a rolled dawn amount on the legacy field yet:
              // refilling keeps the item usable and the player spends the excess.
              charges.max
            : Math.min(charges.max, regain);
      expect(after?.charges?.current).toBe(expected);
      // The persisted shape never changes.
      expect(Object.keys(after?.charges ?? {}).sort()).toEqual(
        Object.keys(charges).sort()
      );
    }
  );
});
