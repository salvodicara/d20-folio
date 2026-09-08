import { assertJsonBudget } from "../shared/json-budget";
import { isLibrarySnapshot, type CatalogueVerifier } from "./sources";
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  runTransaction,
  type Firestore,
  type QuerySnapshot,
  type DocumentSnapshot,
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
import { libraryPath, type LibraryVersion } from "../library/model";
import { serializeLibraryRecovery } from "../library/recovery";
import { equal, receiptPath } from "../shared/model";
import { conformDefinition } from "./conformance";
import {
  DEFAULT_INSTANCE_STATE,
  isInitialInstanceId,
  isBundledSnapshot,
  initialLoadoutPath,
  parseInitialLoadout,
  parseInitialSnapshot,
  updateInitialLoadoutInstance,
  type InstanceSnapshot,
  type InitialLoadout,
  instancePath,
  materializeInstance,
  parseInstance,
  parseInstanceState,
  parseInstanceVersion,
  type HomebrewInstance,
  type InstanceIssue,
  type InstanceOperation,
  type InstanceReceipt,
  type InstanceRepository,
  type InstanceState,
} from "./instances";
function requireReusable(snapshot: LibraryVersion) {
  if (
    conformDefinition(snapshot.definition).some((issue) => issue.severity === "invalid")
  )
    throw new Error("invalid-operation");
}
export function createInstanceRepository(
  db: Firestore,
  session: SessionController,
  verifyCatalogue?: CatalogueVerifier
): InstanceRepository {
  const tickets = new Map<string, { fence: () => void; operation: InstanceOperation }>();
  const initialBases = new Map<string, InitialLoadout>();
  const sources = new Map<string, InstanceIssue[]>();
  const listeners = new Set<(issues: InstanceIssue[]) => void>();
  const uid = () => {
    const u = session.scope().uid;
    if (!u) throw new Error("permission-denied");
    return u;
  };
  const online = () => {
    if ((globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine === false)
      throw new Error("offline");
  };
  function check(op?: InstanceOperation) {
    uid();
    if (op) {
      const ticket = tickets.get(op.opId);
      if (!ticket) throw new Error("stale-session");
      ticket.fence();
      if (!equal(ticket.operation, op)) throw new Error("intent-mismatch");
      if (op.uid !== uid() || !equal(op.scope, session.scope()))
        throw new Error("stale-session");
    }
  }
  let epoch: (() => void) | null = null;
  function ensureIssues() {
    try {
      epoch?.();
      if (epoch) return;
    } catch {
      /* New scope. */
    }
    sources.clear();
    initialBases.clear();
    listeners.clear();
    epoch = session.ticket();
    session.track(() => {
      sources.clear();
      initialBases.clear();
      listeners.clear();
      epoch = null;
    });
  }
  function records(character: CharacterRef, s: QuerySnapshot) {
    ensureIssues();
    const issues: InstanceIssue[] = [],
      values: HomebrewInstance[] = [];
    for (const d of s.docs) {
      try {
        const i = parseInstance(d.data(), undefined, verifyCatalogue ?? (() => false));
        if (
          !equal(i.character, { ownerUid: character.ownerUid, id: character.id }) ||
          i.id !== d.id
        )
          throw new Error("incompatible-instance");
        values.push(i);
      } catch {
        issues.push({
          path: d.ref.path,
          original: serializeLibraryRecovery(d.data()),
          error: "incompatible-instance",
        });
      }
    }
    sources.set(characterPath(character) + "/homebrew", issues);
    for (const listener of listeners) listener([...sources.values()].flat());
    return values;
  }
  function initialRecords(
    character: CharacterRef,
    snapshot: DocumentSnapshot
  ): HomebrewInstance[] {
    ensureIssues();
    const path = initialLoadoutPath(character);
    const issues: InstanceIssue[] = [];
    let values: HomebrewInstance[] = [];
    initialBases.delete(path);
    if (snapshot.exists()) {
      try {
        const group = parseInitialLoadout(snapshot.data(), verifyCatalogue);
        if (!equal(group.character, { ownerUid: character.ownerUid, id: character.id }))
          throw new Error("incompatible-instance");
        initialBases.set(path, group);
        values = Object.values(group.instances);
      } catch {
        issues.push({
          path,
          original: serializeLibraryRecovery(snapshot.data()),
          error: "incompatible-instance",
        });
      }
    }
    sources.set(path, issues);
    for (const listener of listeners) listener([...sources.values()].flat());
    return values;
  }
  function intent(
    kind: InstanceOperation["kind"],
    character: FolioCharacter,
    base: HomebrewInstance | null,
    snapshot: InstanceSnapshot,
    state: InstanceState,
    id: string
  ) {
    check();
    parseCharacter(character);
    identityId(id);
    const grouped = isInitialInstanceId(id);
    const initialBase = grouped
      ? initialBases.get(initialLoadoutPath(character))
      : undefined;
    if (grouped) {
      if (
        kind === "homebrew-add" ||
        !initialBase ||
        !equal(initialBase.instances[id], base)
      )
        throw new Error("invalid-operation");
      parseInitialSnapshot(snapshot, initialBase.sources, verifyCatalogue);
    } else parseInstanceVersion(snapshot, verifyCatalogue ?? (() => false));
    if (kind !== "homebrew-state") {
      if (isBundledSnapshot(snapshot) || !isLibrarySnapshot(snapshot))
        throw new Error("invalid-operation");
      requireReusable(snapshot);
    }
    parseInstanceState(state);
    const ref = { ownerUid: character.ownerUid, id: character.id };
    if (
      character.ownerUid !== uid() ||
      (!isBundledSnapshot(snapshot) &&
        isLibrarySnapshot(snapshot) &&
        snapshot.ownerUid !== uid())
    )
      throw new Error("permission-denied");
    if (base) {
      parseInstance(base, initialBase?.sources, verifyCatalogue);
      if (!equal(base.character, ref) || base.id !== id)
        throw new Error("invalid-operation");
      if (
        kind === "homebrew-update" &&
        (isBundledSnapshot(base.snapshot) ||
          isBundledSnapshot(snapshot) ||
          !isLibrarySnapshot(base.snapshot) ||
          !isLibrarySnapshot(snapshot) ||
          base.snapshot.entryId !== snapshot.entryId)
      )
        throw new Error("invalid-operation");
    }
    const opId = crypto.randomUUID();
    const operation = frozen(
      structuredClone({
        kind,
        character: ref,
        targetId: id,
        base,
        snapshot,
        state,
        opId,
        uid: uid(),
        scope: session.scope(),
        baseRevision: initialBase?.revision ?? base?.revision ?? 0,
        ...(initialBase ? { initialBase } : {}),
        authority: {
          characterRevision: character.revision,
          assignment: character.currentAssignment,
          campaignRevision: null,
        },
      })
    ) as InstanceOperation;
    assertJsonBudget(operation, 600000, 4096);
    tickets.set(opId, { fence: session.ticket(), operation });
    session.track(() => tickets.delete(opId));
    return operation;
  }
  function receipt(value: unknown, op: InstanceOperation) {
    const r = value as InstanceReceipt | null;
    if (!r || !equal(r.operation, op) || r.revision !== op.baseRevision + 1)
      throw new Error("intent-mismatch");
    return frozen(structuredClone(r));
  }
  const api: InstanceRepository = {
    watchIssues(listener) {
      ensureIssues();
      const callback = session.guard(listener);
      listeners.add(callback);
      callback([...sources.values()].flat());
      return session.track(() => listeners.delete(callback));
    },
    async list(character) {
      check();
      const done = session.ticket();
      const [individual, grouped] = await Promise.all([
        getDocsFromServer(collection(db, characterPath(character) + "/homebrew")),
        getDocFromServer(doc(db, initialLoadoutPath(character))),
      ]);
      done();
      return [...records(character, individual), ...initialRecords(character, grouped)];
    },
    watch(character, onData, onError) {
      check();
      let individual: HomebrewInstance[] | null = null;
      let grouped: HomebrewInstance[] | null = null;
      const emit = () => {
        if (individual && grouped) onData([...individual, ...grouped]);
      };
      const stopIndividual = onSnapshot(
        collection(db, characterPath(character) + "/homebrew"),
        session.guard((snapshot: QuerySnapshot) => {
          try {
            individual = records(character, snapshot);
            emit();
          } catch (error) {
            onError(error as Error);
          }
        }),
        session.guard(onError)
      );
      const stopGrouped = onSnapshot(
        doc(db, initialLoadoutPath(character)),
        session.guard((snapshot: DocumentSnapshot) => {
          try {
            grouped = initialRecords(character, snapshot);
            emit();
          } catch (error) {
            onError(error as Error);
          }
        }),
        session.guard(onError)
      );
      return session.track(() => {
        stopIndividual();
        stopGrouped();
      });
    },
    addIntent: (c, v, s = DEFAULT_INSTANCE_STATE, id = crypto.randomUUID()) =>
      intent("homebrew-add", c, null, v, s, id),
    updateIntent: (c, b, v) => intent("homebrew-update", c, b, v, b.state, b.id),
    stateIntent: (c, b, s) => intent("homebrew-state", c, b, b.snapshot, s, b.id),
    async reconcile(op) {
      // Read-only recovery may use a persisted envelope after reload. It grants no
      // write ticket: an absent receipt never authorizes replay of that envelope.
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
      identityId(op.opId);
      const grouped = isInitialInstanceId(op.targetId);
      if (grouped) {
        if (
          op.kind === "homebrew-add" ||
          !op.initialBase ||
          !equal(op.initialBase.instances[op.targetId], op.base) ||
          !equal(op.initialBase.character, op.character)
        )
          throw new Error("invalid-operation");
        parseInitialLoadout(op.initialBase, verifyCatalogue);
        parseInitialSnapshot(op.snapshot, op.initialBase.sources, verifyCatalogue);
      } else {
        instancePath(op.character, op.targetId);
        if (op.initialBase) throw new Error("invalid-operation");
        parseInstanceVersion(op.snapshot, verifyCatalogue ?? (() => false));
      }
      if (op.kind !== "homebrew-state") {
        if (isBundledSnapshot(op.snapshot) || !isLibrarySnapshot(op.snapshot))
          throw new Error("invalid-operation");
        requireReusable(op.snapshot);
      }
      parseInstanceState(op.state);
      if (
        op.character.ownerUid !== op.uid ||
        (!isBundledSnapshot(op.snapshot) &&
          isLibrarySnapshot(op.snapshot) &&
          op.snapshot.ownerUid !== op.uid)
      )
        throw new Error("permission-denied");
      if (
        op.kind === "homebrew-add"
          ? op.base !== null || op.baseRevision !== 0
          : !op.base || op.baseRevision !== (op.initialBase?.revision ?? op.base.revision)
      )
        throw new Error("invalid-operation");
      if (
        op.kind === "homebrew-update" &&
        (!equal(op.state, op.base?.state) ||
          isBundledSnapshot(op.snapshot) ||
          !op.base ||
          isBundledSnapshot(op.base.snapshot) ||
          op.snapshot.entryId !== op.base.snapshot.entryId)
      )
        throw new Error("invalid-operation");
      if (op.kind === "homebrew-state" && !equal(op.snapshot, op.base?.snapshot))
        throw new Error("invalid-operation");
      try {
        const result = await runTransaction(db, async (tx) => {
          fence();
          const user = await tx.get(doc(db, "users/" + op.uid));
          if (!user.exists() || user.data().status === "blocked")
            throw new Error("permission-denied");
          const rp = doc(db, receiptPath(op));
          const old = await tx.get(rp);
          if (old.exists()) {
            fence();
            return receipt(old.data(), op);
          }
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
          const ref = doc(
            db,
            grouped
              ? initialLoadoutPath(op.character)
              : instancePath(op.character, op.targetId)
          );
          const current = await tx.get(ref);
          if (!equal(current.exists() ? current.data() : null, op.initialBase ?? op.base))
            throw new Error("stale-base");
          if (op.kind !== "homebrew-state") {
            if (isBundledSnapshot(op.snapshot) || !isLibrarySnapshot(op.snapshot))
              throw new Error("invalid-operation");
            const source = await tx.get(
              doc(
                db,
                libraryPath({ ownerUid: op.uid, id: op.snapshot.entryId }) +
                  "/versions/" +
                  String(op.snapshot.version)
              )
            );
            if (!source.exists() || !equal(source.data(), op.snapshot))
              throw new Error("invalid-operation");
          }
          const next = op.initialBase
            ? updateInitialLoadoutInstance(
                op.initialBase,
                op.targetId,
                op.snapshot,
                op.state,
                { uid: op.uid, opId: op.opId },
                verifyCatalogue
              )
            : materializeInstance(
                op.character,
                op.targetId,
                op.snapshot,
                op.state,
                op.baseRevision + 1,
                { uid: op.uid, opId: op.opId }
              );
          const r = { operation: op, revision: next.revision };
          fence();
          tx.set(ref, next);
          tx.set(rp, r);
          return frozen(r);
        });
        fence();
        return result;
      } catch (error) {
        fence();
        if ((error as { code?: string }).code === "permission-denied") {
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
