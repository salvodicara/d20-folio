/**
 * A custom item as the Play screen's «Oggetto personalizzato» form makes it (#1230).
 * Pattern source: D&D Beyond's custom item (name, quantity, weight, cost, notes).
 *
 * It is the classic sheet's homebrew gear (`CustomEquipment`: carried, its own
 * `instanceId`). Its weight and cost are stored where the catalogue magic item keeps
 * them (`mechanics.weight` in pounds, `mechanics.price` named in its own coin,
 * "25 GP"), so the item engine reads one shape and the inventory weighs it. Neither
 * fact gives it grants, charges or attunement.
 *
 * Pure module — no React, no store.
 */
import { coinPrice } from "@/lib/coin-price";
import { homebrewItemMechanics } from "@/lib/homebrew-items";
import { createItemInstanceId } from "@/lib/item-resources";
import { usesMetric, type Locale } from "@/lib/locale";
import { editHomebrewText } from "@/lib/views/homebrew-text-view";
import type { CurrencyUnit } from "@/data/types";
import type { CustomEquipment, CustomWeapon } from "@/types/character";

/** What the form holds: the numbers as typed (an Italian comma is read as a point). */
export interface CustomGearDraft {
  name: string;
  quantity: number;
  /** For one, in the viewer's unit (pounds; kilograms where the sheet shows them,
   *  at the app's half a pound each, `formatWeight`); empty = none. */
  weight: string;
  /** Gold pieces for one; empty = none. */
  cost: string;
  description: string;
}

export type CustomGearErrors = Partial<{
  name: "required";
  quantity: "min";
  weight: "number";
  cost: "number";
}>;

/** An optional non-negative number as typed; `undefined` when empty, NaN when not one. */
function typedAmount(text: string): number | undefined {
  const value = text.trim().replace(",", ".");
  if (value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

export function customGearFromDraft(
  draft: CustomGearDraft,
  locale: Locale
): { ok: true; item: CustomEquipment } | { ok: false; errors: CustomGearErrors } {
  const name = draft.name.trim();
  const typedWeight = typedAmount(draft.weight);
  const weight =
    typedWeight !== undefined && usesMetric(locale) ? typedWeight * 2 : typedWeight;
  const cost = typedAmount(draft.cost);
  const errors: CustomGearErrors = {
    ...(name ? {} : { name: "required" as const }),
    ...(Number.isInteger(draft.quantity) && draft.quantity >= 1
      ? {}
      : { quantity: "min" as const }),
    ...(Number.isNaN(weight) ? { weight: "number" as const } : {}),
    ...(Number.isNaN(cost) ? { cost: "number" as const } : {}),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const description = draft.description.trim();
  const price = cost ? coinPrice(cost) : undefined;
  const mechanics = {
    ...(weight ? { weight } : {}),
    ...(price ? { price: `${price.amount} ${price.coin.toUpperCase()}` } : {}),
  };
  return {
    ok: true,
    item: {
      custom: true,
      name: editHomebrewText(undefined, locale, name),
      ...(description
        ? { description: editHomebrewText(undefined, locale, description) }
        : {}),
      equipped: true,
      quantity: draft.quantity,
      ...(Object.keys(mechanics).length > 0 ? { mechanics } : {}),
      instanceId: createItemInstanceId(),
    },
  };
}

/** A homebrew item's weight for one, in pounds (0 when it has none). */
export function customItemWeight(item: CustomEquipment | CustomWeapon): number {
  return homebrewItemMechanics(item)?.weight ?? 0;
}

const PRICE = /^(\d+(?:\.\d+)?) (PP|GP|EP|SP|CP)$/i;

/** A homebrew item's cost for one, in its own coin (null when it has none, or when
 *  the price is not one amount in one coin). */
export function customItemCost(
  item: CustomEquipment | CustomWeapon
): { amount: number; unit: CurrencyUnit } | null {
  const match = PRICE.exec(homebrewItemMechanics(item)?.price?.trim() ?? "");
  if (!match?.[1] || !match[2]) return null;
  return { amount: Number(match[1]), unit: match[2].toLowerCase() as CurrencyUnit };
}
