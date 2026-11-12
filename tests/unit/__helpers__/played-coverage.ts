/**
 * For what the owner's groups actually play (the played-content survey,
 * `scripts/survey-played-content.ts`), what each catalogue entry DECLARES, on the
 * rules of `rules-coverage.ts`. Declared is not proven: an effect the data declares
 * but no screen applies still reads «auto» here (coordinator, 2026-11-12). The proven
 * class comes from a conformance case that goes through the function a screen calls;
 * until then this column is the declaration only. Class features held are counted from the
 * survey's class levels: every character at or above a feature's level holds it (a
 * subclass's features up to the highest level any character has in that class, since
 * the survey does not pair a subclass with its level).
 */
import { classFeatures, classFeatureIndex } from "@/data/classes";
import { getFeat } from "@/data/feats";
import { getRace } from "@/data/races";
import { localizeSrd } from "@/i18n/resolver";

import {
  classFeatureCoverage,
  featCoverage,
  speciesTraitCoverage,
  SRD_CARRIED,
  type CoverageClass,
} from "./rules-coverage";

/** The survey's shape, as `survey-played-content.ts` prints it. */
export interface PlayedSurvey {
  classLevels: Record<string, number>;
  subclasses: Record<string, number>;
  species: Record<string, number>;
  features: Record<string, number>;
  upcoming: Record<string, number>;
}

export type PlayedCoverage = CoverageClass | "missing";

export interface PlayedRow {
  id: string;
  name: string;
  characters: number;
  coverage: PlayedCoverage;
}

export interface PlayedSection {
  title: string;
  rows: PlayedRow[];
}

const featureName = (id: string): string => {
  const feature = classFeatureIndex.get(id);
  if (feature) return localizeSrd("class-feature", id, "name", "en");
  return getFeat(id) ? localizeSrd("feat", id, "name", "en") : id;
};

function classFeatureRow(id: string, characters: number): PlayedRow {
  const feature = classFeatureIndex.get(id);
  return {
    id,
    name: featureName(id),
    characters,
    coverage: feature ? classFeatureCoverage(feature, SRD_CARRIED) : "missing",
  };
}

/** Most played first, then by name. */
const byPlay = (a: PlayedRow, b: PlayedRow) =>
  b.characters - a.characters || a.name.localeCompare(b.name);

function heldClassFeatures(survey: PlayedSurvey): PlayedRow[] {
  const held = new Map<string, number>();
  const add = (id: string, n: number) => held.set(id, (held.get(id) ?? 0) + n);
  const topLevel = new Map<string, number>();
  for (const [key, n] of Object.entries(survey.classLevels)) {
    const [classId = "", levelText = "0"] = key.split(":");
    const level = Number(levelText);
    topLevel.set(classId, Math.max(topLevel.get(classId) ?? 0, level));
    for (const feature of classFeatures)
      if (feature.class === classId && !feature.subclass && feature.level <= level)
        add(feature.id, n);
  }
  for (const [key, n] of Object.entries(survey.subclasses)) {
    const [classId = "", subclassId = ""] = key.split(":");
    const level = topLevel.get(classId) ?? 0;
    for (const feature of classFeatures)
      if (
        feature.class === classId &&
        feature.subclass === subclassId &&
        feature.level <= level
      )
        add(feature.id, n);
  }
  return [...held].map(([id, n]) => classFeatureRow(id, n)).sort(byPlay);
}

function pickedFeatures(survey: PlayedSurvey): PlayedRow[] {
  return Object.entries(survey.features)
    .map(([id, characters]) => {
      const feat = getFeat(id);
      if (feat)
        return { id, name: featureName(id), characters, coverage: featCoverage(feat) };
      return classFeatureRow(id, characters);
    })
    .sort(byPlay);
}

function speciesTraits(survey: PlayedSurvey): PlayedRow[] {
  return Object.entries(survey.species)
    .flatMap(([raceId, characters]): PlayedRow[] => {
      const race = getRace(raceId);
      if (!race) return [{ id: raceId, name: raceId, characters, coverage: "missing" }];
      return race.traits.map((trait) => ({
        id: `${raceId}:${trait.id}`,
        name: `${localizeSrd("race", raceId, "name", "en")}: ${trait.id}`,
        characters,
        coverage: speciesTraitCoverage(raceId, trait),
      }));
    })
    .sort(byPlay);
}

export function playedCoverage(survey: PlayedSurvey): PlayedSection[] {
  return [
    { title: "Class features held", rows: heldClassFeatures(survey) },
    { title: "Feats and picked features", rows: pickedFeatures(survey) },
    { title: "Species traits", rows: speciesTraits(survey) },
    {
      title: "Next two levels",
      rows: Object.entries(survey.upcoming)
        .map(([id, n]) => classFeatureRow(id, n))
        .sort(byPlay),
    },
  ];
}

const LABEL: Record<PlayedCoverage, string> = {
  auto: "Declared auto",
  tap: "Declared 1 tap",
  reference: "Text only (by hand)",
  missing: "No catalogue entry",
};

/** The report: a legend, a summary per section, then each section's table. */
export function playedCoverageMarkdown(survey: PlayedSurvey): string {
  const sections = playedCoverage(survey);
  const out = [
    "# What the groups play, and what the catalogue declares for it",
    "",
    "**Declared, not proven.** This reads what each entry's data declares. A declared",
    "effect that no screen applies still reads «declared auto»: check the code before",
    "telling a player it works.",
    "",
    "- Declared auto: the data declares an effect the engine could apply with no input.",
    "- Declared 1 tap: the data declares a counter, an action, a cast or a pick.",
    "- Text only (by hand): the data declares nothing; the table plays it by hand.",
    "- No catalogue entry: the id is not in the catalogue.",
  ];
  for (const section of sections) {
    const count = (c: PlayedCoverage) =>
      section.rows.filter((row) => row.coverage === c).length;
    out.push(
      "",
      `## ${section.title}`,
      "",
      `${count("auto")} declared auto · ${count("tap")} declared 1 tap · ${count("reference")} text only · ${count("missing")} no entry`,
      "",
      "| Entry | Id | Characters | Coverage |",
      "| --- | --- | --- | --- |",
      ...section.rows.map(
        (row) =>
          `| ${row.name} | ${row.id} | ${row.characters} | ${LABEL[row.coverage]} |`
      )
    );
  }
  return `${out.join("\n")}\n`;
}
