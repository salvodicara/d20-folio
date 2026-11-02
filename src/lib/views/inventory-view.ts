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
 *    magic items) — so when the LocaleText on `src/data/**` is later stripped, this
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
 *    the catalogue identity (`id` / `isCustom` / `magicItemType`) the section needs
 *    to pick a seal via `weaponSealIcon` / `equipmentSealIconById` /
 *    `magicItemSealIcon`; the separate `rowId` is UI-state identity only.
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
import type { CurrencyUnit, MagicItemType } from "@/data/types";
import type { DamageType } from "@/types/damage";
import type { ProficiencyToken } from "@/types/ids";
import { WEAPONS_BY_ID } from "@/data/weapons";
import { GEAR_BY_ID } from "@/data/gear";
import { ARMOR_BY_ID } from "@/data/armor";
import { MAGIC_ITEMS_BY_ID } from "@/data/magic-items";
import { requiresAttunement } from "@/lib/attunement";
import {
  isArmorProficient,
  resolveItemBoundWeaponBonus,
  resolveItemBoundDamageRiders,
  carryingCapacity,
  aggregateAbilityScores,
} from "@/lib/compute";
import { evaluateGrants, type AggregatedGrants } from "@/lib/grants";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { magicItemChargeMax } from "@/lib/smart-tracker";
import {
  localizeDamageBreakdown,
  localizeBreakdown,
} from "@/lib/views/combat-action-view";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { effectiveArmorProficiencies } from "@/lib/feat-prereq";
import {
  buildWeaponRange,
  resolveActions,
  type RawActionSummary,
} from "@/lib/smart-tracker";
import { appendAbilityModToDice } from "@/lib/utils";
import { buildWeaponFacts, type WeaponFactsVM } from "@/lib/views/weapon-facts-view";
import { resolveItemConsumable } from "@/lib/srd-resolve";
import { localizeSrd, localizeCustom, hasSrd } from "@/i18n/resolver";
import {
  buildItemResourceViewModels,
  type ItemResourceVM,
} from "@/lib/views/item-resource-view";

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
   * Set when the pool is TRACKER-BACKED (a cast or activated-property pool keyed
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
  /** Catalogue identity for localization, seals, and rules (homebrew keeps its custom token). */
  id: string;
  /** Unique opaque row identity for React keys and disclosure state. Never render it. */
  rowId: string;
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
  /** Typed counters owned by this exact physical copy. Never collapsed by item id. */
  resources: ItemResourceVM[];
  /** Legacy counter only; typed items use `resources` as their sole owner. */
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
  /** Push/drag/lift ceiling = STR × 30 lb (twice `capacity`); shown in the capacity tooltip (2024 PHB). */
  pushDragLift: number;
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
    /** Each carried weapon's own attack row, by its place in `weapons[]`. */
    rows: ReadonlyMap<number, RawActionSummary>;
  }
): WeaponRowVM {
  const { locale } = ctx;
  const isCustom = "custom" in ref;
  const srdWeapon = isCustom ? undefined : WEAPONS_BY_ID.get(ref.srdId);

  const name = isCustom
    ? localizeCustom(ref.name, locale)
    : srdWeapon
      ? localizeSrd("equipment", ref.srdId, "name", locale)
      : titleize(ref.srdId);
  const searchEn = isCustom
    ? localizeCustom(ref.name, "en")
    : srdWeapon
      ? localizeSrd("equipment", ref.srdId, "name", "en")
      : ref.srdId;

  const rawProperties = isCustom
    ? splitCustomProperties(ref.properties)
    : (srdWeapon?.properties ?? []);

  // The numbers are the weapon's own attack row (smart-tracker `resolveWeaponActions`):
  // the SAME stat, proficiency, to-hit, die, damage modifier, range and mastery the Play
  // card shows, a spell bound to the weapon (Magic Weapon, Shillelagh) and grants from
  // invocations and spells included. Nothing is recomputed here, so the two cards
  // cannot disagree (simplify-core item 7; `weapon-attack-parity.test.ts`).
  const row = ctx.rows.get(idx);
  const parts = row?.weaponParts;
  const attackBonus = row?.attackBonus ?? 0;
  const damageMod = parts?.damageMod ?? 0;
  const damageDie =
    parts?.die ?? (isCustom ? ref.damageDie : (srdWeapon?.damage?.die ?? "1d8"));
  const versatileDie = parts?.versatileDie ?? null;
  const isProficient = parts?.proficient ?? true;
  const damageType: DamageType =
    (row?.damageType as DamageType | undefined) ??
    (isCustom ? ref.damageType : (srdWeapon?.damage?.type ?? "slashing"));
  // The bound magic item's own +N, for the card's enchant line (already in the numbers).
  const enchantItemId = isCustom ? undefined : ref.enchantItemId;
  const enchantItem = enchantItemId ? MAGIC_ITEMS_BY_ID.get(enchantItemId) : undefined;
  const enchantBonus = resolveItemBoundWeaponBonus(enchantItem?.grants);

  const description = isCustom
    ? ref.description
      ? localizeCustom(ref.description, locale)
      : ""
    : srdWeapon
      ? srdText("equipment", ref.srdId, "description", locale)
      : "";

  const facts = buildWeaponFacts(
    {
      damage: row?.damage ?? appendAbilityModToDice(damageDie, damageMod),
      versatileDamage: row?.versatileDamage ?? null,
      damageType,
      attackBonus,
      rangeSpec:
        row?.weaponRange ??
        buildWeaponRange(rawProperties, {
          isRanged: srdWeapon?.weaponType === "ranged",
        }),
      properties: rawProperties,
      category: srdWeapon?.weaponCategory,
      mastery: row?.weaponMastery ?? null,
      extraMasteries: row?.extraMasteries,
      masteryDetail: row?.masteryDetail,
      breakdown: row?.damageBreakdown
        ? localizeDamageBreakdown(row.damageBreakdown, locale)
        : null,
      attackBreakdown: row?.attackBreakdown
        ? localizeBreakdown(row.attackBreakdown, locale)
        : null,
      heavyDisadvantage: row?.heavyDisadvantage ?? false,
    },
    locale
  );

  return {
    id: isCustom ? ref.instanceId : ref.srdId,
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
    /** Typed resources already resolved for this exact physical copy. */
    resources: ItemResourceVM[];
  }
): ItemRowVM {
  const { locale, armorProficiencies, resources } = ctx;
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
    ? localizeCustom(ref.name, locale)
    : srdItem
      ? localizeSrd("equipment", ref.srdId, "name", locale)
      : magicItem
        ? localizeSrd("magic-item", ref.srdId, "name", locale)
        : titleize(ref.srdId);
  const searchEn = isCustom
    ? localizeCustom(ref.name, "en")
    : srdItem
      ? localizeSrd("equipment", ref.srdId, "name", "en")
      : magicItem
        ? localizeSrd("magic-item", ref.srdId, "name", "en")
        : ref.srdId;
  const description = isCustom
    ? ref.description
      ? localizeCustom(ref.description, locale)
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
  const poolMax = poolId && magicItem ? magicItemChargeMax(magicItem.grants) : 0;
  const charges: ChargesVM | null =
    resources.length > 0
      ? null
      : poolId && poolMax > 0
        ? {
            current: Math.max(0, poolMax - (ctx.trackers[poolId]?.used ?? 0)),
            max: poolMax,
            trackerId: poolId,
          }
        : ref.charges
          ? { current: ref.charges.current, max: ref.charges.max, trackerId: null }
          : null;

  return {
    id: isCustom ? ref.instanceId : ref.srdId,
    rowId: isCustom
      ? `equipment-instance:${ref.instanceId}`
      : ref.instanceId !== undefined
        ? `equipment-instance:${ref.instanceId}`
        : `equipment-legacy:${idx}`,
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
    resources,
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
  const grants = grantAggregates(character, doc.session.activeFeatures ?? []);

  // The EFFECTIVE ability scores — the SAME chokepoint the COMBAT attack row and the
  // cockpit display resolve against (set-score item floors + additive item bonuses:
  // Gauntlets of Ogre Power → STR 19, Belt of Giant Strength, Belt of Dwarvenkind +2).
  // Feeds carrying capacity, which uses the equipped STR (rule 6); the weapon numbers
  // come from the weapons' own attack rows. The floors/bonuses come from the WHOLE-character
  // aggregate (`resolveAllGrantSources` — it sees EQUIPPED items, which `grantAggregates`
  // above deliberately does not), threading the session toggles like the combat path.
  // Behaviour-preserving with no ability-score item (floors/bonus empty → an equal-
  // valued copy of the stored scores).
  const scoreAgg = aggregateCharacterGrants(character, doc.session);
  const effectiveScores = aggregateAbilityScores(
    character.abilityScores,
    scoreAgg,
    character.abilityScoreOverrides
  );

  // The EFFECTIVE armor-proficiency set — the SAME multiclass-aware + override-first
  // resolver the combat unproficient-armor Disadvantage clause reads (rule 6), so
  // the per-item "Untrained" gloss and that clause are identical by construction (a
  // force-added heavy-armor override drops "Untrained" here AND the clause together).
  const armorProficiencies = [...effectiveArmorProficiencies(character)];

  // Typed physical-item resources resolve ONCE for the complete document. The
  // exact instance id is used only as an internal join key and never rendered.
  const resourceViews = buildItemResourceViewModels(doc).resources;
  const resourcesByInstance = new Map<string, ItemResourceVM[]>();
  for (const resource of resourceViews) {
    const owned = resourcesByInstance.get(resource.identity.instanceId) ?? [];
    owned.push(resource);
    resourcesByInstance.set(resource.identity.instanceId, owned);
  }

  // Each weapon's numbers are its own attack row: resolved once, read by index.
  const rows = new Map<number, RawActionSummary>();
  for (const action of resolveActions(doc)) {
    const index = action.summary.weaponParts?.index;
    if (index !== undefined && !rows.has(index)) rows.set(index, action.summary);
  }
  const weapons = character.weapons.map((ref, idx) =>
    buildWeaponVM(ref, idx, { doc, locale, rows })
  );

  const items = character.equipment.map((ref, idx) =>
    buildItemVM(ref, idx, {
      locale,
      armorProficiencies,
      trackers: doc.session.trackers,
      resources:
        "custom" in ref || ref.instanceId === undefined
          ? []
          : (resourcesByInstance.get(ref.instanceId) ?? []),
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
  const { carry: capacity, pushDragLift } = carryingCapacity(effectiveScores.STR, {
    asLargerSize: scoreAgg.carryAsLargerSize,
    pin: character.carryingCapacityOverride,
  });
  const encumbrance: EncumbranceVM = {
    carried,
    capacity,
    pushDragLift,
    over: carried > capacity,
  };

  // Bindable weapon enchants — every inventory magic item carrying an
  // `item-bound-bonus` grant (weapon-plus-1/2/3, Vorpal Sword, Sun Blade, …) or its
  // own extra damage (`item-bound-damage-rider`: Vicious Weapon, Flame Tongue).
  const enchantOptions: EnchantOptionVM[] = [];
  for (const ref of character.equipment) {
    if ("custom" in ref) continue;
    const item = MAGIC_ITEMS_BY_ID.get(ref.srdId);
    const bonus = resolveItemBoundWeaponBonus(item?.grants);
    const hasRider = resolveItemBoundDamageRiders(item?.grants, () => true).length > 0;
    if (!item || (bonus === 0 && !hasRider)) continue;
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
