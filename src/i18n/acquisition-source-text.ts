import type { Locale } from "@/lib/locale";

/** Inline authored bundle labels are read at this edge, with no locale fallback. */
export function authoredChoiceText(value: unknown, locale: Locale): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const text = (value as Record<string, unknown>)[locale];
  return typeof text === "string" ? text : undefined;
}
