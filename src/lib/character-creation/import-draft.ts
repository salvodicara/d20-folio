import { equal } from "../shared/model";
import { object, parseCharacter, type FolioCharacter } from "../identity/model";
import { analyzeImport, reviewImport, type ImportReview } from "./import-review";
import {
  parseImportReconciliation,
  type ImportReconciliation,
} from "./import-repository";
export interface ImportDraft {
  schema: 1;
  ownerUid: string;
  original: string;
  review: ImportReview;
  target: FolioCharacter | null;
  base: ImportReconciliation | null;
}
export function parseImportDraft(value: unknown, uid: string): ImportDraft {
  const raw = object(value);
  if (
    Object.keys(raw).length !== 6 ||
    raw.schema !== 1 ||
    raw.ownerUid !== uid ||
    typeof raw.original !== "string"
  )
    throw Error("incompatible-import-draft");
  const analysis = analyzeImport(raw.original),
    r = object(raw.review);
  if (
    typeof r.declaredEdition !== "string" ||
    !["unknown", "2014", "2024"].includes(r.declaredEdition) ||
    !Array.isArray(r.reviewed)
  )
    throw Error("incompatible-import-draft");
  const review = reviewImport(
    analysis,
    r.declaredEdition as ImportReview["declaredEdition"],
    r.reviewed as ImportReview["reviewed"]
  );
  if (!equal(review, raw.review)) throw Error("incompatible-import-draft");
  const target = raw.target === null ? null : parseCharacter(raw.target);
  if (target && target.ownerUid !== uid) throw Error("incompatible-import-draft");
  if (!target && raw.base !== null) throw Error("incompatible-import-draft");
  const base =
    target && raw.base !== null
      ? parseImportReconciliation(raw.base, { ownerUid: uid, id: target.id })
      : null;
  return { schema: 1, ownerUid: uid, original: raw.original, review, target, base };
}
