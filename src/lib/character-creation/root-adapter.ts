import { initializeDefinition } from "../homebrew/model";
import { blankClassLevel } from "../homebrew/classes";
import {
  dependencyKey,
  type OriginChoice,
  type OriginDependency,
  type OriginPrerequisite,
} from "../homebrew/origins";
import type { CatalogueSnapshot } from "../homebrew/sources";
import type { JsonValue, LibraryDefinition } from "../library/model";
import { equal } from "../shared/model";
import { TOOL_IDS } from "../tools";
import { toolIdByEnName, umbrellaToolChoiceOptions } from "../tool-names";
import {
  creationAbility,
  creationSkill,
  normalizeCreationGrants,
  type CreationGrants,
} from "./grant-adapter";
import { creationPool, CREATION_CATALOGUE, CREATION_RELEASE } from "./catalogue-policy";
import { normalizeStartingEquipment } from "./equipment-adapter";
import type { CreationSource } from "./catalogue-source";

const json = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;
const empty = (): CreationGrants => ({ benefits: [], choices: [], deferred: [] });
function featCategory(snapshot: CatalogueSnapshot): string {
  const value = snapshot.definition.payload.data.category;
  if (typeof value !== "string") throw new Error("catalogue-feat-category");
  return value;
}
function merge(target: CreationGrants, next: CreationGrants) {
  target.benefits.push(...next.benefits);
  target.deferred.push(...next.deferred);
  for (const choice of next.choices) {
    const previous = target.choices.find((c) => c.id === choice.id);
    if (previous && !equal(previous, choice))
      throw new Error("catalogue-choice-collision");
    if (!previous) target.choices.push(choice);
  }
}
function include(
  dependencies: Record<string, OriginDependency>,
  source: CatalogueSnapshot
): string {
  const copy = structuredClone(source);
  const children = copy.definition.payload.data.dependencies;
  if (children && !Array.isArray(children) && typeof children === "object")
    Object.assign(dependencies, children);
  delete copy.definition.payload.data.dependencies;
  const key = dependencyKey(source);
  dependencies[key] = copy;
  return key;
}
/** Normalized acquisitions and exact original mechanics share the same frozen source identity. */
export function creationRootDefinition(
  source: CreationSource,
  snapshot: (key: string) => CatalogueSnapshot
): LibraryDefinition {
  if (source.kind === "spell" || source.kind === "equipment")
    throw new Error("catalogue-root-required");
  const family = source.kind === "invocation" ? "feature" : source.kind;
  const definition: LibraryDefinition =
    family === "feature"
      ? {
          schema: 1 as const,
          family,
          name: source.name,
          description: source.description,
          tags: [],
          payload: { schema: 1 as const, data: {} },
        }
      : initializeDefinition(family);
  definition.name = source.name;
  definition.description = source.description;
  const d = definition.payload.data;
  Object.assign(d, {
    authoringVersion: 1,
    edition: "2024",
    source: CREATION_CATALOGUE,
    sourceVersion: CREATION_RELEASE,
    mechanicId: source.id,
  });
  const dependencies: Record<string, OriginDependency> = {};
  const acquisition = empty();
  const prerequisites: OriginPrerequisite[] = [];
  if (source.kind === "species") {
    const species = source.value;
    d.walkSpeed = species.speed * 0.3048;
    if (species.size === "Small or Medium") {
      delete d.size;
      d.sizeChoice = "size";
      acquisition.choices.push({
        id: "size",
        name: "Size",
        count: 1,
        parent: null,
        options: ["small", "medium"].map((size) => ({
          id: size,
          name: size,
          benefits: [{ kind: "size", size: size as "small" | "medium" }],
        })),
      });
    } else d.size = species.size.toLowerCase();
    for (const trait of species.traits) {
      if ((trait.minLevel ?? 1) > 1) continue;
      const normalized = normalizeCreationGrants(trait.grants ?? [], {
        prefix: trait.id,
        level: 1,
        casting: trait.spellcastingAbility,
      });
      merge(acquisition, normalized);
    }
  } else if (source.kind === "feat") {
    const feat = source.value;
    d.category = feat.category;
    d.repeatable = feat.repeatable;
    if (feat.category === "general") prerequisites.push({ kind: "level", minimum: 4 });
    if (feat.category === "epic-boon") prerequisites.push({ kind: "level", minimum: 19 });
    for (const requirement of feat.prereq?.abilities ?? [])
      prerequisites.push({
        kind: "any",
        requirements: requirement.anyOf.map((code) => ({
          kind: "ability",
          ability: creationAbility(code),
          minimum: requirement.min,
        })),
      });
    if (feat.prereq?.spellcasting) prerequisites.push({ kind: "spellcasting" });
    if (feat.prereq?.armorTraining)
      prerequisites.push({
        kind: "training",
        category: "armor",
        id:
          feat.prereq.armorTraining === "shield"
            ? "shields"
            : feat.prereq.armorTraining + "-armor",
      });
    merge(
      acquisition,
      normalizeCreationGrants(feat.grants ?? [], {
        prefix: "feat",
        level: 1,
        casting: feat.spellcastingAbility,
      })
    );
  } else if (source.kind === "background") {
    const background = source.value;
    if (
      background.abilityOptions.length !== 3 ||
      background.skillProficiencies.length !== 2
    )
      throw new Error("catalogue-background-shape");
    background.abilityOptions.forEach((code, i) => {
      d["ability" + String(i + 1)] = creationAbility(code);
    });
    background.skillProficiencies.forEach((skill, i) => {
      d["skill" + String(i + 1)] = creationSkill(skill);
    });
    const tool = background.toolProficiency;
    const options = tool ? umbrellaToolChoiceOptions(tool) : undefined;
    if (options) {
      delete d.tool;
      d.toolChoice = "tool";
      acquisition.choices.push({
        id: "tool",
        name: "Tool proficiency",
        count: 1,
        options: [],
        parent: null,
        pool: creationPool({
          kind: "proficiency",
          categories: ["tool"],
          ids: [...options],
        }),
      });
    } else {
      const id = tool && (TOOL_IDS.has(tool) ? tool : toolIdByEnName(tool));
      if (!id) throw new Error("catalogue-background-tool");
      d.tool = id;
    }
    if (background.featOptions) {
      const categories = [
        ...new Set(
          background.featOptions.map((id) => featCategory(snapshot("feat:" + id)))
        ),
      ];
      d.originFeatCategories = categories;
      delete d.originFeat;
      d.originFeatChoice = "origin-feat";
      acquisition.choices.push({
        id: "origin-feat",
        name: "Origin feat",
        count: 1,
        options: [],
        parent: null,
        pool: creationPool({
          kind: "feat",
          ids: [...background.featOptions],
          categories,
        }),
      });
    } else {
      const feat = snapshot("feat:" + background.feat);
      d.originFeatCategories = [featCategory(feat)];
      d.originFeat = include(dependencies, feat);
    }
    const gear = normalizeStartingEquipment(
      background.startingEquipment ?? [],
      "equipment",
      snapshot,
      source.key
    );
    delete d.equipment;
    delete d.equipmentGold;
    d.equipmentChoice = "equipment";
    acquisition.choices.push(...gear.choices);
    Object.assign(dependencies, gear.dependencies);
    // Fixed skills already have their field authority; avoid projecting their duplicate authored grants twice.
    merge(
      acquisition,
      normalizeCreationGrants(
        (background.grants ?? []).filter((g) => g.type !== "skill-proficiency"),
        { prefix: "background", level: 1 }
      )
    );
  } else if (source.kind === "invocation") {
    d.acquisitionLevel = source.value.prerequisites?.minimumClassLevel ?? 1;
    merge(
      acquisition,
      normalizeCreationGrants(source.value.grants ?? [], {
        prefix: "invocation",
        level: 1,
        casting: { kind: "fixed", ability: "CHA" },
      })
    );
  } else {
    const table = source.value;
    const first = table.levels.find((row) => row.level === 1);
    if (!first) throw new Error("catalogue-class-level");
    d.hitDie = table.hitDie;
    d.primaryAbilities = table.primaryAbility.map(creationAbility);
    d.savingThrows = table.savingThrows.map(creationAbility);
    d.subclassLevels = [table.subclassLevel];
    const starting = normalizeCreationGrants(table.grants ?? [], {
      prefix: "starting",
      level: 1,
    });
    starting.benefits.push(
      ...table.armorProficiencies.map((id) => ({
        kind: "training" as const,
        category: "armor" as const,
        id,
      })),
      ...table.weaponProficiencies.map((id) => ({
        kind: "training" as const,
        category: "weapon" as const,
        id,
      }))
    );
    if (table.skillChoices.count)
      starting.choices.push({
        id: "skills",
        name: "Class skills",
        count: table.skillChoices.count,
        options: [],
        parent: null,
        pool: creationPool({
          kind: "proficiency",
          categories: ["skill"],
          ids: table.skillChoices.from.map(creationSkill),
        }),
      });
    const gear = normalizeStartingEquipment(
      table.startingEquipment,
      "equipment",
      snapshot,
      source.key
    );
    starting.choices.push(...gear.choices);
    Object.assign(dependencies, gear.dependencies);
    d.starting = json({
      prerequisites: [],
      benefits: starting.benefits,
      choices: starting.choices,
    });
    const level = blankClassLevel(1);
    level.name = source.name + " 1";
    const progression = empty();
    for (const feature of source.features) {
      const normalized = normalizeCreationGrants(feature.grants ?? [], {
        prefix: feature.id,
        level: 1,
        ...(table.spellcasting
          ? { casting: { kind: "fixed" as const, ability: table.spellcasting.ability } }
          : {}),
      });
      merge(progression, normalized);
    }
    if (table.weaponMastery) {
      const count = Number(first.classSpecific?.[table.weaponMastery.countKey]);
      if (!Number.isSafeInteger(count) || count < 1)
        throw new Error("catalogue-mastery-count");
      progression.choices.push({
        id: "mastery",
        name: "Weapon mastery",
        count,
        parent: null,
        options: [],
        selectedGrant: { kind: "mastery" },
        pool: creationPool({
          kind: "mastery",
          proficientOnly: true,
          ...(table.weaponMastery.propertiesAnyOf
            ? { properties: [...table.weaponMastery.propertiesAnyOf] }
            : {}),
        }),
      });
    }
    if (table.invocationChoices) {
      const count = Number(first.classSpecific?.[table.invocationChoices.countKey]);
      if (!Number.isSafeInteger(count) || count < 1)
        throw new Error("catalogue-invocation-count");
      progression.choices.push({
        id: "invocations",
        name: "Eldritch invocations",
        count,
        options: [],
        parent: null,
        pool: creationPool({ kind: "invocation", maximumClassLevel: 1 }),
      });
    }
    if (table.spellcasting) {
      const policy = table.spellcasting.policy;
      if (!policy) throw new Error("catalogue-casting-policy");
      const ability = creationAbility(table.spellcasting.ability);
      d.spellcasting = json({
        mode: policy.mode,
        ability,
        multiclass: policy.multiclass,
      });
      const slots = first.spellSlots ?? [];
      const prepared = first.spellsKnown ?? first.classSpecific?.preparedSpells ?? 0;
      if (typeof prepared !== "number" || !Number.isSafeInteger(prepared) || prepared < 0)
        throw new Error("catalogue-prepared-count");
      level.spellcasting = {
        cantrips: first.cantripsKnown ?? 0,
        prepared,
        known: 0,
        slots: policy.mode === "pact" ? [] : slots,
        pactSlots: policy.mode === "pact" ? slots.reduce((a, b) => a + b, 0) : 0,
        pactLevel: policy.mode === "pact" ? slots.findIndex((n) => n > 0) + 1 : 0,
      };
      const spellChoice = (
        id: string,
        count: number,
        min: number,
        max: number,
        entitlement: "known" | "prepared" | "spellbook",
        dependent = false
      ): OriginChoice => ({
        id,
        name:
          id === "cantrips"
            ? "Cantrips"
            : id === "spellbook"
              ? "Spellbook"
              : "Prepared spells",
        count,
        options: [],
        parent: null,
        ...(dependent ? { phase: "dependent" } : {}),
        pool: creationPool({
          kind: "spell",
          classSpellLists: [table.id],
          minimumLevel: min,
          maximumLevel: max,
          ...(dependent ? { acquiredPolicy: "spellbook" } : {}),
        }),
        selectedGrant: {
          kind: "spell",
          ability,
          entitlements: [{ policy: entitlement }],
        },
      });
      if (first.cantripsKnown)
        progression.choices.push(
          spellChoice("cantrips", first.cantripsKnown, 0, 0, "known")
        );
      const max = Math.max(1, slots.findLastIndex((n) => n > 0) + 1);
      if (policy.acquisition.kind === "spellbook")
        progression.choices.push(
          spellChoice(
            "spellbook",
            policy.acquisition.initialSpells,
            1,
            policy.acquisition.initialSpellLevel,
            "spellbook"
          )
        );
      if (prepared)
        progression.choices.push(
          spellChoice(
            "prepared",
            prepared,
            1,
            max,
            "prepared",
            policy.acquisition.kind === "spellbook"
          )
        );
    }
    level.benefits = progression.benefits;
    level.choices = progression.choices;
    d.progression = json([level]);
  }
  d.prerequisites = json(prerequisites);
  d.benefits = json(acquisition.benefits);
  d.choices = json(acquisition.choices);
  d.dependencies = json(dependencies);
  return definition;
}
