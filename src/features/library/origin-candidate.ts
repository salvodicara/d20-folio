import type { OriginBuild, OriginSelection } from "@/lib/homebrew/origin-build";
import type { FolioCharacter } from "@/lib/identity/model";
import type { LibraryVersion } from "@/lib/library/model";
import { equal } from "@/lib/shared/model";

/** A changed source requires fresh consent; retain the old reasons as inactive history. */
export function replaceOriginSnapshot(
  selection: OriginSelection,
  snapshot: LibraryVersion
): OriginSelection {
  if (equal(selection.snapshot, snapshot)) return selection;
  const source = JSON.stringify([
    selection.snapshot.ownerUid,
    selection.snapshot.entryId,
    selection.snapshot.version,
  ]);
  return {
    ...selection,
    snapshot,
    exceptions: selection.exceptions.map((exception) => ({
      ...exception,
      path: exception.path.startsWith("inactive-history/")
        ? exception.path
        : `inactive-history/${source}/${exception.path}`,
    })),
  };
}
export function originCandidate(
  character: FolioCharacter,
  base: OriginBuild | null,
  selection: OriginSelection | null,
  targetId: string
): OriginBuild {
  const selections = Object.fromEntries(
    Object.entries(base?.selections ?? {}).filter(([id]) => id !== targetId)
  );
  if (selection) selections[targetId] = selection;
  return {
    schema: 1,
    character: { ownerUid: character.ownerUid, id: character.id },
    revision: (base?.revision ?? 0) + 1,
    selections,
    lastOperation: base?.lastOperation ?? { uid: character.ownerUid, opId: "preview" },
  };
}
