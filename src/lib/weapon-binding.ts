/**
 * A spell that changes ONE chosen weapon while it lasts (`weapon-binding`): Magic
 * Weapon's +1 to +3, Shillelagh's spellcasting ability, bigger die and Force option.
 *
 * Pure. The cast names the weapon; `castWeaponBinding` validates it against the
 * grant and returns the option picks to store (`session.grantBundleChoices`, the
 * store every cast-time option already uses, written by the `set-bundle-choices`
 * sheet event). While the spell's state is lit the aggregate carries the grant, and
 * `resolveWeaponBindings` turns it into the change on that weapon's row; when the
 * state ends (timer, Concentration, a rest) the grant leaves the aggregate and the
 * weapon reads as printed again, whatever pick is still stored.
 */
import type { SrdSpellData } from "@/data/types";
import type { AggregatedGrants, Grant } from "@/lib/grants";
import { isHomebrewMagicWeapon } from "@/lib/homebrew-items";
import type { AbilityCode } from "@/types/ability";
import type { CharacterDoc, CustomWeapon, SrdWeaponRef } from "@/types/character";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage";

export type WeaponBindingGrant = Extract<Grant, { type: "weapon-binding" }>;

/**
 * One carried weapon, as a cast option names it. An SRD weapon has no identity of
 * its own, so it is its place in `weapons[]` plus its id (a moved list still finds
 * the same kind of weapon); a homebrew weapon has its `instanceId`.
 */
export type WeaponAddress =
  | { kind: "srd"; index: number; srdId: string }
  | { kind: "custom"; instanceId: string };

/** The stored form of a weapon pick: `srd:<index>:<srdId>` or `custom:<instanceId>`. */
export function encodeWeaponAddress(address: WeaponAddress): string {
  return address.kind === "srd"
    ? `srd:${address.index}:${address.srdId}`
    : `custom:${address.instanceId}`;
}

/** Read a stored weapon pick; null for anything malformed. */
export function decodeWeaponAddress(
  raw: string | null | undefined
): WeaponAddress | null {
  if (!raw) return null;
  const srd = /^srd:(\d+):(.+)$/.exec(raw);
  if (srd?.[1] && srd[2]) return { kind: "srd", index: Number(srd[1]), srdId: srd[2] };
  const custom = /^custom:(.+)$/.exec(raw);
  return custom?.[1] ? { kind: "custom", instanceId: custom[1] } : null;
}

type CarriedWeapon = SrdWeaponRef | CustomWeapon;

/** The address of the weapon at `index`. */
function addressAt(weapon: CarriedWeapon, index: number): WeaponAddress {
  return "custom" in weapon
    ? { kind: "custom", instanceId: weapon.instanceId }
    : { kind: "srd", index, srdId: weapon.srdId };
}

/** Where the addressed weapon sits in `weapons[]` now, or -1 when it is gone. */
export function weaponIndexOf(
  weapons: ReadonlyArray<CarriedWeapon>,
  address: WeaponAddress
): number {
  if (address.kind === "custom") {
    return weapons.findIndex((w) => "custom" in w && w.instanceId === address.instanceId);
  }
  const at = weapons[address.index];
  if (at && !("custom" in at) && at.srdId === address.srdId) return address.index;
  return weapons.findIndex((w) => !("custom" in w) && w.srdId === address.srdId);
}

/** Why a weapon cannot take the binding. */
export type WeaponBindingRejection =
  | "no-binding"
  | "no-weapon"
  | "weapon-not-allowed"
  | "magical-weapon"
  | "damage-type-not-offered";

/** Whether `weapon` may take the binding: the listed weapons only, nonmagical only. */
function weaponRejection(
  grant: WeaponBindingGrant,
  weapon: CarriedWeapon
): WeaponBindingRejection | null {
  const custom = "custom" in weapon;
  if (grant.weaponIds && (custom || !grant.weaponIds.includes(weapon.srdId))) {
    return "weapon-not-allowed";
  }
  // A bound catalogue enchant, or a homebrew weapon with magic-item mechanics.
  if (
    grant.nonmagical &&
    (custom ? isHomebrewMagicWeapon(weapon) : weapon.enchantItemId)
  ) {
    return "magical-weapon";
  }
  return null;
}

/** The `weapon-binding` grants a spell's states carry, each with its state's key. */
export function spellWeaponBindings(
  spell: Pick<SrdSpellData, "grants">
): Array<{ activeKey: string; grant: WeaponBindingGrant }> {
  return (spell.grants ?? []).flatMap((g) =>
    g.type === "while-active"
      ? g.grants.flatMap((inner) =>
          inner.type === "weapon-binding"
            ? [{ activeKey: g.activeKey, grant: inner }]
            : []
        )
      : []
  );
}

/** The carried weapons the spell can bind — what the cast dialog offers. */
export function eligibleBindingWeapons(
  spell: Pick<SrdSpellData, "grants">,
  character: CharacterDoc
): WeaponAddress[] {
  const binding = spellWeaponBindings(spell)[0];
  if (!binding) return [];
  return character.character.weapons.flatMap((weapon, index) =>
    weaponRejection(binding.grant, weapon) ? [] : [addressAt(weapon, index)]
  );
}

/** One cast of a weapon-binding spell: the weapon it names, the damage type picked. */
export interface WeaponBindingCast {
  spell: Pick<SrdSpellData, "grants">;
  weapon: WeaponAddress;
  /** One of the grant's `damageTypeChoice` options; absent = the weapon's own. */
  damageType?: string;
}

export type CastWeaponBinding =
  | {
      ok: true;
      /** The state the cast lights. */
      activeKey: string;
      /** The picks to store: the `set-bundle-choices` payload (null clears). */
      choices: Record<string, string | null>;
    }
  | { ok: false; reason: WeaponBindingRejection };

/**
 * Validate a cast's chosen weapon and return the picks to store. Shillelagh takes
 * only a Club or Quarterstaff, Magic Weapon only a nonmagical weapon; a damage type
 * must be one the spell offers.
 */
export function castWeaponBinding(
  cast: WeaponBindingCast,
  character: CharacterDoc
): CastWeaponBinding {
  const binding = spellWeaponBindings(cast.spell)[0];
  if (!binding) return { ok: false, reason: "no-binding" };
  const { grant } = binding;
  const weapons = character.character.weapons;
  const index = weaponIndexOf(weapons, cast.weapon);
  const weapon = weapons[index];
  if (!weapon) return { ok: false, reason: "no-weapon" };
  const rejection = weaponRejection(grant, weapon);
  if (rejection) return { ok: false, reason: rejection };
  const typeChoice = grant.damageTypeChoice;
  if (
    cast.damageType !== undefined &&
    !typeChoice?.options.some((option) => option === cast.damageType)
  ) {
    return { ok: false, reason: "damage-type-not-offered" };
  }
  return {
    ok: true,
    activeKey: binding.activeKey,
    choices: {
      [grant.choiceKey]: encodeWeaponAddress(addressAt(weapon, index)),
      ...(typeChoice ? { [typeChoice.choiceKey]: cast.damageType ?? null } : {}),
    },
  };
}

/** What a lit binding does to its weapon's row. */
export interface ResolvedWeaponBinding {
  /** The source (spell id) — names the change in the breakdown. */
  sourceId: string;
  activeKey: string;
  /** +N to the attack and the damage (0 = none). */
  bonus: number;
  /** The ability the attack and damage may use instead of Strength. */
  attackAbility?: AbilityCode;
  /** The die that replaces the weapon's own. */
  damageDie?: string;
  /** The damage type the caster picked instead of the weapon's own. */
  damageType?: DamageType;
  /** The types the caster may switch to, and where the pick is stored. */
  damageTypeOptions?: ReadonlyArray<DamageType>;
  damageTypeChoiceKey?: string;
}

/** The highest tier whose `minLevel` the level reaches. */
function tierAt<T extends { minLevel: number }>(
  tiers: ReadonlyArray<T> | undefined,
  level: number
): T | undefined {
  return [...(tiers ?? [])]
    .sort((a, b) => a.minLevel - b.minLevel)
    .filter((tier) => level >= tier.minLevel)
    .at(-1);
}

/** A die token as a formula die: `d8` → `1d8`. */
const asDice = (die: string): string => (/^\d/.test(die) ? die : `1${die}`);

const isDamageType = (value: string | undefined): value is DamageType =>
  DAMAGE_TYPES.some((type) => type === value);

/** The caster's level across every class. */
function characterLevel(character: CharacterDoc): number {
  return character.character.classes.reduce((sum, entry) => sum + entry.level, 0);
}

/**
 * The lit bindings by the index of the weapon each rides. A pick for a weapon that
 * is gone or no longer qualifies binds nothing. Two bindings on one weapon add
 * their bonuses; the later one's die, ability and type win.
 */
export function resolveWeaponBindings(
  lit: AggregatedGrants["weaponBindings"],
  character: CharacterDoc
): Map<number, ResolvedWeaponBinding> {
  const { session, character: data } = character;
  const picks = session.grantBundleChoices ?? {};
  const level = characterLevel(character);
  const bound = new Map<number, ResolvedWeaponBinding>();
  for (const { sourceId, activeKey, grant } of lit) {
    const address = decodeWeaponAddress(picks[grant.choiceKey]);
    if (!address) continue;
    const index = weaponIndexOf(data.weapons, address);
    const weapon = data.weapons[index];
    if (!weapon || weaponRejection(grant, weapon)) continue;
    const castLevel = session.activeSpellCastLevels?.[activeKey] ?? 0;
    const bonus = tierAt(grant.bonusByCastLevel, castLevel)?.amount ?? grant.bonus ?? 0;
    const die = tierAt(grant.damageDieByLevel, level)?.die ?? grant.damageDie;
    const spellRef = data.spells.find((s) => !("custom" in s) && s.srdId === sourceId);
    const ability = grant.spellcastingAbility
      ? ((spellRef && !("custom" in spellRef)
          ? spellRef.spellAbilityOverride
          : undefined) ?? data.spellcasting?.ability)
      : undefined;
    const typeChoice = grant.damageTypeChoice;
    const picked = typeChoice ? picks[typeChoice.choiceKey] : undefined;
    const damageType =
      isDamageType(picked) && typeChoice?.options.includes(picked) ? picked : undefined;
    const prior = bound.get(index);
    bound.set(index, {
      ...prior,
      sourceId,
      activeKey,
      bonus: (prior?.bonus ?? 0) + bonus,
      ...(ability ? { attackAbility: ability } : {}),
      ...(die ? { damageDie: asDice(die) } : {}),
      ...(damageType ? { damageType } : {}),
      ...(typeChoice
        ? {
            damageTypeOptions: typeChoice.options,
            damageTypeChoiceKey: typeChoice.choiceKey,
          }
        : {}),
    });
  }
  return bound;
}
