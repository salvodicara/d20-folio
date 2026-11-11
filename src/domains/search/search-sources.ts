/**
 * The global ⌘K search's sources, each turned into `SearchEntry` rows labelled in the
 * reader's language (`global-search.ts` ranks them). They are the classic palette's own
 * sources, taken out of the component so both surfaces read the same ones:
 *  - the user's characters and campaigns (the caller holds the live lists);
 *  - the app's screens;
 *  - the rules glossary: the conditions and the skills;
 *  - the compendium, through the compendium specs. Its index is LAZY: the specs pull
 *    the whole catalogue, so `loadCompendiumEntries` imports them on the first open
 *    and nothing here weighs on the eager bundle. Pack content arrives only through the
 *    specs' composed data (the `@pack` seam), so an SRD-only build finds SRD entries
 *    only.
 */
import type { TFunction } from "i18next";

import { compendiumArt } from "@/domains/compendium/compendium-art";
import { compendiumGist } from "@/domains/compendium/compendium-gist";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { classTables } from "@/data/classes";
import { SRD_CONDITIONS } from "@/data/conditions";
import { SRD_RACES } from "@/data/races";
import i18n, { ensureSrdKind } from "@/i18n";
import { localizeSrd } from "@/i18n/resolver";
import { primaryClassId, totalLevel } from "@/lib/classes";
import { LOCALES, SOURCE_LOCALE, type Locale } from "@/lib/locale";
import { ALL_SKILLS } from "@/lib/skills";
import {
  localizeBackgroundName,
  localizeClassName,
  localizeRaceName,
} from "@/lib/views/srd-i18n";
import type { ClassEntry } from "@/types/character";

import type { SearchEntry } from "./global-search";

/** The label first, then every other language's name for the same entry. */
const allNames = (label: string, nameIn: (locale: Locale) => string): string[] => [
  label,
  ...LOCALES.map(nameIn).filter((name) => name !== label),
];

/** The user's characters (the roster's live list). */
export function characterEntries(
  characters: ReadonlyArray<{
    id: string;
    character: { name: string; classes?: ReadonlyArray<ClassEntry> };
  }>,
  locale: Locale
): SearchEntry[] {
  return characters.map(({ id, character }) => {
    const bearer = { classes: [...(character.classes ?? [])] };
    const classId = primaryClassId(bearer);
    const cls = classId ? localizeClassName(classId, locale) : "";
    return {
      kind: "character",
      id: `char:${id}`,
      label: character.name,
      ...(cls ? { sub: `${cls} ${totalLevel(bearer)}` } : {}),
      action: { kind: "navigate", route: `/characters/${id}` },
      names: [character.name, ...(cls ? [cls] : []), ...(classId ? [classId] : [])],
    };
  });
}

/** The user's campaigns. */
export function campaignEntries(
  campaigns: ReadonlyArray<{ id: string; name: string }>
): SearchEntry[] {
  return campaigns.map(({ id, name }) => ({
    kind: "campaign",
    id: `camp:${id}`,
    label: name,
    action: { kind: "navigate", route: `/campaigns/${id}` },
    names: [name],
  }));
}

/** The app's screens (the admin one only for an admin). */
export function destinationEntries(
  t: TFunction,
  opts: { isAdmin: boolean }
): SearchEntry[] {
  const screens: Array<{ route: string; key: string }> = [
    { route: "/characters", key: "nav.characters" },
    { route: "/campaigns", key: "nav.campaigns" },
    { route: "/compendium", key: "nav.compendium" },
    { route: "/settings", key: "nav.settings" },
    { route: "/legal", key: "legal.title" },
    ...(opts.isAdmin ? [{ route: "/admin", key: "nav.admin" }] : []),
  ];
  return screens.map(({ route, key }) => ({
    kind: "destination",
    id: `sec:${route}`,
    label: t(key),
    action: { kind: "navigate", route },
    // The reader's name and the source (English) one, as the classic palette matched.
    names: [...new Set([t(key), i18n.getFixedT(SOURCE_LOCALE)(key)])],
  }));
}

/** The rules glossary: the conditions and the skills, explained in place. */
export function ruleEntries(t: TFunction, locale: Locale): SearchEntry[] {
  const conditions = SRD_CONDITIONS.map((condition): SearchEntry => {
    const label = localizeSrd("condition", condition.id, "name", locale);
    const description = localizeSrd("condition", condition.id, "description", locale);
    return {
      kind: "rule",
      id: `cond:${condition.id}`,
      label,
      sub: t("palette.kindCondition"),
      gist: description.split(/(?<=\.)\s/)[0] ?? null,
      action: { kind: "explain" },
      names: allNames(label, (l) => localizeSrd("condition", condition.id, "name", l)),
      text: [description],
    };
  });
  const skills = ALL_SKILLS.map((skill): SearchEntry => {
    const label = t(`skills.${skill.id}`);
    return {
      kind: "rule",
      id: `skill:${skill.id}`,
      label,
      sub: t("abilities.skill"),
      gist: t(`abilities.${skill.ability}`),
      action: { kind: "explain" },
      names: allNames(label, (l) => i18n.getFixedT(l)(`skills.${skill.id}`)),
    };
  });
  return [...conditions, ...skills];
}

/**
 * The compendium (spells, features, feats, items, maneuvers, metamagic, invocations,
 * weapon masteries, monsters), loaded on the first open: the specs and the lazy monster
 * catalogue are imported here, never statically.
 */
export async function loadCompendiumEntries(
  t: TFunction,
  locale: Locale,
  options: { names?: "shown" | "all" } = {}
): Promise<SearchEntry[]> {
  const [{ COMPENDIUM_SPECS }] = await Promise.all([
    import("@/features/compendium/picker/specs"),
    ensureSrdKind("monster"),
  ]);
  const ctx = { t, locale, character: null, mode: "browse" } as Parameters<
    (typeof COMPENDIUM_SPECS)[number]["getName"]
  >[1];
  // The ⌘K index ranks every language's name (`names: "all"`); the classic palette
  // ranks the shown one only.
  const others =
    options.names === "all"
      ? LOCALES.filter((l) => l !== locale).map((l) => ({
          ...ctx,
          t: i18n.getFixedT(l),
          locale: l,
        }))
      : [];
  return COMPENDIUM_SPECS.flatMap((spec) => {
    const typeLabel = spec.label(t);
    return spec.data.map((entry): SearchEntry => {
      const id = spec.getId(entry);
      const label = spec.getName(entry, ctx);
      const otherNames = others.map((other) => spec.getName(entry, other));
      return {
        kind: "compendium",
        id: `cmp:${spec.id}:${id}`,
        label,
        sub: typeLabel,
        gist: compendiumGist(spec.id, entry, locale),
        art: compendiumArt(spec.id, entry),
        action: {
          kind: "navigate",
          route: `/compendium?type=${spec.id}&sel=${encodeURIComponent(id)}`,
        },
        // By default ranked by the shown name only; the other languages' names live
        // in the text (`searchText` holds `nameText`), so they surface as capped
        // hints, as in the classic palette.
        names: [...new Set([label, ...otherNames])],
        text: spec.searchText(entry, ctx),
      };
    });
  });
}

/**
 * Classes, species and backgrounds (the build composes the pack's through the `@pack`
 * seam), each named in every language and explained in place: the compendium has no
 * page of their own.
 */
export function originEntries(locale: Locale): SearchEntry[] {
  const t = i18n.getFixedT(locale);
  const rows = (
    type: "class" | "species" | "background",
    ids: ReadonlyArray<string>,
    nameIn: (id: string, locale: Locale) => string,
    sub: string
  ) =>
    ids.map((id): SearchEntry => {
      const label = nameIn(id, locale);
      return {
        kind: "compendium",
        id: `${type}:${id}`,
        label,
        sub,
        action: { kind: "explain" },
        names: allNames(label, (l) => nameIn(id, l)),
      };
    });
  return [
    ...rows(
      "class",
      classTables.map((c) => c.id),
      localizeClassName,
      t("palette.kindClass")
    ),
    ...rows(
      "species",
      SRD_RACES.map((r) => r.id),
      localizeRaceName,
      t("palette.kindSpecies")
    ),
    ...rows(
      "background",
      SRD_BACKGROUNDS.map((b) => b.id),
      localizeBackgroundName,
      t("palette.kindBackground")
    ),
  ];
}
