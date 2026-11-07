/**
 * «Effetti» on Play: every effect on the character now, so a changed number always has a
 * visible cause. Its own buffs (the header's ✦ group: not the ones its Concentration
 * holds, which sit under ◉) and what others left on it in the fight or on the campaign
 * clock (an ally's Bless, Warding Bond), each with who cast it. Conditions have their
 * own panel; areas (zones) the initiative panel.
 */
import { getSpellById } from "@/data/spells";
import type { SpellSchool } from "@/data/types";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { effectGroupsView, type EffectChip } from "@/lib/views/effect-chips-view";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { CharacterDoc } from "@/types/character";

export interface PlayEffectRow {
  id: string;
  name: string;
  /** Who put it on the character; null for its own. */
  from: string | null;
  /** What established its own buff (a feature, an item); null for an ally's. */
  source: string | null;
  remaining: EffectChip["remaining"];
  /** Ends when its caster's Concentration does. */
  concentration: boolean;
  /** The spell behind it, for its painted icon; null for a feature or own buff. */
  spell: { id: string; school: SpellSchool } | null;
  /** What it does in one line (the catalogue's gist), or null. */
  gist: string | null;
}

export interface PlayEffectsView {
  count: number;
  rows: PlayEffectRow[];
}

const spellOf = (e: ActiveCombatEffect) => {
  const school =
    e.source.kind === "spell" ? getSpellById(e.source.id)?.school : undefined;
  return school ? { id: e.source.id, school } : null;
};

const gistOf = (e: ActiveCombatEffect, locale: Locale) => {
  const kind = e.source.kind === "spell" ? "spell" : "class-feature";
  return hasSrd(kind, e.source.id, "gist", locale)
    ? localizeSrd(kind, e.source.id, "gist", locale) || null
    : null;
};

const sourceName = (e: ActiveCombatEffect, locale: Locale) =>
  localizeSrd(
    e.source.kind === "spell" ? "spell" : "class-feature",
    e.source.id,
    "name",
    locale
  );

/** `nameOf` names a combatant id (`pc-<uid>`, a monster) as the fight shows it. */
export function playEffectsView(
  doc: CharacterDoc,
  locale: Locale,
  nameOf: (combatantId: string) => string
): PlayEffectsView {
  const own: PlayEffectRow[] = effectGroupsView(doc, locale).effects.chips.map(
    (chip) => ({
      id: chip.id,
      name: chip.name,
      from: null,
      source: chip.source,
      remaining: chip.remaining,
      concentration: false,
      spell: null,
      gist: null,
    })
  );
  const others: PlayEffectRow[] = (doc.session.encounterEffects ?? [])
    .filter(
      (e) =>
        e.actor.combatantId !== e.target.combatantId &&
        e.payload.kind !== "condition" &&
        e.payload.kind !== "zone"
    )
    .map((e) => ({
      id: e.id,
      name: sourceName(e, locale),
      from: nameOf(e.actor.combatantId) || null,
      source: null,
      remaining: null,
      concentration:
        e.duration.kind === "concentration" ||
        (e.duration.kind === "game-clock" && e.duration.concentration !== undefined),
      spell: spellOf(e),
      gist: gistOf(e, locale),
    }));
  const rows = [...own, ...others];
  return { count: rows.length, rows };
}
