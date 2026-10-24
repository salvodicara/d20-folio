/**
 * The viewer's string of homebrew text a player authored (`HomebrewText`: a
 * plain string, or some languages) and the edit a form makes in one language.
 * The ONE resolver every presenter and form uses for a homebrew name,
 * description or label: the viewer's locale, else the source locale, else any
 * present locale (`homebrewLocaleText`'s fallback).
 */
import { homebrewLocaleText, type HomebrewText } from "@/lib/homebrew-text";
import type { Locale } from "@/lib/locale";

/** The display string of authored text in the viewer's locale, with the fallback. */
export function homebrewText(value: HomebrewText | undefined, locale: Locale): string {
  return homebrewLocaleText(value)[locale];
}

/**
 * The stored value after a form edits it in the viewer's locale: a plain string
 * stays a plain string (its language is unknown, so the edit replaces it); a map
 * changes only that locale, so the languages the form did not show are kept.
 */
export function editHomebrewText(
  value: HomebrewText | undefined,
  locale: Locale,
  next: string
): HomebrewText {
  if (value === undefined || typeof value === "string") return next;
  return { ...value, [locale]: next };
}
