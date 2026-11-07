/**
 * A compendium entry's «In breve»: the catalogue's one-line gist, read through the
 * catalogue the entry's spec draws from. Null when the catalogue has none for it.
 */
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { SrdKind } from "@/i18n/srd-en";
import type { Locale } from "@/lib/locale";

const KIND: Record<string, SrdKind> = {
  spell: "spell",
  feat: "feat",
  feature: "class-feature",
  monster: "monster",
  invocation: "invocation",
  metamagic: "metamagic",
  maneuver: "maneuver",
};

export function compendiumGist(
  specId: string,
  entry: unknown,
  locale: Locale
): string | null {
  const e = entry as { id?: string; kind?: string; item?: { id: string } } | null;
  const [kind, id]: [SrdKind | undefined, string | undefined] =
    specId === "items" && e?.item
      ? [e.kind === "magic" ? "magic-item" : "equipment", e.item.id]
      : [KIND[specId], e?.id];
  if (!kind || !id || !hasSrd(kind, id, "gist", locale)) return null;
  return localizeSrd(kind, id, "gist", locale) || null;
}
