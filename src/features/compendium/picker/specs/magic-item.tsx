/**
 * Magic-item compendium spec — drives the unified "Add Item" modal's Magic Items
 * tab (add mode) and the Compendium page's Magic Items facet (browse).
 * Replicates `MagicItemAddBody` at parity: the combined rarity + type facet row
 * (one "All" resets both), no already-added dedup (magic items are addable any
 * number of times), the rarity-tinted type glyph, the verbatim `CustomEquipment`
 * commit (charges / attunement / potion flags), and close-on-add.
 */

import { Gem } from "lucide-react";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { cn } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import { parseMagicItemAcBonus, parseMagicItemCharges } from "@/lib/magic-item-utils";
import { addEquipmentRef } from "@/lib/equipment-add";
import { magicItemSealIcon } from "@/components/shared/item-icons";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { Icon } from "@/components/ui/icon";
import { FilterChip } from "@/components/sheet/picker-parts";
import { ALL_MAGIC_ITEM_RARITIES, ALL_MAGIC_ITEM_TYPES } from "@/data/types";
import type { SrdMagicItemData, MagicItemRarity, MagicItemType } from "@/data/types";
import type { SrdEquipmentRef } from "@/types/character";
import { defineFilter, type CompendiumPickerSpec } from "../types";
import { CmpSeal } from "../CmpSeal";
import { descriptionSearch, nameCorpus } from "./shared";

// The rarity + type facet lists come from the canonical runtime tuples in
// `@/data/types` (golden rule 6), kept exhaustive over the union by construction.
const RARITIES: readonly MagicItemRarity[] = [...ALL_MAGIC_ITEM_RARITIES];

const TYPES: readonly MagicItemType[] = [...ALL_MAGIC_ITEM_TYPES];

const RARITY_CLASSES: Record<MagicItemRarity, string> = {
  common: "text-text-secondary",
  uncommon: "text-success",
  rare: "text-info",
  "very-rare": "text-accent",
  legendary: "text-warning",
  artifact: "text-danger",
};

/** Rarity → the codex seal/verdict pigment (graphic hue) + its AA-safe `-ink` label
 *  variant. Mirrors RARITY_CLASSES but in raw tokens (the seal/chip recipes need a
 *  CSS var, not a Tailwind class). Common stays neutral; rarer items light up. */
const RARITY_TONE: Record<MagicItemRarity, { tone: string; ink: string }> = {
  common: { tone: "var(--text-muted)", ink: "var(--text-secondary)" },
  uncommon: { tone: "var(--verdigris-300)", ink: "var(--verdigris-100)" },
  rare: { tone: "var(--lapis-300)", ink: "var(--lapis-100)" },
  "very-rare": { tone: "var(--accent-primary)", ink: "var(--accent-text)" },
  legendary: { tone: "var(--gold-leaf-300)", ink: "var(--accent-text)" },
  artifact: { tone: "var(--vermilion-300)", ink: "var(--vermilion-100)" },
};

/** Resolve a localized SRD string for a magic-item field (top-level catalogue key). */
const miText = (i: SrdMagicItemData, field: string, locale: Locale) =>
  localizeSrd("magic-item", i.id, field, locale);

export const magicItemSpec: CompendiumPickerSpec<SrdMagicItemData> = {
  id: "magic-item",
  label: (t) => t("equipment.tabMagicItems"),
  icon: Gem,
  // The codex verdict — the item's RARITY, tinted to the rarity scale (the single
  // most inviting at-a-glance fact: is this a legendary?). Rare items glow gold/red.
  verdict: (item, { t }) => ({
    label: t(`magicItems.rarity_${item.rarity}`),
    tone: RARITY_TONE[item.rarity].tone,
  }),
  data: SRD_MAGIC_ITEMS,
  getId: (i) => i.id,
  getName: (i, { locale }) => miText(i, "name", locale),
  nameText: (i, { locale }) => nameCorpus("magic-item", i.id, miText(i, "name", locale)),
  searchText: (i, ctx) => [
    ...magicItemSpec.nameText(i, ctx),
    // Item f — search by what the item DOES (active locale + EN), both resident.
    ...descriptionSearch("magic-item", i.id, ctx.locale),
  ],
  searchPlaceholder: (t) => t("magicItems.searchPlaceholder"),
  closeOnAdd: true,
  addLabel: ({ t }) => t("common.add"),

  // D36 — TWO independent facet axes, each with its OWN "All". The old single
  // combined chip row shared ONE "All" across rarity AND type, so picking a type
  // (e.g. "Rod") visibly turned "All" off and read as "Rod deselected All" — the
  // owner-reported confusion. Separate groups each reset only their own axis.
  filters: [
    defineFilter<SrdMagicItemData, MagicItemRarity | null>({
      id: "rarity",
      label: (t) => t("magicItems.rarity"),
      initial: null,
      render: (value, setValue, { t }) => (
        <>
          <FilterChip
            label={t("common.allF")}
            active={value === null}
            onClick={() => setValue(null)}
          />
          {RARITIES.map((r) => (
            <FilterChip
              key={r}
              label={t(`magicItems.rarity_${r}`)}
              active={value === r}
              onClick={() => setValue(value === r ? null : r)}
            />
          ))}
        </>
      ),
      predicate: (i, value) => value == null || i.rarity === value,
    }),
    defineFilter<SrdMagicItemData, MagicItemType | null>({
      id: "type",
      label: (t) => t("magicItems.type"),
      initial: null,
      render: (value, setValue, ctx) => {
        const { t } = ctx;
        // D22 — glyph only in the ADD WIZARD (ctx.character set); text-only in the
        // COMPENDIUM browse, matching the equipment facet + the rest of the filters.
        const withIcon = ctx.character != null;
        return (
          <>
            <FilterChip
              label={t("common.all")}
              active={value === null}
              onClick={() => setValue(null)}
            />
            {TYPES.map((ty) => (
              <FilterChip
                key={ty}
                label={
                  withIcon ? (
                    <span className="inline-flex items-center gap-1">
                      <Icon as={magicItemSealIcon(ty)} size="xs" decorative />
                      {t(`magicItems.type_${ty}`)}
                    </span>
                  ) : (
                    t(`magicItems.type_${ty}`)
                  )
                }
                active={value === ty}
                onClick={() => setValue(value === ty ? null : ty)}
              />
            ))}
          </>
        );
      },
      predicate: (i, value) => value == null || i.type === value,
    }),
    // §2.5 discovery — "Which magic items need attunement?" is a constitutional
    // example question. A third independent axis: All · Requires attunement ·
    // No attunement (the negative matters too — "what can I use right away?").
    defineFilter<SrdMagicItemData, boolean | null>({
      id: "attunement",
      label: (t) => t("magicItems.attunement"),
      initial: null,
      render: (value, setValue, { t }) => (
        <>
          <FilterChip
            label={t("common.all")}
            active={value === null}
            onClick={() => setValue(null)}
          />
          <FilterChip
            label={t("magicItems.attunementRequired")}
            active={value === true}
            onClick={() => setValue(value === true ? null : true)}
          />
          <FilterChip
            label={t("magicItems.attunementNone")}
            active={value === false}
            onClick={() => setValue(value === false ? null : false)}
          />
        </>
      ),
      predicate: (i, value) => value == null || i.attunement === value,
    }),
  ],

  row: (item, { t, locale }) => ({
    leading: (
      <CmpSeal
        icon={magicItemSealIcon(item.type)}
        tone={RARITY_TONE[item.rarity].tone}
        toneInk={RARITY_TONE[item.rarity].ink}
      />
    ),
    name: miText(item, "name", locale),
    // The rarity now reads as the colour-coded verdict chip; the gloss carries the
    // item type + attunement mark.
    meta: (
      <>
        {t(`magicItems.type_${item.type}`)}
        {item.attunement && ` · ${t("magicItems.attunementShort")}`}
      </>
    ),
  }),

  detail: (item, { t, locale }) => {
    // P9 — the typed-document facts a reader wants pinned above the prose (the
    // P2/P7 anatomy): the parsed engine facts (charges pool, AC bonus) as meta
    // rows. Rarity/type/attunement already read at a glance in the eyebrow.
    const charges = parseMagicItemCharges(item);
    const acBonus = parseMagicItemAcBonus(item);
    const meta: { label: string; value: string }[] = [];
    if (charges !== undefined)
      meta.push({ label: t("equipment.charges"), value: String(charges) });
    if (acBonus !== undefined)
      meta.push({
        label: t("character.armorClassShort"),
        value: acBonus > 0 ? `+${acBonus}` : String(acBonus),
      });
    return {
      eyebrow: (
        <>
          <span className={cn("font-bold", RARITY_CLASSES[item.rarity])}>
            {t(`magicItems.rarity_${item.rarity}`)}
          </span>
          <span className="text-text-secondary">·</span>
          <span className="inline-flex items-center gap-1 normal-case text-text-secondary">
            <Icon
              as={magicItemSealIcon(item.type)}
              size="xs"
              className={RARITY_CLASSES[item.rarity]}
              decorative
            />
            {t(`magicItems.type_${item.type}`)}
          </span>
          {item.attunement && (
            <>
              <span className="text-text-secondary">·</span>
              <span className="text-warning">{t("magicItems.attunement")}</span>
            </>
          )}
        </>
      ),
      meta: meta.length > 0 ? meta : undefined,
      description: miText(item, "description", locale),
      // D3 — the raw `properties` tags ("+1 AC", "charges: 7", "duration: 1 hour", …)
      // are free-form ENGLISH (105 distinct tokens, no IT) and leaked untranslated into
      // the IT detail; they're also redundant with the fully-bilingual description that
      // already carries the same mechanical facts. Only the PARSED engine facts above
      // surface as meta rows; re-add the rest only as a bilingual `BiText[]` if needed.
    };
  },

  supportsQuantity: true,

  onAdd: (item, { character }, quantity) => {
    if (!character) return;
    const acBonus = parseMagicItemAcBonus(item);
    // A `free-cast-spell` charge item (Wand of Web) keeps its ONE charge pool
    // in the session tracker keyed by the item id — the counter the cast flow
    // debits and the Inventory row reads (golden rule 6). Seeding `ref.charges`
    // too would create a second copy that drifts, so it stays for NON-cast
    // charged items only.
    const hasTrackerPool = item.grants?.some((g) => g.type === "free-cast-spell");
    const maxCharges = hasTrackerPool ? undefined : parseMagicItemCharges(item);
    // D6/D8/D9 + i18n — store magic items as an SRD REFERENCE (srdId), NOT a frozen
    // CustomEquipment copy. The whole point of references: the item resolves against
    // the bundled SRD at render, so its name + description are bilingual (translate
    // on locale switch), it shows full fields/weight, it reads as a real catalogue
    // item (not "custom"), AND — critically — its declarative grants (resistances,
    // senses, free-casts, AC) flow through `resolveGrantSourcesForEquipment`, which
    // SKIPS `custom` items. Only items the player explicitly homebrews stay custom.
    const newItem: SrdEquipmentRef = {
      srdId: item.id,
      quantity: quantity ?? 1,
      equipped: item.type === "armor" || item.type === "ring",
      ...(acBonus !== undefined ? { acBonus } : {}),
      ...(maxCharges !== undefined
        ? {
            charges: {
              current: maxCharges,
              max: maxCharges,
              recovery: "long-rest" as const,
            },
          }
        : {}),
      ...(item.attunement ? { attuned: false } : {}),
      ...(item.type === "potion" ? { isConsumable: true, isPotion: true } : {}),
    };
    useCharacterStore.getState().setCharacter({
      ...character,
      character: {
        ...character.character,
        // Stack onto an identical entry (a charged/attuned item is a distinct
        // instance and won't merge; a plain potion stacks by quantity).
        equipment: addEquipmentRef(character.character.equipment, newItem),
      },
    });
  },
};
