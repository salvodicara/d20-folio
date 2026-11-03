/**
 * «Su quale arma?» (approved prototype cast-weapon): the weapons a binding spell (Magic
 * Weapon, Shillelagh) may name at `castLevel`, each named for the table, in hand or in
 * the pack, with what the spell does to it — read from `bindingWeaponChoices`. Empty
 * for a spell that binds nothing. `key` is the stable address the cast carries.
 */
import { getSpellById } from "@/data/spells";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { homebrewText } from "@/lib/views/homebrew-text-view";
import {
  bindingWeaponChoices,
  encodeWeaponAddress,
  type BindingWeaponChoice,
} from "@/lib/weapon-binding";
import type { CharacterDoc } from "@/types/character";

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
  if (!spell) return [];
  return bindingWeaponChoices(spell, doc, castLevel).map((choice) => ({
    ...choice,
    key: encodeWeaponAddress(choice.address),
    name: choice.srdId
      ? localizeSrd("equipment", choice.srdId, "name", locale)
      : homebrewText(choice.name, locale),
  }));
}
