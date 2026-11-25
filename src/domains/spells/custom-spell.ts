/**
 * A homebrew spell as a form makes it (#1230): the classic sheet's `CustomSpell`
 * (name, level, school, casting time, range, duration, V/S/M with the material,
 * Concentration, description), prepared, with its own `instanceId`. One rule: a
 * name is required. Shared by the classic Custom form and the Play screen's
 * «Incantesimo personalizzato».
 *
 * A ritual is stored where the catalogue spell keeps it (`mechanics.ritual`), the
 * shape the spell engine reads (`homebrewSpellData`); a cantrip is never a ritual.
 *
 * Pure module — no React, no store.
 */
import type { SpellSchool } from "@/data/types";
import { createItemInstanceId } from "@/lib/item-resources";
import type { Locale } from "@/lib/locale";
import { editHomebrewText } from "@/lib/views/homebrew-text-view";
import type { CustomSpell } from "@/types/character";

/** The casting-time option tokens (stable ids, rendered `srd.castingTime_<id>`). */
export const CUSTOM_SPELL_CASTING_TIMES = [
  "action",
  "bonus",
  "reaction",
  "1 minute",
  "10 minutes",
  "1 hour",
  "8 hours",
  "24 hours",
] as const;

export interface CustomSpellDraft {
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  v: boolean;
  s: boolean;
  m: boolean;
  material: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
}

/** An empty draft: level 1 evocation, an action, V and S; the range and duration
 *  start from the viewer's localized defaults. */
export function customSpellDraft(defaults: {
  range: string;
  duration: string;
}): CustomSpellDraft {
  return {
    name: "",
    level: 1,
    school: "evocation",
    castingTime: "action",
    range: defaults.range,
    duration: defaults.duration,
    v: true,
    s: true,
    m: false,
    material: "",
    concentration: false,
    ritual: false,
    description: "",
  };
}

export function customSpellFromDraft(
  draft: CustomSpellDraft,
  locale: Locale,
  /** An edit: what the form does not show is kept, and so are the other languages. */
  seed?: CustomSpell
): { ok: true; spell: CustomSpell } | { ok: false; errors: { name: "required" } } {
  const name = draft.name.trim();
  if (!name) return { ok: false, errors: { name: "required" } };
  const { ritual: _ritual, ...kept } = seed?.mechanics ?? {};
  void _ritual;
  const mechanics = {
    ...kept,
    ...(draft.ritual && draft.level > 0 ? { ritual: true } : {}),
  };
  const material = draft.material.trim();
  return {
    ok: true,
    spell: {
      ...seed,
      custom: true,
      name: editHomebrewText(seed?.name, locale, name),
      level: draft.level,
      school: draft.school,
      castingTime: draft.castingTime,
      range: draft.range,
      components: {
        v: draft.v,
        s: draft.s,
        m: draft.m,
        ...(draft.m && material ? { material } : {}),
      },
      duration: draft.duration,
      concentration: draft.concentration,
      description: editHomebrewText(seed?.description, locale, draft.description),
      mechanics: Object.keys(mechanics).length > 0 ? mechanics : undefined,
      prepared: true,
      instanceId: seed?.instanceId ?? createItemInstanceId(),
    },
  };
}
