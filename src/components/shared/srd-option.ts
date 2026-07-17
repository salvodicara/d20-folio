import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { srdEn, type SrdKind } from "@/i18n/srd-en";
import type { Locale } from "@/lib/locale";
import { SRD_TOOLS_2024 } from "@/lib/tools";

/**
 * The ONE label/search recipe for an SRD-entry option row — pure, no component,
 * so it can be shared without tripping React Fast-Refresh (golden rule 3: one
 * shared helper, no per-picker variant).
 *
 * Pickers map an SRD entry's stable `(kind, id)` to a
 * grid item: the visible label is the localized name, and the search text pairs
 * the localized name with the canonical EN name so a search finds an entry by
 * either language. The names are resolved from the i18n catalogues via
 * `localizeSrd` (R3 — SRD strings live there, not on the data). Returns just those
 * two fields so each picker layers on its own seal/chip/note.
 */
export function srdOptionParts(
  kind: SrdKind,
  id: string,
  locale: Locale
): { label: string; searchText: string } {
  const label = localizeSrd(kind, id, "name", locale);
  return { label, searchText: `${label} ${localizeSrd(kind, id, "name", "en")}` };
}

/** A tag-picker / option roster entry: id + bilingual name (+ the umbrella flag).
 *  Matches `SrdOption` in `SrdTagPicker.tsx` structurally. */
export interface ToolOption {
  id: string;
  name: { en: string; it: string };
  pickable?: boolean;
}

/**
 * The TOOL option roster — the SINGLE source every tool picker/chip resolves names
 * through (#107). Names come from the SRD equipment catalogue keyed by tool id:
 * `en` = the always-loaded EN anchor (the FACT the grants carry + the EN-token
 * match); `it` = the catalogue's IT name WHEN that catalogue is loaded (so a token
 * stored in Italian re-localizes regardless of the active UI locale, like the old
 * static BiText), falling back to EN when IT has not loaded. Consumers display
 * `name[locale]` and match against both, so the proficiency picker, the
 * skill-or-tool picker, the tool-choice picker AND the Bio tag picker read the SAME
 * canonical name the inventory item does — by construction, no drift. The
 * catalogue's `pickable` flag is carried through so the umbrellas stay
 * hold-but-not-offered.
 */
export function toolOptions(): ToolOption[] {
  return SRD_TOOLS_2024.map((tool) => {
    const en = srdEn("equipment", tool.id, "name") ?? tool.id;
    const it = hasSrd("equipment", tool.id, "name", "it")
      ? localizeSrd("equipment", tool.id, "name", "it")
      : en;
    return {
      id: tool.id,
      name: { en, it },
      ...(tool.pickable === false ? { pickable: false as const } : {}),
    };
  });
}
