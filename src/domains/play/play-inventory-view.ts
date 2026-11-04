/**
 * The Play screen's «Inventario» tab (approved prototype x-play-inv), over the
 * inventory presenter (`buildInventoryViewModel`): the weight carried against the
 * most, the coins, then three groups — equipped (the weapons, worn armor), attuned
 * (with the count against the cap), the pack — each item with the one line that
 * matters at the table (damage, Armor Class, healing, charges) and, when the actions
 * list has its use (a potion, a charged item's spells), that action's id for «Usa».
 * Weights stay raw (pounds); the screen formats them.
 */
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import {
  attunables,
  canAttune,
  weaponAttunementKey,
  type AttunementRefusal,
} from "@/lib/attunement-guard";
import { gearKey, selfFormRule } from "@/lib/polymorph";
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
  /** In a form whose gear merges (Wild Shape): the item's key for «Indossato nella
   *  forma», and whether the table ruled it worn (only then does it work). */
  formGear?: { key: string; worn: boolean };
  /** An item that takes attunement: whether it is attuned, and why the rules say no
   *  to attuning it now (the player may still force it). */
  attune?: PlayAttune;
  /** A Spell Scroll: its row in the equipment and the spell on it, once set. */
  scroll?: { index: number; spellId: string | null; spellName: string | null };
}

export interface PlayAttune {
  /** The engine's key for it (`attunables`): an instance id, `equipment:<i>` or
   *  `weapon:<i>`. */
  key: string;
  attuned: boolean;
  refusal?: AttuneRefusalView;
}

/** Why attuning is refused, with the names the reason needs. */
export type AttuneRefusalView =
  /** Already at the limit: the items standing in the way. */
  | { reason: "limit"; limit: number; names: string[] }
  /** Already attuned to another copy of this item. */
  | { reason: "copy" }
  /** Only some creatures can: a spellcaster, these classes or species, or one
   *  attuned to `attunedTo`. */
  | { reason: "prerequisite"; spellcaster: boolean; names: string[]; attunedTo?: string };

export interface PlayInventoryView {
  /** The character's form merges its gear: it gives nothing unless ruled worn. */
  formMerges: boolean;
  weight: { carried: number; capacity: number; over: boolean } | null;
  coins: CharacterDoc["session"]["currency"];
  attunement: { bonded: number; cap: number };
  groups: { kind: "equipped" | "attuned" | "pack"; items: PlayItem[] }[];
}

const signedDice = (die: string, mod: number) =>
  mod === 0 ? die : `${die}${mod > 0 ? "+" : "−"}${String(Math.abs(mod))}`;

const SPELL_SCROLL = "spell-scroll";

export function playInventoryView(doc: CharacterDoc, locale: Locale): PlayInventoryView {
  const vm = buildInventoryViewModel(doc, locale);
  const form = doc.session.activeForm;
  const formMerges =
    form !== undefined && selfFormRule(form.sourceId).gearMerges === true;
  const wornGear = new Set(form?.wornGear ?? []);
  const formGear = (
    ref: Parameters<typeof gearKey>[0] | undefined
  ): Pick<PlayItem, "formGear"> =>
    formMerges && ref
      ? { formGear: { key: gearKey(ref), worn: wornGear.has(gearKey(ref)) } }
      : {};
  const uses = new Map<string, string>();
  for (const action of localizeActions(doc, locale)) {
    const item = action.costEquipment ?? action.castPoolItemId;
    if (item && !uses.has(item)) uses.set(item, action.id);
  }
  // Attunement, keyed the engine's way across equipment and weapons (#724).
  const attunable = new Map(attunables(doc).map((a) => [a.key, a]));
  const equipmentKey = (idx: number) =>
    doc.character.equipment[idx]?.instanceId ?? `equipment:${String(idx)}`;
  const weaponKey = (idx: number) => {
    const ref = doc.character.weapons[idx];
    return ref && "custom" in ref ? ref.instanceId : weaponAttunementKey(idx);
  };
  const names = new Map<string, string>([
    ...[...vm.armor, ...vm.gear].map((i): [string, string] => [
      equipmentKey(i.idx),
      i.name,
    ]),
    ...vm.weapons.map((w): [string, string] => [weaponKey(w.idx), w.name]),
  ]);
  const attuneOf = (key: string): Pick<PlayItem, "needsAttunement" | "attune"> => {
    const a = attunable.get(key);
    if (!a) return { needsAttunement: false };
    const verdict = a.attuned ? null : canAttune(doc, key);
    const refusal =
      verdict && !verdict.ok
        ? refusalView(verdict, (k) => names.get(k) ?? k, locale)
        : null;
    return {
      needsAttunement: !a.attuned,
      attune: { key, attuned: a.attuned, ...(refusal ? { refusal } : {}) },
    };
  };
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
    ...attuneOf(weaponKey(w.idx)),
    useActionId: null,
    ...formGear(doc.character.weapons[w.idx]),
  });
  const item = (i: ItemRowVM): PlayItem => {
    const ref = i.isCustom ? undefined : doc.character.equipment[i.idx];
    if (i.id === SPELL_SCROLL && ref && !("custom" in ref)) {
      // A scroll is read through its own action, keyed by the spell it holds.
      const spellId = ref.scrollSpell ?? null;
      return {
        ...plainItem(i),
        scroll: {
          index: i.idx,
          spellId,
          spellName: spellId ? localizeSrd("spell", spellId, "name", locale) : null,
        },
        useActionId: spellId
          ? (uses.get(ref.instanceId ?? `${SPELL_SCROLL}#${spellId}`) ?? null)
          : null,
      };
    }
    return plainItem(i);
  };
  const plainItem = (i: ItemRowVM): PlayItem => ({
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
    ...attuneOf(equipmentKey(i.idx)),
    useActionId: uses.get(i.isCustom ? `custom-${i.id}` : i.id) ?? null,
    // Only what is worn or bonded merges; the pack gives nothing in any form.
    ...(i.equipped || i.attuned ? formGear(doc.character.equipment[i.idx]) : {}),
  });
  const rows = [...vm.armor, ...vm.gear];
  const equipped = [
    ...vm.weapons.map(weapon),
    ...rows.filter((i) => i.equipped && !i.attuned).map(item),
  ];
  const attuned = rows.filter((i) => i.attuned).map(item);
  const pack = rows.filter((i) => !i.equipped && !i.attuned).map(item);
  return {
    formMerges,
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

function refusalView(
  verdict: AttunementRefusal,
  nameOf: (key: string) => string,
  locale: Locale
): AttuneRefusalView | null {
  switch (verdict.reason) {
    case "attunement-limit":
      return {
        reason: "limit",
        limit: verdict.limit,
        names: verdict.attuned.map(nameOf),
      };
    case "duplicate-copy":
      return { reason: "copy" };
    case "prerequisite": {
      const r = verdict.requires;
      return {
        reason: "prerequisite",
        spellcaster: r.spellcaster === true,
        names: [
          ...(r.classes ?? []).map((id) => localizeSrd("class", id, "name", locale)),
          ...(r.species ?? []).map((id) => localizeSrd("race", id, "name", locale)),
        ],
        ...(r.attunedItem ? { attunedTo: itemName(r.attunedItem, locale) } : {}),
      };
    }
    default:
      return null;
  }
}

/** An SRD item's name: a magic item's, else the equipment catalogue's. */
function itemName(srdId: string, locale: Locale): string {
  return hasSrd("magic-item", srdId, "name", locale)
    ? localizeSrd("magic-item", srdId, "name", locale)
    : localizeSrd("equipment", srdId, "name", locale);
}
