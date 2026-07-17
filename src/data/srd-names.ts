/**
 * SRD display NAMES — the SRD-free localization source.
 *
 * Character records store class/race/background/subclass as English strings or
 * kebab-case ids. Resolving those to localized labels needs ONLY the name BiText,
 * not the multi-megabyte class/spell/background data. This tiny module holds those
 * names so a glance (the roster card, the identity line) can localize WITHOUT
 * pulling the SRD: importing the full `@/data/classes` / `races` / `backgrounds`
 * for a name used to drag `srd-classes` + `srd-content` (~350 KB gzip) onto the
 * landing page.
 *
 * Single source is preserved by `tests/unit/srd-names-sync.guard.test.ts`, which
 * imports the full SRD data and fails if any name here drifts from it — so this
 * stays exact (and IT translations can never silently diverge).
 */
import type { BiText } from "@/data/types";
import type { RaceId } from "@/types/ids";
import { mergePack } from "@/lib/pack-merge";
import {
  packBackgroundNames,
  packClassNames,
  packRaceNames,
  packSubclassNames,
} from "@pack";

/** A localized id→name entry (the data is keyed by stable kebab-case id). */
export interface NamedEntry {
  id: string;
  name: BiText;
}

/**
 * Resolve a stable class id from a (possibly IT-localized) class string — the
 * SRD-free equivalent of `@/data/classes` `getCharacterClassId`, for eager
 * callers (the persistence-layer sanitizer) that must not pull the class data.
 * Class ids ARE `name.en` lower-cased, so a direct id match or an EN/IT name
 * match both resolve; unknown input falls back to its lower-case form.
 */
export function resolveClassId(className: string): string {
  if (typeof className !== "string" || !className) return "";
  const lower = className.toLowerCase();
  for (const n of CLASS_NAMES) {
    if (n.en.toLowerCase() === lower || n.it.toLowerCase() === lower) {
      return n.en.toLowerCase();
    }
  }
  return lower;
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
  for (const n of CLASS_NAMES) {
    if (n.en.toLowerCase() === lower) return n.en;
  }
  return "";
}

/** The EN subclass display name for a subclassId, or `""` if unknown. */
export function subclassNameById(subclassId: string): string {
  if (typeof subclassId !== "string" || !subclassId) return "";
  const lower = subclassId.toLowerCase();
  return SUBCLASS_NAMES.find((e) => e.id.toLowerCase() === lower)?.name.en ?? "";
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
  const match = SUBCLASS_NAMES.find(
    (e) =>
      e.id.toLowerCase() === lower ||
      e.name.en.toLowerCase() === lower ||
      e.name.it.toLowerCase() === lower
  );
  return match?.id ?? "";
}

/**
 * The stable RACE id for a (possibly IT-localized) race string — `"Elf"`/`"Elfo"`
 * → `"elf"`, and an already-id input (`"lorwyn-changeling"`) passes through. The
 * race equivalent of {@link resolveClassId}: scans {@link RACE_NAMES} for an id /
 * EN / IT match and returns the canonical `id`. Unknown (homebrew) input falls
 * back to its lower-cased form so the value still round-trips. SRD-free.
 */
export function raceIdByName(raceName: string): string {
  if (typeof raceName !== "string" || !raceName) return "";
  const lower = raceName.toLowerCase();
  for (const r of RACE_NAMES) {
    if (
      r.id.toLowerCase() === lower ||
      r.name.en.toLowerCase() === lower ||
      r.name.it.toLowerCase() === lower
    ) {
      return r.id;
    }
  }
  return lower;
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
  for (const b of BACKGROUND_NAMES) {
    if (
      b.id.toLowerCase() === lower ||
      b.name.en.toLowerCase() === lower ||
      b.name.it.toLowerCase() === lower
    ) {
      return b.id;
    }
  }
  return lower;
}

/**
 * The EN background display name for a background id (`"wayfarer"` →
 * `"Wayfarer"`), or `""` when unknown. The inverse of {@link backgroundIdByName}.
 */
export function backgroundNameById(backgroundId: string): string {
  if (typeof backgroundId !== "string" || !backgroundId) return "";
  const lower = backgroundId.toLowerCase();
  return BACKGROUND_NAMES.find((b) => b.id.toLowerCase() === lower)?.name.en ?? "";
}

const PUBLIC_CLASS_NAMES: ReadonlyArray<BiText> = [
  { en: "Barbarian", it: "Barbaro" },
  { en: "Bard", it: "Bardo" },
  { en: "Cleric", it: "Chierico" },
  { en: "Druid", it: "Druido" },
  { en: "Fighter", it: "Guerriero" },
  { en: "Monk", it: "Monaco" },
  { en: "Paladin", it: "Paladino" },
  { en: "Ranger", it: "Ranger" },
  { en: "Rogue", it: "Ladro" },
  { en: "Sorcerer", it: "Stregone" },
  { en: "Warlock", it: "Warlock" },
  { en: "Wizard", it: "Mago" },
];

/** Class display names — public SRD + content pack. */
export const CLASS_NAMES: ReadonlyArray<BiText> = [
  ...PUBLIC_CLASS_NAMES,
  ...packClassNames,
];

const PUBLIC_SUBCLASS_NAMES: ReadonlyArray<NamedEntry> = [
  {
    id: "berserker",
    name: { en: "Path of the Berserker", it: "Sentiero del Berserker" },
  },
  {
    id: "college-of-lore",
    name: { en: "College of Lore", it: "Collegio della Sapienza" },
  },
  { id: "life-domain", name: { en: "Life Domain", it: "Dominio della Vita" } },
  {
    id: "circle-of-the-land",
    name: { en: "Circle of the Land", it: "Circolo della Terra" },
  },
  { id: "champion", name: { en: "Champion", it: "Campione" } },
  {
    id: "open-hand",
    name: { en: "Warrior of the Open Hand", it: "Guerriero della Mano Aperta" },
  },
  {
    id: "oath-of-devotion",
    name: { en: "Oath of Devotion", it: "Giuramento di Devozione" },
  },
  { id: "hunter", name: { en: "Hunter", it: "Cacciatore" } },
  { id: "thief", name: { en: "Thief", it: "Furfante" } },
  {
    id: "draconic-sorcery",
    name: { en: "Draconic Sorcery", it: "Stregoneria Draconica" },
  },
  { id: "fiend-patron", name: { en: "Fiend Patron", it: "Patrono Immondo" } },
  // Official IT SRD 5.2.1: "Invocatore" — the Evocation school is "Invocazione"
  // in the IT vocabulary ("Evocazione" is Conjuration).
  { id: "evoker", name: { en: "Evoker", it: "Invocatore" } },
];

/** Subclass display names — public SRD + content pack. */
export const SUBCLASS_NAMES: ReadonlyArray<NamedEntry> = mergePack(
  "subclass-name",
  PUBLIC_SUBCLASS_NAMES,
  packSubclassNames
);

const PUBLIC_RACE_NAMES: ReadonlyArray<NamedEntry> = [
  { id: "human", name: { en: "Human", it: "Umano" } },
  { id: "elf", name: { en: "Elf", it: "Elfo" } },
  { id: "dwarf", name: { en: "Dwarf", it: "Nano" } },
  { id: "halfling", name: { en: "Halfling", it: "Halfling" } },
  { id: "orc", name: { en: "Orc", it: "Orco" } },
  { id: "gnome", name: { en: "Gnome", it: "Gnomo" } },
  { id: "tiefling", name: { en: "Tiefling", it: "Tiefling" } },
  { id: "goliath", name: { en: "Goliath", it: "Goliath" } },
  { id: "dragonborn", name: { en: "Dragonborn", it: "Dragonide" } },
];

/** Species display names — public SRD + content pack. */
export const RACE_NAMES: ReadonlyArray<NamedEntry> = mergePack(
  "race-name",
  PUBLIC_RACE_NAMES,
  packRaceNames
);

const PUBLIC_BACKGROUND_NAMES: ReadonlyArray<NamedEntry> = [
  { id: "acolyte", name: { en: "Acolyte", it: "Accolito" } },
  { id: "criminal", name: { en: "Criminal", it: "Criminale" } },
  { id: "sage", name: { en: "Sage", it: "Saggio" } },
  { id: "soldier", name: { en: "Soldier", it: "Soldato" } },
];

/** Background display names — public SRD + content pack. */
export const BACKGROUND_NAMES: ReadonlyArray<NamedEntry> = mergePack(
  "background-name",
  PUBLIC_BACKGROUND_NAMES,
  packBackgroundNames
);
