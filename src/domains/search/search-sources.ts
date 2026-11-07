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
import { SRD_CONDITIONS } from "@/data/conditions";
import i18n, { ensureSrdKind } from "@/i18n";
import { localizeSrd } from "@/i18n/resolver";
import { primaryClassId, totalLevel } from "@/lib/classes";
import type { Locale } from "@/lib/locale";
import { ALL_SKILLS } from "@/lib/skills";
import { localizeClassName } from "@/lib/views/srd-i18n";
import type { ClassEntry } from "@/types/character";

import type { SearchEntry } from "./global-search";

const other = (locale: Locale): Locale => (locale === "it" ? "en" : "it");

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
  const en = i18n.getFixedT("en");
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
    names: [t(key), en(key)],
  }));
}

/** The rules glossary: the conditions and the skills, explained in place. */
export function ruleEntries(t: TFunction, locale: Locale): SearchEntry[] {
  const tOther = i18n.getFixedT(other(locale));
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
      names: [label, localizeSrd("condition", condition.id, "name", other(locale))],
      text: [description],
    };
  });
  const skills = ALL_SKILLS.map((skill): SearchEntry => {
    const label = t(`skills.${skill.id}`);
    return {
      kind: "rule",
      id: `skill:${skill.id}`,
      label,
      sub: t("palette.kindSkill"),
      gist: t(`abilities.${skill.ability}`),
      action: { kind: "explain" },
      names: [label, tOther(`skills.${skill.id}`)],
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
  locale: Locale
): Promise<SearchEntry[]> {
  const [{ COMPENDIUM_SPECS }] = await Promise.all([
    import("@/features/compendium/picker/specs"),
    ensureSrdKind("monster"),
  ]);
  const ctx = { t, locale, character: null, mode: "browse" } as Parameters<
    (typeof COMPENDIUM_SPECS)[number]["getName"]
  >[1];
  return COMPENDIUM_SPECS.flatMap((spec) => {
    const typeLabel = spec.label(t);
    return spec.data.map((entry): SearchEntry => {
      const id = spec.getId(entry);
      const label = spec.getName(entry, ctx);
      const names = spec
        .nameText(entry, ctx)
        .filter((name): name is string => typeof name === "string" && name !== "");
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
        names: [label, ...names.filter((name) => name !== label)],
        text: spec.searchText(entry, ctx),
      };
    });
  });
}
