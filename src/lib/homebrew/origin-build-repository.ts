import { isLibrarySnapshot } from "./sources";
import type { ChoiceResolutionContext } from "./choice-pools";
import {
  doc,
  getDocFromServer,
  onSnapshot,
  runTransaction,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import {
  characterPath,
  frozen,
  identityId,
  parseCharacter,
  type CharacterRef,
  type FolioCharacter,
} from "../identity/model";
import type { SessionController } from "../identity/session";
import { libraryPath } from "../library/model";
import { serializeLibraryRecovery } from "../library/recovery";
import { equal, receiptPath, type Envelope } from "../shared/model";
import {
  assertOriginJsonBudget,
  parseOriginBuild,
  validateOriginSelection,
  type OriginBuild,
  type OriginSelection,
} from "./origin-build";

export interface OriginBuildOperation extends Envelope {
  kind: "origin-build";
  character: CharacterRef;
  targetId: string;
  predecessorId: string | null;
  base: OriginBuild | null;
  selections: Record<string, OriginSelection>;
}
export interface OriginBuildReceipt {
  operation: OriginBuildOperation;
  revision: number;
}
export interface OriginBuildIssue {
  path: string;
  original: string;
  error: "incompatible-origin-build";
}
export interface OriginBuildRepository {
  read(character: CharacterRef): Promise<OriginBuild | null>;
  watch(
    character: CharacterRef,
    onData: (build: OriginBuild | null) => void,
    onError: (error: Error) => void
  ): () => void;
  watchIssues(listener: (issues: OriginBuildIssue[]) => void): () => void;
  saveIntent(
    character: FolioCharacter,
    base: OriginBuild | null,
    targetId: string,
    selection: OriginSelection | null
  ): OriginBuildOperation;
  commit(
    operation: OriginBuildOperation,
    check?: () => void
  ): Promise<OriginBuildReceipt>;
  reconcile(operation: OriginBuildOperation): Promise<OriginBuildReceipt | null>;
}
export function originBuildPath(character: CharacterRef) {
  return characterPath(character) + "/origins/build";
}
/** Includes repeated before/next snapshots; count UTF8 rather than JavaScript code units. */
export function assertOriginBuildBudget(value: unknown, bytes = 180000) {
  try {
    assertOriginJsonBudget(value, bytes);
  } catch {
    throw new Error("origin-build-too-large");
  }
}
export function createOriginBuildRepository(
  db: Firestore,
  session: SessionController,
  context: ChoiceResolutionContext = {}
): OriginBuildRepository {
  const tickets = new Map<
    string,
    { fence: () => void; operation: OriginBuildOperation }
  >();
  const issues = new Map<string, OriginBuildIssue>();
  const listeners = new Set<(issues: OriginBuildIssue[]) => void>();
  const uid = () => {
    const value = session.scope().uid;
    if (!value) throw new Error("permission-denied");
    return value;
  };
  const online = () => {
    if ((globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine === false)
      throw new Error("offline");
  };
  const check = (op?: OriginBuildOperation) => {
    uid();
    if (!op) return;
    const ticket = tickets.get(op.opId);
    if (!ticket) throw new Error("stale-session");
    ticket.fence();
    if (!equal(ticket.operation, op)) throw new Error("intent-mismatch");
    if (op.uid !== uid() || !equal(op.scope, session.scope()))
      throw new Error("stale-session");
  };
  let epoch: (() => void) | null = null;
  function ensureIssues() {
    try {
      epoch?.();
      if (epoch) return;
    } catch {
      /* New scope. */
    }
    issues.clear();
    listeners.clear();
    epoch = session.ticket();
    session.track(() => {
      issues.clear();
      listeners.clear();
      epoch = null;
    });
  }
  function record(
    character: CharacterRef,
    snapshot: DocumentSnapshot
  ): OriginBuild | null {
    ensureIssues();
    const path = originBuildPath(character);
    try {
      const value = snapshot.exists()
        ? parseOriginBuild(snapshot.data(), context.verifyCatalogue ?? (() => false))
        : null;
      if (
        value &&
        !equal(value.character, { ownerUid: character.ownerUid, id: character.id })
      )
        throw new Error("incompatible-origin-build");
      issues.delete(path);
      for (const listener of listeners) listener([...issues.values()]);
      return value;
    } catch {
      issues.set(path, {
        path,
        original: serializeLibraryRecovery(snapshot.data()),
        error: "incompatible-origin-build",
      });
      for (const listener of listeners) listener([...issues.values()]);
      throw new Error("incompatible-origin-build");
    }
  }
  function nextBuild(op: OriginBuildOperation) {
    const value = {
      schema: 1,
      character: op.character,
      revision: op.baseRevision + 1,
      selections: op.selections,
      lastOperation: { uid: op.uid, opId: op.opId },
    };
    assertOriginBuildBudget(value);
    return parseOriginBuild(value, context.verifyCatalogue ?? (() => false));
  }
  function receipt(value: unknown, op: OriginBuildOperation): OriginBuildReceipt {
    const r = value as OriginBuildReceipt | null;
    if (
      !r ||
      !equal(r.operation, op) ||
      r.revision !== op.baseRevision + 1 ||
      Object.keys(r).length !== 2
    )
      throw new Error("intent-mismatch");
    return frozen(structuredClone(r));
  }
  const api: OriginBuildRepository = {
    watchIssues(listener) {
      ensureIssues();
      const callback = session.guard(listener);
      listeners.add(callback);
      callback([...issues.values()]);
      return session.track(() => listeners.delete(callback));
    },
    async read(character) {
      check();
      const done = session.ticket();
      const s = await getDocFromServer(doc(db, originBuildPath(character)));
      done();
      return record(character, s);
    },
    watch(character, onData, onError) {
      check();
      return session.track(
        onSnapshot(
          doc(db, originBuildPath(character)),
          session.guard((s: DocumentSnapshot) => {
            try {
              onData(record(character, s));
            } catch (e) {
              onError(e as Error);
            }
          }),
          session.guard(onError)
        )
      );
    },
    saveIntent(character, base, targetId, selection) {
      check();
      parseCharacter(character);
      identityId(targetId);
      const ref = { ownerUid: character.ownerUid, id: character.id };
      if (ref.ownerUid !== uid()) throw new Error("permission-denied");
      if (base) {
        parseOriginBuild(base, context.verifyCatalogue ?? (() => false));
        if (!equal(base.character, ref)) throw new Error("invalid-operation");
      }
      const previous = base?.selections[targetId];
      if (selection) {
        if (
          selection.id !== targetId ||
          selection.ordinal !==
            (previous?.ordinal ??
              Math.max(
                -1,
                ...Object.values(base?.selections ?? {}).map((s) => s.ordinal)
              ) + 1)
        )
          throw new Error("invalid-operation");
        if (
          !equal(previous?.snapshot, selection.snapshot) &&
          (!isLibrarySnapshot(selection.snapshot) ||
            selection.snapshot.ownerUid !== uid())
        )
          throw new Error("permission-denied");
        if (!equal(previous?.resolvedChoices ?? {}, selection.resolvedChoices ?? {}))
          throw new Error("invalid-operation");
      } else if (!previous) throw new Error("invalid-operation");
      const selections = selection
        ? { ...base?.selections, [targetId]: selection }
        : Object.fromEntries(
            Object.entries(base?.selections ?? {}).filter(([id]) => id !== targetId)
          );
      if (equal(base?.selections, selections)) throw new Error("invalid-operation");
      const predecessorId =
        Object.values(base?.selections ?? {}).reduce<OriginSelection | null>(
          (latest, root) => (!latest || root.ordinal > latest.ordinal ? root : latest),
          null
        )?.id ?? null;
      const op: OriginBuildOperation = frozen(
        structuredClone({
          kind: "origin-build",
          character: ref,
          targetId,
          predecessorId,
          base,
          selections,
          opId: crypto.randomUUID(),
          uid: uid(),
          scope: session.scope(),
          baseRevision: base?.revision ?? 0,
          authority: {
            characterRevision: character.revision,
            assignment: character.currentAssignment,
            campaignRevision: null,
          },
        })
      );
      const next = nextBuild(op);
      assertOriginBuildBudget(op, 600000);
      if (validateOriginSelection(character, next, context).length > 0)
        throw new Error("invalid-origin-selection");
      tickets.set(op.opId, { fence: session.ticket(), operation: op });
      session.track(() => tickets.delete(op.opId));
      return op;
    },
    async reconcile(op) {
      const done = session.ticket();
      const fence = () => {
        done();
        check();
        if (op.uid !== uid() || !equal(op.scope, session.scope()))
          throw new Error("stale-session");
        online();
      };
      fence();
      const s = await getDocFromServer(doc(db, receiptPath(op)));
      fence();
      return s.exists() ? receipt(s.data(), op) : null;
    },
    async commit(op, localCheck = () => {}) {
      const done = session.ticket();
      const fence = () => {
        done();
        check(op);
        localCheck();
        check(op);
        online();
      };
      fence();
      assertOriginBuildBudget(op, 600000);
      const next = nextBuild(op);
      try {
        const result = await runTransaction(
          db,
          async (tx) => {
            fence();
            const rp = doc(db, receiptPath(op));
            const old = await tx.get(rp);
            if (old.exists()) {
              fence();
              return receipt(old.data(), op);
            }
            const user = await tx.get(doc(db, "users/" + op.uid));
            if (!user.exists() || user.data().status === "blocked")
              throw new Error("permission-denied");
            const c = parseCharacter(
              (await tx.get(doc(db, characterPath(op.character)))).data()
            );
            if (
              !equal(op.authority, {
                characterRevision: c.revision,
                assignment: c.currentAssignment,
                campaignRevision: null,
              })
            )
              throw new Error("stale-base");
            const ref = doc(db, originBuildPath(op.character));
            const current = await tx.get(ref);
            if (!equal(current.exists() ? current.data() : null, op.base))
              throw new Error("stale-base");
            const selection = op.selections[op.targetId];
            if (
              selection &&
              !equal(op.base?.selections[op.targetId]?.snapshot, selection.snapshot)
            ) {
              const v = selection.snapshot;
              if (!isLibrarySnapshot(v)) throw new Error("invalid-operation");
              const source = await tx.get(
                doc(
                  db,
                  libraryPath({ ownerUid: op.uid, id: v.entryId }) +
                    "/versions/" +
                    String(v.version)
                )
              );
              if (!source.exists() || !equal(source.data(), v))
                throw new Error("invalid-operation");
            }
            const r = { operation: op, revision: next.revision };
            fence();
            tx.set(ref, next);
            tx.set(rp, r);
            return frozen(r);
          },
          { maxAttempts: 1 }
        );
        fence();
        return result;
      } catch (error) {
        fence();
        if (
          (error as { code?: string }).code === "permission-denied" ||
          (error instanceof Error && error.message === "stale-base")
        ) {
          const r = await api.reconcile(op);
          fence();
          if (r) return r;
        }
        throw error;
      }
    },
  };
  return api;
}
