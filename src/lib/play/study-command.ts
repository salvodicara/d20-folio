/**
 * Studying one copy of a manual or tome, prepared from the sheet: the scores it
 * raises (`studyItemAbilityScores`) and the spend of the book's one use, whose
 * depletion makes the copy nonmagical (the catalogue's `FINITE_SUPPLY("uses", 1,
 * "nonmagical")`), so it can't be studied twice. Pure: the store commits both.
 */
import { MAGIC_ITEMS_BY_ID } from "@/data/magic-items";
import type { AbilityCode } from "@/data/types";
import {
  itemResourceSpend,
  prepareItemResourceCommand,
  type PreparedItemResourceCommand,
} from "@/lib/item-resource-commands";
import { makeItemResourceIdentity } from "@/lib/resources";
import type { CharacterDoc } from "@/types/character";
import { studyItemAbilityScores } from "./study-item";

/** The book's one use, as the catalogue declares it. */
const STUDY_USE = "uses";

export interface PreparedStudy {
  scores: Record<AbilityCode, number>;
  spend: PreparedItemResourceCommand;
}

/** The study of the copy `instanceId`, or null when it can't happen: no such copy,
 *  nothing it raises (or every score at its maximum), or a book already studied. */
export function prepareStudy(
  doc: CharacterDoc,
  instanceId: string,
  occurrenceId: string
): PreparedStudy | null {
  const ref = doc.character.equipment.find(
    (entry) => !("custom" in entry) && entry.instanceId === instanceId
  );
  if (!ref || "custom" in ref) return null;
  const item = MAGIC_ITEMS_BY_ID.get(ref.srdId);
  if (!item?.resources?.some((resource) => resource.id === STUDY_USE)) return null;
  const scores = studyItemAbilityScores(doc.character.abilityScores, item.grants);
  if (!scores) return null;
  const prepared = prepareItemResourceCommand({
    item: { itemId: item.id, resources: item.resources },
    state: doc.session.itemResources?.[instanceId],
    recipe: itemResourceSpend(
      makeItemResourceIdentity(item.id, instanceId, STUDY_USE),
      1
    ),
    occurrenceId,
  });
  return prepared.status === "prepared" ? { scores, spend: prepared.prepared } : null;
}
