/**
 * The Play screen's «Inventario» tab (approved prototype x-play-inv), over the
 * inventory presenter (`buildInventoryViewModel`): the weight carried against the
 * most, the coins, then three groups — equipped (the weapons, worn armor), attuned
 * (with the count against the cap), the pack — each item with the one line that
 * matters at the table (damage, Armor Class, healing, charges) and, when the actions
 * list has its use (a potion, a charged item's spells), that action's id for «Usa».
 * Weights stay raw (pounds); the screen formats them.
 */
import type { Locale } from "@/lib/locale";
import { localizeActions } from "@/lib/views/combat-action-view";
import {
  buildInventoryViewModel,
  type ItemRowVM,
  type WeaponRowVM,
} from "@/lib/views/inventory-view";
import type { CharacterDoc } from "@/types/character";
import type { DamageType } from "@/types/damage";

export type ItemLine =
  | { kind: "damage"; dice: string; type: DamageType }
  | { kind: "ac"; base: number }
  | { kind: "ac-bonus"; bonus: number }
  | { kind: "heal"; dice: string }
  | { kind: "charges"; current: number; max: number }
  | null;

export interface PlayItem {
  key: string;
  name: string;
  quantity: number;
  /** Pounds, for one. */
  weight: number;
  line: ItemLine;
  stealthDisadvantage: boolean;
  needsAttunement: boolean;
  /** The actions list's use of this item, for «Usa». */
  useActionId: string | null;
}

export interface PlayInventoryView {
  weight: { carried: number; capacity: number; over: boolean } | null;
  coins: CharacterDoc["session"]["currency"];
  attunement: { bonded: number; cap: number };
  groups: { kind: "equipped" | "attuned" | "pack"; items: PlayItem[] }[];
}

const signedDice = (die: string, mod: number) =>
  mod === 0 ? die : `${die}${mod > 0 ? "+" : "−"}${String(Math.abs(mod))}`;

export function playInventoryView(doc: CharacterDoc, locale: Locale): PlayInventoryView {
  const vm = buildInventoryViewModel(doc, locale);
  const uses = new Map<string, string>();
  for (const action of localizeActions(doc, locale)) {
    const item = action.costEquipment ?? action.castPoolItemId;
    if (item && !uses.has(item)) uses.set(item, action.id);
  }
  const weapon = (w: WeaponRowVM): PlayItem => ({
    key: `w-${w.id}-${String(w.idx)}`,
    name: w.name,
    quantity: w.quantity,
    weight: w.weight,
    line: {
      kind: "damage",
      dice: signedDice(w.damageDie, w.damageMod),
      type: w.damageType,
    },
    stealthDisadvantage: false,
    needsAttunement: false,
    useActionId: null,
  });
  const item = (i: ItemRowVM): PlayItem => ({
    key: i.rowId,
    name: i.name,
    quantity: i.quantity,
    weight: i.weight,
    line: i.armorAc
      ? i.armorAc.category === "shield"
        ? { kind: "ac-bonus", bonus: i.armorAc.base }
        : { kind: "ac", base: i.armorAc.base }
      : i.isPotion && i.potionFormula
        ? { kind: "heal", dice: i.potionFormula }
        : i.charges
          ? { kind: "charges", current: i.charges.current, max: i.charges.max }
          : null,
    stealthDisadvantage: i.stealthDisadvantage,
    needsAttunement: i.requiresAttunement && !i.attuned,
    useActionId: uses.get(i.isCustom ? `custom-${i.id}` : i.id) ?? null,
  });
  const rows = [...vm.armor, ...vm.gear];
  const equipped = [
    ...vm.weapons.map(weapon),
    ...rows.filter((i) => i.equipped && !i.attuned).map(item),
  ];
  const attuned = rows.filter((i) => i.attuned).map(item);
  const pack = rows.filter((i) => !i.equipped && !i.attuned).map(item);
  return {
    weight: vm.encumbrance
      ? {
          carried: vm.encumbrance.carried,
          capacity: vm.encumbrance.capacity,
          over: vm.encumbrance.over,
        }
      : null,
    coins: doc.session.currency,
    attunement: { bonded: vm.attunement.bonded, cap: vm.attunement.cap },
    groups: [
      { kind: "equipped" as const, items: equipped },
      { kind: "attuned" as const, items: attuned },
      { kind: "pack" as const, items: pack },
    ].filter((g) => g.items.length > 0),
  };
}
