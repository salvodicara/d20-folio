/**
 * The compendium on the new frame (approved prototypes comp, comp-detail,
 * comp-empty): one category at a time (Spells, Items, Feats), each entry a row that
 * reads at a glance (its name, one facts line, the casting time and range or the
 * cost on the right), filter groups of ticks, and the entry's detail: facts, a
 * short label · value grid, what it does, then the full text.
 *
 * Filters: ticks inside one group widen the list (Cantrips or Level 1); groups
 * narrow it (Cleric and Level 1). The search reads the name first, then the text.
 *
 * Pure: names and facts resolve here in the reader's language.
 */
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_FEATS } from "@/data/feats";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { spells as allSpells } from "@/data/spells";
import {
  ALL_MAGIC_ITEM_RARITIES,
  type SrdEquipmentData,
  type SrdFeatData,
  type SrdMagicItemData,
  type SrdSpellData,
} from "@/data/types";
import { spellEffect } from "@/domains/spells/spell-pick-rows";
import i18n from "@/i18n";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { SrdKind } from "@/i18n/srd-en";
import type { Locale } from "@/lib/locale";
import { SOURCE_LOCALE } from "@/lib/locale";
import { proseCorpus, rankedSearch } from "@/lib/search";
import { castingTimeI18nKey, formatWeight } from "@/lib/utils";
import { compactRange } from "@/lib/views/compact-range";
import { localizeWeaponMastery } from "@/lib/views/srd-i18n";

export const COMP_CATEGORIES = ["spell", "item", "feat"] as const;
export type CompCategory = (typeof COMP_CATEGORIES)[number];

export const isCompCategory = (v: string | null): v is CompCategory =>
  (COMP_CATEGORIES as readonly string[]).includes(v ?? "");

/** The glyph a row wears, read from its data (a spell's school, an item's kind). */
export type CompIcon =
  | { kind: "school"; id: SrdSpellData["school"] }
  | { kind: "weapon"; id: string }
  | { kind: "equipment"; category: SrdEquipmentData["category"] }
  | { kind: "magic"; type: SrdMagicItemData["type"] }
  | { kind: "feat" };

export interface CompRow {
  /** Unique across the category (an item id is prefixed by its kind). */
  id: string;
  name: string;
  icon: CompIcon;
  /** The facts line: «1° livello · Ammaliamento · concentrazione». */
  facts: string[];
  /** Right-hand columns on a wide list: casting time and range, or cost. */
  aside: string[];
  /** Filter group id → the option ids this entry carries. */
  tags: Record<string, readonly string[]>;
  searchText: string;
  readonly searchDesc: string;
}

export interface CompFilter {
  id: string;
  label: string;
  options: { id: string; label: string }[];
}

/** Filter group id → ticked option ids. */
export type CompPicks = Readonly<Record<string, readonly string[]>>;

export interface CompDetail {
  id: string;
  /** What it is, for the panel header: «Incantesimo», «Oggetto», «Talento». */
  kind: string;
  name: string;
  icon: CompIcon;
  facts: string[];
  kv: { label: string; value: string }[];
  /** What it does in a few words («8d6 Fuoco»), or null. */
  effect: string | null;
  /** The full text, markdown. */
  text: string;
  /** Labelled extras under the text: Material, At Higher Levels. */
  more: { label: string; text: string }[];
}

const tFor = (locale: Locale) => i18n.getFixedT(locale);

/** Names in the reader's language and English, then the text in both (read lazily). */
function corpus(kind: SrdKind, id: string, locale: Locale, name: string) {
  let desc: string | undefined;
  return {
    searchText: `${name} ${localizeSrd(kind, id, "name", SOURCE_LOCALE)}`,
    get searchDesc() {
      desc ??= proseCorpus(
        hasSrd(kind, id, "description", locale)
          ? localizeSrd(kind, id, "description", locale)
          : undefined,
        locale === SOURCE_LOCALE || !hasSrd(kind, id, "description", SOURCE_LOCALE)
          ? undefined
          : localizeSrd(kind, id, "description", SOURCE_LOCALE)
      );
      return desc;
    },
  };
}

const byName = (a: CompRow, b: CompRow) => a.name.localeCompare(b.name);

// ── Spells ──────────────────────────────────────────────────────────────────

const SPELLS = new Map(allSpells.map((s) => [s.id, s]));

function levelName(level: number, locale: Locale): string {
  const t = tFor(locale);
  return level === 0 ? t("spells.cantrip") : t("spells.level", { level });
}

function spellRow(s: SrdSpellData, locale: Locale): CompRow {
  const t = tFor(locale);
  const name = localizeSrd("spell", s.id, "name", locale);
  const castKey = castingTimeI18nKey(s.castingTime);
  const other = [
    s.ritual ? "ritual" : null,
    s.concentration ? "concentration" : null,
    castKey === "bonus action" ? "bonus" : null,
  ].filter((v): v is string => v !== null);
  return {
    id: s.id,
    name,
    icon: { kind: "school", id: s.school },
    facts: [
      levelName(s.level, locale),
      t(`srd.school_${s.school}`),
      s.concentration ? t("play.concentration") : null,
      s.ritual ? t("spells.pick.ritual") : null,
    ].filter((v): v is string => v !== null),
    aside: [
      t(`srd.castingTime_${castKey}`),
      compactRange(localizeSrd("spell", s.id, "range", locale)),
    ],
    tags: { level: [String(s.level)], class: s.classes, other },
    ...corpus("spell", s.id, locale, name),
  };
}

function spellFilters(rows: readonly CompRow[], locale: Locale): CompFilter[] {
  const t = tFor(locale);
  const levels = [...new Set(rows.flatMap((r) => r.tags.level ?? []))].sort(
    (a, b) => Number(a) - Number(b)
  );
  const classes = [...new Set(rows.flatMap((r) => r.tags.class ?? []))]
    .map((id) => ({ id, label: t(`srd.class_${id}`) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [
    {
      id: "level",
      label: t("common.level"),
      options: levels.map((id) => ({
        id,
        label: id === "0" ? t("spells.cantrips") : t("spells.level", { level: id }),
      })),
    },
    { id: "class", label: t("character.class"), options: classes },
    {
      id: "other",
      label: t("report.types.other"),
      options: [
        { id: "ritual", label: t("spells.ritual") },
        { id: "concentration", label: t("spells.concentration") },
        { id: "bonus", label: t("srd.castingTime_bonus") },
      ],
    },
  ];
}

function spellDetail(s: SrdSpellData, locale: Locale): CompDetail {
  const t = tFor(locale);
  const row = spellRow(s, locale);
  const c = s.components;
  const more: CompDetail["more"] = [];
  const materialKey = `${s.id}.components`;
  if (c.m && hasSrd("spell", materialKey, "material", locale))
    more.push({
      label: t("spells.material"),
      text: localizeSrd("spell", materialKey, "material", locale),
    });
  if (hasSrd("spell", s.id, "higherLevels", locale))
    more.push({
      label: t("spells.higherLevels"),
      text: localizeSrd("spell", s.id, "higherLevels", locale),
    });
  return {
    id: s.id,
    kind: t("compendium.screen.kind_spell"),
    name: row.name,
    icon: row.icon,
    facts: [levelName(s.level, locale), t(`srd.school_${s.school}`)],
    kv: [
      { label: t("compendium.screen.castingTime"), value: row.aside[0] ?? "" },
      { label: t("spells.range"), value: localizeSrd("spell", s.id, "range", locale) },
      {
        label: t("spells.components"),
        value: [c.v && "V", c.s && "S", c.m && "M"].filter(Boolean).join(", "),
      },
      {
        label: t("spells.duration"),
        value: localizeSrd("spell", s.id, "duration", locale),
      },
    ],
    effect: spellEffect(s, locale),
    text: localizeSrd("spell", s.id, "description", locale),
    more,
  };
}

// ── Items: equipment and magic items in one list ────────────────────────────

const EQUIPMENT = new Map(SRD_EQUIPMENT.map((e) => [e.id, e]));
const MAGIC = new Map(SRD_MAGIC_ITEMS.map((m) => [m.id, m]));
const EQUIPMENT_KINDS = ["weapon", "armor", "shield", "gear", "tool", "pack"] as const;
const KIND_LABEL: Record<(typeof EQUIPMENT_KINDS)[number] | "magic", string> = {
  weapon: "equipment.weapons",
  armor: "equipment.armor",
  shield: "equipment.shields",
  gear: "equipment.gear",
  tool: "equipment.tools",
  pack: "equipment.packs",
  magic: "equipment.tabMagicItems",
};

function cost(e: SrdEquipmentData, locale: Locale): string {
  const t = tFor(locale);
  return `${String(e.cost.amount)}\u00a0${t(`equipment.currencyAbbr.${e.cost.unit}`)}`;
}

function equipmentFacts(e: SrdEquipmentData, locale: Locale): string[] {
  const t = tFor(locale);
  return [
    t(KIND_LABEL[e.category]),
    e.damage
      ? `${e.damage.die}\u00a0${t(`srd.damage_${e.damage.type.toLowerCase()}`)}`
      : null,
    e.ac
      ? `${t("character.armorClassShort")}\u00a0${String(e.ac.base)}${e.ac.dexBonus ? ` + ${t("abilities.DEX_short")}` : ""}`
      : null,
  ].filter((v): v is string => v !== null);
}

function equipmentRow(e: SrdEquipmentData, locale: Locale): CompRow {
  const name = localizeSrd("equipment", e.id, "name", locale);
  return {
    id: `e:${e.id}`,
    name,
    icon:
      e.category === "weapon"
        ? { kind: "weapon", id: e.id }
        : { kind: "equipment", category: e.category },
    facts: equipmentFacts(e, locale),
    aside: [cost(e, locale)],
    tags: { kind: [e.category] },
    ...corpus("equipment", e.id, locale, name),
  };
}

function magicRow(m: SrdMagicItemData, locale: Locale): CompRow {
  const t = tFor(locale);
  const name = localizeSrd("magic-item", m.id, "name", locale);
  return {
    id: `m:${m.id}`,
    name,
    icon: { kind: "magic", type: m.type },
    facts: [
      t(`magicItems.type_${m.type}`),
      t(`magicItems.rarity_${m.rarity}`),
      m.attunement ? t("magicItems.attunementShort") : null,
    ].filter((v): v is string => v !== null),
    aside: [],
    tags: {
      kind: ["magic"],
      rarity: [m.rarity],
      other: m.attunement ? ["attunement"] : [],
    },
    ...corpus("magic-item", m.id, locale, name),
  };
}

function itemFilters(locale: Locale): CompFilter[] {
  const t = tFor(locale);
  return [
    {
      id: "kind",
      label: t("magicItems.type"),
      options: [...EQUIPMENT_KINDS, "magic" as const].map((id) => ({
        id,
        label: t(KIND_LABEL[id]),
      })),
    },
    {
      id: "rarity",
      label: t("magicItems.rarity"),
      options: ALL_MAGIC_ITEM_RARITIES.map((id) => ({
        id,
        label: t(`magicItems.rarity_${id}`),
      })),
    },
    {
      id: "other",
      label: t("report.types.other"),
      options: [{ id: "attunement", label: t("magicItems.attunementRequired") }],
    },
  ];
}

function equipmentDetail(e: SrdEquipmentData, locale: Locale): CompDetail {
  const t = tFor(locale);
  const row = equipmentRow(e, locale);
  const kv: CompDetail["kv"] = [{ label: t("equipment.cost"), value: cost(e, locale) }];
  if (e.weight)
    kv.push({ label: t("equipment.weight"), value: formatWeight(e.weight, locale) });
  if (e.damage)
    kv.push({
      label: t("equipment.damage"),
      value: `${e.damage.die} ${t(`srd.damage_${e.damage.type.toLowerCase()}`)}`,
    });
  if (e.ac)
    kv.push({
      label: t("character.armorClassShort"),
      value: `${String(e.ac.base)}${e.ac.dexBonus ? ` + ${t("abilities.DEX_short")}${e.ac.maxDex !== undefined ? ` (${t("equipment.acMaxDex", { n: e.ac.maxDex })})` : ""}` : ""}`,
    });
  if (e.mastery)
    kv.push({
      label: t("abilities.weaponMastery"),
      value: localizeWeaponMastery(e.mastery, locale),
    });
  return {
    id: row.id,
    kind: t("compendium.screen.kind_item"),
    name: row.name,
    icon: row.icon,
    facts: row.facts,
    kv,
    effect: null,
    text: hasSrd("equipment", e.id, "description", locale)
      ? localizeSrd("equipment", e.id, "description", locale)
      : "",
    more: [],
  };
}

function magicDetail(m: SrdMagicItemData, locale: Locale): CompDetail {
  const t = tFor(locale);
  const row = magicRow(m, locale);
  return {
    id: row.id,
    kind: t("compendium.screen.kind_item"),
    name: row.name,
    icon: row.icon,
    facts: row.facts,
    kv: [
      { label: t("magicItems.rarity"), value: t(`magicItems.rarity_${m.rarity}`) },
      {
        label: t("magicItems.attunement"),
        value: m.attunement
          ? t("magicItems.attunementRequired")
          : t("magicItems.attunementNone"),
      },
    ],
    effect: null,
    text: localizeSrd("magic-item", m.id, "description", locale),
    more: [],
  };
}

// ── Feats ───────────────────────────────────────────────────────────────────

const FEATS = new Map(SRD_FEATS.map((f) => [f.id, f]));

function featRow(f: SrdFeatData, locale: Locale): CompRow {
  const t = tFor(locale);
  const name = localizeSrd("feat", f.id, "name", locale);
  return {
    id: f.id,
    name,
    icon: { kind: "feat" },
    facts: [
      t(`feats.category_${f.category}`),
      hasSrd("feat", f.id, "prerequisite", locale)
        ? localizeSrd("feat", f.id, "prerequisite", locale)
        : null,
      f.repeatable ? t("feats.repeatable") : null,
    ].filter((v): v is string => v !== null),
    aside: [],
    tags: { category: [f.category] },
    ...corpus("feat", f.id, locale, name),
  };
}

function featFilters(rows: readonly CompRow[], locale: Locale): CompFilter[] {
  const t = tFor(locale);
  const cats = [...new Set(rows.flatMap((r) => r.tags.category ?? []))];
  return [
    {
      id: "category",
      label: t("feats.category"),
      options: cats.map((id) => ({ id, label: t(`feats.category_${id}`) })),
    },
  ];
}

function featDetail(f: SrdFeatData, locale: Locale): CompDetail {
  const t = tFor(locale);
  const row = featRow(f, locale);
  const kv: CompDetail["kv"] = [
    { label: t("feats.category"), value: t(`feats.category_${f.category}`) },
  ];
  if (hasSrd("feat", f.id, "prerequisite", locale))
    kv.push({
      label: t("feats.prerequisite"),
      value: localizeSrd("feat", f.id, "prerequisite", locale),
    });
  return {
    id: f.id,
    kind: t("compendium.screen.kind_feat"),
    name: row.name,
    icon: row.icon,
    facts: [t(`feats.category_${f.category}`)],
    kv,
    effect: null,
    text: localizeSrd("feat", f.id, "description", locale),
    more: [],
  };
}

// ── The category seams ──────────────────────────────────────────────────────

/** Every entry of a category, by name. */
export function compendiumRows(category: CompCategory, locale: Locale): CompRow[] {
  const rows =
    category === "spell"
      ? allSpells.map((s) => spellRow(s, locale))
      : category === "item"
        ? [
            ...SRD_EQUIPMENT.map((e) => equipmentRow(e, locale)),
            ...SRD_MAGIC_ITEMS.map((m) => magicRow(m, locale)),
          ]
        : SRD_FEATS.map((f) => featRow(f, locale));
  return rows.sort(byName);
}

/** The filter groups a category offers, each with only the options its entries carry. */
export function compendiumFilters(
  category: CompCategory,
  rows: readonly CompRow[],
  locale: Locale
): CompFilter[] {
  const groups =
    category === "spell"
      ? spellFilters(rows, locale)
      : category === "item"
        ? itemFilters(locale)
        : featFilters(rows, locale);
  return groups
    .map((g) => ({
      ...g,
      options: g.options.filter((o) => rows.some((r) => r.tags[g.id]?.includes(o.id))),
    }))
    .filter((g) => g.options.length > 0);
}

/** The rows every ticked group lets through, matching `query`, best matches first. */
export function filterCompRows(
  rows: readonly CompRow[],
  query: string,
  picks: CompPicks
): readonly CompRow[] {
  const groups = Object.entries(picks).filter(([, ids]) => ids.length > 0);
  const kept = groups.length
    ? rows.filter((r) =>
        groups.every(([g, ids]) => ids.some((id) => r.tags[g]?.includes(id)))
      )
    : rows;
  return rankedSearch(
    query,
    kept,
    (r) => r.searchText,
    (r) => r.searchDesc
  );
}

/** How many options are ticked across the groups. */
export const pickCount = (picks: CompPicks) =>
  Object.values(picks).reduce((n, ids) => n + ids.length, 0);

/** An entry's detail, or null for an id the category does not hold. */
export function compendiumDetail(
  category: CompCategory,
  id: string,
  locale: Locale
): CompDetail | null {
  if (category === "spell") {
    const s = SPELLS.get(id);
    return s ? spellDetail(s, locale) : null;
  }
  if (category === "item") {
    const [kind, raw = ""] = id.split(/:(.*)/s);
    const e = kind === "e" ? EQUIPMENT.get(raw) : undefined;
    if (e) return equipmentDetail(e, locale);
    const m = kind === "m" ? MAGIC.get(raw) : undefined;
    return m ? magicDetail(m, locale) : null;
  }
  const f = FEATS.get(id);
  return f ? featDetail(f, locale) : null;
}
