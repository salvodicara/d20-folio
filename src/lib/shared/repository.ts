import {
  doc,
  getDocFromServer,
  runTransaction,
  type Firestore,
  type Transaction,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase/firestore";
import {
  characterPath,
  identityId,
  parseCharacter,
  parseCampaign,
  rosterId,
  frozen,
  type CharacterRef,
} from "../identity/model";
import type { SessionController } from "../identity/session";
import {
  equal,
  notePath,
  receiptPath,
  validateOperation,
  type Authority,
  type NoteTarget,
  type NoteSnapshot,
  type NoteOperation,
  type AssignmentOperation,
  type Operation,
  type Receipt,
  type SharedRepository,
} from "./model";

type Reader = (ref: DocumentReference) => Promise<DocumentSnapshot>;
export function createSharedRepository(
  db: Firestore,
  session: SessionController
): SharedRepository {
  const campaignPath = (id: string) => "folioCampaigns/" + identityId(id);
  const online = () => {
    const browserOnline = (globalThis as { navigator?: { onLine?: boolean } }).navigator
      ?.onLine;
    if (browserOnline === false) throw new Error("offline");
  };
  const uid = () => {
    const value = session.scope().uid;
    if (!value) throw new Error("permission-denied");
    return value;
  };
  function checkScope(op: Operation) {
    if (op.uid !== uid() || !equal(op.scope, session.scope()))
      throw new Error("stale-session");
  }
  async function authority(target: NoteTarget, read: Reader): Promise<Authority> {
    if (target.kind === "dm") {
      if (session.scope().campaignId !== target.campaignId)
        throw new Error("stale-session");
      const c = parseCampaign(
        (await read(doc(db, campaignPath(target.campaignId)))).data()
      );
      return { characterRevision: null, assignment: null, campaignRevision: c.revision };
    }
    const c = parseCharacter(
      (
        await read(
          doc(db, characterPath({ ownerUid: target.ownerUid, id: target.characterId }))
        )
      ).data()
    );
    // Personal narrative stays owner-private even while the PC is assigned. The exact
    // assignment fences stale drafts; it does not grant campaign readers note access.
    return {
      characterRevision: c.revision,
      assignment: c.currentAssignment,
      campaignRevision: null,
    };
  }
  function readReceipt(value: unknown, op: Operation): Receipt {
    const r = value as Receipt | null;
    if (!r || !equal(r.operation, op) || r.revision !== op.baseRevision + 1)
      throw new Error("intent-mismatch");
    return frozen(structuredClone(r));
  }
  const api = {
    async readNotes(target: NoteTarget): Promise<NoteSnapshot> {
      const check = session.ticket();
      uid();
      const result = await runTransaction(db, async (tx) => {
        const a = await authority(target, (r) => tx.get(r));
        const snap = await tx.get(doc(db, notePath(target)));
        check();
        const data = snap.data();
        return {
          target,
          text: String(data?.text ?? ""),
          revision: Number(data?.revision ?? 0),
          authority: a,
        };
      });
      check();
      return frozen(result);
    },
    noteIntent(base: NoteSnapshot, text: string): NoteOperation {
      const op: NoteOperation = {
        kind: "notes",
        opId: crypto.randomUUID(),
        uid: uid(),
        scope: session.scope(),
        target: base.target,
        baseRevision: base.revision,
        authority: base.authority,
        text,
      };
      validateOperation(op);
      return frozen(structuredClone(op));
    },
    async assignmentIntent(
      target: CharacterRef,
      campaignId: string | null
    ): Promise<AssignmentOperation> {
      const check = session.ticket();
      const actor = uid();
      online();
      const result = await runTransaction(db, async (tx) => {
        const c = parseCharacter((await tx.get(doc(db, characterPath(target)))).data());
        const campaign = campaignId
          ? parseCampaign((await tx.get(doc(db, campaignPath(campaignId)))).data())
          : null;
        check();
        return {
          kind: "assignment" as const,
          opId: crypto.randomUUID(),
          uid: actor,
          scope: session.scope(),
          target,
          baseRevision: c.revision,
          authority: {
            characterRevision: c.revision,
            assignment: c.currentAssignment,
            campaignRevision: null,
          },
          campaignId,
          campaignRevision: campaign?.revision ?? null,
        };
      });
      check();
      return frozen(result);
    },
    async reconcile(op: Operation): Promise<Receipt | null> {
      validateOperation(op);
      checkScope(op);
      online();
      const check = session.ticket();
      const snap = await getDocFromServer(doc(db, receiptPath(op)));
      check();
      return snap.exists() ? readReceipt(snap.data(), op) : null;
    },
    async commit(op: Operation, localCheck: () => void = () => {}): Promise<Receipt> {
      validateOperation(op);
      checkScope(op);
      online();
      const ticket = session.ticket();
      const check = () => {
        ticket();
        localCheck();
        checkScope(op);
        online();
      };
      try {
        return await runTransaction(db, async (tx) => {
          check();
          const user = await tx.get(doc(db, "users/" + op.uid));
          if (!user.exists() || user.data().status === "blocked")
            throw new Error("permission-denied");
          const rp = doc(db, receiptPath(op));
          const existing = await tx.get(rp);
          check();
          if (existing.exists()) return readReceipt(existing.data(), op);
          if (op.kind === "notes") {
            const currentAuthority = await authority(op.target, (r) => tx.get(r));
            const target = doc(db, notePath(op.target));
            const snapshot = await tx.get(target);
            if (!equal(currentAuthority, op.authority))
              throw new Error("stale-authority");
            if ((snapshot.data()?.revision ?? 0) !== op.baseRevision)
              throw new Error("stale-base");
            check();
            tx.set(target, {
              text: op.text,
              revision: op.baseRevision + 1,
              lastOperation: { uid: op.uid, opId: op.opId },
            });
          } else await applyAssignment(tx, op, check);
          const receipt: Receipt = { operation: op, revision: op.baseRevision + 1 };
          check();
          tx.set(rp, receipt);
          return frozen(receipt);
        });
      } catch (error) {
        check();
        // Rules may reject a racing duplicate before the SDK retries its transaction.
        // Only an exact, currently readable remote receipt can turn that into ack.
        if ((error as { code?: string }).code === "permission-denied") {
          const receipt = await api.reconcile(op);
          check();
          if (receipt) return receipt;
          if (op.kind === "notes") {
            const latest = await api.readNotes(op.target);
            check();
            if (!equal(latest.authority, op.authority))
              throw new Error("stale-authority", { cause: error });
            if (latest.revision !== op.baseRevision)
              throw new Error("stale-base", { cause: error });
          }
        }
        throw error;
      }
    },
  };
  async function applyAssignment(
    tx: Transaction,
    op: AssignmentOperation,
    check: () => void
  ) {
    if (op.target.ownerUid !== op.uid) throw new Error("permission-denied");
    const target = doc(db, characterPath(op.target));
    const current = parseCharacter((await tx.get(target)).data());
    if (current.revision !== op.baseRevision) throw new Error("stale-base");
    if (
      current.revision !== op.authority.characterRevision ||
      !equal(current.currentAssignment, op.authority.assignment)
    )
      throw new Error("stale-authority");
    if (op.campaignId) {
      const c = parseCampaign(
        (await tx.get(doc(db, campaignPath(op.campaignId)))).data()
      );
      if (c.revision !== op.campaignRevision) throw new Error("stale-authority");
      if (c.archived || !c.members.includes(op.uid)) throw new Error("permission-denied");
    }
    const previous = current.currentAssignment
      ? doc(
          db,
          campaignPath(current.currentAssignment.campaignId) +
            "/roster/" +
            rosterId(op.target)
        )
      : null;
    const previousExists = previous ? (await tx.get(previous)).exists() : false;
    const revision = op.baseRevision + 1;
    const next = op.campaignId
      ? { campaignId: op.campaignId, assignmentId: op.opId, version: revision }
      : null;
    check();
    tx.update(target, { currentAssignment: next, revision });
    if (previous && previousExists) tx.delete(previous);
    if (next)
      tx.set(doc(db, campaignPath(next.campaignId) + "/roster/" + rosterId(op.target)), {
        ownerUid: op.uid,
        characterId: op.target.id,
        assignmentId: next.assignmentId,
        version: revision,
      });
    tx.set(doc(db, characterPath(op.target) + "/history/" + String(revision)), {
      previous: current.currentAssignment,
      next,
      revision,
      operationId: op.opId,
    });
  }
  return api;
}
