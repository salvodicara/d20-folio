/**
 * Items compendium spec — the ONE unified browser that merges the old separate
 * Equipment and Magic Items surfaces into a single searchable list, in BOTH the
 * sheet "Add Item" modal (add mode) and the Compendium page (browse). It replaces
 * the two `equipment` + `magic-item` ribbon/tab entries with one "Items" entry.
 *
 * TWO corpora stay SEPARATE under the hood (they are genuinely different shapes —
 * `SrdEquipmentData` carries a cost/category, `SrdMagicItemData` a rarity/type/
 * attunement/grants). This spec wraps each row in a discriminated {@link ItemEntry}
 * and DELEGATES every per-corpus fact (row · detail · verdict · onAdd · quantity)
 * to the existing `equipmentSpec` / `magicItemSpec` — one source of truth, no forked
 * rendering (golden rule 6). Only the user-facing VIEW is merged:
 *
 *   • ONE search over both corpora (the shared `rankedSearch` in the picker hook).
 *   • A SMART facet rail: a Magic lens (All · Magic · Nonmagical), one Kind axis
 *     spanning both datasets (Weapon · Armor · Shield · Gear · Tool · Pack ·
 *     Wondrous · Potion · Ring · Rod · Scroll · Staff · Wand), and the magic-only
 *     Rarity + Attunement axes that LIGHT UP only in a magic context (their `render`
 *     returns null otherwise — the picker skips the empty strip), modelled on how
 *     D&D Beyond folds rarity into its single equipment browser.
 *   • Default order: the everyday mundane gear first (its curated data order), then
 *     the magic items — common-before-rare, calm at rest; `rankedSearch` reorders by
 *     name once the reader types.
 *
 * `closeOnAdd` is deliberately OFF here (both corpora): a unified list lets a player
 * kit out a character / drop session loot in one flow — an add returns to the list
 * (the feedback), never dismissing the modal. (Magic items used to close-on-add; the
 * merge unifies to stay-open for consistency.)
 */

import { Sparkles } from "lucide-react";
import { FolioInventoryIcon } from "@/components/shared/folio-icons";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { equipmentCategoryIcon, magicItemSealIcon } from "@/components/shared/item-icons";
import { Icon } from "@/components/ui/icon";
import { FilterChip } from "@/components/sheet/picker-parts";
import {
  ALL_MAGIC_ITEM_RARITIES,
  ALL_MAGIC_ITEM_TYPES,
  type EquipmentCategory,
  type MagicItemRarity,
  type MagicItemType,
  type SrdEquipmentData,
  type SrdMagicItemData,
} from "@/data/types";
import { defineFilter, type CompendiumPickerSpec, type PickerCtx } from "../types";
import { equipmentSpec } from "./equipment";
import { magicItemSpec } from "./magic-item";

/**
 * One normalized row over EITHER corpus — the discriminant the whole spec branches
 * on. The two item shapes never merge; the `kind` tag routes each accessor to the
 * corpus that owns the fact.
 */
export type ItemEntry =
  | { readonly kind: "equipment"; readonly item: SrdEquipmentData }
  | { readonly kind: "magic"; readonly item: SrdMagicItemData };

/** The unified Kind axis — the union of both datasets' own kinds (weapon + armor are
 *  shared, so a "Weapon" chip surfaces mundane AND magic weapons alike). */
type ItemKind = EquipmentCategory | MagicItemType;

/** The magic-only kinds (no mundane counterpart) — selecting one enters a magic
 *  context, so the Rarity + Attunement axes unfold. */
const MAGIC_ONLY_KINDS = new Set<ItemKind>([
  "wondrous",
  "potion",
  "ring",
  "rod",
  "scroll",
  "staff",
  "wand",
]);

/** The Kind chip order — mundane categories first (the everyday gear), then the
 *  magic-only types. `weapon`/`armor` sit up front and span both corpora. */
const KIND_ORDER: readonly ItemKind[] = [
  "weapon",
  "armor",
  "shield",
  "gear",
  "tool",
  "pack",
  ...ALL_MAGIC_ITEM_TYPES.filter((ty) => MAGIC_ONLY_KINDS.has(ty)),
];

/** The i18n key for a Kind label — reuse the canonical singular item-type labels
 *  (`magicItems.type_*`, which read the same for a mundane or magic weapon/armor)
 *  and the equipment singulars; only Tool/Pack need the new `items.kind_*` keys. */
const KIND_LABEL_KEY: Record<ItemKind, string> = {
  weapon: "magicItems.type_weapon",
  armor: "magicItems.type_armor",
  shield: "equipment.shield",
  gear: "equipment.gears",
  tool: "items.kind_tool",
  pack: "items.kind_pack",
  wondrous: "magicItems.type_wondrous",
  potion: "magicItems.type_potion",
  ring: "magicItems.type_ring",
  rod: "magicItems.type_rod",
  scroll: "magicItems.type_scroll",
  staff: "magicItems.type_staff",
  wand: "magicItems.type_wand",
};

const EQUIP_KINDS = new Set<ItemKind>([
  "weapon",
  "armor",
  "shield",
  "gear",
  "tool",
  "pack",
]);

/** The normalized kind of a row (its equipment category or its magic-item type). */
function kindOf(entry: ItemEntry): ItemKind {
  return entry.kind === "equipment" ? entry.item.category : entry.item.type;
}

/** The Kind chip glyph — the mundane category icon for a shared/mundane kind, the
 *  magic-item type icon for a magic-only kind. */
function kindIcon(kind: ItemKind) {
  return EQUIP_KINDS.has(kind)
    ? equipmentCategoryIcon(kind as EquipmentCategory)
    : magicItemSealIcon(kind as MagicItemType);
}

/** The Magic lens value — the corpus discriminant + the reveal trigger. */
type MagicLens = "all" | "magic" | "mundane";

/** The unified data — mundane equipment (curated order) THEN magic items (curated
 *  order). Static: both source arrays are module constants, so this builds once. */
const ITEMS: readonly ItemEntry[] = [
  ...SRD_EQUIPMENT.map((item) => ({ kind: "equipment" as const, item })),
  ...SRD_MAGIC_ITEMS.map((item) => ({ kind: "magic" as const, item })),
];

/** True when the rail should surface the magic-only axes: the Magic lens is on
 *  Magic, a magic-only Kind is chosen, or one of the two axes already has a value
 *  (so an active-but-contextless facet is never orphaned/invisible). */
function magicContext(all: Record<string, unknown>): boolean {
  return (
    all.magic === "magic" ||
    (all.kind != null && MAGIC_ONLY_KINDS.has(all.kind as ItemKind)) ||
    all.rarity != null ||
    all.attunement != null
  );
}

export const itemsSpec: CompendiumPickerSpec<ItemEntry> = {
  id: "items",
  label: (t) => t("items.tab"),
  icon: FolioInventoryIcon,
  data: ITEMS,
  getId: (e) => (e.kind === "magic" ? `m:${e.item.id}` : `e:${e.item.id}`),
  getName: (e, ctx) =>
    e.kind === "magic"
      ? magicItemSpec.getName(e.item, ctx)
      : equipmentSpec.getName(e.item, ctx),
  nameText: (e, ctx) =>
    e.kind === "magic"
      ? magicItemSpec.nameText(e.item, ctx)
      : equipmentSpec.nameText(e.item, ctx),
  searchText: (e, ctx) =>
    e.kind === "magic"
      ? magicItemSpec.searchText(e.item, ctx)
      : equipmentSpec.searchText(e.item, ctx),
  searchPlaceholder: (t) => t("items.searchPlaceholder"),

  // The at-a-glance classifier — rarity glow for a magic item, the quiet category
  // tone for mundane gear (delegated, so the two read exactly as they do alone).
  verdict: (e, ctx) =>
    e.kind === "magic"
      ? magicItemSpec.verdict?.(e.item, ctx)
      : equipmentSpec.verdict?.(e.item, ctx),

  filters: [
    // ── The Magic lens — the corpus discriminant + the trigger that unfolds the
    //    magic-only axes below. Always visible, first. ──────────────────────────
    defineFilter<ItemEntry, MagicLens>({
      id: "magic",
      label: (t) => t("items.magic"),
      initial: "all",
      render: (value, setValue, ctx) => {
        const { t } = ctx;
        const withIcon = ctx.character != null;
        return (
          <>
            <FilterChip
              label={t("common.all")}
              active={value === "all"}
              onClick={() => setValue("all")}
            />
            <FilterChip
              label={
                withIcon ? (
                  <span className="inline-flex items-center gap-1">
                    <Icon as={Sparkles} size="xs" decorative />
                    {t("items.magical")}
                  </span>
                ) : (
                  t("items.magical")
                )
              }
              active={value === "magic"}
              onClick={() => setValue(value === "magic" ? "all" : "magic")}
            />
            <FilterChip
              label={t("items.nonmagical")}
              active={value === "mundane"}
              onClick={() => setValue(value === "mundane" ? "all" : "mundane")}
            />
          </>
        );
      },
      predicate: (e, value) =>
        value === "all" ||
        (value === "magic" ? e.kind === "magic" : e.kind === "equipment"),
    }),

    // ── Kind — the one axis spanning BOTH corpora. ────────────────────────────
    defineFilter<ItemEntry, ItemKind | null>({
      id: "kind",
      label: (t) => t("items.kind"),
      initial: null,
      render: (value, setValue, ctx) => {
        const { t } = ctx;
        // D22 — the glyph rides the chip ONLY in the add wizard (character set);
        // the Compendium browse stays text-only, matching every other facet.
        const withIcon = ctx.character != null;
        return (
          <>
            <FilterChip
              label={t("common.all")}
              active={value === null}
              onClick={() => setValue(null)}
            />
            {KIND_ORDER.map((kind) => (
              <FilterChip
                key={kind}
                label={
                  withIcon ? (
                    <span className="inline-flex items-center gap-1">
                      <Icon as={kindIcon(kind)} size="xs" decorative />
                      {t(KIND_LABEL_KEY[kind])}
                    </span>
                  ) : (
                    t(KIND_LABEL_KEY[kind])
                  )
                }
                active={value === kind}
                onClick={() => setValue(value === kind ? null : kind)}
              />
            ))}
          </>
        );
      },
      predicate: (e, value) => value == null || kindOf(e) === value,
    }),

    // ── Rarity — magic-only; renders (and thus filters visibly) only in a magic
    //    context. An equipment row can never match a set rarity. ────────────────
    defineFilter<ItemEntry, MagicItemRarity | null>({
      id: "rarity",
      label: (t) => t("magicItems.rarity"),
      term: "magicRarity",
      initial: null,
      render: (value, setValue, { t }, all) => {
        if (!magicContext(all)) return null;
        return (
          <>
            <FilterChip
              label={t("common.allF")}
              active={value === null}
              onClick={() => setValue(null)}
            />
            {ALL_MAGIC_ITEM_RARITIES.map((r) => (
              <FilterChip
                key={r}
                label={t(`magicItems.rarity_${r}`)}
                active={value === r}
                onClick={() => setValue(value === r ? null : r)}
              />
            ))}
          </>
        );
      },
      predicate: (e, value) =>
        value == null || (e.kind === "magic" && e.item.rarity === value),
    }),

    // ── Attunement — magic-only; the §2.5 discovery question ("what needs
    //    attunement?" — and the negative). Unfolds with the rarity axis. ────────
    defineFilter<ItemEntry, boolean | null>({
      id: "attunement",
      label: (t) => t("magicItems.attunement"),
      term: "attunement",
      initial: null,
      render: (value, setValue, { t }, all) => {
        if (!magicContext(all)) return null;
        return (
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
        );
      },
      predicate: (e, value) =>
        value == null || (e.kind === "magic" && e.item.attunement === value),
    }),
  ],

  row: (e, ctx) =>
    e.kind === "magic" ? magicItemSpec.row(e.item, ctx) : equipmentSpec.row(e.item, ctx),
  detail: (e, ctx, state) =>
    e.kind === "magic"
      ? magicItemSpec.detail(e.item, ctx, state)
      : equipmentSpec.detail(e.item, ctx, state),

  // Both corpora are RE-BUYABLE (more rope, another potion), so neither dedups —
  // omit `existingIds`, matching the two specs alone.
  supportsQuantity: true,
  quantityStep: (e) =>
    e.kind === "equipment" ? (equipmentSpec.quantityStep?.(e.item) ?? 1) : 1,

  onAdd: (e, ctx: PickerCtx, quantity) => {
    if (e.kind === "magic") magicItemSpec.onAdd?.(e.item, ctx, quantity);
    else equipmentSpec.onAdd?.(e.item, ctx, quantity);
  },
};
