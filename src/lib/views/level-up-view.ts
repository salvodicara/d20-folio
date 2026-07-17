/**
 * Level-up presenter (`lib/views`) — resolves the STABLE ids the level-up engine
 * emits into LOCALIZED interpolation args, at render (docs/ARCHITECTURE.md).
 *
 * `level-up.ts` is engine-core: it must not localize, so a `LevelUpChange` carries
 * ids in its `i18nArgs` (`classId` for the subclass-choice checklist item,
 * `featureId` for a scaling-die upgrade) rather than forcing both `name.en` +
 * `name.it` into the args and letting each locale's template cherry-pick. This
 * presenter resolves each id to the single localized name the template expects
 * (`{{class}}` / `{{feature}}` — identical placeholder in EN and IT), so the
 * "engine emits the wrong language" leak is gone and there is ONE name source.
 *
 * Pure: it reads SRD data + a `locale`, returns plain interpolation args. No React,
 * no stores, no i18next import — the UI feeds the result straight to `t(key, args)`.
 *
 * ## Slice 4 (R6+R3) — the full per-step presenter
 *
 * Beyond the engine-emitted-id resolvers above, this module now builds the
 * render-ready view-models for EVERY level-up picker (subclass · ASI/feat ·
 * fighting style · expertise · weapon mastery · metamagic · invocations ·
 * maneuvers · spell mastery · signature spells · new feature cards · spell-swap
 * summary). Each VM carries its STABLE id (the picker binds to + emits THIS) plus
 * the localized label / gloss resolved HERE through {@link localizeSrd} keyed by
 * the id — so the surface survives the upcoming `src/data/**` BiText strip and
 * makes ZERO direct `[locale]` reads (golden rules 5 + 7, docs/ARCHITECTURE.md
 * §1.3 + §3.3). Raw NUMBERS (costs, picks-needed, HP, slot counts) stay raw; the
 * UI formats them at the edge via `t`.
 */
import { getClassTable, getFeaturesAtLevel, classFeatureIndex } from "@/data/classes";
import { getExpandedSpellsThroughLevel } from "@/lib/expanded-spells";
import type { Locale } from "@/lib/locale";
import type { ProficiencyToken } from "@/types/ids";
import { proseCorpus } from "@/lib/search";
import { localizeSrd, hasSrd, type SrdKind } from "@/i18n/resolver";
import { listFightingStyles, hasFightingStyleFeat } from "@/lib/fighting-style";
import { listMasterableWeapons } from "@/lib/weapon-mastery-pick";
import { localizeWeaponMastery } from "@/lib/views/srd-i18n";
import { listMetamagicOptions } from "@/lib/metamagic-pick";
import { eligibleInvocations } from "@/lib/invocation-pick";
import { eligibleManeuvers } from "@/lib/maneuver-pick";
import type { CustomFeature, SrdFeatureRef } from "@/types/character";

/**
 * The minimal shape this presenter localizes — anything carrying engine-emitted
 * `i18nArgs` (a `LevelUpChange` OR a `LevelUpChecklistItem`; both share the
 * `{ i18nKey?, i18nArgs? }` contract).
 */
interface HasI18nArgs {
  i18nArgs?: Record<string, string | number>;
}

/** Humanize a slug id when no SRD name is found (EN/IT both fall back here). */
function humanizeId(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The localized interpolation args for a `LevelUpChange`: the engine's raw
 * `i18nArgs` with any id arg resolved to its localized name under the single
 * placeholder the i18n template uses (`classId` → `class`, `featureId` →
 * `feature`). Non-id args (numbers, dice strings) pass through unchanged. Returns
 * `undefined` when the change has no args (so `t(key)` is called bare).
 */
/**
 * R4 — the localized SOURCE-ATTRIBUTION label for a level-up change: "Wizard 5"
 * (the advancing class + its new class level). Returns `undefined` when the change
 * carries no source class (a total-level event like the PB bump), so the UI omits
 * the badge. Engine emits the id; the view resolves the localized name (one seam).
 */
export function levelUpChangeSource(
  change: { sourceClassId?: string; sourceClassLevel?: number },
  locale: Locale
): string | undefined {
  if (!change.sourceClassId) return undefined;
  const className = hasSrd("class", change.sourceClassId, "name", locale)
    ? localizeSrd("class", change.sourceClassId, "name", locale)
    : humanizeId(change.sourceClassId);
  return change.sourceClassLevel ? `${className} ${change.sourceClassLevel}` : className;
}

export function levelUpChangeArgs(
  change: HasI18nArgs,
  locale: Locale
): Record<string, string | number> | undefined {
  const args = change.i18nArgs;
  if (!args) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === "classId" && typeof v === "string") {
      out.class = hasSrd("class", v, "name", locale)
        ? localizeSrd("class", v, "name", locale)
        : humanizeId(v);
    } else if (k === "featureId" && typeof v === "string") {
      out.feature = hasSrd("class-feature", v, "name", locale)
        ? localizeSrd("class-feature", v, "name", locale)
        : humanizeId(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── shared option-VM shape ───────────────────────────────────────────────────

/** One render-ready level-up picker option. The picker binds to + emits `id`. */
export interface LevelUpOptionVM {
  /** Stable id — the SINGLE source of truth the picker emits. */
  id: string;
  /** Localized display label. */
  label: string;
  /** The localized EN name — the accent-insensitive search anchor (paired). */
  searchEn: string;
  /** Localized gloss / description line, when the option carries one. */
  meta?: string;
  /** Tier-2 search corpus (localized + EN description) — set alongside `meta`
   *  so a ≥3-char query surfaces description hits AFTER name hits (fb4). */
  searchDesc?: string;
  /** A localized note line (prerequisite, "already taken", mastery keyword). */
  note?: string;
  /** True when the option is already owned and must render disabled. */
  disabled?: boolean;
}

/** The tier-2 corpus for one option: its localized description + the EN twin
 *  (markdown flattened) — one helper, every prose builder below uses it. */
function descSearchCorpus(
  kind: SrdKind,
  id: string,
  meta: string,
  locale: Locale
): string {
  return proseCorpus(
    meta,
    locale === "en" ? undefined : localizeSrd(kind, id, "description", "en")
  );
}

// ── name accessors (the ONE place these SRD strings resolve) ──────────────────

/** The localized subclass name (kind `"subclass"`). */
export function subclassName(subclassId: string, locale: Locale): string {
  return localizeSrd("subclass", subclassId, "name", locale);
}

/** The localized class name (kind `"class"`) — for the advancement context line. */
export function className(classId: string, locale: Locale): string {
  return localizeSrd("class", classId, "name", locale);
}

/** The localized weapon/armor proficiency name (kind `"proficiency"`) — for the
 *  multiclass entry-gains note. The token (`martial-weapons`, `light-armor`) is a
 *  stable {@link ProficiencyToken}; the display resolves from the catalogue. */
export function proficiencyName(token: ProficiencyToken, locale: Locale): string {
  return localizeSrd("proficiency", token, "name", locale);
}

/** The localized feat name (kind `"feat"`). */
export function featName(featId: string, locale: Locale): string {
  return localizeSrd("feat", featId, "name", locale);
}

/** The localized equipment name (kind `"equipment"`) — weapon-mastery rows. */
export function equipmentName(id: string, locale: Locale): string {
  return localizeSrd("equipment", id, "name", locale);
}

/** The localized metamagic-option name (kind `"metamagic"`). */
export function metamagicName(id: string, locale: Locale): string {
  return localizeSrd("metamagic", id, "name", locale);
}

/** The localized invocation name (kind `"invocation"`). */
export function invocationName(id: string, locale: Locale): string {
  return localizeSrd("invocation", id, "name", locale);
}

/** The localized maneuver name (kind `"maneuver"`). */
export function maneuverName(id: string, locale: Locale): string {
  return localizeSrd("maneuver", id, "name", locale);
}

/** The localized SRD spell name (kind `"spell"`) — for swap/mastery summaries. */
export function spellName(spellId: string, locale: Locale): string {
  return localizeSrd("spell", spellId, "name", locale);
}

// ── subclass step ────────────────────────────────────────────────────────────

/**
 * The subclass options for a class, each glossed with its FIRST feature's
 * localized description (the same gloss the wizard has always shown). Empty when
 * the class has no subclasses. Identity is the subclass id.
 */
export function subclassOptions(classId: string, locale: Locale): LevelUpOptionVM[] {
  const table = getClassTable(classId.toLowerCase());
  if (!table) return [];
  return table.subclasses.map((sc) => {
    const firstFeatureId = sc.featureIds[0];
    const firstFeature = firstFeatureId
      ? classFeatureIndex.get(firstFeatureId)
      : undefined;
    const meta = firstFeature
      ? localizeSrd("class-feature", firstFeature.id, "description", locale)
      : "";
    return {
      id: sc.id,
      label: subclassName(sc.id, locale),
      searchEn: subclassName(sc.id, "en"),
      meta: meta || undefined,
    };
  });
}

/** One granted feature in the subclass reveal (localized name + full prose). */
export interface SubclassRevealFeature {
  id: string;
  name: string;
  description: string;
}

/**
 * The chosen subclass's REVEAL — everything it grants at the unlock level, for
 * the level-up hero altar (detail on selected, §2.7.2): its features at `level`
 * (localized name + full reading prose) and its always-prepared bonus spells
 * granted THROUGH `level` (localized names). Features resolve from the class's
 * own feature rows (D6 — the owning-class level), spells from the subclass's
 * `expandedSpells` thresholds. Pure; identity stays the stable ids.
 */
export function subclassReveal(
  classId: string,
  subclassId: string,
  level: number,
  locale: Locale
): { features: SubclassRevealFeature[]; spells: string[] } {
  const sub = subclassId.toLowerCase();
  const features = getFeaturesAtLevel(classId.toLowerCase(), level)
    .filter((f) => f.subclass && f.subclass.toLowerCase() === sub)
    .map((f) => ({
      id: f.id,
      name: localizeSrd("class-feature", f.id, "name", locale),
      description: localizeSrd("class-feature", f.id, "description", locale),
    }));
  const spells = getExpandedSpellsThroughLevel(classId, subclassId, level).map((id) =>
    spellName(id, locale)
  );
  return { features, spells };
}

// ── feat (ASI) step ──────────────────────────────────────────────────────────

/** The six ability codes, in canonical order. */
const ABILITY_CODES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
/** ASI ability-tile labels (app abbreviations, not SRD BiText). */
const ABILITY_LABELS: Record<string, BiTextLite> = {
  STR: { en: "STR", it: "FOR" },
  DEX: { en: "DEX", it: "DES" },
  CON: { en: "CON", it: "COS" },
  INT: { en: "INT", it: "INT" },
  WIS: { en: "WIS", it: "SAG" },
  CHA: { en: "CHA", it: "CAR" },
};
interface BiTextLite {
  en: string;
  it: string;
}

/** The localized abbreviation for an ability code (the ASI tiles). */
export function abilityLabel(code: string, locale: Locale): string {
  return ABILITY_LABELS[code]?.[locale] ?? code;
}

/** The ordered ability codes the ASI tiles render. */
export function abilityCodes(): readonly string[] {
  return ABILITY_CODES;
}

/**
 * The localized prerequisite line for a feat (kind `"feat"`, field
 * `"prerequisite"`), or `undefined` when the feat has none. The catalogue carries
 * `prerequisite` as an OPTIONAL field, so `hasSrd` gates the resolve — `undefined`
 * means "no prerequisite", never a missing-key bug.
 */
export function featPrerequisite(featId: string, locale: Locale): string | undefined {
  if (!hasSrd("feat", featId, "prerequisite", locale)) return undefined;
  return localizeSrd("feat", featId, "prerequisite", locale);
}

// ── fighting style ───────────────────────────────────────────────────────────

/**
 * The fighting-style options, each glossed with its localized description, with
 * any style already on the character flagged `disabled` + a localized "already
 * taken" note (the caller supplies the localized note string + the owned check).
 *
 * `classId` (the advancing class — a stable id, rule 7) scopes the two CASTER
 * styles: a Paladin's list includes Blessed Warrior, a Ranger's includes Druidic
 * Warrior, every other class includes neither. Omit it for a class-agnostic
 * caller (only the universal styles are offered).
 */
export function fightingStyleOptions(
  ownedFeatures: ReadonlyArray<SrdFeatureRef | CustomFeature>,
  alreadyTakenNote: string,
  locale: Locale,
  classId?: string
): LevelUpOptionVM[] {
  return listFightingStyles(classId).map((style) => {
    const owned = hasFightingStyleFeat(ownedFeatures, style.id);
    const meta = localizeSrd("feat", style.id, "description", locale);
    return {
      id: style.id,
      label: featName(style.id, locale),
      searchEn: featName(style.id, "en"),
      meta,
      searchDesc: descSearchCorpus("feat", style.id, meta, locale),
      note: owned ? alreadyTakenNote : undefined,
      disabled: owned,
    };
  });
}

// ── weapon mastery ───────────────────────────────────────────────────────────

/**
 * The masterable-weapon options, each labelled with its localized name and noted
 * with its LOCALIZED mastery-property name. The note resolves through the shared
 * `localizeWeaponMastery` (the `weapon-mastery` SRD catalogue) — the SAME path the
 * Compendium facet and the Features re-pick use, so the property reads in the
 * active locale ("Topple" / "Rovesciamento") instead of the raw English token.
 */
export function weaponMasteryOptions(locale: Locale): LevelUpOptionVM[] {
  return listMasterableWeapons().map((w) => ({
    id: w.id,
    label: localizeSrd("equipment", w.id, "name", locale),
    searchEn: localizeSrd("equipment", w.id, "name", "en"),
    note: w.mastery ? localizeWeaponMastery(w.mastery, locale) : undefined,
  }));
}

// ── metamagic ────────────────────────────────────────────────────────────────

/** One metamagic option VM — carries its raw `cost` (the UI formats the badge). */
export interface MetamagicOptionVM extends LevelUpOptionVM {
  /** Sorcery-point cost per use (RAW number; the edge formats "N SP"). */
  cost: number;
}

/**
 * The metamagic options, each glossed with its localized description + raw cost,
 * with any already-known option flagged `disabled` + an "already taken" note.
 */
export function metamagicOptions(
  alreadyKnown: ReadonlySet<string>,
  alreadyTakenNote: string,
  locale: Locale
): MetamagicOptionVM[] {
  return listMetamagicOptions().map((opt) => {
    const known = alreadyKnown.has(opt.id);
    const meta = localizeSrd("metamagic", opt.id, "description", locale);
    return {
      id: opt.id,
      label: localizeSrd("metamagic", opt.id, "name", locale),
      searchEn: localizeSrd("metamagic", opt.id, "name", "en"),
      meta,
      searchDesc: descSearchCorpus("metamagic", opt.id, meta, locale),
      cost: opt.cost,
      note: known ? alreadyTakenNote : undefined,
      disabled: known,
    };
  });
}

// ── eldritch invocations ─────────────────────────────────────────────────────

/**
 * The invocation options eligible at `level` (excluding already-known), each
 * glossed with its localized description. The prerequisite (when present) is
 * prefixed with the caller's localized "Prerequisite:" label.
 */
export function invocationOptions(
  level: number,
  alreadyKnown: ReadonlyArray<string>,
  prerequisiteLabel: string,
  locale: Locale
): LevelUpOptionVM[] {
  return eligibleInvocations(level, alreadyKnown).map((inv) => {
    const meta = localizeSrd("invocation", inv.id, "description", locale);
    return {
      id: inv.id,
      label: localizeSrd("invocation", inv.id, "name", locale),
      searchEn: localizeSrd("invocation", inv.id, "name", "en"),
      meta,
      searchDesc: descSearchCorpus("invocation", inv.id, meta, locale),
      // The prerequisite renders from the id-keyed SRD catalogue (EN + IT), behind
      // the localized label; the data `prerequisite` string stays the engine FACT.
      note: hasSrd("invocation", inv.id, "prerequisite", locale)
        ? `${prerequisiteLabel} ${localizeSrd("invocation", inv.id, "prerequisite", locale)}`
        : undefined,
    };
  });
}

// ── fighter maneuvers ────────────────────────────────────────────────────────

/**
 * The maneuver options eligible at `fighterLevel` (excluding already-known), each
 * glossed with its localized description. Identity is the maneuver id.
 */
export function maneuverOptions(
  fighterLevel: number,
  alreadyKnown: ReadonlyArray<string>,
  locale: Locale
): LevelUpOptionVM[] {
  return eligibleManeuvers(fighterLevel, alreadyKnown).map((m) => {
    const meta = localizeSrd("maneuver", m.id, "description", locale);
    return {
      id: m.id,
      label: localizeSrd("maneuver", m.id, "name", locale),
      searchEn: localizeSrd("maneuver", m.id, "name", "en"),
      meta,
      searchDesc: descSearchCorpus("maneuver", m.id, meta, locale),
    };
  });
}

// ── wizard spell mastery / signature spells ──────────────────────────────────

/**
 * Localize a list of `{ id }` spell picks (Spell Mastery / Signature Spells
 * eligible spells) into label VMs. The engine returns the eligible ids; the view
 * resolves the localized name (one seam). `searchEn` is kept for parity even
 * though these pickers are not searchable.
 */
export function spellPickOptions(
  picks: ReadonlyArray<{ id: string }>,
  locale: Locale
): LevelUpOptionVM[] {
  return picks.map((p) => ({
    id: p.id,
    label: spellName(p.id, locale),
    searchEn: spellName(p.id, "en"),
  }));
}

// ── new-feature preview cards ────────────────────────────────────────────────

/** One new-feature preview card — localized name + optional description. */
export interface FeatureCardVM {
  /** Stable class-feature id (card key + identity). */
  id: string;
  /** Localized feature name. */
  name: string;
  /** Localized description, or undefined when the feature has none. */
  description?: string;
}

/**
 * Build the new-feature preview cards from a `feature`-type `LevelUpChange`. The
 * change carries the stable class-feature IDS gained this level (`featureIds`); each
 * is localized from the catalogue at render (golden rule 7), so the card reads
 * in the active locale with NO display-name round-trip (the engine no longer emits
 * EN names the presenter parses back to ids). Any `-asi` feature is dropped when
 * `hideAsi` is set (the interactive ASI picker covers it).
 */
export function featureCardsFromChange(
  change: { featureIds?: string[] },
  hideAsi: boolean,
  locale: Locale
): FeatureCardVM[] {
  const cards: FeatureCardVM[] = [];
  for (const id of change.featureIds ?? []) {
    if (hideAsi && id.endsWith("-asi")) continue;
    cards.push({
      id,
      name: localizeSrd("class-feature", id, "name", locale),
      description: localizeSrd("class-feature", id, "description", locale),
    });
  }
  return cards;
}

// ── advancement context (R4 multiclass) ──────────────────────────────────────

/** The localized class-advancement context for the wizard header/subline. */
export interface AdvancementContextVM {
  /** The advancing class id (stable). */
  classId: string;
  /** Its localized name. */
  className: string;
  /** The class level being reached on THIS class (RAW number). */
  classLevel: number;
}

/**
 * The advancement context for a level-up: which class is being advanced and to
 * what class-level. `classLevel` stays RAW (the edge formats "Wizard 3"). This is
 * the multiclass-aware companion to {@link levelUpChangeSource}.
 */
export function advancementContext(
  classId: string,
  classLevel: number,
  locale: Locale
): AdvancementContextVM {
  return {
    classId,
    className: className(classId, locale),
    classLevel,
  };
}
