/**
 * The Play screen's left column: «Risorse», every pool the character spends from in
 * the engine's order (`resourcesView`) with what is left of it, and «Abilità», the six
 * skills worth seeing at a glance — the proficient ones (or with Expertise) first, the
 * best bonus first, then the best of the rest — with all 18 behind one tap.
 * Jack of All Trades' half proficiency covers every skill, so it ranks none higher.
 */
import type { Locale } from "@/lib/locale";
import { resourcesView, type ResourceRow } from "@/lib/views/resources-view";
import {
  deriveSavesAndChecks,
  type SaveCheckSkillRow,
} from "@/lib/views/saves-checks-view";
import type { CharacterDoc } from "@/types/character";

export interface PlayResource {
  id: string;
  row: ResourceRow;
  left: number;
  max: number;
}

export interface PlaySkill {
  id: string;
  ability: SaveCheckSkillRow["ability"];
  bonus: number;
  proficient: boolean;
  expertise: boolean;
}

export interface PlayLeftView {
  resources: PlayResource[];
  topSkills: PlaySkill[];
  allSkills: PlaySkill[];
}

const TOP = 6;

function pool(row: ResourceRow): PlayResource {
  if (row.kind === "item-charges") {
    const max = row.capacity ?? 0;
    return { id: row.id, row, left: Math.min(row.current ?? 0, max), max };
  }
  return { id: row.id, row, left: Math.max(0, row.max - row.used), max: row.max };
}

export function playLeftView(doc: CharacterDoc, locale: Locale): PlayLeftView {
  const skills = deriveSavesAndChecks(doc.character, doc.session).skills.map(
    (s): PlaySkill => ({
      id: s.id,
      ability: s.ability,
      bonus: s.bonus,
      proficient: s.proficiency === "proficient" || s.proficiency === "expertise",
      expertise: s.proficiency === "expertise",
    })
  );
  const ranked = [...skills].sort(
    (a, b) => Number(b.proficient) - Number(a.proficient) || b.bonus - a.bonus
  );
  return {
    resources: resourcesView(doc, locale).map(pool),
    topSkills: ranked.slice(0, TOP),
    allSkills: skills,
  };
}
