import { dryRunMigration } from "../identity/migration";
import { frozen, object } from "../identity/model";

export type RulesEdition = "2014" | "2024" | "unknown";
export type ImportEdition =
  | { kind: "unknown" }
  | { kind: "invalid"; fields: string[] }
  | { kind: "known"; value: Exclude<RulesEdition, "unknown"> }
  | { kind: "unsupported" | "conflicting"; values: (string | number | boolean | null)[] };

const categoryFields = {
  origins: ["race", "background", "originFeats", "humanOriginFeat", "bgFeat", "asi"],
  classes: ["classes", "features"],
  abilities: [
    "abilities",
    "skills",
    "savingThrows",
    "languageIds",
    "customLanguages",
    "toolProficiencyIds",
    "customToolProficiencies",
    "toolChoices",
  ],
  equipment: ["weapons", "equipment"],
  spells: ["spells", "spellcasting", "spellSlots", "speciesSpellAbility"],
  custom: ["customs"],
  overrides: ["overrides", "proficiencyBonusOverride"],
} as const;
export type ImportCategory = keyof typeof categoryFields | "state" | "unrecognized";
export interface ImportAnalysis {
  sourceSchema: 3;
  original: string;
  edition: ImportEdition;
  /** Mechanical paths only. Private narrative is never copied into the comparison. */
  categories: { id: ImportCategory; paths: string[] }[];
}
export interface ImportReview {
  declaredEdition: RulesEdition;
  /** Acknowledged preservation, never certification that mechanics were converted. */
  reviewed: ImportCategory[];
  unresolved: ImportCategory[];
}

function omitted(source: unknown, projected: unknown): boolean {
  if (Array.isArray(source))
    return (
      !Array.isArray(projected) ||
      source.some((item, index) => omitted(item, projected[index]))
    );
  if (source === null || typeof source !== "object") return projected === undefined;
  if (projected === null || typeof projected !== "object" || Array.isArray(projected))
    return true;
  const target = projected as Record<string, unknown>;
  // Entry notes are deliberately private, not an unsupported mechanical extension.
  return Object.entries(source).some(
    ([key, value]) =>
      key !== "notes" && (!Object.hasOwn(target, key) || omitted(value, target[key]))
  );
}

/** Analyse format and mechanics separately. The original remains the recovery authority. */
export function analyzeImport(original: string): Readonly<ImportAnalysis> {
  // The same grammar that will be applied rejects an invalid or oversized copy here.
  const plan = dryRunMigration(original, { ownerUid: "analysis", id: "analysis" });
  const source = object(JSON.parse(original));
  const editionFields = ["edition", "rulesEdition"].filter((key) =>
    Object.hasOwn(source, key)
  );
  const invalidFields = editionFields.filter((key) => {
    const value = source[key];
    return (
      value !== null &&
      typeof value !== "boolean" &&
      typeof value !== "number" &&
      (typeof value !== "string" || value.length > 80)
    );
  });
  const unique = invalidFields.length
    ? []
    : ([...new Set(editionFields.map((key) => source[key]))] as (
        | string
        | number
        | boolean
        | null
      )[]);
  let edition: ImportEdition = { kind: "unknown" };
  if (invalidFields.length) edition = { kind: "invalid", fields: invalidFields };
  else if (unique.length > 1) edition = { kind: "conflicting", values: unique };
  else if (unique.length === 1) {
    const value = unique[0];
    edition =
      value === "2014" || value === "2024"
        ? { kind: "known", value }
        : { kind: "unsupported", values: unique };
  }
  const build = plan.character.sheet.build;
  const categories: ImportAnalysis["categories"] = [];
  for (const [id, fields] of Object.entries(categoryFields)) {
    const paths = fields
      .filter((field) => Object.hasOwn(build, field))
      .map((field) => `build.${field}`);
    if (paths.length) categories.push({ id: id as ImportCategory, paths });
  }
  const state = Object.keys(plan.character.sheet.state);
  if (state.length)
    categories.push({ id: "state", paths: state.map((key) => `state.${key}`) });
  const unrecognized: string[] = [];
  for (const section of ["build", "state"] as const) {
    const privateFields =
      section === "build" ? ["lore", "player", "quote"] : ["log", "notes"];
    for (const [key, value] of Object.entries(object(source[section] ?? {}))) {
      if (
        !privateFields.includes(key) &&
        omitted(value, plan.character.sheet[section][key])
      )
        unrecognized.push(`${section}.${key}`);
    }
  }
  for (const key of Object.keys(source))
    if (!["schema", "build", "state", "edition", "rulesEdition"].includes(key))
      unrecognized.push(key);
  if (unrecognized.length) categories.push({ id: "unrecognized", paths: unrecognized });
  return frozen({ sourceSchema: 3, original, edition, categories });
}

export function reviewImport(
  analysis: Readonly<ImportAnalysis>,
  declaredEdition: RulesEdition,
  reviewed: readonly ImportCategory[]
): Readonly<ImportReview> {
  const ids = analysis.categories.map((category) => category.id);
  if (
    !["2014", "2024", "unknown"].includes(declaredEdition) ||
    new Set(reviewed).size !== reviewed.length ||
    reviewed.some((id) => !ids.includes(id))
  )
    throw new Error("invalid-import-review");
  return frozen({
    declaredEdition,
    reviewed: ids.filter((id) => reviewed.includes(id)),
    // Reading the comparison does not implement or validate a mechanical migration.
    unresolved: ids,
  });
}
