/**
 * Spell-pick presenter (`lib/views`) — the render-ready view-models for the
 * wizard F spell LIST (the read-then-Learn morphing accordion: the creation
 * spells step and the level-up new-spell / new-cantrip steps).
 *
 * Pure: SRD data + a `locale` in, plain VMs out. Identity is the stable spell
 * id; names resolve HERE through {@link localizeSrd}; the school /
 * casting-time tokens stay STABLE KEYS the edge formats via
 * `t("srd.school_…")` / `t("srd.castingTime_…")` (the same path every other
 * spell surface uses — one key per semantic unit).
 */
import { spells as allSpells } from "@/data/spells";
import type { SpellSchool, SrdSpellData } from "@/data/types";
import { localizeSrd } from "@/i18n/resolver";
import { proseCorpus } from "@/lib/search";
import { castingTimeI18nKey } from "@/lib/utils";
import type { Locale } from "@/lib/locale";

/** One render-ready spell entry for the wizard F morphing list. */
export interface SpellPickVM {
  /** Stable spell id — the list binds to and emits THIS. */
  id: string;
  /** Localized display name. */
  name: string;
  /** Tier-1 search corpus (localized + EN name anchor). */
  searchText: string;
  /** Tier-2 search corpus (localized + EN description, markdown flattened) —
   *  resolved lazily on first access (only a ≥3-char query reaches tier 2). */
  readonly searchDesc: string;
  level: number;
  /** Stable school token — the edge renders `t("srd.school_<school>")`. */
  school: SpellSchool;
  /** Stable casting-time token — the edge renders `t("srd.castingTime_<key>")`. */
  castingTimeKey: string;
  concentration: boolean;
  ritual: boolean;
  /** Full localized SRD description (markdown — the reading prose). */
  description: string;
  /** Localized range ("60 feet" / "18 metri") — the reading spread's fact row. */
  readonly range: string;
  /** Localized duration ("Instantaneous" / "1 minuto") — fact row. */
  readonly duration: string;
  /** The raw SRD entry — feeds the shared compendium read view. */
  entry: SrdSpellData;
}

/** Build ONE spell's VM (exported for table-driven tests). */
export function spellPickVM(spell: SrdSpellData, locale: Locale): SpellPickVM {
  const name = localizeSrd("spell", spell.id, "name", locale);
  let searchDesc: string | undefined;
  return {
    id: spell.id,
    name,
    searchText: `${name} ${localizeSrd("spell", spell.id, "name", "en")}`,
    // LAZY + cached (D, same contract as `description` below): the corpus
    // resolves on the FIRST ≥3-char query, then sticks — a 300-spell pool
    // still mounts on name lookups only.
    get searchDesc() {
      searchDesc ??= proseCorpus(
        this.description,
        locale === "en" ? undefined : localizeSrd("spell", spell.id, "description", "en")
      );
      return searchDesc;
    },
    level: spell.level,
    school: spell.school,
    castingTimeKey: castingTimeI18nKey(spell.castingTime),
    concentration: spell.concentration,
    ritual: spell.ritual,
    // LAZY (D): the reading prose resolves on ACCESS — only an OPENED row pays
    // the catalogue lookup, so building a 300-spell pool costs names only
    // (the ~750ms full-list mount under 4× CPU was mostly eager descriptions).
    get description() {
      return localizeSrd("spell", spell.id, "description", locale);
    },
    // LAZY like `description`: only an OPENED row's fact grid pays the lookups.
    get range() {
      return localizeSrd("spell", spell.id, "range", locale);
    },
    get duration() {
      return localizeSrd("spell", spell.id, "duration", locale);
    },
    entry: spell,
  };
}

/** Filter facts for one learnable pool (cantrips OR leveled spells). */
export interface SpellPoolFilter {
  /** Class list gate ("bard") — used when `allowedLists` is absent. */
  classId: string;
  /**
   * The exact set of spell lists the pool may draw from — a spell qualifies if
   * it is on ANY of these. Supplied when the class's pool is WIDENED beyond its
   * own list (Bard "Magical Secrets" → bard∪cleric∪druid∪wizard), derived from
   * the accumulated grants via `widenedSpellListsAtLevel` (golden rule 7 — no
   * feature-id / display-string branching). When absent the gate is the single
   * `classId` list (the historic, unwidened behavior).
   */
  allowedLists?: ReadonlySet<string>;
  /** true → level 0 only; false → 1..maxLevel. */
  cantripsOnly: boolean;
  maxLevel: number;
  /** Spell ids the character already owns — excluded from the pool. */
  exclude: ReadonlySet<string>;
}

/** The learnable spell pool for a wizard list slot, as VMs (SRD order). */
export function learnableSpellVMs(
  filter: SpellPoolFilter,
  locale: Locale
): SpellPickVM[] {
  const allowed = filter.allowedLists ?? new Set([filter.classId.toLowerCase()]);
  return allSpells
    .filter((s) => {
      if (!s.classes.some((c) => allowed.has(c))) return false;
      if (filter.exclude.has(s.id)) return false;
      if (filter.cantripsOnly) return s.level === 0;
      return s.level > 0 && s.level <= filter.maxLevel;
    })
    .map((s) => spellPickVM(s, locale));
}
