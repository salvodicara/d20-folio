import { verifyCatalogueSnapshot } from "@/lib/character-creation/catalogue";
import type { InitialLoadout, InstanceSnapshot } from "@/lib/homebrew/instances";
import type { CatalogueSnapshot } from "@/lib/homebrew/sources";
import { equal } from "@/lib/shared/model";

/** Resolve display provenance from the frozen loadout, never a mutable source build. */
export function includedCopyCatalogue(
  snapshot: InstanceSnapshot,
  sources: InitialLoadout["sources"]
): CatalogueSnapshot | undefined {
  if (!("kind" in snapshot) || snapshot.kind !== "bundled") return;
  const dependencies = sources[snapshot.sourceKey]?.definition.payload.data.dependencies;
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies))
    return;
  const child = dependencies[snapshot.dependencyPath];
  if (!child || typeof child !== "object" || Array.isArray(child)) return;
  if (child.kind !== "catalogue") return undefined;
  const catalogue = child as unknown as CatalogueSnapshot;
  if (
    equal(catalogue.definition, snapshot.definition) &&
    verifyCatalogueSnapshot(catalogue, true)
  )
    return catalogue;
  return undefined;
}
