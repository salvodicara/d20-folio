/**
 * The choices a stored character's build still owes: picks its species asks for
 * that the old creation wizard never asked (an Elf's lineage, a Dragonborn's
 * ancestry, a Tiefling's legacy, the species spellcasting ability, a skill pick).
 * The sheet's «Scelte da completare» banner and the production survey read the
 * same list. Pure: catalogue and character in, choices out.
 *
 * Some picks leave no trace of their own: stored skills are one flat map, so a
 * skill chosen "from any" (a Human's Skillful) can't be told apart from a class's.
 * Those come back `verifiable: false`; a pick from named options counts as made
 * when any of them is proficient.
 *
 * Beyond the species: a feat whose increase you choose, when something reads the
 * choice ("the ability increased by this feat") and the feat ref never stored it
 * (`featAbility`, written by level-ups since it existed).
 *
 * And the class picks its level table gives that the build lacks (`class-pick`,
 * from `owedClassPicks`): invocations, cantrips, Metamagic, maneuvers, Weapon
 * Mastery, counted per class at that class's own level.
 */
import { FEATS_BY_ID } from "@/data/feats";
import { getRace } from "@/data/races";
import { getClassTable } from "@/data/classes";
import { featsOwingAbility } from "@/lib/feat-ability";
import { owedClassPicks, type ClassPickKind } from "@/lib/owed-class-picks";
import type { CharacterData, SessionState } from "@/types/character";

export type UnresolvedBuildChoice =
  /** A single-select variant never chosen (`elf-lineage`, `dragonborn-ancestry`). */
  | { kind: "bundle"; traitId: string; bundleKey: string }
  /** The INT/WIS/CHA pick for the species' spells (unset reads Charisma). */
  | { kind: "species-spell-ability" }
  /** An origin feat the species grants, never chosen. */
  | { kind: "feat"; traitId: string }
  /** A skill pick; `verifiable: false` when the sheet can't tell it was made. An
   *  any-skill pick (Skillful) is asked only when the stored skills fall short of the
   *  least the build gives (`short`: how many it has, how many it needs at least). */
  | {
      kind: "skill";
      traitId: string;
      verifiable: boolean;
      short?: { have: number; need: number };
    }
  /** Which ability a feat's increase raised, when something reads it. */
  | { kind: "feat-ability"; featId: string }
  /** `owed` more picks of a kind the class's level table gives. */
  | { kind: "class-pick"; classId: string; pick: ClassPickKind; owed: number };

export type BuildForChoices = Pick<
  CharacterData,
  "race" | "skills" | "humanOriginFeat" | "speciesSpellAbility"
> &
  Partial<Pick<CharacterData, "features" | "classes" | "spells">>;

/** Every pick the character's species and feats ask for that the stored build lacks. */
export function unresolvedBuildChoices(
  character: BuildForChoices,
  session: Pick<SessionState, "grantBundleChoices">
): UnresolvedBuildChoice[] {
  const out = speciesChoicesOwed(character, session);
  for (const featId of featsOwingAbility(
    { features: character.features ?? [] },
    (id) => FEATS_BY_ID.get(id)?.grants
  )) {
    out.push({ kind: "feat-ability", featId });
  }
  for (const owed of owedClassPicks(character)) out.push({ kind: "class-pick", ...owed });
  return out;
}

/**
 * The stored skills against the least a build gives (background 2 + the starting
 * class's skill choices + the species' one any-skill pick): `{ have, need }` when
 * short, null when not or when the class is unknown. A lower bound: other sources
 * (a feat, a subclass) only raise the real count, so a character at the bound is
 * trusted, never asked by mistake.
 */
function skillsShort(character: BuildForChoices): { have: number; need: number } | null {
  const first = character.classes?.[0];
  const table = first ? getClassTable(first.classId) : undefined;
  if (!table) return null;
  const need = 2 + table.skillChoices.count + 1;
  const have = Object.values(character.skills).filter(
    (tier) => tier === "proficient" || tier === "expertise"
  ).length;
  return have < need ? { have, need } : null;
}

function speciesChoicesOwed(
  character: BuildForChoices,
  session: Pick<SessionState, "grantBundleChoices">
): UnresolvedBuildChoice[] {
  const race = getRace(character.race);
  if (!race) return [];
  const chosen = session.grantBundleChoices ?? {};
  const out: UnresolvedBuildChoice[] = [];
  let speciesSpells = false;
  for (const trait of race.traits) {
    for (const grant of trait.grants ?? []) {
      if (grant.type === "choice-grant-bundle") {
        if (JSON.stringify(grant).includes('"spellAbilitySource":"species"')) {
          speciesSpells = true;
        }
        if (!chosen[grant.bundleKey]) {
          out.push({ kind: "bundle", traitId: trait.id, bundleKey: grant.bundleKey });
        }
      } else if (grant.type === "choice-skill-proficiency") {
        const options = grant.options;
        if (options.length === 0) {
          const short = skillsShort(character);
          out.push(
            short
              ? { kind: "skill", traitId: trait.id, verifiable: true, short }
              : { kind: "skill", traitId: trait.id, verifiable: false }
          );
        } else if (!options.some((skill) => character.skills[skill])) {
          out.push({ kind: "skill", traitId: trait.id, verifiable: true });
        }
      } else if (grant.type === "choice-feat") {
        if (!character.humanOriginFeat) out.push({ kind: "feat", traitId: trait.id });
      } else if (
        "spellAbilitySource" in grant &&
        grant.spellAbilitySource === "species"
      ) {
        speciesSpells = true;
      }
    }
  }
  if (speciesSpells && !character.speciesSpellAbility) {
    out.push({ kind: "species-spell-ability" });
  }
  return out;
}
