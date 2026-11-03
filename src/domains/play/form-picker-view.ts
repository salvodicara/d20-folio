/**
 * The Play screen's form picker (edge-case family M2): the forms the character may
 * assume through `sourceId` (`formPool`: Wild Shape by the druid's table, a spell by
 * level), grouped by Challenge Rating from the lowest, found by name, each with the
 * numbers that decide the pick. Wild Shape's Temporary HP are the same for every form
 * (the Druid level), so the picker says them once; a spell's are each form's own Hit
 * Points, shown on its row. Pure: the screen renders labels and distances.
 */
import type { BeastStatBlock } from "@/data/types";
import { localizeSrd } from "@/i18n/resolver";
import { formPool } from "@/lib/form-pool";
import type { Locale } from "@/lib/locale";
import { assumeBeastForm } from "@/lib/play/forms";
import { selfFormRule } from "@/lib/polymorph";
import { matchesSearch } from "@/lib/search";
import { formatCr } from "@/lib/utils";
import type { CharacterDoc } from "@/types/character";

export type SpeedMode = "walk" | "fly" | "swim" | "climb" | "burrow";

const SPEED_MODES: readonly SpeedMode[] = ["walk", "fly", "swim", "climb", "burrow"];

export interface FormPickRow {
  id: string;
  name: string;
  ac: number;
  hp: number;
  speeds: { mode: SpeedMode; ft: number }[];
}

export interface FormPickerView {
  groups: { cr: string; rows: FormPickRow[] }[];
  /** The Temporary HP every form brings (Wild Shape), or null when each form's own. */
  tempHp: number | null;
}

function row(beast: BeastStatBlock, locale: Locale): FormPickRow {
  return {
    id: beast.id,
    name: localizeSrd("beasts", beast.id, "name", locale),
    ac: beast.ac,
    hp: beast.hp,
    speeds: SPEED_MODES.flatMap((mode) => {
      const ft = beast.speeds[mode];
      return typeof ft === "number" && ft > 0 ? [{ mode, ft }] : [];
    }),
  };
}

export function formPickerView(
  doc: CharacterDoc,
  sourceId: string,
  locale: Locale,
  query: string
): FormPickerView {
  const pool = formPool(doc, sourceId);
  const groups: FormPickerView["groups"] = [];
  for (const beast of pool) {
    const shown = row(beast, locale);
    const en = localizeSrd("beasts", beast.id, "name", "en");
    if (!matchesSearch(query, shown.name, en)) continue;
    const cr = formatCr(beast.cr);
    const last = groups.at(-1);
    if (last?.cr === cr) last.rows.push(shown);
    else groups.push({ cr, rows: [shown] });
  }
  const first = pool[0];
  const tempHp =
    first && selfFormRule(sourceId).tempHp === "grants"
      ? assumeBeastForm(doc, first, sourceId).tempHp
      : null;
  return { groups, tempHp };
}
