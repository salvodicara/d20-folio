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
import { dryRunMigration } from "../identity/migration";
import type { SessionController } from "../identity/session";
import { assertJsonBudget } from "../shared/json-budget";
import { equal, receiptPath, type Envelope } from "../shared/model";
import { analyzeImport, reviewImport, type ImportReview } from "./import-review";

export interface InitialImportOperation extends Envelope {
  kind: "character-import";
  character: CharacterRef;
  sourceHash: string;
  output: FolioCharacter;
  review: ImportReview;
}
export interface ImportReviewOperation extends Envelope {
  kind: "import-review";
  character: CharacterRef;
  sourceHash: string;
  review: ImportReview;
  base: ImportReconciliation | null;
}
export type ImportOperation = InitialImportOperation | ImportReviewOperation;
export interface ImportReceipt {
  operation: ImportOperation;
  revision: number;
}
export function parseImportReconciliation(
  value: unknown,
  character: CharacterRef
): ImportReconciliation {
  try {
    const data = object(value);
    const categories = [
      "origins",
      "classes",
      "abilities",
      "equipment",
      "spells",
      "custom",
      "overrides",
      "state",
      "unrecognized",
    ];
    const ids = (v: unknown): v is string[] =>
      Array.isArray(v) &&
      v.every((id) => typeof id === "string" && categories.includes(id)) &&
      new Set(v).size === v.length;
    if (
      Object.keys(data).length !== 9 ||
      data.schema !== 1 ||
      data.sourceSchema !== 3 ||
      !equal(data.character, character) ||
      typeof data.sourceHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(data.sourceHash) ||
      !Number.isSafeInteger(data.revision) ||
      Number(data.revision) < 0 ||
      typeof data.declaredEdition !== "string" ||
      !["2014", "2024", "unknown"].includes(data.declaredEdition) ||
      !ids(data.reviewed) ||
      !ids(data.unresolved)
    )
      throw new Error();
    const unresolved = data.unresolved;
    if (data.reviewed.some((id) => !unresolved.includes(id))) throw new Error();
    const last = object(data.lastOperation);
    if (
      Object.keys(last).length !== 2 ||
      last.uid !== character.ownerUid ||
      typeof last.opId !== "string"
    )
      throw new Error();
    identityId(last.opId);
    return frozen(structuredClone(data) as unknown as ImportReconciliation);
  } catch {
    throw new Error("incompatible-import-review");
  }
}
export interface ImportReconciliation extends ImportReview {
  schema: 1;
  character: CharacterRef;
  sourceHash: string;
  sourceSchema: 3;
  revision: number;
  lastOperation: { uid: string; opId: string };
}
export function importReviewPath(character: CharacterRef) {
  return characterPath(character) + "/reconciliation/import";
}
function exactReceipt(value: unknown, operation: ImportOperation): ImportReceipt {
  if (
    !value ||
    typeof value !== "object" ||
    !("operation" in value) ||
    !("revision" in value) ||
    value.revision !==
      (operation.kind === "character-import" ? 0 : operation.baseRevision + 1) ||
    !equal(value.operation, operation) ||
    Object.keys(value).length !== 2
  )
    throw new Error("intent-mismatch");
  return frozen({
    operation,
    revision: operation.kind === "character-import" ? 0 : operation.baseRevision + 1,
  });
}

/** Private bytes are retained by the live intent, never copied into its receipt. */
export function createImportRepository(db: Firestore, session: SessionController) {
  const intents = new Map<
    string,
    { operation: ImportOperation; original: string; fence: () => void }
  >();
  function owner() {
    const uid = session.scope().uid;
    if (!uid) throw new Error("permission-denied");
    return identityId(uid);
  }
  function live(operation: ImportOperation) {
    const intent = intents.get(operation.opId);
    if (!intent) throw new Error("stale-session");
    intent.fence();
    if (!equal(intent.operation, operation)) throw new Error("intent-mismatch");
    if (owner() !== operation.uid || !equal(session.scope(), operation.scope))
      throw new Error("stale-session");
    return intent;
  }
  function budget(operation: ImportOperation) {
    try {
      assertJsonBudget(operation, 600_000);
    } catch {
      throw new Error("import-operation-too-large");
    }
  }
  async function prepare(original: string, review: ImportReview) {
    const uid = owner(),
      fence = session.ticket();
    const analysis = analyzeImport(original);
    if (!equal(reviewImport(analysis, review.declaredEdition, review.reviewed), review))
      throw new Error("invalid-import-review");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(original)
    );
    fence();
    const sourceHash = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    return { uid, fence, sourceHash };
  }
  const api = {
    async intent(
      original: string,
      review: ImportReview
    ): Promise<InitialImportOperation> {
      const { uid, fence, sourceHash } = await prepare(original, review);
      fence();
      const character = { ownerUid: uid, id: "import-" + sourceHash };
      const output = dryRunMigration(original, character).character;
      const operation: InitialImportOperation = frozen({
        kind: "character-import",
        uid,
        opId: crypto.randomUUID(),
        scope: session.scope(),
        baseRevision: 0,
        authority: { characterRevision: null, assignment: null, campaignRevision: null },
        character,
        sourceHash,
        output,
        review: structuredClone(review),
      });
      budget(operation);
      intents.set(operation.opId, { operation, original, fence });
      session.track(() => intents.delete(operation.opId));
      return operation;
    },
    async read(character: CharacterRef): Promise<ImportReconciliation | null> {
      owner();
      const fence = session.ticket();
      const result = await getDocFromServer(doc(db, importReviewPath(character)));
      fence();
      return result.exists() ? parseImportReconciliation(result.data(), character) : null;
    },
    async reviewIntent(
      character: FolioCharacter,
      original: string,
      base: ImportReconciliation | null,
      review: ImportReview
    ): Promise<ImportReviewOperation> {
      if (character.ownerUid !== owner()) throw new Error("permission-denied");
      parseCharacter(character);
      const { uid, fence, sourceHash } = await prepare(original, review);
      fence();
      const target = { ownerUid: character.ownerUid, id: character.id };
      if (base && (!equal(base.character, target) || base.sourceHash !== sourceHash))
        throw new Error("invalid-import-review");
      if (base) parseImportReconciliation(base, target);
      const operation: ImportReviewOperation = frozen({
        kind: "import-review",
        uid,
        opId: crypto.randomUUID(),
        scope: session.scope(),
        baseRevision: base?.revision ?? 0,
        authority: {
          characterRevision: character.revision,
          assignment: character.currentAssignment,
          campaignRevision: null,
        },
        character: target,
        sourceHash,
        review: structuredClone(review),
        base: structuredClone(base),
      });
      budget(operation);
      intents.set(operation.opId, { operation, original, fence });
      session.track(() => intents.delete(operation.opId));
      return operation;
    },
    async reconcile(operation: ImportOperation): Promise<ImportReceipt | null> {
      if (operation.uid !== owner() || operation.character.ownerUid !== operation.uid)
        throw new Error("permission-denied");
      const fence = session.ticket();
      const result = await getDocFromServer(doc(db, receiptPath(operation)));
      fence();
      return result.exists() ? exactReceipt(result.data(), operation) : null;
    },
    async commit(
      operation: ImportOperation,
      check: () => void = () => {}
    ): Promise<ImportReceipt> {
      const intent = live(operation);
      budget(operation);
      const fence = () => {
        live(operation);
        check();
      };
      fence();
      if (
        (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine === false
      )
        throw new Error("offline");
      const plan = dryRunMigration(intent.original, operation.character);
      if (
        operation.kind === "character-import" &&
        !equal(plan.character, operation.output)
      )
        throw new Error("intent-mismatch");
      const revision =
        operation.kind === "character-import" ? 0 : operation.baseRevision + 1;
      const next: ImportReconciliation = {
        ...operation.review,
        schema: 1,
        character: operation.character,
        sourceHash: operation.sourceHash,
        sourceSchema: 3,
        revision,
        lastOperation: { uid: operation.uid, opId: operation.opId },
      };
      const result = await session.runWrite(() =>
        runTransaction(
          db,
          async (tx) => {
            fence();
            const receiptRef = doc(db, receiptPath(operation));
            const previous = await tx.get(receiptRef);
            if (previous.exists()) {
              fence();
              return exactReceipt(previous.data(), operation);
            }
            const user = await tx.get(doc(db, "users/" + operation.uid));
            if (!user.exists() || user.data().status === "blocked")
              throw new Error("permission-denied");
            const parent = doc(db, characterPath(operation.character));
            const archive = doc(
              db,
              characterPath(operation.character) + "/private/import"
            );
            const notes = doc(db, characterPath(operation.character) + "/private/notes");
            const reviewRef = doc(db, importReviewPath(operation.character));
            const existing = await tx.get(parent),
              oldArchive = await tx.get(archive),
              oldNotes = await tx.get(notes),
              oldReview = await tx.get(reviewRef);
            fence();
            if (
              operation.kind === "character-import" &&
              (existing.exists() ||
                oldArchive.exists() ||
                oldNotes.exists() ||
                oldReview.exists())
            )
              throw new Error("stale-base");
            if (operation.kind === "import-review") {
              if (
                !existing.exists() ||
                !oldArchive.exists() ||
                !equal(oldArchive.data(), plan.archive) ||
                !equal(oldReview.exists() ? oldReview.data() : null, operation.base)
              )
                throw new Error("stale-base");
              const current = parseCharacter(existing.data());
              if (
                !equal(operation.authority, {
                  characterRevision: current.revision,
                  assignment: current.currentAssignment,
                  campaignRevision: null,
                })
              )
                throw new Error("stale-authority");
            }
            const receipt: ImportReceipt = { operation, revision };
            if (operation.kind === "character-import") {
              tx.set(parent, plan.character);
              tx.set(archive, plan.archive);
              tx.set(notes, { text: plan.privateNotes });
            }
            tx.set(reviewRef, next);
            tx.set(receiptRef, receipt);
            return frozen(receipt);
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
export type ImportRepository = ReturnType<typeof createImportRepository>;
