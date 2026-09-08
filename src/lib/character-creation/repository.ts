import {
  doc,
  getDocFromServer,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import {
  characterPath,
  frozen,
  identityId,
  object,
  parseCharacter,
  type CharacterRef,
  type FolioCharacter,
} from "../identity/model";
import type { SessionController } from "../identity/session";
import { libraryPath, type LibraryVersion } from "../library/model";
import { parseOriginBuild, type OriginBuild } from "../homebrew/origin-build";
import { parseClassBuild, type ClassBuild } from "../homebrew/class-build";
import {
  initialLoadoutPath,
  isBundledSnapshot,
  isInitialInstanceId,
  parseInitialLoadout,
  type InitialLoadout,
} from "../homebrew/instances";
import {
  conformAcquisitionSnapshot,
  isLibrarySnapshot,
  sourceIdentity,
  type CatalogueVerifier,
  type DefinitionSnapshot,
} from "../homebrew/sources";
import { assertJsonBudget } from "../shared/json-budget";
import { equal, receiptPath, type Envelope } from "../shared/model";
export interface CreationCandidate {
  character: FolioCharacter;
  origins: OriginBuild;
  classes: ClassBuild;
  loadout: InitialLoadout;
}
export interface CreationOperation extends Envelope {
  kind: "character-create";
  character: CharacterRef;
  output: CreationCandidate;
}
export interface CreationReceipt {
  operation: CreationOperation;
  revision: 0;
}
export interface CreationValidation {
  verifyCatalogue: CatalogueVerifier;
  validateCandidate: (candidate: CreationCandidate) => void;
}
function budget(value: unknown) {
  try {
    assertJsonBudget(value, 600000, 4096);
  } catch {
    throw new Error("creation-operation-too-large");
  }
}
function receipt(value: unknown, operation: CreationOperation): CreationReceipt {
  const data = object(value);
  if (
    Object.keys(data).length !== 2 ||
    data.revision !== 0 ||
    !equal(data.operation, operation)
  )
    throw new Error("intent-mismatch");
  return frozen({ operation, revision: 0 });
}
/** Atomic guided creation; restored envelopes can only inspect their exact receipt. */
export function createCreationRepository(
  db: Firestore,
  session: SessionController,
  validation: CreationValidation
) {
  if (
    typeof validation.verifyCatalogue !== "function" ||
    typeof validation.validateCandidate !== "function"
  )
    throw new Error("invalid-creation-validator");
  const tickets = new Map<string, { operation: CreationOperation; fence: () => void }>();
  const owner = () => {
    const uid = session.scope().uid;
    if (!uid) throw new Error("permission-denied");
    return identityId(uid);
  };
  const online = () => {
    if ((globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine === false)
      throw new Error("offline");
  };
  const live = (op: CreationOperation) => {
    const ticket = tickets.get(op.opId);
    if (!ticket) throw new Error("stale-session");
    ticket.fence();
    if (!equal(ticket.operation, op)) throw new Error("intent-mismatch");
    if (op.uid !== owner() || !equal(op.scope, session.scope()))
      throw new Error("stale-session");
  };
  function validate(op: CreationOperation): LibraryVersion[] {
    budget(op);
    if (
      Object.keys(op).length !== 8 ||
      (op as { kind: unknown }).kind !== "character-create" ||
      op.baseRevision !== 0 ||
      op.uid !== owner() ||
      !equal(op.authority, {
        characterRevision: null,
        assignment: null,
        campaignRevision: null,
      }) ||
      Object.keys(op.output).length !== 4
    )
      throw new Error("invalid-creation");
    const output = op.output,
      character = parseCharacter(output.character),
      ref = { ownerUid: character.ownerUid, id: character.id },
      last = { uid: op.uid, opId: op.opId };
    const marker = object(character.sheet.build.creation);
    if (
      !equal(ref, op.character) ||
      character.ownerUid !== op.uid ||
      character.revision !== 0 ||
      character.level !== 1 ||
      character.currentAssignment !== null ||
      character.portraitPath !== null ||
      marker.schema !== 1 ||
      marker.kind !== "guided" ||
      marker.operationId !== op.opId
    )
      throw new Error("invalid-creation");
    const origins = parseOriginBuild(output.origins, validation.verifyCatalogue),
      classes = parseClassBuild(output.classes, validation.verifyCatalogue),
      loadout = parseInitialLoadout(output.loadout, validation.verifyCatalogue);
    for (const aggregate of [origins, classes, loadout])
      if (
        !equal(aggregate.character, ref) ||
        aggregate.revision !== 1 ||
        !equal(aggregate.lastOperation, last)
      )
        throw new Error("invalid-creation");
    const sources = new Map<string, DefinitionSnapshot>();
    const source = (snapshot: DefinitionSnapshot) => {
      const id = sourceIdentity(snapshot),
        previous = sources.get(id);
      if (previous) {
        if (!equal(previous, snapshot)) throw new Error("incompatible-source");
        return;
      }
      if (isLibrarySnapshot(snapshot) && snapshot.ownerUid !== op.uid)
        throw new Error("permission-denied");
      if (conformAcquisitionSnapshot(snapshot, validation.verifyCatalogue).length)
        throw new Error("incompatible-source");
      sources.set(id, snapshot);
    };
    for (const selection of [
      ...Object.values(origins.selections),
      ...Object.values(classes.acquisitions),
    ]) {
      source(selection.snapshot);
      for (const selected of Object.values(selection.resolvedChoices ?? {}))
        for (const snapshot of selected) source(snapshot);
    }
    for (const snapshot of Object.values(loadout.sources)) source(snapshot);
    for (const item of Object.values(loadout.instances)) {
      if (
        !isInitialInstanceId(item.id) ||
        item.revision !== 1 ||
        !equal(item.lastOperation, last)
      )
        throw new Error("invalid-creation");
      if (!isBundledSnapshot(item.snapshot)) source(item.snapshot);
    }
    const checked: unknown = validation.validateCandidate(
      frozen(structuredClone(output))
    );
    if (checked !== undefined) throw new Error("invalid-creation-validator");
    return [...sources.values()].filter(isLibrarySnapshot);
  }
  const api = {
    intent(candidate: CreationCandidate): CreationOperation {
      budget(candidate);
      const uid = owner(),
        fence = session.ticket(),
        output = structuredClone(candidate),
        opId = crypto.randomUUID(),
        last = { uid, opId };
      const marker = object(output.character.sheet.build.creation);
      if (marker.schema !== 1 || marker.kind !== "guided")
        throw new Error("invalid-creation");
      marker.operationId = opId;
      for (const aggregate of [output.origins, output.classes, output.loadout])
        aggregate.lastOperation = last;
      for (const item of Object.values(output.loadout.instances))
        item.lastOperation = last;
      const operation: CreationOperation = frozen({
        kind: "character-create",
        uid,
        opId,
        scope: session.scope(),
        baseRevision: 0,
        authority: { characterRevision: null, assignment: null, campaignRevision: null },
        character: { ownerUid: output.character.ownerUid, id: output.character.id },
        output,
      });
      validate(operation);
      fence();
      tickets.set(opId, { operation, fence });
      session.track(() => tickets.delete(opId));
      return operation;
    },
    async reconcile(operation: CreationOperation): Promise<CreationReceipt | null> {
      const ticket = session.ticket();
      const fence = () => {
        ticket();
        if (operation.uid !== owner() || !equal(operation.scope, session.scope()))
          throw new Error("stale-session");
        online();
      };
      fence();
      validate(operation);
      fence();
      const result = await getDocFromServer(doc(db, receiptPath(operation)));
      fence();
      return result.exists() ? receipt(result.data(), operation) : null;
    },
    async commit(
      operation: CreationOperation,
      check: () => void = () => {}
    ): Promise<CreationReceipt> {
      const fence = () => {
        live(operation);
        check();
        live(operation);
        online();
      };
      fence();
      const sources = validate(operation);
      fence();
      const result = await session.runWrite(() =>
        runTransaction(
          db,
          async (tx) => {
            fence();
            const read = async (path: string) => {
              const result = await tx.get(doc(db, path));
              fence();
              return result;
            };
            const previous = await read(receiptPath(operation));
            fence();
            if (previous.exists()) return receipt(previous.data(), operation);
            const user = await read("users/" + operation.uid);
            fence();
            if (!user.exists() || user.data().status === "blocked")
              throw new Error("permission-denied");
            const root = characterPath(operation.character),
              paths = [
                root,
                root + "/origins/build",
                root + "/classes/build",
                initialLoadoutPath(operation.character),
              ];
            for (const path of paths) {
              const current = await read(path);
              fence();
              if (current.exists()) throw new Error("stale-base");
            }
            for (const source of sources) {
              const current = await read(
                libraryPath({ ownerUid: operation.uid, id: source.entryId }) +
                  "/versions/" +
                  String(source.version)
              );
              fence();
              if (!current.exists() || !equal(current.data(), source))
                throw new Error("incompatible-source");
            }
            const next: CreationReceipt = { operation, revision: 0 };
            fence();
            tx.set(doc(db, root), operation.output.character);
            tx.set(doc(db, root + "/origins/build"), operation.output.origins);
            tx.set(doc(db, root + "/classes/build"), operation.output.classes);
            tx.set(
              doc(db, initialLoadoutPath(operation.character)),
              operation.output.loadout
            );
            tx.set(doc(db, receiptPath(operation)), next);
            return frozen(next);
          },
          { maxAttempts: 1 }
        )
      );
      fence();
      return result;
    },
  };
  return api;
}
export type CreationRepository = ReturnType<typeof createCreationRepository>;
