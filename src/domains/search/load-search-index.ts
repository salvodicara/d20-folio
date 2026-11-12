/**
 * The ⌘K index over every source, in one call: the user's characters and campaigns
 * (the caller holds the live lists), the app's screens, the rules glossary, classes,
 * species and backgrounds, and the compendium named in every language. The compendium
 * is imported on the first call (see `loadCompendiumEntries`), so call it when the
 * palette first opens and rebuild it when the lists or the language change.
 */
import type { TFunction } from "i18next";

import type { Locale } from "@/lib/locale";

import { createSearchIndex, type SearchIndex } from "./search-index";
import {
  campaignEntries,
  characterEntries,
  destinationEntries,
  loadCompendiumEntries,
  originEntries,
  ruleEntries,
} from "./search-sources";

export interface SearchIndexInput {
  t: TFunction;
  locale: Locale;
  characters: Parameters<typeof characterEntries>[0];
  campaigns: Parameters<typeof campaignEntries>[0];
  isAdmin: boolean;
}

export async function loadSearchIndex(input: SearchIndexInput): Promise<SearchIndex> {
  const { t, locale } = input;
  return createSearchIndex([
    ...characterEntries(input.characters, locale),
    ...campaignEntries(input.campaigns),
    ...destinationEntries(t, { isAdmin: input.isAdmin }),
    ...ruleEntries(t, locale),
    ...originEntries(locale),
    ...(await loadCompendiumEntries(t, locale, { names: "all" })),
  ]);
}
