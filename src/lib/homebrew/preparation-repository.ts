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
import { parseCampaign, frozen, identityId, type FolioCampaign } from "../identity/model";
import type { SessionController } from "../identity/session";
import { libraryPath, type LibraryVersion } from "../library/model";
import { serializeLibraryRecovery } from "../library/recovery";
import { equal, receiptPath } from "../shared/model";
import { conformDefinition } from "./conformance";
import {
  defaultPreparedState,
  preparationCollection,
  preparationPath,
  materializePreparedCopy,
  parsePreparedCopy,
  parsePreparedState,
  parsePreparationVersion,
  type PreparedCopy,
  type PreparationIssue,
  type PreparationOperation,
  type PreparationReceipt,
  type PreparationRepository,
  type PreparedState,
} from "./preparation";
function requireReusable(snapshot: LibraryVersion) {
  if (
    conformDefinition(snapshot.definition).some((issue) => issue.severity === "invalid")
  )
    throw new Error("invalid-operation");
}
export function createPreparationRepository(
  db: Firestore,
  session: SessionController
): PreparationRepository {
  const tickets = new Map<
    string,
    { fence: () => void; operation: PreparationOperation }
  >();
  const sources = new Map<string, PreparationIssue[]>();
  const listeners = new Set<(issues: PreparationIssue[]) => void>();
  const uid = () => {
    const u = session.scope().uid;
    if (!u) throw new Error("permission-denied");
    return u;
  };
  const online = () => {
    if ((globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine === false)
      throw new Error("offline");
  };
  function check(op?: PreparationOperation) {
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
    listeners.clear();
    epoch = session.ticket();
    session.track(() => {
      sources.clear();
      listeners.clear();
      epoch = null;
    });
  }
  function records(campaignId: string, preparationId: string | null, s: QuerySnapshot) {
    ensureIssues();
    const issues: PreparationIssue[] = [],
      values: PreparedCopy[] = [];
    for (const d of s.docs) {
      try {
        const i = parsePreparedCopy(d.data());
        if (
          i.campaignId !== campaignId ||
          i.preparationId !== preparationId ||
          i.id !== d.id
        )
          throw new Error("incompatible-preparation");
        values.push(i);
      } catch {
        issues.push({
          path: d.ref.path,
          original: serializeLibraryRecovery(d.data()),
          error: "incompatible-preparation",
        });
      }
    }
    sources.set(preparationCollection(campaignId, preparationId), issues);
    for (const listener of listeners) listener([...sources.values()].flat());
    return values;
  }
  function intent(
    kind: PreparationOperation["kind"],
    campaign: FolioCampaign,
    preparationId: string | null,
    base: PreparedCopy | null,
    snapshot: LibraryVersion,
    state: PreparedState,
    id: string
  ) {
    check();
    parseCampaign(campaign);
    identityId(id);
    parsePreparationVersion(snapshot);
    if (["preparation-add", "preparation-update"].includes(kind))
      requireReusable(snapshot);
    parsePreparedState(state);
    if (
      session.scope().campaignId !== campaign.id ||
      campaign.archived ||
      (["preparation-add", "preparation-update"].includes(kind) &&
        snapshot.ownerUid !== uid())
    )
      throw new Error("permission-denied");
    if (base) {
      parsePreparedCopy(base);
      if (
        base.campaignId !== campaign.id ||
        base.preparationId !== preparationId ||
        base.id !== id
      )
        throw new Error("invalid-operation");
      if (
        kind === "preparation-update" &&
        (base.snapshot.entryId !== snapshot.entryId ||
          base.snapshot.ownerUid !== snapshot.ownerUid ||
          base.snapshot.definition.family !== snapshot.definition.family)
      )
        throw new Error("invalid-operation");
    }
    materializePreparedCopy(
      campaign.id,
      preparationId,
      id,
      snapshot,
      state,
      (base?.revision ?? 0) + 1,
      { uid: uid(), opId: "validate" }
    );
    const opId =
      kind === "preparation-remove" && base
        ? identityId("remove_" + base.lastOperation.opId)
        : crypto.randomUUID();
    const operation = frozen(
      structuredClone({
        kind,
        campaignId: campaign.id,
        preparationId,
        targetId: id,
        base,
        snapshot,
        state,
        opId,
        uid: uid(),
        scope: session.scope(),
        baseRevision: base?.revision ?? 0,
        authority: {
          characterRevision: null,
          assignment: null,
          campaignRevision: campaign.revision,
        },
      })
    ) as PreparationOperation;
    tickets.set(opId, { fence: session.ticket(), operation });
    session.track(() => tickets.delete(opId));
    return operation;
  }
  function receipt(value: unknown, op: PreparationOperation) {
    const r = value as PreparationReceipt | null;
    if (!r || !equal(r.operation, op) || r.revision !== op.baseRevision + 1)
      throw new Error("intent-mismatch");
    return frozen(structuredClone(r));
  }
  const api: PreparationRepository = {
    watchIssues(listener) {
      ensureIssues();
      const callback = session.guard(listener);
      listeners.add(callback);
      callback([...sources.values()].flat());
      return session.track(() => listeners.delete(callback));
    },
    async list(campaignId, preparationId) {
      check();
      const done = session.ticket();
      const s = await getDocsFromServer(
        collection(db, preparationCollection(campaignId, preparationId))
      );
      done();
      return records(campaignId, preparationId, s);
    },
    watch(campaignId, preparationId, onData, onError) {
      check();
      return session.track(
        onSnapshot(
          collection(db, preparationCollection(campaignId, preparationId)),
          session.guard((s: QuerySnapshot) => {
            try {
              onData(records(campaignId, preparationId, s));
            } catch (e) {
              onError(e as Error);
            }
          }),
          session.guard(onError)
        )
      );
    },
    addIntent: (c, v, p, s = defaultPreparedState(v), id = crypto.randomUUID()) =>
      intent("preparation-add", c, p, null, v, s, id),
    updateIntent: (c, b, v) =>
      intent("preparation-update", c, b.preparationId, b, v, b.state, b.id),
    stateIntent: (c, b, s) =>
      intent("preparation-state", c, b.preparationId, b, b.snapshot, s, b.id),
    removeIntent: (c, b) =>
      intent("preparation-remove", c, b.preparationId, b, b.snapshot, b.state, b.id),
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
      preparationPath(op.campaignId, op.preparationId, op.targetId);
      parsePreparationVersion(op.snapshot);
      if (["preparation-add", "preparation-update"].includes(op.kind))
        requireReusable(op.snapshot);
      parsePreparedState(op.state);
      if (
        op.scope.campaignId !== op.campaignId ||
        (["preparation-add", "preparation-update"].includes(op.kind) &&
          op.snapshot.ownerUid !== op.uid)
      )
        throw new Error("permission-denied");
      if (
        op.kind === "preparation-add"
          ? op.base !== null || op.baseRevision !== 0
          : !op.base || op.baseRevision !== op.base.revision
      )
        throw new Error("invalid-operation");
      if (
        op.kind === "preparation-update" &&
        (!equal(op.state, op.base?.state) ||
          op.snapshot.entryId !== op.base?.snapshot.entryId ||
          op.snapshot.ownerUid !== op.base.snapshot.ownerUid)
      )
        throw new Error("invalid-operation");
      if (
        ["preparation-state", "preparation-remove"].includes(op.kind) &&
        !equal(op.snapshot, op.base?.snapshot)
      )
        throw new Error("invalid-operation");
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
            const c = parseCampaign(
              (await tx.get(doc(db, "folioCampaigns/" + op.campaignId))).data()
            );
            if (
              !user.exists() ||
              user.data().status === "blocked" ||
              c.archived ||
              (user.data().role !== "admin" &&
                (c.dmUid !== op.uid || !c.members.includes(op.uid)))
            )
              throw new Error("permission-denied");
            if (
              !equal(op.authority, {
                characterRevision: null,
                assignment: null,
                campaignRevision: c.revision,
              })
            )
              throw new Error("stale-base");
            const ref = doc(
              db,
              preparationPath(op.campaignId, op.preparationId, op.targetId)
            );
            const current = await tx.get(ref);
            if (!equal(current.exists() ? current.data() : null, op.base))
              throw new Error("stale-base");
            if (["preparation-add", "preparation-update"].includes(op.kind)) {
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
            const next = materializePreparedCopy(
              op.campaignId,
              op.preparationId,
              op.targetId,
              op.snapshot,
              op.state,
              op.baseRevision + 1,
              { uid: op.uid, opId: op.opId }
            );
            const r = { operation: op, revision: next.revision };
            fence();
            if (op.kind === "preparation-remove") tx.delete(ref);
            else tx.set(ref, next);
            tx.set(rp, r);
            return frozen(r);
          },
          { maxAttempts: 1 }
        );
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
