/**
 * `dumpSheet(doc)` — the verification backbone.
 *
 * Produces a single structured, human-readable snapshot of EVERYTHING the engine
 * derives for a character, by calling the SAME pure engine functions the UI
 * surfaces call (LeftHud for abilities/saves/skills/senses, SpellsTab for spell
 * DC/attack + the effective spell list, aggregate-character for AC, smart-tracker
 * for combat actions + trackers). It is NOT a parallel reimplementation: if a
 * value in the dump is wrong, the UI shows the same wrong value, because both read
 * the one engine seam.
 *
 * Used by the per-character verification pass: hand-compute the expected sheet
 * from the 2024 rules, diff against this dump, and every discrepancy is a real
 * engine gap to fix at root. Pure + Firebase-free so it runs under Vitest.
 *
 * See `tests/unit/team-fixtures-dump.test.ts` (emits the 6 dumps to disk) and
 * `docs/CONTRIBUTING.md` → "Verifying a character end-to-end".
 */
import type { CharacterDoc, SrdSpellRef, CustomSpell } from "@/types/character";
import { srd } from "../_harness/loc";
import {
  ALL_ABILITIES,
  ALL_SKILLS,
  abilityModifier,
  proficiencyBonus,
  savingThrowBonus,
  skillBonus,
  passiveScore,
  spellSaveDC,
  spellAttackBonus,
  effectiveAbilityScores,
  calculateMaxHP,
  computeInitiative,
  attacksPerAction,
  maxTableExtraAttacks,
  carryingCapacity,
  characterHasFeat,
  resolveSaveBonus,
} from "@/lib/compute";
import { aggregateCharacterGrants, effectiveAC } from "@/lib/aggregate-character";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import { grantSourceName } from "@/lib/views/srd-i18n";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeTrackers } from "@/lib/views/tracker-view";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import {
  mergeSaveProficiencies,
  mergeSkillProficiencies,
  deriveSensesAndSpeeds,
  deriveImmunities,
  displayLanguages,
  displayToolProficiencies,
} from "@/lib/views/sheet-view";
import { inferHitDie } from "@/lib/character-infer";
import { minimizeCharacter } from "@/lib/character-minimal";
import { getClassTable } from "@/data/classes";
import { totalLevel, primaryClassId, primaryClassEntry, getClasses } from "@/lib/classes";
import { getSpellById } from "@/data/spells";
import { loc } from "./loc";

const ABILITY_CODES = ALL_ABILITIES.map((a) => a.code);

/** Folio modifier convention (mirrors LeftHud). */
function fmt(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

function spellName(ref: SrdSpellRef | CustomSpell): string {
  if ("custom" in ref) return `${ref.name} (custom)`;
  const data = getSpellById(ref.srdId);
  const lvl = data ? (data.level === 0 ? "cantrip" : `L${data.level}`) : "?";
  const tags = [
    ref.prepared ? "prepared" : null,
    ref.alwaysPrepared ? "always-prepared" : null,
  ]
    .filter(Boolean)
    .join(",");
  return `${srd("spell", data?.id ?? "", "name", "en") || ref.srdId} [${lvl}${tags ? ` ${tags}` : ""}]`;
}

/** A fully-derived snapshot of a character sheet — order-stable for diffing. */
export interface SheetDump {
  identity: Record<string, unknown>;
  abilities: Record<string, { score: number; mod: string }>;
  proficiencyBonus: number;
  saves: Record<string, { proficient: boolean; bonus: string }>;
  skills: Record<string, { proficiency: string | null; bonus: string }>;
  passives: { perception: number; insight: number; investigation: number };
  vitals: {
    acEffective: number;
    hpMaxStored: number | null;
    hpMaxComputed: number;
    initiative: number;
    attacksPerAction: number;
    walkingSpeedFt: number;
    carryingCapacityLb: number;
  };
  senses: Array<{ kind: string; rangeFt: number }>;
  speeds: Array<{ kind: string; rangeFt: number }>;
  defenses: {
    resistances: string[];
    immunities: string[];
    vulnerabilities: string[];
    conditionImmunities: string[];
    damageSourceResistances: string[];
  };
  proficiencies: {
    languages: string;
    tools: string;
    weapons: string[];
    armor: string[];
  };
  spellcasting: {
    ability: string;
    saveDC: number | null;
    attackBonus: number | null;
    preparedMax: number | null;
    slots: Array<{ level: number; total: number }>;
  } | null;
  spellsByLevel: Record<string, string[]>;
  features: string[];
  actions: Array<{
    name: string;
    type: string;
    source: string;
    attack: string | null;
    damage: string | null;
    damageType: string | null;
    spellLevel: number | null;
    costsSlot: boolean;
    costTracker: string | null;
  }>;
  trackers: Array<{ id: string; label: string; max: number; unit?: string }>;
  /** The raw aggregate — the catch-all so nothing the engine knows is hidden. */
  aggregate: Record<string, unknown>;
  /** What the MINIMAL codec actually stores (explicit choices + overrides). */
  minimalKeys: string[];
}

/** Replace ReadonlySet values with sorted arrays so the dump serializes cleanly. */
function setToArr(s: ReadonlySet<unknown> | undefined): string[] {
  return s ? [...s].map(String).sort() : [];
}

export function dumpSheet(doc: CharacterDoc): SheetDump {
  const c = doc.character;
  const session = doc.session;
  const level = totalLevel(c);
  const exhaustion = session.exhaustion;
  const pbOverride = c.proficiencyBonusOverride ?? null;
  const pb = pbOverride ?? proficiencyBonus(level);

  const agg = aggregateCharacterGrants(c, session);
  // B8 — full effective channels (floors + additive item bonus + caps), matching
  // LeftHud / the PDF, so the dumped save bonuses reflect ability-boosting items.
  const scores = effectiveAbilityScores(
    c.abilityScores,
    agg.abilityScoreFloors,
    agg.itemAbilityScoreBonus,
    agg.itemAbilityScoreCap
  );

  const abilities: SheetDump["abilities"] = {};
  for (const code of ABILITY_CODES) {
    abilities[code] = { score: scores[code], mod: fmt(abilityModifier(scores[code])) };
  }

  const displayedSaves = mergeSaveProficiencies(c.savingThrows, agg.saveProficiencies);
  const saves: SheetDump["saves"] = {};
  for (const code of ABILITY_CODES) {
    const isProf = displayedSaves.includes(code);
    const override = c.savingThrowBonusOverrides?.[code] ?? null;
    const bonus = savingThrowBonus(
      scores[code],
      level,
      isProf,
      override,
      exhaustion,
      pbOverride,
      resolveSaveBonus(agg, scores, code)
    );
    saves[code] = { proficient: isProf, bonus: fmt(bonus) };
  }

  // Match LeftHud exactly: fixed grants + grant-derived expertise + the DERIVED
  // Jack-of-all-Trades half-proficiency (#57) — so the dump reflects the real
  // rendered skill set (stored skills are choices-only; JoaT half is derived).
  const displayedSkills = mergeSkillProficiencies(
    c.skills,
    agg.skillProficiencies,
    agg.expertiseSkills,
    agg.halfProficiencyAllSkills
  );
  const skills: SheetDump["skills"] = {};
  for (const skill of ALL_SKILLS) {
    const prof = displayedSkills[skill.id] ?? null;
    const override = c.skillBonusOverrides?.[skill.id] ?? null;
    const bonus = skillBonus(
      scores[skill.ability],
      level,
      prof,
      override,
      exhaustion,
      pb
    );
    skills[skill.id] = { proficiency: prof, bonus: fmt(bonus) };
  }

  const passives = {
    perception: passiveScore(
      scores.WIS,
      level,
      displayedSkills["perception"] ?? null,
      exhaustion,
      pbOverride
    ),
    insight: passiveScore(
      scores.WIS,
      level,
      displayedSkills["insight"] ?? null,
      exhaustion,
      pbOverride
    ),
    investigation: passiveScore(
      scores.INT,
      level,
      displayedSkills["investigation"] ?? null,
      exhaustion,
      pbOverride
    ),
  };

  const walkingSpeedFt = parseInt(c.speed, 10) || 0;
  const { senses, speeds } = deriveSensesAndSpeeds(agg, walkingSpeedFt);
  const immunities = deriveImmunities(agg);

  const classId = primaryClassId(c);
  const classTable = getClassTable(classId);
  const hitDie = inferHitDie(primaryClassEntry(c));
  const hpMaxComputed =
    calculateMaxHP(hitDie, scores.CON, level) + agg.hpPerLevel * level + agg.hpFlat;

  const hasAlert = characterHasFeat("alert", {
    humanOriginFeat: c.humanOriginFeat,
    bgFeat: c.bgFeat,
    features: c.features,
  });

  const sc = c.spellcasting;
  const spellcasting: SheetDump["spellcasting"] = sc
    ? {
        ability: sc.ability,
        saveDC: spellSaveDC(level, scores[sc.ability], sc.saveDCOverride, pbOverride),
        attackBonus: spellAttackBonus(
          level,
          scores[sc.ability],
          sc.attackBonusOverride,
          exhaustion,
          pbOverride
        ),
        preparedMax: sc.preparedMaxOverride ?? sc.preparedMax,
        slots: c.spellSlots,
      }
    : null;

  const effective = resolveEffectiveSpells(c, session);
  const spellsByLevel: Record<string, string[]> = {};
  for (const ref of effective) {
    const data = "custom" in ref ? null : getSpellById(ref.srdId);
    const lvl = data ? data.level : "custom" in ref ? ref.level : 0;
    const key = lvl === 0 ? "cantrips" : `level ${lvl}`;
    (spellsByLevel[key] ??= []).push(spellName(ref));
  }
  for (const k of Object.keys(spellsByLevel)) spellsByLevel[k]?.sort();

  const features = resolveAllGrantSources(c)
    .map((s) => `${grantSourceName(s, "en")} (${s.id})`)
    .sort();

  // Sorted by a stable total order, NOT raw resolveActions order: the Play tab
  // always renders actions through `sortActions` (combat-action-view) — the raw
  // push order is never user-visible. So the dump must compare actions
  // order-INDEPENDENTLY (mirroring features + spellsByLevel, which already sort),
  // else a benign storage reorder (e.g. always-prepared spells re-inferred at the
  // tail after a minimal round-trip instead of interleaved) reads as a diff.
  const actions = resolveActions(doc)
    .map((a) => ({
      name: loc(a.name, "en"),
      type: a.type,
      source: a.source,
      attack: a.summary.attackBonus != null ? fmt(a.summary.attackBonus) : null,
      damage: a.summary.damage ?? null,
      damageType: a.summary.damageType ?? null,
      spellLevel: a.spellLevel,
      costsSlot: a.costsSlot,
      costTracker: a.costTracker ?? null,
    }))
    .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));

  const trackers = localizeTrackers(doc, "en").map((tr) => ({
    id: tr.id,
    label: tr.label,
    max: tr.total,
    ...(tr.unit ? { unit: tr.unit } : {}),
  }));

  return {
    identity: {
      name: c.name,
      race: c.race,
      class: primaryClassId(c),
      subclass: primaryClassEntry(c).subclassId ?? "",
      level,
      background: c.background,
      backgroundAsi: c.backgroundAsi,
      alignment: c.alignment,
    },
    abilities,
    proficiencyBonus: pb,
    saves,
    skills,
    passives,
    vitals: {
      acEffective: effectiveAC(c, session),
      hpMaxStored: c.hp.max,
      hpMaxComputed,
      initiative: computeInitiative(scores.DEX, pb, hasAlert, exhaustion),
      attacksPerAction: attacksPerAction(
        maxTableExtraAttacks(getClasses(c), getClassTable),
        agg
      ),
      walkingSpeedFt,
      carryingCapacityLb: carryingCapacity(scores.STR).carry,
    },
    senses: senses.map((s) => ({ kind: s.kind, rangeFt: s.rangeFt })),
    speeds: speeds.map((s) => ({ kind: s.kind, rangeFt: s.rangeFt })),
    defenses: {
      resistances: setToArr(agg.damageResistances),
      immunities: immunities.damageImmunities.slice().sort(),
      vulnerabilities: setToArr(agg.damageVulnerabilities),
      conditionImmunities: immunities.conditionImmunities.slice().sort(),
      damageSourceResistances: setToArr(agg.damageSourceResistances),
    },
    proficiencies: {
      languages: displayLanguages(c.languageIds, c.customLanguages, agg, "en"),
      tools: displayToolProficiencies(
        c.toolProficiencyIds,
        c.customToolProficiencies,
        agg,
        "en"
      ),
      // Effective weapon/armor profs = the class table's ∪ the grant aggregate's
      // (mirrors smart-tracker's `classWeaponProfs`); the aggregate alone omits the
      // class-fixed ones (Monk's Simple + Martial), which reads as a false gap.
      weapons: [
        ...new Set([
          ...(classTable?.weaponProficiencies ?? []),
          ...agg.weaponProficiencies,
        ]),
      ].sort(),
      armor: [
        ...new Set([
          ...(classTable?.armorProficiencies ?? []),
          ...agg.armorProficiencies,
        ]),
      ].sort(),
    },
    spellcasting,
    spellsByLevel,
    features,
    actions,
    trackers,
    aggregate: {
      darkvisionFt: agg.darkvisionFt,
      speedBonusFt: agg.speedBonusFt,
      acBonus: agg.acBonus,
      hpPerLevel: agg.hpPerLevel,
      hpFlat: agg.hpFlat,
      extraAttacks: agg.extraAttacks,
      critThreshold: agg.critThreshold,
      saveBonusFlat: agg.saveBonusFlat,
      freeCasts: agg.freeCasts,
      atWillCasts: agg.atWillCasts,
      abilityScoreFloors: agg.abilityScoreFloors,
    },
    minimalKeys: Object.keys(minimizeCharacter(c)).sort(),
  };
}
