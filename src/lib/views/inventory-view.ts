/**
 * Inventory presenter (`lib/views`) — the pure, framework-free seam that turns a
 * character + its aggregated grants into a render-ready inventory view-model
 * (docs/ARCHITECTURE.md). The InventoryTab orchestrator reads ONE
 * view-model in a single memo; its section components are presentational.
 *
 * ## What it does
 *  - Resolves the three item lists — weapons, armor, gear/potions — each with its
 *    full, localized, render-ready row VM (localized name + description, the
 *    weapon damage formula incl. the versatile `/` two-handed split, properties,
 *    mastery, category, to-hit, AC context, attunement state, charges, consumable
 *    flags, per-unit + total weight).
 *  - Localizes every SRD content string HERE via {@link localizeSrd} keyed by the
 *    stable item id (kind `"equipment"` for weapons/gear/armor, `"magic-item"` for
 *    magic items) — so when the BiText on `src/data/**` is later stripped, this
 *    surface keeps rendering. Custom (homebrew) items carry their own single-locale
 *    text and bypass the resolver via {@link localizeCustom}.
 *  - Resolves the cross-cutting summaries: attunement (bonded / cap / shown-when),
 *    encumbrance (carried / capacity / over), and exposes the raw currency.
 *
 * ## What it does NOT do
 *  - No React, no Zustand, no Firebase, no i18next (pure-modules-guard pins it).
 *  - Raw NUMBERS stay raw — to-hit signs, weight figures, "x / y" charge strings,
 *    AC-formula labels, and APP i18n strings (damage-type words, facts labels,
 *    status flags) are resolved at the EDGE with `t(...)` / `formatWeight`. The VM
 *    carries stable ids / structured fields / numbers for those; only SRD CONTENT
 *    (name / description) and the weapon property/category strings are pre-localized.
 *  - No icon resolution: seals are React glyphs (component layer). The VM carries
 *    the stable identity (`id` / `isCustom` / `magicItemType`) the section needs to
 *    pick a seal via `weaponSealIcon` / `equipmentSealIconById` / `magicItemSealIcon`.
 *
 * The result is a STABLE set of row VMs keyed on the character/locale — search runs
 * on top of them in the orchestrator without recreating any VM, so the memo'd cards
 * bail on a search keystroke (mirrors the spells slice).
 */

import type { Locale } from "@/lib/locale";
import type {
  CharacterData,
  CharacterDoc,
  SrdEquipmentRef,
  CustomEquipment,
  SrdWeaponRef,
  CustomWeapon,
} from "@/types/character";
import type { AbilityCode, CurrencyUnit, DamageType, MagicItemType } from "@/data/types";
import type { ProficiencyToken } from "@/types/ids";
import { WEAPONS_BY_ID } from "@/data/weapons";
import { GEAR_BY_ID } from "@/data/gear";
import { ARMOR_BY_ID } from "@/data/armor";
import { MAGIC_ITEMS_BY_ID } from "@/data/magic-items";
import { requiresAttunement } from "@/lib/attunement";
import { getClassTable } from "@/data/classes";
import { totalLevel, primaryClassId, allEntryPicks } from "@/lib/classes";
import {
  abilityModifier,
  effectiveProficiencyBonus,
  isWeaponProficient,
  isArmorProficient,
  resolveWeaponAttackStat,
  resolveItemBoundWeaponBonus,
  exhaustionPenalty,
  carryingCapacity,
  effectiveAbilityScores,
  effectiveWeaponDie,
} from "@/lib/compute";
import { evaluateGrants, type AggregatedGrants } from "@/lib/grants";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  buildWeaponDamageBreakdown,
  resolveWeaponDamageBonuses,
  buildWeaponAttackBreakdown,
  resolveWeaponAttackBonuses,
  isMonkMeleeWeapon,
  featureClassRow,
  freeCastItemChargeMax,
  masteryNumbers,
} from "@/lib/smart-tracker";
import { breakdownTotal } from "@/lib/value-breakdown";
import {
  localizeDamageBreakdown,
  localizeBreakdown,
} from "@/lib/views/combat-action-view";
// LocText constructors for the breakdown composer (aliased — this module has
// its own string-returning `srdText` helper below).
import { srdText as srdTextRef, customText as customTextRef } from "@/lib/loc-text";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { effectiveArmorProficiencies } from "@/lib/feat-prereq";
import { buildWeaponRange } from "@/lib/smart-tracker";
import { appendAbilityModToDice } from "@/lib/utils";
import { buildWeaponFacts, type WeaponFactsVM } from "@/lib/views/weapon-facts-view";
import { resolveItemConsumable } from "@/lib/srd-resolve";
import { localizeSrd, localizeCustom, hasSrd } from "@/i18n/resolver";

type WeaponRef = SrdWeaponRef | CustomWeapon;
type EquipRef = SrdEquipmentRef | CustomEquipment;

/** The AC formula context for an armor row (raw — `t` formats it at the edge). */
export interface ArmorAcVM {
  base: number;
  dexBonus: boolean;
  maxDex?: number;
  /** Armor category ("light"/"medium"/"heavy"/"shield") — drives the formula label. */
  category: string | undefined;
}

/** Magic-item / wand / staff charge counter (raw counts). */
export interface ChargesVM {
  current: number;
  max: number;
  /**
   * Set when the pool is TRACKER-BACKED (a `free-cast-spell` charge pool keyed
   * by the item id — the SAME counter the Play-board cast debits and the rail
   * shows, golden rule 6). The spend affordance then routes to the session
   * tracker; `null` means the pool lives on the stored `ref.charges` (manual /
   * non-cast charged items).
   */
  trackerId: string | null;
}

/** SRD list price (raw; the edge localizes the currency abbreviation). */
export interface CostVM {
  amount: number;
  unit: CurrencyUnit;
}

/** One weapon row's complete, localized, render-ready view-model. */
export interface WeaponRowVM {
  /** Stable React key + identity (SRD id, or `custom-<name>`). */
  id: string;
  /** Index into the STORED `weapons[]` array. */
  idx: number;
  isCustom: boolean;

  // ── localized content ──
  name: string;
  /** Canonical EN name — the accent-insensitive search anchor. */
  searchEn: string;
  description: string;

  // ── numbers (raw; edge formats) ──
  quantity: number;
  /** PER-UNIT SRD weight in lb (custom → 0). */
  weight: number;
  /** The SRD list price (the "value" fact), or null (custom / unpriced). */
  cost: CostVM | null;
  attackBonus: number;
  /** Flat damage modifier — ability mod + bound enchant + active flat grant
   *  bonuses (Rage Damage while raging — issue #27). */
  damageMod: number;
  damageDie: string;
  /** The versatile (two-handed) die, or null when the weapon has none. */
  versatileDie: string | null;
  /** Raw damage-type id (drives the §11 chromatic verdict + the `srd.damage_*` word). */
  damageType: DamageType;

  /**
   * The unified weapon facts block (damage formulas, to-hit, range, the
   * category / property / OWNED-mastery chips) — the SAME `WeaponFactsVM` the
   * combat presenter builds for this weapon, rendered by the ONE shared
   * `WeaponFacts` component on both surfaces (owner mandate 2026-06-12).
   */
  facts: WeaponFactsVM;

  isProficient: boolean;
  notes: string;

  // ── PRIM-item-bound-bonus (weapon enchant) ──
  /** The bound +N magic-item id (`SrdWeaponRef.enchantItemId`), or null. */
  enchantItemId: string | null;
  /** Localized name of the bound item (derived from the id), or null. */
  enchantName: string | null;
  /** The bound item's +N (already folded into attackBonus/damageMod), or 0. */
  enchantBonus: number;

  // ── custom-weapon edit fields (raw stored values) ──
  rawDamageDie: string | undefined;
  rawDamageType: DamageType | undefined;
  rawAttackStat: "STR" | "DEX" | undefined;
  rawProperties: string | undefined;
  attackBonusOverride: number | null;
  damageOverride: string | null;
}

/** One armor / gear / potion / magic-item row's view-model. */
export interface ItemRowVM {
  id: string;
  idx: number;
  isCustom: boolean;
  /** Which section this row belongs to. */
  category: "armor" | "gear";

  // ── localized content ──
  name: string;
  searchEn: string;
  description: string;

  // ── numbers / state ──
  quantity: number;
  /** PER-UNIT weight in lb (bundle items divide by bundleSize; custom → 0). */
  weight: number;
  /** The SRD list price (per bundle for bundle items), or null (custom /
   *  magic items — 2024 prices magic items by rarity, not a list cost). */
  cost: CostVM | null;
  notes: string;
  equipped: boolean;
  tracked: boolean;
  isConsumable: boolean;
  isPotion: boolean;
  potionFormula: string | undefined;
  isPool: boolean;
  unit: string | undefined;
  charges: ChargesVM | null;

  // ── attunement / wearing ──
  requiresAttunement: boolean;
  attuned: boolean;
  /**
   * Whether the row earns an Equip (wear/wield) toggle: a non-consumable SRD
   * magic item whose effects gate on being worn (`grants` and/or a stored
   * `acBonus`) — the SAME activity gate `resolveGrantSourcesForEquipment` /
   * `computeAC` apply. Armor rows keep their own equip toggle; inert gear
   * (a crowbar) earns none (only-and-all-the-necessary).
   */
  wearable: boolean;

  // ── armor context ──
  armorAc: ArmorAcVM | null;
  stealthDisadvantage: boolean;
  /** Armor the class is NOT proficient with (Disadvantage + no spellcasting). */
  unproficientArmor: boolean;

  // ── seal identity (component picks the glyph) ──
  /** The magic-item type when this row resolves to a magic item, else null. */
  magicItemType: MagicItemType | null;
}

/** The attunement summary chip (bonded vs cap). */
export interface AttunementVM {
  bonded: number;
  cap: number;
  /** Any item requires attunement. */
  hasAny: boolean;
  /** Show the chip (attunement is in play OR the cap exceeds the base 3). */
  show: boolean;
}

/** The carried-weight / capacity readout (raw lb; edge formats). */
export interface EncumbranceVM {
  carried: number;
  capacity: number;
  over: boolean;
}

/** A bindable weapon-enchant option — a +N magic weapon item in the inventory. */
export interface EnchantOptionVM {
  /** Stable magic-item srdId (golden rule 7 — the picker binds ids). */
  id: string;
  /** Localized item name (display only, derived from the id). */
  label: string;
  /** The item's +N to attack & damage. */
  bonus: number;
}

/** The complete Inventory-tab view-model. */
export interface InventoryViewModel {
  weapons: WeaponRowVM[];
  /** Armor rows (the `category === "armor"` slice). */
  armor: ItemRowVM[];
  /** Gear + potion rows (the `category === "gear"` slice). */
  gear: ItemRowVM[];
  attunement: AttunementVM;
  encumbrance: EncumbranceVM | null;
  /**
   * The +N magic-weapon items in the inventory a weapon row can BIND to
   * (PRIM-item-bound-bonus — closes needs-UI:weapon-enchant-picker). Empty for
   * characters with no such item, hiding the picker entirely.
   */
  enchantOptions: EnchantOptionVM[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

const ATTUNEMENT_DEFAULT = 3;

/** Localize an SRD equipment/magic-item field, omitting it (→ "") when absent
 *  (a longsword carries no description). */
function srdText(
  kind: "equipment" | "magic-item",
  id: string,
  field: string,
  locale: Locale
): string {
  return hasSrd(kind, id, field, locale) ? localizeSrd(kind, id, field, locale) : "";
}

/** Feature-granted weapon/armor proficiencies + attunement cap (Valor Bard, etc.)
 *  + the flat weapon-damage bonuses currently up (`while-active` grants gate on
 *  the session's active set — Rage Damage only flows while raging, issue #27). */
function grantAggregates(
  character: CharacterData,
  activeFeatures: ReadonlyArray<string>
): {
  weapon: ProficiencyToken[];
  armor: ProficiencyToken[];
  attunementSlots: number;
  weaponDamageBonuses: AggregatedGrants["weaponDamageBonuses"];
  weaponAttackBonuses: AggregatedGrants["weaponAttackBonuses"];
  weaponAttackAbilities: AggregatedGrants["weaponAttackAbilities"];
} {
  const agg = evaluateGrants(
    resolveGrantSourcesForFeatures(character.features),
    new Set(activeFeatures)
  );
  return {
    weapon: [...agg.weaponProficiencies],
    armor: [...agg.armorProficiencies],
    attunementSlots: agg.attunementSlots,
    weaponDamageBonuses: agg.weaponDamageBonuses,
    weaponAttackBonuses: agg.weaponAttackBonuses,
    weaponAttackAbilities: agg.weaponAttackAbilities,
  };
}

/** Build one weapon row VM (everything localized for `locale`). */
function buildWeaponVM(
  ref: WeaponRef,
  idx: number,
  ctx: {
    doc: CharacterDoc;
    locale: Locale;
    /** The EFFECTIVE ability scores (set-score item floors + additive item bonuses
     *  — Gauntlets of Ogre Power → STR 19, Belt of Giant Strength) — the SAME
     *  derivation the combat attack row resolves against, so the inventory to-hit /
     *  damage / attack-stat choice can never disagree with the Play card (rule 6). */
    effectiveScores: Record<AbilityCode, number>;
    effectivePB: number;
    exPenalty: number;
    classProficiencies: ProficiencyToken[];
    /** The SRD weapon ids the character has MASTERED (`classes[].weaponMasteries`
     *  union) — the ONE ownership truth the mastery chip gates on. */
    masteredIds: ReadonlySet<string>;
    /** The flat weapon-damage bonuses currently up (`weapon-damage-bonus` —
     *  Rage Damage while raging); the SAME resolver the combat row uses so the
     *  inventory figure can never disagree with the Play card. */
    weaponDamageBonuses: AggregatedGrants["weaponDamageBonuses"];
    /** The flat weapon to-hit bonuses (`weapon-attack-bonus` — Archery & other
     *  fighting styles); the SAME resolver the combat row uses so the inventory
     *  to-hit + its breakdown can never disagree with the Play card (#94). */
    weaponAttackBonuses: AggregatedGrants["weaponAttackBonuses"];
    /** Weapon-attack-ability grants (Monk Martial Arts) carrying the optional
     *  die upgrade; the SAME `effectiveWeaponDie` the combat row uses so the
     *  inventory printed die matches the Play card (a Monk weapon's MA die). */
    weaponAttackAbilities: AggregatedGrants["weaponAttackAbilities"];
  }
): WeaponRowVM {
  const {
    doc,
    locale,
    effectiveScores,
    effectivePB,
    exPenalty,
    classProficiencies,
    masteredIds,
  } = ctx;
  const isCustom = "custom" in ref;
  const srdWeapon = isCustom ? undefined : WEAPONS_BY_ID.get(ref.srdId);

  const name = isCustom
    ? localizeCustom(ref.name)
    : srdWeapon
      ? localizeSrd("equipment", ref.srdId, "name", locale)
      : titleize(ref.srdId);
  const searchEn = isCustom
    ? localizeCustom(ref.name)
    : srdWeapon
      ? localizeSrd("equipment", ref.srdId, "name", "en")
      : ref.srdId;

  const rawProperties = isCustom
    ? splitCustomProperties(ref.properties)
    : (srdWeapon?.properties ?? []);

  // Resolve the attack stat through the SAME authority the Combat row uses
  // (finesse STR-vs-DEX + the Monk Martial-Arts DEX swap on Monk weapons), so the
  // inventory to-hit can NEVER disagree with the Play card (golden rule 6). The
  // previous call missed the monk-melee swap, so a Monk's inventory weapon showed
  // a STR to-hit while Combat showed DEX — the divergence this fix closes.
  const stat: AbilityCode = isCustom
    ? ref.attackStat
    : resolveWeaponAttackStat({
        weaponType: srdWeapon?.weaponType,
        properties: rawProperties,
        scores: effectiveScores,
        weaponAttackAbilities: ctx.weaponAttackAbilities,
        isMonkMelee: isMonkMeleeWeapon(srdWeapon),
      });
  const mod = abilityModifier(effectiveScores[stat]);

  const isProficient = isCustom
    ? true
    : isWeaponProficient(
        srdWeapon?.weaponCategory,
        // The stable SRD id anchors group-proficiency (`longswords` → `longsword`),
        // never the localized name (golden rule 7).
        srdWeapon ? ref.srdId : undefined,
        srdWeapon?.weaponType,
        rawProperties,
        classProficiencies
      );

  // PRIM-item-bound-bonus — the +N of the magic item bound to THIS weapon
  // (`enchantItemId`), auto-folded into to-hit + damage. Override-first: a
  // pinned attackBonusOverride/damageOverride replaces the whole figure, so
  // the enchant is NOT re-added on top (mirrors the combat weapon row).
  const enchantItemId = isCustom ? undefined : ref.enchantItemId;
  const enchantItem = enchantItemId ? MAGIC_ITEMS_BY_ID.get(enchantItemId) : undefined;
  const enchantBonus = resolveItemBoundWeaponBonus(enchantItem?.grants);
  const isRangedWeapon = !isCustom && srdWeapon?.weaponType === "ranged";
  const hasAtkOverride = ref.attackBonusOverride != null;
  // Flat to-hit bonuses (`weapon-attack-bonus` — Archery & other fighting
  // styles), resolved with provenance so the to-hit breakdown NAMES each by its
  // feat's canonical key (#94, golden rule 6). The SAME resolver the combat
  // attack row uses — so the inventory to-hit (previously missing these) now
  // matches the Play card exactly (golden rule 6).
  const attackFeatureBonuses = resolveWeaponAttackBonuses(ctx.weaponAttackBonuses, {
    isRanged: isRangedWeapon,
    scores: effectiveScores,
  });
  // Per-source to-hit composition for the tooltip — empty under an override.
  const attackBreakdownParts = buildWeaponAttackBreakdown({
    attackStat: stat,
    abilityMod: mod,
    proficiencyBonus: isProficient ? effectivePB : 0,
    enchantBonus,
    ...(enchantItem && enchantBonus !== 0
      ? { enchantName: srdTextRef("magic-item", enchantItem.id, "name") }
      : {}),
    featureBonuses: attackFeatureBonuses,
    exhaustionPenalty: exPenalty,
    hasOverride: hasAtkOverride,
  });
  // The to-hit DERIVES from the breakdown (golden rule 6; the AC pattern), so
  // the figure and the tip are the same arithmetic. Override pins it directly.
  const attackBonus = hasAtkOverride
    ? (ref.attackBonusOverride ?? 0) + exPenalty
    : breakdownTotal(attackBreakdownParts);
  const attackBreakdown = localizeBreakdown(attackBreakdownParts, locale);
  // Flat damage bonuses currently up (`weapon-damage-bonus` — Rage Damage while
  // raging, issue #27): the SAME resolver the combat attack row uses, so the
  // inventory figure and the Play card can never disagree (golden rule 6).
  const isHeavyWeapon = rawProperties.some((p) => /\bheavy\b/i.test(p));
  const featureBonuses = resolveWeaponDamageBonuses(ctx.weaponDamageBonuses, doc, {
    attackStat: stat,
    isRanged: isRangedWeapon,
    isHeavy: isHeavyWeapon,
  });
  const featureDmgBonus = featureBonuses.reduce((s, b) => s + b.amount, 0);
  // Monk Martial Arts die upgrade (a Monk weapon's printed die is replaced by the
  // larger MA die) — the SAME `effectiveWeaponDie` the combat row uses, resolved
  // against the Monk's own level via `featureClassRow` (golden rule 6).
  const printedDie = isCustom ? ref.damageDie : (srdWeapon?.damage?.die ?? "1d8");
  const damageDie = isCustom
    ? printedDie
    : effectiveWeaponDie(
        printedDie,
        isMonkMeleeWeapon(srdWeapon),
        ctx.weaponAttackAbilities,
        (sid, key) => (sid ? featureClassRow(sid, doc)?.[key] : undefined)
      );
  const damageType: DamageType = isCustom
    ? ref.damageType
    : (srdWeapon?.damage?.type ?? "slashing");

  // Parse "Versatile (1d10)" out of the properties for the two-handed die, then
  // run it through the SAME `effectiveWeaponDie` the one-handed `damageDie` uses
  // — the Monk Martial Arts die replaces a Monk weapon's die in EITHER grip, so
  // a Quarterstaff (Versatile (1d8), a Monk weapon) two-handed at Monk L11+ shows
  // the larger MA die. A non-Monk versatile weapon (Longsword) is unaffected.
  const rawVersatileDie =
    rawProperties
      .map((p) => /Versatile\s*\(([^)]+)\)/i.exec(p)?.[1])
      .find((m): m is string => !!m) ?? null;
  const versatileDie =
    rawVersatileDie && !isCustom
      ? effectiveWeaponDie(
          rawVersatileDie,
          isMonkMeleeWeapon(srdWeapon),
          ctx.weaponAttackAbilities,
          (sid, key) => (sid ? featureClassRow(sid, doc)?.[key] : undefined)
        )
      : rawVersatileDie;

  const description = isCustom
    ? ref.description
      ? localizeCustom(ref.description)
      : ""
    : srdWeapon
      ? srdText("equipment", ref.srdId, "description", locale)
      : "";

  // The unified weapon facts block — the SAME `buildWeaponFacts` recipe the
  // combat presenter runs for this weapon, so both surfaces are identical by
  // construction. Override-first: a pinned `damageOverride` replaces the whole
  // formula (no versatile split — the player owns the figure), mirroring the
  // combat resolver. The mastery chip is gated on OWNERSHIP (a
  // `classes[].weaponMasteries` pick covering this weapon), never on the mere
  // presence of a mastery on the weapon. The while-active flat bonuses
  // (`featureDmgBonus` — Rage Damage) fold into the SAME modifier as the STR/
  // enchant bonus, so both the one-handed AND the two-handed (Versatile)
  // formulas carry the full bonus — skipped entirely under `damageOverride`.
  const hasDamageOverride = ref.damageOverride != null && ref.damageOverride !== "";
  const damageMod = mod + enchantBonus + featureDmgBonus;

  // Per-source damage composition for the damage tooltip — composed by the ONE
  // engine builder the combat row uses, localized here (SRD names only), then
  // carried on `facts.breakdown` so the shared `WeaponFacts` component attaches
  // it to the damage label (golden rule 6: combat card and inventory card read
  // identically). Empty under override — the breakdown is then suppressed.
  const damageBreakdown = localizeDamageBreakdown(
    buildWeaponDamageBreakdown({
      damageDie,
      weaponName: isCustom
        ? customTextRef(ref.name)
        : srdTextRef("equipment", ref.srdId, "name"),
      attackStat: stat,
      abilityMod: mod,
      enchantBonus,
      ...(enchantItem
        ? { enchantName: srdTextRef("magic-item", enchantItem.id, "name") }
        : {}),
      featureBonuses,
      hasOverride: hasDamageOverride,
    }),
    locale
  );

  // The weapon's OWNED mastery — surfaced ONLY when the character mastered THIS
  // weapon (the chip is gated by construction). Resolved ONCE and reused for both
  // the mastery chip and its resolved numbers, so the two can't drift.
  const ownedMastery =
    !isCustom && srdWeapon?.mastery && masteredIds.has(ref.srdId)
      ? srdWeapon.mastery
      : null;

  const facts = buildWeaponFacts(
    {
      damage: hasDamageOverride
        ? (ref.damageOverride ?? "")
        : appendAbilityModToDice(damageDie, damageMod),
      versatileDamage:
        versatileDie && !hasDamageOverride
          ? appendAbilityModToDice(versatileDie, damageMod)
          : null,
      damageType,
      attackBonus,
      rangeSpec: buildWeaponRange(rawProperties, {
        isRanged: srdWeapon?.weaponType === "ranged",
      }),
      properties: rawProperties,
      category: srdWeapon?.weaponCategory,
      mastery: ownedMastery,
      // RA-13 — the resolved Topple DC / Graze number, through the SAME
      // `masteryNumbers` seam (and the SAME stat + PB) the combat row uses, so
      // the two surfaces' chips are identical by construction (golden rule 6).
      masteryDetail: ownedMastery
        ? masteryNumbers([ownedMastery], mod, effectivePB)
        : undefined,
      breakdown: damageBreakdown,
      attackBreakdown,
    },
    locale
  );

  return {
    id: isCustom ? `custom-${ref.name}` : ref.srdId,
    idx,
    isCustom,
    name,
    searchEn,
    description,
    quantity: ref.quantity,
    weight: srdWeapon?.weight ?? 0,
    cost: srdWeapon?.cost ?? null,
    attackBonus,
    damageMod,
    damageDie,
    versatileDie,
    damageType,
    facts,
    isProficient,
    notes: ref.notes ?? "",
    enchantItemId: enchantItem ? (enchantItemId ?? null) : null,
    enchantName: enchantItem
      ? localizeSrd("magic-item", enchantItem.id, "name", locale)
      : null,
    enchantBonus,
    rawDamageDie: isCustom ? ref.damageDie : undefined,
    rawDamageType: isCustom ? ref.damageType : undefined,
    rawAttackStat: isCustom ? ref.attackStat : undefined,
    rawProperties: isCustom ? ref.properties : undefined,
    attackBonusOverride: ref.attackBonusOverride ?? null,
    damageOverride: ref.damageOverride ?? null,
  };
}

/** Build one equipment (armor / gear / potion / magic-item) row VM. */
function buildItemVM(
  ref: EquipRef,
  idx: number,
  ctx: {
    locale: Locale;
    armorProficiencies: ProficiencyToken[];
    /** Session tracker spend state — the one source a `free-cast-spell` charge
     *  pool lives in (the same id the Play-board cast debits). */
    trackers: Readonly<Record<string, { used: number }>>;
  }
): ItemRowVM {
  const { locale, armorProficiencies } = ctx;
  const isCustom = "custom" in ref;
  const srdItem = isCustom
    ? undefined
    : (GEAR_BY_ID.get(ref.srdId) ?? ARMOR_BY_ID.get(ref.srdId));
  // Magic items are SRD references too (srdId → magic-item row); only genuine
  // homebrew (`custom: true`) renders as custom.
  const magicItem = isCustom || srdItem ? undefined : MAGIC_ITEMS_BY_ID.get(ref.srdId);
  const isArmor =
    !isCustom && (ARMOR_BY_ID.has(ref.srdId) || magicItem?.type === "armor");

  const name = isCustom
    ? localizeCustom(ref.name)
    : srdItem
      ? localizeSrd("equipment", ref.srdId, "name", locale)
      : magicItem
        ? localizeSrd("magic-item", ref.srdId, "name", locale)
        : titleize(ref.srdId);
  const searchEn = isCustom
    ? localizeCustom(ref.name)
    : srdItem
      ? localizeSrd("equipment", ref.srdId, "name", "en")
      : magicItem
        ? localizeSrd("magic-item", ref.srdId, "name", "en")
        : ref.srdId;
  const description = isCustom
    ? ref.description
      ? localizeCustom(ref.description)
      : ""
    : srdItem
      ? srdText("equipment", ref.srdId, "description", locale)
      : magicItem
        ? srdText("magic-item", ref.srdId, "description", locale)
        : "";

  // Consumable / potion / heal-formula display DERIVES from the SRD entry (golden
  // rule 6 — the same resolver the combat board uses).
  const { isPotion, potionFormula, isConsumable } = resolveItemConsumable(ref);
  const tracked = isConsumable || (ref.tracked ?? false);

  // Per-unit weight: bundle items (ammunition) list weight per bundle, so divide.
  const weight = (srdItem?.weight ?? magicItem?.weight ?? 0) / (srdItem?.bundleSize ?? 1);

  const armorAc: ArmorAcVM | null = srdItem?.ac
    ? {
        base: srdItem.ac.base,
        dexBonus: srdItem.ac.dexBonus,
        maxDex: srdItem.ac.maxDex,
        category: srdItem.armorCategory,
      }
    : null;

  // Charges — ONE source per item (golden rule 6). A `free-cast-spell` charge
  // pool (Wand of Web) lives in the SESSION TRACKER keyed by the item id — the
  // same counter the Play-board cast debits and the rail edits — so the row
  // reads (and spends) THAT, never a parallel `ref.charges` copy that could
  // drift. Items without a tracker pool keep the stored `ref.charges` counter.
  const poolId = !isCustom && magicItem ? ref.srdId : null;
  const poolMax = poolId && magicItem ? freeCastItemChargeMax(magicItem.grants) : 0;
  const charges: ChargesVM | null =
    poolId && poolMax > 0
      ? {
          current: Math.max(0, poolMax - (ctx.trackers[poolId]?.used ?? 0)),
          max: poolMax,
          trackerId: poolId,
        }
      : ref.charges
        ? { current: ref.charges.current, max: ref.charges.max, trackerId: null }
        : null;

  return {
    id: isCustom ? `custom-${ref.name}` : ref.srdId,
    idx,
    isCustom,
    category: isArmor ? "armor" : "gear",
    name,
    searchEn,
    description,
    quantity: ref.quantity ?? 1,
    weight,
    cost: srdItem?.cost ?? null,
    notes: ref.notes ?? "",
    equipped: ref.equipped ?? false,
    tracked,
    isConsumable,
    isPotion,
    potionFormula,
    isPool: ref.isPool ?? false,
    unit: ref.unit,
    charges,
    requiresAttunement: requiresAttunement(ref),
    attuned: ref.attuned === true,
    wearable:
      !isArmor &&
      !isConsumable &&
      magicItem != null &&
      ((magicItem.grants?.length ?? 0) > 0 || ref.acBonus != null),
    armorAc,
    stealthDisadvantage: !isCustom && (srdItem?.stealthDisadvantage ?? false),
    unproficientArmor:
      isArmor && !isArmorProficient(srdItem?.armorCategory, armorProficiencies),
    magicItemType: magicItem?.type ?? null,
  };
}

/** Split a custom weapon's comma-joined property string into a trimmed list. */
function splitCustomProperties(properties: string | undefined): string[] {
  if (!properties) return [];
  return properties
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Title-case a kebab srdId as the honest fallback name for an unknown id. */
function titleize(srdId: string): string {
  return srdId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── the presenter ──────────────────────────────────────────────────────────────

/**
 * Build the complete, localized Inventory-tab view-model from a character
 * document and the active locale. Pure — the React orchestrator feeds this
 * straight into its render and runs search on top of the stable row lists.
 */
export function buildInventoryViewModel(
  doc: CharacterDoc,
  locale: Locale
): InventoryViewModel {
  const { character } = doc;
  const classId = primaryClassId(character);
  const classData = getClassTable(classId);
  const grants = grantAggregates(character, doc.session.activeFeatures ?? []);

  // The EFFECTIVE ability scores — the SAME chokepoint the COMBAT attack row and the
  // cockpit display resolve against (set-score item floors + additive item bonuses:
  // Gauntlets of Ogre Power → STR 19, Belt of Giant Strength, Belt of Dwarvenkind +2).
  // Feeds the weapon to-hit / damage / attack-stat choice AND carrying capacity, so
  // the inventory weapon list and the Play card can never disagree, and capacity uses
  // the equipped STR (rule 6). The floors/bonuses come from the WHOLE-character
  // aggregate (`resolveAllGrantSources` — it sees EQUIPPED items, which `grantAggregates`
  // above deliberately does not), threading the session toggles like the combat path.
  // Behaviour-preserving with no ability-score item (floors/bonus empty → an equal-
  // valued copy of the stored scores).
  const scoreAgg = aggregateCharacterGrants(character, doc.session);
  const effectiveScores = effectiveAbilityScores(
    character.abilityScores,
    scoreAgg.abilityScoreFloors,
    scoreAgg.itemAbilityScoreBonus,
    scoreAgg.itemAbilityScoreCap
  );

  const level = totalLevel(character);
  const effectivePB = effectiveProficiencyBonus(
    level,
    character.proficiencyBonusOverride
  );
  const exPenalty = exhaustionPenalty(doc.session.exhaustion);
  const classProficiencies = [
    ...(classData?.weaponProficiencies ?? []),
    ...grants.weapon,
  ];
  // The EFFECTIVE armor-proficiency set — the SAME multiclass-aware + override-first
  // resolver the combat unproficient-armor Disadvantage clause reads (rule 6), so
  // the per-item "Untrained" gloss and that clause are identical by construction (a
  // force-added heavy-armor override drops "Untrained" here AND the clause together).
  const armorProficiencies = [...effectiveArmorProficiencies(character)];

  const weapons = character.weapons.map((ref, idx) =>
    buildWeaponVM(ref, idx, {
      doc,
      locale,
      effectiveScores,
      effectivePB,
      exPenalty,
      classProficiencies,
      masteredIds: new Set(allEntryPicks(character, "weaponMasteries")),
      weaponDamageBonuses: grants.weaponDamageBonuses,
      weaponAttackBonuses: grants.weaponAttackBonuses,
      weaponAttackAbilities: grants.weaponAttackAbilities,
    })
  );

  const items = character.equipment.map((ref, idx) =>
    buildItemVM(ref, idx, {
      locale,
      armorProficiencies,
      trackers: doc.session.trackers,
    })
  );
  const armor = items.filter((i) => i.category === "armor");
  const gear = items.filter((i) => i.category === "gear");

  // Attunement summary — the SAME data-derived rule the row VMs use.
  const requiring = character.equipment.filter(requiresAttunement);
  const bonded = requiring.filter((i) => i.attuned === true).length;
  const cap = grants.attunementSlots;
  const attunement: AttunementVM = {
    bonded,
    cap,
    hasAny: requiring.length > 0,
    show: requiring.length > 0 || cap > ATTUNEMENT_DEFAULT,
  };

  // Encumbrance — carried weight vs capacity (STR × 15 lb, 2024). Custom items 0.
  // Capacity reads the EFFECTIVE STR (a set-score / additive item raises it), the
  // same single source the weapon rows use (rule 6) — never the raw stored STR.
  const carried =
    weapons.reduce((s, w) => s + w.weight * w.quantity, 0) +
    items.reduce((s, i) => s + i.weight * i.quantity, 0);
  const capacity = carryingCapacity(effectiveScores.STR).carry;
  const encumbrance: EncumbranceVM = {
    carried,
    capacity,
    over: carried > capacity,
  };

  // Bindable weapon enchants — every inventory magic item carrying an
  // `item-bound-bonus` grant (weapon-plus-1/2/3, Vorpal Sword, Sun Blade, …).
  const enchantOptions: EnchantOptionVM[] = [];
  for (const ref of character.equipment) {
    if ("custom" in ref) continue;
    const item = MAGIC_ITEMS_BY_ID.get(ref.srdId);
    const bonus = resolveItemBoundWeaponBonus(item?.grants);
    if (!item || bonus === 0) continue;
    if (enchantOptions.some((o) => o.id === item.id)) continue;
    enchantOptions.push({
      id: item.id,
      label: localizeSrd("magic-item", item.id, "name", locale),
      bonus,
    });
  }

  return {
    weapons,
    armor,
    gear,
    attunement,
    encumbrance,
    enchantOptions,
  };
}
