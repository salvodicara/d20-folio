import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  runTransaction,
  type Firestore,
  type QuerySnapshot,
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
  session: SessionController
): InstanceRepository {
  const tickets = new Map<string, () => void>();
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
      ticket();
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
    listeners.clear();
    epoch = session.ticket();
    session.track(() => {
      sources.clear();
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
        const i = parseInstance(d.data());
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
    sources.set(characterPath(character), issues);
    for (const listener of listeners) listener([...sources.values()].flat());
    return values;
  }
  function intent(
    kind: InstanceOperation["kind"],
    character: FolioCharacter,
    base: HomebrewInstance | null,
    snapshot: LibraryVersion,
    state: InstanceState,
    id: string
  ) {
    check();
    parseCharacter(character);
    identityId(id);
    parseInstanceVersion(snapshot);
    if (kind !== "homebrew-state") requireReusable(snapshot);
    parseInstanceState(state);
    const ref = { ownerUid: character.ownerUid, id: character.id };
    if (character.ownerUid !== uid() || snapshot.ownerUid !== uid())
      throw new Error("permission-denied");
    if (base) {
      parseInstance(base);
      if (!equal(base.character, ref) || base.id !== id)
        throw new Error("invalid-operation");
      if (kind === "homebrew-update" && base.snapshot.entryId !== snapshot.entryId)
        throw new Error("invalid-operation");
    }
    const opId = crypto.randomUUID();
    tickets.set(opId, session.ticket());
    session.track(() => tickets.delete(opId));
    return frozen(
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
        baseRevision: base?.revision ?? 0,
        authority: {
          characterRevision: character.revision,
          assignment: character.currentAssignment,
          campaignRevision: null,
        },
      })
    ) as InstanceOperation;
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
      const s = await getDocsFromServer(
        collection(db, characterPath(character) + "/homebrew")
      );
      done();
      return records(character, s);
    },
    watch(character, onData, onError) {
      check();
      return session.track(
        onSnapshot(
          collection(db, characterPath(character) + "/homebrew"),
          session.guard((s: QuerySnapshot) => {
            try {
              onData(records(character, s));
            } catch (e) {
              onError(e as Error);
            }
          }),
          session.guard(onError)
        )
      );
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
      instancePath(op.character, op.targetId);
      parseInstanceVersion(op.snapshot);
      if (op.kind !== "homebrew-state") requireReusable(op.snapshot);
      parseInstanceState(op.state);
      if (op.character.ownerUid !== op.uid || op.snapshot.ownerUid !== op.uid)
        throw new Error("permission-denied");
      if (
        op.kind === "homebrew-add"
          ? op.base !== null || op.baseRevision !== 0
          : !op.base || op.baseRevision !== op.base.revision
      )
        throw new Error("invalid-operation");
      if (
        op.kind === "homebrew-update" &&
        (!equal(op.state, op.base?.state) ||
          op.snapshot.entryId !== op.base?.snapshot.entryId)
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
          const ref = doc(db, instancePath(op.character, op.targetId));
          const current = await tx.get(ref);
          if (!equal(current.exists() ? current.data() : null, op.base))
            throw new Error("stale-base");
          if (op.kind !== "homebrew-state") {
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
          const next = materializeInstance(
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
