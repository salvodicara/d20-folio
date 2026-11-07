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
