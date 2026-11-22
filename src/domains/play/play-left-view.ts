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
import type { SheetEvent } from "@/lib/play/sheet-events";
import { getSpellSlotTrackerRecovery } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";

export interface PlayResource {
  id: string;
  row: ResourceRow;
  left: number;
  max: number;
  /** A spell slot can refill one spent use now (Font of Inspiration). */
  slotRecover?: boolean;
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
  const refillable = getSpellSlotTrackerRecovery(doc);
  return {
    resources: resourcesView(doc, locale)
      .map(pool)
      .map((r) =>
        r.row.kind === "class-resource" && refillable.has(r.id)
          ? { ...r, slotRecover: true }
          : r
      ),
    topSkills: ranked.slice(0, TOP),
    allSkills: skills,
  };
}

/** What tapping a pool spends (prototype x-play «Tocca per spendere»): one spell slot
 *  of its level, or one use of a class resource, while something is left. Hit Point
 *  Dice go through a Short Rest and an item's charges through its own roll. */
export function resourceSpend(
  r: PlayResource
): Extract<SheetEvent, { kind: "spend-slot" | "spend-tracker" }> | null {
  if (r.left <= 0) return null;
  if (r.row.kind === "spell-slot")
    return { kind: "spend-slot", level: r.row.level, pactMagic: r.row.pact };
  if (r.row.kind === "class-resource")
    return { kind: "spend-tracker", trackerId: r.row.id, amount: 1 };
  return null;
}
