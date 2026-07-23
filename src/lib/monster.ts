/**
 * Monster derivation helpers — pure, SRD-free, engine-layer.
 *
 * The DERIVED-NOT-STORED companion to {@link MonsterStatBlock} (golden rule 2,
 * D-4): XP + PB derive from CR, saves from ability mod + PB × proficiency, skill
 * bonuses from mod + PB (×2 expertise), passive Perception = 10 + Perception
 * bonus, initiative = DEX mod. Every one has a narrow stored override used ONLY
 * when the printed SRD value deviates; the corpus guard fails a redundant one.
 *
 * PURE: no React/stores/Firebase/i18n. Imports ONLY types from `@/data/types` +
 * `abilityModifier` from `@/lib/ability` + the SRD-free skill table, so it adds
 * nothing to any eager chunk — it is imported ONLY by the lazy monster spec /
 * renderer, tests, and later consumers (never by an eager module).
 */
import type { AbilityCode, MonsterSkill, MonsterStatBlock } from "@/data/types";
import { abilityModifier } from "@/lib/ability";
import { ALL_SKILLS } from "@/lib/skills";

/** 2024 proficiency bonus by CR: max(2, ceil(cr/4) + 1). CR 0–4→2 … 29–30→9. */
export function pbForCr(cr: number): number {
  return Math.max(2, Math.ceil(cr / 4) + 1);
}

/**
 * 2024 XP by CR (the fixed table; CR 0 → 10 — the harmless "XP 0" prints are
 * per-entry `xp: 0` overrides). Throws on a CR outside the table (a typo is a
 * bug, not silent 0).
 */
const XP_BY_CR: Readonly<Record<string, number>> = {
  "0": 10,
  "0.125": 25,
  "0.25": 50,
  "0.5": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};

export function xpForCr(cr: number): number {
  const xp = XP_BY_CR[String(cr)];
  if (xp === undefined) throw new Error(`[monster] no XP for CR ${cr}`);
  return xp;
}

/**
 * Mean of a compact dice expression: "XdY+Z" / "XdY-Z" / "XdY" → X·(Y+1)/2 + Z ;
 * a bare integer "N" → N (the flat-damage CR-0 grammar). Throws on a malformed
 * expression (the corpus guard already pins hp averages against this).
 */
export function diceMean(expr: string): number {
  const dice = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr.trim());
  if (dice) {
    const count = Number(dice[1]);
    const sides = Number(dice[2]);
    const mod = dice[3] ? Number(dice[3]) : 0;
    return (count * (sides + 1)) / 2 + mod;
  }
  if (/^\d+$/.test(expr.trim())) return Number(expr.trim());
  throw new Error(`[monster] malformed dice expression "${expr}"`);
}

/** Printed initiative bonus — the stored deviation, else the DEX modifier. */
export function monsterInitiative(m: MonsterStatBlock): number {
  return m.initiative ?? abilityModifier(m.abilityScores.DEX);
}

/** Printed save bonus for an ability — the stored override, else ability mod +
 *  PB when proficient (the 2024 save rule). */
export function monsterSaveBonus(m: MonsterStatBlock, a: AbilityCode): number {
  const override = m.saveOverrides?.[a];
  if (override !== undefined) return override;
  const base = abilityModifier(m.abilityScores[a]);
  const proficient = m.saveProficiencies?.includes(a) ?? false;
  return base + (proficient ? pbForCr(m.cr) : 0);
}

/** Printed skill bonus — the stored override, else ability mod + PB (×2 with
 *  expertise). A skill row always means proficiency. */
export function monsterSkillBonus(m: MonsterStatBlock, s: MonsterSkill): number {
  if (s.bonus !== undefined) return s.bonus;
  const ability = ALL_SKILLS.find((row) => row.id === s.skill)?.ability;
  if (ability === undefined) throw new Error(`[monster] unknown skill "${s.skill}"`);
  const pb = pbForCr(m.cr);
  return abilityModifier(m.abilityScores[ability]) + (s.expertise ? 2 * pb : pb);
}

/** Passive Perception — the stored override, else 10 + the derived Perception
 *  bonus (a Perception skill row if present, else the bare WIS modifier). */
export function monsterPassivePerception(m: MonsterStatBlock): number {
  if (m.passivePerceptionOverride !== undefined) return m.passivePerceptionOverride;
  const perception = m.skills?.find((s) => s.skill === "perception");
  const bonus = perception
    ? monsterSkillBonus(m, perception)
    : abilityModifier(m.abilityScores.WIS);
  return 10 + bonus;
}
