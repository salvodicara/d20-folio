import {
  doc,
  onSnapshot,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import { characterPath, type CharacterRef } from "../identity/model";
import type { SessionController } from "../identity/session";
import { equal } from "../shared/model";
import { serializeLibraryRecovery } from "../library/recovery";
import { parseClassBuild, type ClassBuild } from "./class-build";
import { conformAcquisitionSnapshot, type CatalogueVerifier } from "./sources";
export interface LoadedClassBuild {
  base: ClassBuild | null;
  original: string | null;
}
/** Authorized snapshots contain their complete sources; no private Library children are read. */
export function createClassBuildReader(
  db: Firestore,
  session: SessionController,
  verifyCatalogue: CatalogueVerifier
) {
  return {
    watch(
      character: CharacterRef,
      onData: (value: LoadedClassBuild) => void,
      onError: (error: Error) => void
    ) {
      if (!session.scope().uid) throw Error("permission-denied");
      return session.track(
        onSnapshot(
          doc(db, characterPath(character) + "/classes/build"),
          session.guard((snapshot: DocumentSnapshot) => {
            if (!snapshot.exists()) {
              onData({ base: null, original: null });
              return;
            }
            try {
              const base = parseClassBuild(snapshot.data(), verifyCatalogue);
              if (
                !equal(base.character, character) ||
                Object.values(base.acquisitions).some(
                  (a) => conformAcquisitionSnapshot(a.snapshot, verifyCatalogue).length
                )
              )
                throw Error("incompatible-class-build");
              onData({ base, original: null });
            } catch {
              onData({ base: null, original: serializeLibraryRecovery(snapshot.data()) });
            }
          }),
          session.guard(onError)
        )
      );
    },
  };
}
export type ClassBuildReader = ReturnType<typeof createClassBuildReader>;
