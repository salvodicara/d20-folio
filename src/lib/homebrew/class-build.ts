import { frozen, identityId, object, type CharacterRef } from "../identity/model";
import { assertJsonBudget } from "../shared/json-budget";
import { parseAcquisitionSelection } from "./acquisition-selection";
import type { OriginSelection } from "./origin-build";
import type { CatalogueVerifier } from "./sources";
export interface InitialClassAcquisition extends OriginSelection {
  classLevel: 1;
}
export interface ClassBuild {
  schema: 1;
  character: CharacterRef;
  revision: number;
  acquisitions: Record<string, InitialClassAcquisition>;
  lastOperation: { uid: string; opId: string };
}
export function parseClassBuild(
  value: unknown,
  verifyCatalogue?: CatalogueVerifier
): ClassBuild {
  try {
    assertJsonBudget(value, 180_000);
    const data = object(value),
      character = object(data.character),
      last = object(data.lastOperation),
      acquisitions = object(data.acquisitions);
    if (
      Object.keys(data).length !== 5 ||
      data.schema !== 1 ||
      !Number.isSafeInteger(data.revision) ||
      Number(data.revision) < 1 ||
      Object.keys(character).length !== 2 ||
      Object.keys(last).length !== 2 ||
      typeof character.ownerUid !== "string" ||
      typeof character.id !== "string" ||
      typeof last.uid !== "string" ||
      typeof last.opId !== "string" ||
      Object.keys(acquisitions).length !== 1
    )
      throw new Error();
    identityId(character.ownerUid);
    identityId(character.id);
    identityId(last.uid);
    identityId(last.opId);
    for (const [id, acquisition] of Object.entries(acquisitions)) {
      const parsed = parseAcquisitionSelection(acquisition, "class", verifyCatalogue);
      if (id !== parsed.id || parsed.ordinal !== 0) throw new Error();
    }
    return frozen(structuredClone(data)) as unknown as ClassBuild;
  } catch {
    throw new Error("incompatible-class-build");
  }
}
