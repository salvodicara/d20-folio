/**
 * For what the owner's groups actually play (the played-content survey,
 * `scripts/survey-played-content.ts`): what the app really does with each entry
 * (`coverage-verdicts.ts`, checked against the code; «unproven» when nobody has), beside
 * what the entry's data declares (`rules-coverage.ts`). Declared is not proven: an
 * effect the data declares but no screen applies is flagged (coordinator, 2026-11-12). Class features held are counted from the
 * survey's class levels: every character at or above a feature's level holds it (a
 * subclass's features up to the highest level any character has in that class, since
 * the survey does not pair a subclass with its level).
 */
import { classFeatures, classFeatureIndex } from "@/data/classes";
import { getFeat } from "@/data/feats";
import { getRace } from "@/data/races";
import { localizeSrd } from "@/i18n/resolver";

import { aScreenCalls } from "./coverage-report";
import {
  packVerdicts,
  PUBLIC_VERDICTS,
  shownVerdict,
  type CoverageVerdict,
  type ShownVerdict,
} from "./coverage-verdicts";
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
  /** What the entry's data declares. */
  coverage: PlayedCoverage;
  /** What the code really does (`coverage-verdicts.ts`), or nobody checked it. */
  verdict?: ShownVerdict;
  note?: string;
  until?: string;
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

export function playedCoverage(
  survey: PlayedSurvey,
  extraVerdicts: readonly CoverageVerdict[] = []
): PlayedSection[] {
  const verdicts = new Map(
    [...PUBLIC_VERDICTS, ...packVerdicts(), ...extraVerdicts].map(
      (v) => [v.id, v] as const
    )
  );
  const judge = (row: PlayedRow): PlayedRow => {
    const checked = verdicts.get(row.id);
    return {
      ...row,
      verdict: checked ? shownVerdict(checked, aScreenCalls) : "unproven",
      ...(checked?.note ? { note: checked.note } : {}),
      ...(checked?.until ? { until: checked.until } : {}),
    };
  };
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
  ].map((section) => ({ ...section, rows: section.rows.map(judge) }));
}

const DECLARED: Record<PlayedCoverage, string> = {
  auto: "Declared auto",
  tap: "Declared 1 tap",
  reference: "Text only",
  missing: "No catalogue entry",
};

const CHECKED: Record<ShownVerdict, string> = {
  "re-check": "Re-check (its change reached a screen)",
  auto: "Auto",
  "by-hand": "By hand",
  missing: "Missing",
  impossible: "Impossible",
  wrong: "Wrong",
  unproven: "Unproven",
};

/** The declaration promises more than the code does. */
const overclaims = (row: PlayedRow): boolean =>
  (row.coverage === "auto" || row.coverage === "tap") &&
  row.verdict !== undefined &&
  row.verdict !== "auto" &&
  row.verdict !== "unproven" &&
  row.verdict !== "re-check" &&
  !(row.coverage === "tap" && row.verdict === "by-hand");

/** The report: a legend, a summary per section, then each section's table. */
export function playedCoverageMarkdown(
  survey: PlayedSurvey,
  extraVerdicts: readonly CoverageVerdict[] = []
): string {
  const sections = playedCoverage(survey, extraVerdicts);
  const out = [
    "# What the groups play, and how far the app plays it",
    "",
    "**Code-checked** is what the app really does, checked against the code and its tests",
    "(the rules lane's audits). **Declared** is what the entry's data declares; ⚠ marks a",
    "declaration that promises more than the code does.",
    "",
    "- Auto: the app applies it, proven by tests.",
    "- By hand: the player or the DM applies it (a tap, a note, a ruling).",
    "- Missing: a table would want the app to apply it, and it does not.",
    "- Impossible / Wrong: the app cannot represent it / applies something the rule does not say.",
    "- Unproven: nobody has checked it against the code with a test to cite. Never read it as automatic.",
    "- Re-check: the change its verdict waited for now reaches a screen; check it again.",
  ];
  for (const section of sections) {
    const count = (v: ShownVerdict) =>
      section.rows.filter((row) => row.verdict === v).length;
    out.push(
      "",
      `## ${section.title}`,
      "",
      `${count("auto")} auto · ${count("by-hand")} by hand · ${count("missing")} missing · ${count("impossible") + count("wrong")} impossible or wrong · ${count("unproven")} unproven · ${count("re-check")} to re-check`,
      "",
      "| Entry | Id | Characters | Code-checked | Declared |",
      "| --- | --- | --- | --- | --- |",
      ...section.rows.map((row) => {
        const checked = CHECKED[row.verdict ?? "unproven"];
        const why = [row.note, row.until ? `until ${row.until}` : null]
          .filter(Boolean)
          .join("; ");
        return `| ${row.name} | ${row.id} | ${row.characters} | ${checked}${why ? ` (${why})` : ""} | ${DECLARED[row.coverage]}${overclaims(row) ? " ⚠" : ""} |`;
      })
    );
  }
  return `${out.join("\n")}\n`;
}
