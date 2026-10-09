/**
 * Activities: every active mechanic in one shape (see `./types`). Translators
 * read today's catalogue dialects; readers migrate to `Activity` one consumer
 * family at a time.
 */
export * from "./types";
export { activityFromSpell, translateSpell } from "./from-spell";
export { activityFromAction, translateAction, type ActionOwner } from "./from-action";
export {
  activityFromBeastAttack,
  activityFromCompanionAttack,
  translateMonsterEntry,
} from "./from-creature";
export { activityFromItemActivation } from "./from-item";
export { translateWeapon } from "./from-weapon";
export {
  actionTypeOf,
  addsSpellMod,
  castingTimeKey,
  damageTypeFacet,
  effectsOfKind,
  fixedDamageType,
  healDice,
  primaryDamage,
  secondaryDamage,
  type DamageTypeFacet,
} from "./read";
