/**
 * Equipment compendium spec — drives the unified "Add Item" modal's Equipment
 * tab (add mode) and the Compendium page's Equipment facet (browse). Replicates
 * `EquipmentAddBody` at parity: the category facet, already-added dedup across
 * BOTH equipment and weapons, and the dual commit (weapons → `weapons[]`,
 * everything else → `equipment[]` with the gear/pack `tracked` flag).
 */

import { Backpack } from "lucide-react";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { equipmentSealIcon, equipmentCategoryIcon } from "@/components/shared/item-icons";
import { addEquipmentRef, addWeaponRef } from "@/lib/equipment-add";
import { formatWeight } from "@/lib/utils";
import { localizeWeaponProperty } from "@/lib/views/srd-i18n";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { useCharacterStore } from "@/stores/characterStore";
import { Icon } from "@/components/ui/icon";
import { FilterChip } from "@/components/sheet/picker-parts";
import type { SrdEquipmentData, EquipmentCategory } from "@/data/types";
import type { SrdEquipmentRef, SrdWeaponRef } from "@/types/character";
import { defineFilter, type CompendiumPickerSpec } from "../types";
import { CmpSeal } from "../CmpSeal";
import { descriptionSearch, nameCorpus } from "./shared";

const CATEGORIES: { value: EquipmentCategory; key: string }[] = [
  { value: "weapon", key: "equipment.weapons" },
  { value: "armor", key: "equipment.armor" },
  { value: "shield", key: "equipment.shields" },
  { value: "gear", key: "equipment.gear" },
  { value: "tool", key: "equipment.tools" },
  { value: "pack", key: "equipment.packs" },
];

/** The seal pigment for an equipment category (mirrors the cockpit `.uc-seal kind`
 *  pigments — gear/packs lapis, the rest a neutral steel). Mundane gear stays quiet. */
function categoryTone(cat: EquipmentCategory): string {
  if (cat === "gear" || cat === "pack") return "var(--lapis-300)";
  return "var(--text-secondary)";
}

function formatCost(item: SrdEquipmentData): string {
  return `${item.cost.amount} ${item.cost.unit}`;
}

/** Resolve a localized SRD string for an equipment field (top-level catalogue key). */
const itemText = (i: SrdEquipmentData, field: string, locale: Locale) =>
  localizeSrd("equipment", i.id, field, locale);

export const equipmentSpec: CompendiumPickerSpec<SrdEquipmentData> = {
  id: "equipment",
  label: (t) => t("equipment.tabEquipment"),
  icon: Backpack,
  // The codex verdict — the item's category (weapon · armor · gear …), quietly
  // tinted (mundane gear, no loud colour).
  verdict: (item, { t }) => ({
    label: t(`equipment.${item.category}s`),
    tone: categoryTone(item.category),
  }),
  data: SRD_EQUIPMENT,
  getId: (i) => i.id,
  getName: (i, { locale }) => itemText(i, "name", locale),
  nameText: (i, { locale }) => nameCorpus("equipment", i.id, itemText(i, "name", locale)),
  searchText: (i, ctx) => [
    ...equipmentSpec.nameText(i, ctx),
    // Item f — search by description (active locale + EN); many equipment items
    // have no description field, so the helper's hasSrd guard skips those.
    ...descriptionSearch("equipment", i.id, ctx.locale),
  ],
  searchPlaceholder: (t) => t("equipment.searchPlaceholder"),

  filters: [
    defineFilter<SrdEquipmentData, EquipmentCategory | null>({
      id: "category",
      label: (t) => t("equipment.category"),
      initial: null,
      render: (value, setValue, ctx) => {
        const { t } = ctx;
        // D22 — the category facet carries its glyph ONLY in the ADD WIZARD
        // (ctx.character set); the COMPENDIUM browse (character null) shows
        // text-only facets, so every compendium filter reads the same (owner).
        const withIcon = ctx.character != null;
        return (
          <>
            <FilterChip
              label={t("common.allF")}
              active={value === null}
              onClick={() => setValue(null)}
            />
            {CATEGORIES.map((cat) => (
              <FilterChip
                key={cat.value}
                label={
                  withIcon ? (
                    <span className="inline-flex items-center gap-1">
                      <Icon as={equipmentCategoryIcon(cat.value)} size="xs" decorative />
                      {t(cat.key)}
                    </span>
                  ) : (
                    t(cat.key)
                  )
                }
                active={value === cat.value}
                onClick={() => setValue(value === cat.value ? null : cat.value)}
              />
            ))}
          </>
        );
      },
      predicate: (i, value) => value == null || i.category === value,
    }),
  ],

  // No `existingIds`: mundane equipment is always RE-BUYABLE (you can own more
  // rope, another quiver of arrows, a third potion). Adding stacks onto the
  // matching inventory entry (`addEquipmentRef`) instead of being blocked as
  // "already added" — the owner's "ammo/stackables must be re-buyable like potions".

  // Ammo steps a whole bundle at a time (20 → 40 → 60); everything else by 1.
  supportsQuantity: true,
  quantityStep: (item) => item.bundleSize ?? 1,

  row: (item, { t, locale }) => ({
    leading: (
      <CmpSeal icon={equipmentSealIcon(item)} tone={categoryTone(item.category)} />
    ),
    // Bundle items (ammunition) list their cost + weight per bundle, so name the
    // bundle size — "Crossbow Bolts (×20) — 1 gp · 1.5 lb" reads unambiguously.
    name:
      item.bundleSize && item.bundleSize > 1
        ? `${itemText(item, "name", locale)} (×${item.bundleSize})`
        : itemText(item, "name", locale),
    meta: (
      <>
        {formatCost(item)}
        {item.weight ? ` · ${formatWeight(item.weight, locale)}` : ""}
        {item.damage
          ? ` · ${item.damage.die} ${t(`srd.damage_${item.damage.type.toLowerCase()}`)}`
          : ""}
        {item.ac
          ? ` · ${t("equipment.ac")} ${item.ac.base}${item.ac.dexBonus ? ` + ${t("abilities.DEX_short")}` : ""}`
          : ""}
      </>
    ),
  }),

  detail: (item, { t, locale }) => {
    const meta: { label: string; value: string }[] = [
      { label: t("equipment.cost"), value: formatCost(item) },
    ];
    if (item.weight != null && item.weight > 0)
      meta.push({
        label: t("equipment.weight"),
        value: formatWeight(item.weight, locale),
      });
    if (item.damage)
      meta.push({
        label: t("equipment.damage"),
        value: `${item.damage.die} ${t(`srd.damage_${item.damage.type.toLowerCase()}`)}`,
      });
    if (item.ac)
      meta.push({
        label: t("character.armorClassShort"),
        value: `${item.ac.base}${
          item.ac.dexBonus
            ? ` + ${t("abilities.DEX_short")}${
                item.ac.maxDex != null
                  ? ` (${t("equipment.acMaxDex", { n: item.ac.maxDex })})`
                  : ""
              }`
            : ""
        }`,
      });
    if (item.stealthDisadvantage)
      meta.push({ label: t("equipment.stealth"), value: t("common.disadvantage") });
    if (item.strengthReq != null)
      meta.push({ label: t("equipment.strRequired"), value: `${item.strengthReq}` });

    return {
      eyebrow: (
        <span className="inline-flex items-center gap-2">
          <Icon
            as={equipmentSealIcon(item)}
            size="sm"
            className="text-text-secondary"
            decorative
          />
          {t(`equipment.${item.category}s`)}
          {item.weaponCategory
            ? ` · ${t(`srd.weaponCategory_${item.weaponCategory}`)}`
            : ""}
          {item.weaponType ? ` · ${t(`srd.weaponType_${item.weaponType}`)}` : ""}
          {item.armorCategory ? ` · ${t(`srd.armorCategory_${item.armorCategory}`)}` : ""}
        </span>
      ),
      meta,
      description: hasSrd("equipment", item.id, "description", locale)
        ? itemText(item, "description", locale)
        : undefined,
      extras:
        item.properties && item.properties.length > 0 ? (
          <div className="mb-4">
            <div className="mb-1 text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
              {t("equipment.properties")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.properties.map((prop) => (
                <span
                  key={prop}
                  className="rounded-sm bg-bg-tertiary px-2 py-0.5 text-[0.65rem] text-text-primary"
                >
                  {/* D3 — localize weapon properties (Finesse→Agile, etc.) via the
                      shared helper the cockpit already uses. */}
                  {localizeWeaponProperty(prop, locale)}
                </span>
              ))}
            </div>
          </div>
        ) : undefined,
    };
  },

  onAdd: (item, { character }, quantity) => {
    if (!character) return;
    const store = useCharacterStore.getState();
    // The picker's stepper already yields the real unit count (it steps by the
    // bundle size for ammo). With no stepper, default to one bundle.
    const qty = quantity ?? item.bundleSize ?? 1;
    if (item.category === "weapon") {
      const newRef: SrdWeaponRef = { srdId: item.id, quantity: qty };
      store.setCharacter({
        ...character,
        character: {
          ...character.character,
          // Stack onto an identical weapon instead of duplicating the row.
          weapons: addWeaponRef(character.character.weapons, newRef),
        },
      });
    } else {
      const newRef: SrdEquipmentRef = {
        srdId: item.id,
        quantity: qty,
        // Only wearables default to equipped (so AC is right immediately); gear,
        // packs, ammo and consumables are carried, not worn.
        ...(item.category === "armor" || item.category === "shield"
          ? { equipped: true }
          : {}),
        tracked: item.category === "gear" || item.category === "pack",
      };
      store.setCharacter({
        ...character,
        character: {
          // Stack onto an identical entry instead of appending a duplicate row.
          ...character.character,
          equipment: addEquipmentRef(character.character.equipment, newRef),
        },
      });
    }
  },
};
