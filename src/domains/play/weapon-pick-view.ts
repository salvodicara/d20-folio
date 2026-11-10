/**
 * «Su quale arma?» (approved prototype cast-weapon): the weapons a binding spell (Magic
 * Weapon, Shillelagh) may name at `castLevel`, each named for the table, in hand or in
 * the pack, with what the spell does to it — read from `bindingWeaponChoices`. Empty
 * for a spell that binds nothing. `key` is the stable address the cast carries. A
 * feature's state that coats one weapon (Brew Poison) asks the same question.
 */
import { getSpellById } from "@/data/spells";
import type { SrdSpellData } from "@/data/types";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { featureStateSource } from "@/lib/play/states";
import { homebrewText } from "@/lib/views/homebrew-text-view";
import {
  bindingWeaponChoices,
  encodeWeaponAddress,
  type BindingWeaponChoice,
} from "@/lib/weapon-binding";
import type { CharacterDoc } from "@/types/character";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { boundWeaponIndexByState, type WeaponAddress } from "@/lib/weapon-binding";
import type { AggregatedGrants } from "@/lib/grants";

export interface WeaponPick extends BindingWeaponChoice {
  key: string;
  name: string;
}

export function weaponPickView(
  doc: CharacterDoc,
  spellId: string,
  castLevel: number,
  locale: Locale
): WeaponPick[] {
  const spell = getSpellById(spellId);
  return spell ? picksOf(spell, doc, castLevel, locale) : [];
}

/** The weapons a feature's state may coat (Brew Poison), by the key it lights. */
export function stateWeaponPickView(
  doc: CharacterDoc,
  activeKey: string,
  locale: Locale
): WeaponPick[] {
  const source = featureStateSource(doc, activeKey);
  return source ? picksOf(source, doc, 0, locale) : [];
}

function picksOf(
  source: Pick<SrdSpellData, "grants">,
  doc: CharacterDoc,
  castLevel: number,
  locale: Locale
): WeaponPick[] {
  return bindingWeaponChoices(source, doc, castLevel).map((choice) => ({
    ...choice,
    key: encodeWeaponAddress(choice.address),
    name: choice.srdId
      ? localizeSrd("equipment", choice.srdId, "name", locale)
      : homebrewText(choice.name, locale),
  }));
}

/** What an action asks before it runs: nothing, the only eligible weapon (bound
 *  without a question), or «Su quale arma?» over two or more. */
export type WeaponPickStep =
  | { kind: "none" }
  | { kind: "bind"; weapon: WeaponAddress }
  | { kind: "ask"; picks: WeaponPick[] };

/** The weapon question of one action: a binding spell's (Magic Weapon, Shillelagh)
 *  at its base level, or the state a feature or an item's use lights (Brew Poison,
 *  Basic Poison's coat). */
export function weaponPickStep(
  doc: CharacterDoc,
  action: Pick<ResolvedAction, "source" | "spellId" | "spellLevel" | "activatesKey">,
  locale: Locale
): WeaponPickStep {
  const picks =
    action.source === "spell" && action.spellId
      ? weaponPickView(doc, action.spellId, action.spellLevel ?? 0, locale)
      : action.source === "feature" && action.activatesKey
        ? stateWeaponPickView(doc, action.activatesKey, locale)
        : [];
  const [only] = picks;
  if (!only) return { kind: "none" };
  return picks.length === 1
    ? { kind: "bind", weapon: only.address }
    : { kind: "ask", picks };
}

/** The name of the weapon each lit binding state rides, by its key ("item-poison-basic"
 *  → "Pugnale"), so the lit state can say which weapon it holds. */
export function boundWeaponNames(
  doc: CharacterDoc,
  lit: AggregatedGrants["weaponBindings"],
  locale: Locale
): Record<string, string> {
  const weapons = doc.character.weapons;
  const out: Record<string, string> = {};
  for (const [key, index] of boundWeaponIndexByState(lit, doc)) {
    const weapon = weapons[index];
    if (!weapon) continue;
    out[key] =
      "custom" in weapon
        ? homebrewText(weapon.name, locale)
        : localizeSrd("equipment", weapon.srdId, "name", locale);
  }
  return out;
}
