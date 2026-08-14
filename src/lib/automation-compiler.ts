/**
 * Truthful automation coverage compiler.
 *
 * This is deliberately not a percentage calculator. A corpus adapter supplies the
 * exact mechanic-bearing leaf paths proved by its source audit; every path must be
 * claimed exactly once by a registered engine handler or by a bilingual manual
 * boundary. The output is a stable receipt suitable for CI and release evidence.
 */

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { validateCombatEffectProgram } from "@/lib/combat-effect-program";

export const AUTOMATION_HANDLERS = [
  "mechanics-program",
  "effect-program",
  "grant",
  "resource",
  "cast-profile",
  "equipment",
  "tracker",
  "action",
  "stat-block",
  "rule-reference",
  "spell-choice",
  "item-activation",
  "system:ability-score-improvement",
  "system:class-progression",
  "system:expanded-spells",
  "system:feat-choice",
  "system:fighting-style-choice",
  "system:metamagic-choice",
  "system:spell-preparation",
  "system:spellcasting",
  "system:weapon-mastery-choice",
] as const;

export type AutomationHandler = (typeof AUTOMATION_HANDLERS)[number];

export type ManualAutomationBoundary =
  | "spatial"
  | "narrative"
  | "external-time"
  | "open-adjudication";

export interface CompiledAutomationClause {
  disposition: "compiled";
  key: string;
  handler: AutomationHandler;
  consumedPaths: ReadonlyArray<string>;
  /** Exact authored outcome branches proved by this handler. */
  branches: ReadonlyArray<string>;
  /** Required only for `effect-program`; canonical JSON is fingerprinted. */
  program?: unknown;
}

export interface ManualAutomationClause {
  disposition: "manual";
  key: string;
  boundary: ManualAutomationBoundary;
  consumedPaths: ReadonlyArray<string>;
  /** Presenter lookup evidence resolved by the corpus adapter. The compiler
   * stores no localized prose, but refuses an EN- or IT-incomplete boundary. */
  presenter: {
    key: string;
    resolvedLocales: ReadonlyArray<"en" | "it">;
  };
}

export type AutomationClause = CompiledAutomationClause | ManualAutomationClause;

export interface AutomationCompileInput {
  entityKey: string;
  /** Exact source-audited mechanic leaves. Identity, labels, and flavor stay out. */
  mechanicalPaths: ReadonlyArray<string>;
  clauses: ReadonlyArray<AutomationClause>;
  /** Legal only when the source audit proved there are no mechanic-bearing paths. */
  nonMechanical?: true;
}

export interface AutomationClauseReceipt {
  entityKey: string;
  clauseKey: string;
  handler: AutomationHandler | `manual:${ManualAutomationBoundary}`;
  consumedPaths: string[];
  branches: string[];
  programFingerprint?: string;
  presenterKey?: string;
}

export interface AutomationCoverageReceipt {
  version: 1;
  entityKey: string;
  classification: "mechanical" | "nonmechanical";
  clauses: AutomationClauseReceipt[];
}

export type AutomationCompileResult =
  | { ok: true; receipt: AutomationCoverageReceipt }
  | { ok: false; errors: string[] };

const HANDLERS: ReadonlySet<string> = new Set(AUTOMATION_HANDLERS);

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function duplicates(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

function isJsonPlain(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    seen.delete(value);
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const valid = Array.isArray(value)
    ? Object.getPrototypeOf(value) === Array.prototype &&
      Object.keys(descriptors).length === value.length + 1 &&
      Object.hasOwn(descriptors, "length") &&
      Array.from(
        { length: value.length },
        (_, index) => descriptors[String(index)]
      ).every(
        (descriptor) =>
          descriptor !== undefined &&
          descriptor.enumerable &&
          "value" in descriptor &&
          isJsonPlain(descriptor.value, seen)
      )
    : (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null) &&
      Object.entries(descriptors).every(
        ([key, descriptor]) =>
          key.length > 0 &&
          descriptor.enumerable &&
          "value" in descriptor &&
          isJsonPlain(descriptor.value, seen)
      );
  seen.delete(value);
  return valid;
}

/** Exact canonical program identity. Keeping the canonical JSON is intentionally
 * larger than a digest: two distinct JSON programs cannot silently collide. */
function programFingerprint(program: unknown): string | null {
  if (!isJsonPlain(program)) return null;
  return `ace1:${JSON.stringify(canonical(program))}`;
}

function frozenReceipt(receipt: AutomationCoverageReceipt): AutomationCoverageReceipt {
  for (const clause of receipt.clauses) {
    Object.freeze(clause.consumedPaths);
    Object.freeze(clause.branches);
    Object.freeze(clause);
  }
  Object.freeze(receipt.clauses);
  return Object.freeze(receipt);
}

export function compileAutomationCoverage(
  input: AutomationCompileInput
): AutomationCompileResult {
  const errors: string[] = [];
  if (!nonEmpty(input.entityKey)) errors.push("entityKey must be non-empty");
  const mechanicalPaths = input.mechanicalPaths.filter(nonEmpty);
  if (mechanicalPaths.length !== input.mechanicalPaths.length) {
    errors.push("mechanicalPaths contains an empty path");
  }
  for (const path of duplicates(mechanicalPaths)) {
    errors.push(`duplicate mechanical path: ${path}`);
  }
  if (input.nonMechanical) {
    if (mechanicalPaths.length > 0)
      errors.push("nonmechanical entity declares mechanic-bearing paths");
    if (input.clauses.length > 0)
      errors.push("nonmechanical entity declares automation clauses");
  } else if (mechanicalPaths.length === 0) {
    errors.push("entity needs source-audited mechanical paths or nonMechanical: true");
  }

  const mechanical = new Set(mechanicalPaths);
  const claimed = new Map<string, string>();
  const clauseKeys = input.clauses.map(({ key }) => key);
  for (const key of duplicates(clauseKeys)) errors.push(`duplicate clause key: ${key}`);
  const receipts: AutomationClauseReceipt[] = [];

  for (const clause of input.clauses) {
    if (!nonEmpty(clause.key)) errors.push("clause key must be non-empty");
    if (clause.consumedPaths.length === 0) {
      errors.push(`clause ${clause.key || "<empty>"} consumes no paths`);
    }
    for (const path of duplicates([...clause.consumedPaths])) {
      errors.push(`clause ${clause.key} repeats path: ${path}`);
    }
    for (const path of clause.consumedPaths) {
      if (!mechanical.has(path)) {
        errors.push(`clause ${clause.key} consumes unknown path: ${path}`);
        continue;
      }
      const owner = claimed.get(path);
      if (owner) errors.push(`path ${path} claimed by both ${owner} and ${clause.key}`);
      else claimed.set(path, clause.key);
    }

    if (clause.disposition === "compiled") {
      if (!HANDLERS.has(clause.handler)) {
        errors.push(`clause ${clause.key} uses an unregistered handler`);
      }
      if (
        clause.branches.length === 0 ||
        clause.branches.some((branch) => !nonEmpty(branch))
      ) {
        errors.push(`compiled clause ${clause.key} needs explicit branches`);
      }
      for (const branch of duplicates([...clause.branches])) {
        errors.push(`clause ${clause.key} repeats branch: ${branch}`);
      }
      let fingerprint: string | undefined;
      if (clause.handler === "effect-program") {
        const value = programFingerprint(clause.program);
        const validation = validateCombatEffectProgram(clause.program);
        if (!value || !validation.valid) {
          errors.push(`effect-program clause ${clause.key} has no valid plain program`);
        } else fingerprint = value;
      } else if (clause.handler === "mechanics-program") {
        // The canonical deterministic-runtime format (supersedes effect-program).
        const conformed = conformMechanicsProgram(clause.program);
        if (!conformed) {
          errors.push(
            `mechanics-program clause ${clause.key} does not conform to the canonical format`
          );
        } else fingerprint = canonicalFingerprint({ program: conformed });
      } else if (clause.program !== undefined) {
        errors.push(`non-program clause ${clause.key} carries a program`);
      }
      receipts.push({
        entityKey: input.entityKey,
        clauseKey: clause.key,
        handler: clause.handler,
        consumedPaths: [...clause.consumedPaths].sort(),
        branches: [...clause.branches].sort(),
        ...(fingerprint ? { programFingerprint: fingerprint } : {}),
      });
    } else {
      const locales = new Set(clause.presenter.resolvedLocales);
      if (!nonEmpty(clause.presenter.key) || !locales.has("en") || !locales.has("it")) {
        errors.push(`manual clause ${clause.key} has no bilingual presenter`);
      }
      receipts.push({
        entityKey: input.entityKey,
        clauseKey: clause.key,
        handler: `manual:${clause.boundary}`,
        consumedPaths: [...clause.consumedPaths].sort(),
        branches: [],
        presenterKey: clause.presenter.key,
      });
    }
  }

  for (const path of mechanicalPaths) {
    if (!claimed.has(path)) errors.push(`unconsumed mechanical path: ${path}`);
  }
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)].sort() };

  return {
    ok: true,
    receipt: frozenReceipt({
      version: 1,
      entityKey: input.entityKey,
      classification: input.nonMechanical ? "nonmechanical" : "mechanical",
      clauses: receipts.sort((left, right) =>
        left.clauseKey.localeCompare(right.clauseKey)
      ),
    }),
  };
}

export function serializeAutomationCoverageReceipt(
  receipt: AutomationCoverageReceipt
): string {
  return JSON.stringify(canonical(receipt));
}
