import type { AbilityCode, SourceSpellcastingAbility } from "@/data/types";
import type { Grant } from "@/lib/grants";
import { ALL_SKILLS } from "../skills";
import { STANDARD_LANGUAGE_IDS } from "@/data/languages";
import { SRD_LANGUAGE_IDS } from "@/data/languages";
import { srdEn } from "@/i18n/srd-en";
import { TOOL_IDS } from "../tools";
import { toolIdByEnName } from "../tool-names";
import type {
  Ability,
  OriginBenefit,
  OriginChoice,
  OriginOption,
  SpellAbility,
} from "../homebrew/origins";
import { creationPool } from "./catalogue-policy";

export const creationAbility = (code: AbilityCode): Ability =>
  (
    ({
      STR: "strength",
      DEX: "dexterity",
      CON: "constitution",
      INT: "intelligence",
      WIS: "wisdom",
      CHA: "charisma",
    }) as const
  )[code];
export function creationSkill(value: string): string {
  const skill = ALL_SKILLS.find((s) => s.id === value || s.name === value);
  if (!skill) throw new Error("catalogue-skill-unavailable:" + value);
  return skill.id;
}
function creationLanguage(value: string): string {
  const name = value.trim().toLowerCase().replaceAll("’", "'");
  const id = SRD_LANGUAGE_IDS.find(
    (id) =>
      id === value ||
      srdEn("language", id, "name")?.toLowerCase().replaceAll("’", "'") === name
  );
  if (!id) throw new Error("catalogue-language-unavailable");
  return id;
}
interface Context {
  prefix: string;
  level: number;
  casting?: SourceSpellcastingAbility;
}
export interface CreationGrants {
  benefits: OriginBenefit[];
  choices: OriginChoice[];
  deferred: { path: string; grant: Grant }[];
}
/** Only unconditional acquisition facts are projected. Other mechanics stay exact, attributed input. */
export function normalizeCreationGrants(
  grants: readonly Grant[],
  context: Context
): CreationGrants {
  const result: CreationGrants = { benefits: [], choices: [], deferred: [] };
  const casting = context.casting;
  const ability: SpellAbility | undefined =
    casting?.kind === "fixed"
      ? creationAbility(casting.ability)
      : casting?.kind === "not-required"
        ? "none"
        : casting?.kind === "choice"
          ? { choice: casting.id }
          : undefined;
  const addCasting = (
    id: string,
    abilities: readonly AbilityCode[],
    parent: OriginChoice["parent"] = null
  ) => {
    if (result.choices.some((c) => c.id === id)) return;
    result.choices.push({
      id,
      name: "Spellcasting ability",
      count: 1,
      parent,
      options: abilities.map((code) => ({
        id: creationAbility(code),
        name: creationAbility(code),
        benefits: [{ kind: "casting-ability", id, ability: creationAbility(code) }],
      })),
    });
  };
  if (casting?.kind === "choice") addCasting(casting.id, casting.abilities);
  const visit = (
    list: readonly Grant[],
    prefix: string,
    target: OriginBenefit[],
    parent: OriginChoice["parent"]
  ) => {
    list.forEach((grant, index) => {
      const path = prefix + "-" + String(index);
      const defer = () => result.deferred.push({ path, grant });
      if (
        "minLevel" in grant &&
        typeof grant.minLevel === "number" &&
        grant.minLevel > context.level
      ) {
        defer();
        return;
      }
      const choice = (
        name: string,
        count: number,
        extra: Partial<OriginChoice>
      ): OriginChoice => {
        const value: OriginChoice = {
          id: path,
          name,
          count,
          options: [],
          parent,
          ...extra,
        };
        result.choices.push(value);
        return value;
      };
      switch (grant.type) {
        case "skill-proficiency":
          target.push({
            kind: "proficiency",
            category: "skill",
            id: creationSkill(grant.skill),
          });
          break;
        case "save-proficiency":
          target.push({
            kind: "proficiency",
            category: "save",
            id: creationAbility(grant.ability),
          });
          break;
        case "tool-proficiency":
          {
            const id = TOOL_IDS.has(grant.tool) ? grant.tool : toolIdByEnName(grant.tool);
            if (!id) throw new Error("catalogue-tool-unavailable");
            target.push({ kind: "proficiency", category: "tool", id });
          }
          break;
        case "language":
          target.push({
            kind: "proficiency",
            category: "language",
            id: creationLanguage(grant.language),
          });
          break;
        case "expertise":
          target.push({
            kind: "expertise",
            category: "skill",
            id: creationSkill(grant.skill),
          });
          break;
        case "weapon-proficiency":
        case "armor-proficiency":
          target.push({
            kind: "training",
            category: grant.type === "weapon-proficiency" ? "weapon" : "armor",
            id: grant.proficiency,
          });
          break;
        case "hp-per-level":
          target.push({ kind: "hp-per-level", amount: grant.amount });
          break;
        case "ability-score":
          target.push({
            kind: "ability",
            ability: creationAbility(grant.ability),
            amount: grant.amount,
          });
          break;
        case "darkvision":
        case "blindsight":
        case "tremorsense":
        case "truesight":
          target.push({ kind: "sense", sense: grant.type, meters: grant.range * 0.3048 });
          break;
        case "damage-resistance":
          target.push({ kind: "resistance", damageType: grant.damageType });
          break;
        case "speed":
          if (grant.condition || grant.round1) defer();
          else
            target.push({
              kind: "movement-bonus",
              mode: "walk",
              meters: grant.amount * 0.3048,
            });
          break;
        case "fly-speed":
        case "swim-speed":
        case "climb-speed": {
          const mode =
            grant.type === "fly-speed"
              ? "fly"
              : grant.type === "swim-speed"
                ? "swim"
                : "climb";
          target.push(
            typeof grant.amount === "number"
              ? { kind: "movement", mode, meters: grant.amount * 0.3048 }
              : {
                  kind: "movement-equals-walk",
                  mode,
                  multiplier: grant.amount === "twice-walking" ? 2 : 1,
                }
          );
          break;
        }
        case "ac-formula":
          if (grant.condition === "while-active") defer();
          else
            target.push({
              kind: "armor-class",
              base: grant.base,
              abilities: grant.bonuses.map(creationAbility),
              condition: grant.condition,
              ...(grant.shieldBonus !== undefined
                ? { shieldBonus: grant.shieldBonus }
                : {}),
            });
          break;
        case "choice-skill-proficiency":
          choice("Skill proficiencies", grant.amount, {
            pool: creationPool({
              kind: "proficiency",
              categories: ["skill"],
              ...(grant.options.length ? { ids: grant.options.map(creationSkill) } : {}),
            }),
          });
          break;
        case "choice-tool-proficiency":
          choice("Tool proficiencies", grant.amount, {
            pool: creationPool({
              kind: "proficiency",
              categories: ["tool"],
              ...(grant.options.length ? { ids: [...grant.options] } : {}),
            }),
          });
          break;
        case "choice-language":
          choice("Languages", grant.amount, {
            pool: creationPool({
              kind: "proficiency",
              categories: ["language"],
              ids: grant.options.length
                ? grant.options.map(creationLanguage)
                : [...STANDARD_LANGUAGE_IDS],
            }),
          });
          break;
        case "choice-skill-or-tool-proficiency":
          choice("Skill or tool proficiencies", grant.amount, {
            pool: creationPool({ kind: "proficiency", categories: ["skill", "tool"] }),
          });
          break;
        case "choice-expertise":
          choice("Expertise", grant.amount, {
            phase: "dependent",
            pool: creationPool({
              kind: "proficiency",
              categories: ["skill"],
              proficientOnly: true,
            }),
            selectedGrant: { kind: "expertise", category: "skill" },
          });
          break;
        case "choice-feat":
          choice("Feat", grant.amount, {
            pool: creationPool({ kind: "feat", categories: [grant.category] }),
          });
          break;
        case "choice-resistance":
          choice(grant.label?.en ?? "Damage resistance", grant.amount, {
            options: grant.options.map((damageType) => ({
              id: damageType,
              name: damageType,
              benefits: [{ kind: "resistance", damageType }],
            })),
          });
          break;
        case "choice-grant-bundle": {
          const root = choice(grant.label?.en ?? "Feature option", 1, { options: [] });
          for (const option of grant.options) {
            const output: OriginOption = {
              id: option.id,
              name: option.label?.en ?? option.id,
              benefits: [],
            };
            root.options.push(output);
            visit(option.grants, path + "-" + option.id, output.benefits, {
              choiceId: root.id,
              optionId: output.id,
            });
          }
          break;
        }
        case "choice-cantrip":
        case "choice-spell": {
          let scopedAbility = ability;
          if (!ability && grant.spellAbilityChoice?.length) {
            const id = path + "-casting";
            addCasting(id, grant.spellAbilityChoice, parent);
            scopedAbility = { choice: id };
          }
          const spellAbility = grant.spellAbility
            ? creationAbility(grant.spellAbility)
            : scopedAbility;
          if (!spellAbility) {
            defer();
            break;
          }
          const lists =
            grant.type === "choice-spell" && grant.classSpellLists
              ? [...grant.classSpellLists]
              : grant.classSpellList
                ? [grant.classSpellList]
                : undefined;
          const entitlements: Extract<
            NonNullable<OriginChoice["selectedGrant"]>,
            { kind: "spell" }
          >["entitlements"] = [
            {
              policy:
                grant.type === "choice-cantrip"
                  ? "known"
                  : grant.toSpellbook
                    ? "spellbook"
                    : "prepared",
            },
          ];
          if (grant.type === "choice-spell" && grant.freeCastSource)
            entitlements.push({
              policy: "free-cast",
              uses: grant.freeCastSource.usesPerRest,
              rest: grant.freeCastSource.rest,
            });
          choice(grant.type === "choice-cantrip" ? "Cantrips" : "Spells", grant.amount, {
            pool: creationPool({
              kind: "spell",
              minimumLevel: grant.type === "choice-cantrip" ? 0 : 1,
              maximumLevel: grant.type === "choice-cantrip" ? 0 : grant.maxLevel,
              ...(lists ? { classSpellLists: lists } : {}),
              ...(grant.type === "choice-spell" && grant.ritualOnly
                ? { ritualOnly: true }
                : {}),
              ...(grant.type === "choice-spell" &&
              (grant.spellSchools || grant.spellSchool)
                ? {
                    schools: grant.spellSchools
                      ? [...grant.spellSchools]
                      : grant.spellSchool
                        ? [grant.spellSchool]
                        : [],
                  }
                : {}),
            }),
            selectedGrant: { kind: "spell", ability: spellAbility, entitlements },
          });
          break;
        }
        case "always-prepared-spell":
        case "free-cast-spell": {
          const declared =
            grant.type === "always-prepared-spell"
              ? grant.spellAbility
              : grant.casterAbility;
          const spellAbility = declared ? creationAbility(declared) : ability;
          if (!spellAbility) {
            defer();
            break;
          }
          if (grant.type === "always-prepared-spell")
            target.push({
              kind: "spell",
              id: grant.spellId,
              ability: spellAbility,
              policy: "prepared",
            });
          else if (
            grant.rest &&
            (!grant.chargesFormula || grant.chargesFormula === "PB") &&
            !grant.resourceCost
          ) {
            const step = grant.capacityByLevel
              ?.filter((s) => s.minLevel <= context.level)
              .sort((a, b) => b.minLevel - a.minLevel)[0];
            const formula = step?.chargesFormula ?? grant.chargesFormula;
            const uses =
              formula === "PB"
                ? 2 + Math.floor((context.level - 1) / 4)
                : (step?.chargesPerRest ?? grant.chargesPerRest);
            if (!uses || (formula && formula !== "PB")) {
              defer();
              break;
            }
            target.push({
              kind: "spell",
              id: grant.spellId,
              ability: spellAbility,
              policy: "free-cast",
              uses,
              rest: grant.rest,
            });
          } else defer();
          break;
        }
        default:
          defer();
      }
    });
  };
  visit(grants, context.prefix, result.benefits, null);
  return result;
}
