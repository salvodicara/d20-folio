/**
 * The homebrew item form's effects, step 1 (coordinator 2026-11-12). Pattern source:
 * D&D Beyond's homebrew magic item form ("Requires Attunement", a "Bonus / Magic" +N
 * modifier, "Has Charges" with its reset condition, rarity).
 *
 * Each effect is read from and written into the item's `mechanics` in the catalogue
 * magic item's own shape, the one the engine already plays (`homebrewItemData`):
 *  - attunement → `attunement: true` (the limit of three applies as for any item);
 *  - a weapon's +N → an `item-bound-bonus` on its attack and damage rolls (+1 Longsword);
 *  - an armour's or shield's +N → an `ac-bonus` (+1 Armor), on top of its own AC;
 *  - charges → a `charges` counter with its recovery (Wand of Binding);
 *  - rarity → `rarity`.
 * Everything else the item declares (other grants, other counters, spells…) is kept.
 */
import type {
  HomebrewItemMechanics,
  ItemResourceRecoveryAmount,
  ItemResourceSpec,
  MagicItemRarity,
} from "@/data/types";
import type { Grant } from "@/lib/grants";

/** Which kind of item the form is making: the +N lands on attacks or on AC. */
export type HomebrewItemKind = "weapon" | "armor" | "item";

/** When an item's charges come back; "none" means they don't. */
export type ChargeRecovery = "dawn" | "long-rest" | "short-rest" | "none";

export interface ItemEffects {
  attunement?: true;
  magicBonus?: 1 | 2 | 3;
  rarity?: MagicItemRarity;
  /** `returns`: how many come back, as typed («», «3», «1d6+1»; empty = all). */
  charges?: { max: number; recovery: ChargeRecovery; returns: string };
}

/** The id of the charges counter the form owns. */
const CHARGES_ID = "charges";

/** The +N grants the form owns (a weapon's, an armour's). */
function isMagicBonus(grant: Grant): boolean {
  // An item-bound bonus is always the weapon's attack-and-damage +N today.
  return grant.type === "item-bound-bonus" || grant.type === "ac-bonus";
}

/** How many charges come back, as the player typed it; `null` when unreadable. */
export function parseChargeReturn(text: string): ItemResourceRecoveryAmount | null {
  const value = text.trim().toLowerCase();
  if (value === "" || value === "tutte" || value === "all") return { kind: "full" };
  if (/^\d+$/.test(value)) return { kind: "fixed", amount: Number(value) };
  const roll = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(value);
  if (!roll) return null;
  return {
    kind: "entered-roll",
    roll: {
      dice: Number(roll[1]),
      sides: Number(roll[2]),
      ...(roll[3] ? { modifier: Number(roll[3]) } : {}),
    },
  };
}

/** The typed form of an amount that comes back (the reverse of `parseChargeReturn`). */
function formatChargeReturn(amount: ItemResourceRecoveryAmount): string {
  switch (amount.kind) {
    case "full":
      return "";
    case "fixed":
      return String(amount.amount);
    case "entered-roll":
      return `${amount.roll.dice}d${amount.roll.sides}${
        amount.roll.modifier ? `+${amount.roll.modifier}` : ""
      }`;
    default:
      return "";
  }
}

const RECOVERIES: ReadonlyArray<Exclude<ChargeRecovery, "none">> = [
  "dawn",
  "long-rest",
  "short-rest",
];

/** The effects the form shows, read from an item's mechanics (empty for none). */
export function readItemEffects(
  mechanics: HomebrewItemMechanics | undefined
): ItemEffects {
  if (!mechanics) return {};
  const bonus = (mechanics.grants ?? []).find(isMagicBonus);
  const amount =
    bonus && "amount" in bonus && typeof bonus.amount === "number" ? bonus.amount : 0;
  const counter = (mechanics.resources ?? []).find((r) => r.id === CHARGES_ID);
  const recovery = counter?.recoveries?.[0];
  const trigger = recovery?.trigger.kind;
  return {
    ...(mechanics.attunement ? { attunement: true as const } : {}),
    ...(amount === 1 || amount === 2 || amount === 3 ? { magicBonus: amount } : {}),
    ...(mechanics.rarity ? { rarity: mechanics.rarity } : {}),
    ...(counter && counter.capacity.kind === "fixed"
      ? {
          charges: {
            max: counter.capacity.amount,
            recovery: RECOVERIES.find((r) => r === trigger) ?? "none",
            returns: recovery ? formatChargeReturn(recovery.amount) : "",
          },
        }
      : {}),
  };
}

/**
 * The item's mechanics with the form's effects written in; everything else the item
 * declares is kept. Undefined when nothing is left (a text-only item, as today).
 * Charges that come back by an unreadable amount come back in full.
 */
export function writeItemEffects(
  before: HomebrewItemMechanics | undefined,
  kind: HomebrewItemKind,
  effects: ItemEffects
): HomebrewItemMechanics | undefined {
  const {
    attunement: _attunement,
    rarity: _rarity,
    grants: oldGrants,
    resources: oldResources,
    ...rest
  } = before ?? {};
  void _attunement;
  void _rarity;
  const grants: Grant[] = (oldGrants ?? []).filter((g) => !isMagicBonus(g));
  if (effects.magicBonus && kind !== "item")
    grants.push(
      kind === "weapon"
        ? {
            type: "item-bound-bonus",
            target: "weapon-attack-and-damage",
            amount: effects.magicBonus,
          }
        : { type: "ac-bonus", amount: effects.magicBonus }
    );
  const resources: ItemResourceSpec[] = (oldResources ?? []).filter(
    (r) => r.id !== CHARGES_ID
  );
  const charges = effects.charges;
  if (charges && charges.max > 0) {
    const amount = parseChargeReturn(charges.returns) ?? { kind: "full" };
    resources.push({
      kind: "counter",
      id: CHARGES_ID,
      unit: "charges",
      capacity: { kind: "fixed", amount: charges.max },
      initial: { kind: "full" },
      ...(charges.recovery !== "none"
        ? { recoveries: [{ trigger: { kind: charges.recovery }, amount }] }
        : {}),
    });
  }
  const mechanics: HomebrewItemMechanics = {
    ...rest,
    ...(effects.attunement ? { attunement: true } : {}),
    ...(effects.rarity ? { rarity: effects.rarity } : {}),
    ...(grants.length > 0 ? { grants } : {}),
    ...(resources.length > 0 ? { resources } : {}),
  };
  return Object.keys(mechanics).length > 0 ? mechanics : undefined;
}
