import { type DefinitionSnapshot } from "@/lib/homebrew/sources";
import type { CreationDraft, CreationRole } from "@/lib/character-creation/model";
import type { CreationPreview } from "@/lib/character-creation/compose";
import type { ActiveOriginChoice } from "@/lib/homebrew/origin-build";
import { originNodePath } from "@/lib/homebrew/origins";

export const wizardRoles: CreationRole[] = ["species", "background", "class"];
export const activeSelection = (draft: CreationDraft, role: CreationRole) => {
  const key = draft.sources[role];
  return key ? draft.selections[key] : undefined;
};
export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function choiceSource(
  draft: CreationDraft,
  preview: CreationPreview,
  c: ActiveOriginChoice
): DefinitionSnapshot | undefined {
  const selection = activeSelection(draft, c.selectionId as CreationRole);
  if (!selection) return;
  const nodes = [{ path: "root", snapshot: selection.snapshot }];
  for (const parent of preview.composition.activeChoices) {
    if (
      !parent.active ||
      parent.selectionId !== c.selectionId ||
      !parent.choice.pool ||
      parent.selected.length !== parent.choice.count ||
      parent.selected.some(
        (id) => !parent.choice.options.some((option) => option.id === id)
      )
    )
      continue;
    parent.selected.forEach((id, i) => {
      const snapshot = selection.resolvedChoices?.[parent.path]?.[i];
      if (snapshot) nodes.push({ path: originNodePath(parent.path, id), snapshot });
    });
  }
  for (const owner of [...nodes]) {
    for (const [key, value] of Object.entries(
      record(owner.snapshot.definition.payload.data.dependencies)
    )) {
      if (record(value).kind !== "catalogue") continue;
      const segment = originNodePath("", key);
      const start = c.path.indexOf(segment + "/", owner.path.length);
      if (c.path.startsWith(owner.path + "/") && start >= 0)
        nodes.push({
          path: c.path.slice(0, start + segment.length),
          snapshot: value as DefinitionSnapshot,
        });
    }
  }
  return (
    nodes
      .filter((n) => c.path.startsWith(n.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0]?.snapshot ?? selection.snapshot
  );
}
export function isGearChoice(c: ActiveOriginChoice, all: ActiveOriginChoice[]): boolean {
  const direct = (entry: ActiveOriginChoice) =>
    entry.choice.pool?.query.kind === "equipment" ||
    entry.choice.selectedGrant?.kind === "equipment" ||
    entry.choice.options.some((o) =>
      o.benefits.some((b) => b.kind === "equipment" || b.kind === "gold")
    );
  let current: ActiveOriginChoice | undefined = c;
  const seen = new Set<string>();
  while (current && !seen.has(current.path)) {
    if (direct(current)) return true;
    seen.add(current.path);
    const parentId: string | undefined = current.choice.parent?.choiceId;
    const path: string = current.path.slice(0, current.path.lastIndexOf("/"));
    current = all.find(
      (p) =>
        p.selectionId === c.selectionId &&
        p.choice.id === parentId &&
        p.path.startsWith(path + "/")
    );
  }
  return false;
}
export { useAcquisitionLabels as useWizardLabels } from "@/features/library/acquisition-presenters";
