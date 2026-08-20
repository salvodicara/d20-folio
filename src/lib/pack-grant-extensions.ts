/**
 * Compose typed content-pack mechanics into an existing public grant source.
 *
 * Most grants are independent and append normally. The two additive container
 * grants need structural composition so the existing public picker/pool remains
 * the single source of truth:
 * - a matching `choice-grant-bundle` gains options;
 * - a matching `familiar-forms` grant gains monster ids.
 *
 * Duplicate option/form ids throw during module initialization. A drifted pack
 * must fail loudly instead of presenting two indistinguishable choices.
 */
import type { PackGrantExtensions } from "@/data/pack-types";
import type { Grant } from "@/lib/grants";

type ChoiceBundle = Extract<Grant, { type: "choice-grant-bundle" }>;
type FamiliarForms = Extract<Grant, { type: "familiar-forms" }>;

function assertUnique(
  sourceKey: string,
  kind: "choice option" | "familiar form",
  ids: readonly string[]
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`[content-pack] duplicate ${kind} id "${id}" in ${sourceKey}`);
    }
    seen.add(id);
  }
}

function mergeChoiceBundle(
  sourceKey: string,
  base: ChoiceBundle,
  extension: ChoiceBundle
): ChoiceBundle {
  const baseFrequency = base.choiceFrequency ?? "rest";
  const extensionFrequency = extension.choiceFrequency ?? "rest";
  if (baseFrequency !== extensionFrequency) {
    throw new Error(
      `[content-pack] choice bundle "${base.bundleKey}" changes frequency in ${sourceKey}`
    );
  }
  const options = [...base.options, ...extension.options];
  assertUnique(
    sourceKey,
    "choice option",
    options.map((option) => option.id)
  );
  return { ...base, options };
}

function mergeFamiliarForms(
  sourceKey: string,
  base: FamiliarForms,
  extension: FamiliarForms
): FamiliarForms {
  const monsterIds = [...base.monsterIds, ...extension.monsterIds];
  assertUnique(sourceKey, "familiar form", monsterIds);
  return { ...base, monsterIds };
}

/** Return `base` plus the extension registered for `sourceKey`. */
export function withPackGrantExtensions(
  sourceKey: string,
  base: ReadonlyArray<Grant> | undefined,
  extensions: PackGrantExtensions
): ReadonlyArray<Grant> {
  const additions = extensions[sourceKey];
  if (!additions?.length) return base ?? [];

  const out = [...(base ?? [])];
  for (const grant of additions) {
    if (grant.type === "choice-grant-bundle") {
      const index = out.findIndex(
        (candidate) =>
          candidate.type === "choice-grant-bundle" &&
          candidate.bundleKey === grant.bundleKey
      );
      if (index >= 0) {
        const current = out[index];
        if (current?.type !== "choice-grant-bundle") {
          throw new Error(`[content-pack] invalid choice bundle in ${sourceKey}`);
        }
        out[index] = mergeChoiceBundle(sourceKey, current, grant);
      } else {
        assertUnique(
          sourceKey,
          "choice option",
          grant.options.map((option) => option.id)
        );
        out.push(grant);
      }
      continue;
    }

    if (grant.type === "familiar-forms") {
      const index = out.findIndex((candidate) => candidate.type === "familiar-forms");
      if (index >= 0) {
        const current = out[index];
        if (current?.type !== "familiar-forms") {
          throw new Error(`[content-pack] invalid familiar forms in ${sourceKey}`);
        }
        out[index] = mergeFamiliarForms(sourceKey, current, grant);
      } else {
        assertUnique(sourceKey, "familiar form", grant.monsterIds);
        out.push(grant);
      }
      continue;
    }

    out.push(grant);
  }
  return out;
}
