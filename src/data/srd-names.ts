/**
 * SRD display NAMES — the SRD-free name index.
 *
 * Character records store class/race/background/subclass as ids (older ones as
 * EN or IT labels). Resolving those, and naming them on a glance (the roster
 * card, the identity line), needs ONLY the names, not the multi-megabyte
 * class/spell/background data: importing the full `@/data/classes` / `races` /
 * `backgrounds` for a name used to drag `srd-classes` + `srd-content` (~350 KB
 * gzip) onto the landing page.
 *
 * The names are the catalogues' own (`src/i18n/<locale>/srd/{classes,subclasses,
 * races,backgrounds}.json`, plus the content pack's), read through the eager name
 * index (`@/i18n/srd-name-index`), so every language is a catalogue and none is
 * spelled here. `tests/unit/srd-names-sync.guard.test.ts` pins the index to the
 * full SRD data (no entry missing or extra).
 */
import type { LocaleText } from "@/data/types";
import type { RaceId } from "@/types/ids";
import { LOCALES, SOURCE_LOCALE } from "@/lib/locale";
import { srdNameCatalogue, type NameKind } from "@/i18n/srd-name-index";

/** A localized id→name entry (the data is keyed by stable kebab-case id). */
export interface NamedEntry {
  id: string;
  name: LocaleText;
}

/**
 * Every entry of a name kind: the ids are the source catalogue's top-level keys
 * that carry a `name` (nested keys such as `elf.traits.…` are trait rows), named
 * in every locale (a locale missing a name falls back to the source one).
 */
function namedEntries(kind: NameKind): NamedEntry[] {
  const source = srdNameCatalogue(SOURCE_LOCALE, kind);
  return Object.entries(source)
    .filter(([id, fields]) => !id.includes(".") && typeof fields.name === "string")
    .map(([id, fields]) => ({
      id,
      name: Object.fromEntries(
        LOCALES.map((locale) => {
          const name = srdNameCatalogue(locale, kind)[id]?.name;
          return [locale, typeof name === "string" ? name : fields.name];
        })
      ) as LocaleText,
    }));
}

/** Does an entry's id, or its name in any language, equal `lower`? */
function matches(entry: NamedEntry, lower: string): boolean {
  return (
    entry.id.toLowerCase() === lower ||
    Object.values(entry.name).some((name) => name.toLowerCase() === lower)
  );
}

const CLASS_ENTRIES: ReadonlyArray<NamedEntry> = namedEntries("class");

/** Class display names — public SRD + content pack. */
export const CLASS_NAMES: ReadonlyArray<LocaleText> = CLASS_ENTRIES.map((c) => c.name);

/** Subclass display names — public SRD + content pack. */
export const SUBCLASS_NAMES: ReadonlyArray<NamedEntry> = namedEntries("subclass");

/** Species display names — public SRD + content pack. */
export const RACE_NAMES: ReadonlyArray<NamedEntry> = namedEntries("race");

/** Background display names — public SRD + content pack. */
export const BACKGROUND_NAMES: ReadonlyArray<NamedEntry> = namedEntries("background");

/**
 * Resolve a stable class id from a (possibly IT-localized) class string — the
 * SRD-free equivalent of `@/data/classes` `getCharacterClassId`, for eager
 * callers (the persistence-layer sanitizer) that must not pull the class data.
 * An id or a name in any language resolves; unknown input falls back to its
 * lower-case form.
 */
export function resolveClassId(className: string): string {
  if (typeof className !== "string" || !className) return "";
  const lower = className.toLowerCase();
  return CLASS_ENTRIES.find((c) => matches(c, lower))?.id ?? lower;
}

/**
 * The EN class display name for a classId (`"monk"` → `"Monk"`), or `""` if the
 * id is unknown. The inverse of {@link resolveClassId} — used to RESTORE the
 * dropped `class` label on a minimal document (which stores `classId` as the
 * source of truth) so the SRD-free roster, which reads `class`, still shows it.
 * SRD-free (name lookup only).
 */
export function classNameById(classId: string): string {
  if (typeof classId !== "string" || !classId) return "";
  const lower = classId.toLowerCase();
  return CLASS_ENTRIES.find((c) => c.id === lower)?.name[SOURCE_LOCALE] ?? "";
}

/** The EN subclass display name for a subclassId, or `""` if unknown. */
export function subclassNameById(subclassId: string): string {
  if (typeof subclassId !== "string" || !subclassId) return "";
  const lower = subclassId.toLowerCase();
  return (
    SUBCLASS_NAMES.find((e) => e.id.toLowerCase() === lower)?.name[SOURCE_LOCALE] ?? ""
  );
}

/**
 * The CANONICAL subclass id for a subclass label OR id ("Path of the Berserker" →
 * "berserker", "Warrior of Mercy" → "mercy") via the SUBCLASS_NAMES table. SRD-free
 * — used by the read seam to resolve a stored display name to its real id instead of
 * a naive kebab (a kebab of the label, e.g. "path-of-the-berserker", does NOT match
 * the canonical id "berserker", which silently DROPS every subclass feature). Returns
 * `""` when unknown so the caller can fall back.
 */
export function subclassIdByName(nameOrId: string): string {
  if (typeof nameOrId !== "string" || !nameOrId) return "";
  const lower = nameOrId.toLowerCase();
  return SUBCLASS_NAMES.find((e) => matches(e, lower))?.id ?? "";
}

/**
 * The stable RACE id for a (possibly IT-localized) race string — `"Elf"`/`"Elfo"`
 * → `"elf"`, and an already-id input (`"lorwyn-changeling"`) passes through. The
 * race equivalent of {@link resolveClassId}: scans {@link RACE_NAMES} for an id or
 * a name in any language and returns the canonical `id`. Unknown (homebrew) input
 * falls back to its lower-cased form so the value still round-trips. SRD-free.
 */
export function raceIdByName(raceName: string): string {
  if (typeof raceName !== "string" || !raceName) return "";
  const lower = raceName.toLowerCase();
  return RACE_NAMES.find((r) => matches(r, lower))?.id ?? lower;
}

/**
 * Brand a resolved stable race id as a {@link RaceId} — the boundary minter used at
 * the codec read edge + the species SELECT. A trivial tag (the caller has already
 * resolved a real id via {@link raceIdByName} / getRace); the ONE sanctioned way a
 * value becomes a RaceId, so a display NAME can never type-check into
 * `CharacterData.race` (golden rule 7).
 */
export function asRaceId(id: string): RaceId {
  return id as RaceId;
}

/**
 * The stable BACKGROUND id for a (possibly IT-localized) background string —
 * `"Wayfarer"`/`"Viandante"` → `"wayfarer"`, id passthrough. SRD-free mirror of
 * {@link raceIdByName} over {@link BACKGROUND_NAMES}; unknown input falls back to
 * its lower-cased form.
 */
export function backgroundIdByName(background: string): string {
  if (typeof background !== "string" || !background) return "";
  const lower = background.toLowerCase();
  return BACKGROUND_NAMES.find((b) => matches(b, lower))?.id ?? lower;
}

/**
 * The EN background display name for a background id (`"wayfarer"` →
 * `"Wayfarer"`), or `""` when unknown. The inverse of {@link backgroundIdByName}.
 */
export function backgroundNameById(backgroundId: string): string {
  if (typeof backgroundId !== "string" || !backgroundId) return "";
  const lower = backgroundId.toLowerCase();
  return (
    BACKGROUND_NAMES.find((b) => b.id.toLowerCase() === lower)?.name[SOURCE_LOCALE] ?? ""
  );
}
