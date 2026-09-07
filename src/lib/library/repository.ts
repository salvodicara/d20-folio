import { serializeLibraryRecovery } from "./recovery";
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  runTransaction,
  where,
  type Firestore,
  type Query,
  type QuerySnapshot,
} from "firebase/firestore";
import type { SessionController } from "../identity/session";
import { frozen, identityId } from "../identity/model";
import { equal, receiptPath } from "../shared/model";
import {
  grantId,
  libraryId,
  libraryPath,
  offerPath,
  parseDefinition,
  parseEntry,
  type LibraryIssue,
  type LibraryRepository,
  type LibraryDefinition,
  type LibraryEntry,
  type LibraryOffer,
  type LibraryOperation,
  type LibraryReceipt,
  type LibraryRef,
  type LibraryVersion,
  type GrantReceipt,
} from "./model";
export function createLibraryRepository(
  db: Firestore,
  session: SessionController
): LibraryRepository {
  const issueSources = new Map<string, LibraryIssue[]>();
  const issueListeners = new Set<(issues: LibraryIssue[]) => void>();
  let issueEpoch: (() => void) | null = null;
  function ensureIssues() {
    if (issueEpoch) {
      try {
        issueEpoch();
        return;
      } catch {
        /* Initialize the new account epoch. */
      }
    }
    issueSources.clear();
    issueListeners.clear();
    issueEpoch = session.ticket();
    session.track(() => {
      issueSources.clear();
      issueListeners.clear();
      issueEpoch = null;
    });
  }
  function currentIssues() {
    return [
      ...new Map(
        [...issueSources.values()].flat().map((issue) => [issue.path, issue])
      ).values(),
    ];
  }
  function single<T>(path: string, value: unknown, parse: (value: unknown) => T): T {
    ensureIssues();
    try {
      const result = parse(value);
      issueSources.delete("single:" + path);
      return result;
    } catch (error) {
      issueSources.set("single:" + path, [
        {
          path,
          original: serializeLibraryRecovery(value),
          error: "incompatible-library",
        },
      ]);
      throw error;
    } finally {
      const issues = currentIssues();
      for (const listener of issueListeners) listener(issues);
    }
  }
  function records<T>(
    source: string,
    snapshot: QuerySnapshot,
    parse: (value: unknown) => T
  ): T[] {
    ensureIssues();
    const issues: LibraryIssue[] = [];
    const values: T[] = [];
    for (const record of snapshot.docs) {
      issueSources.delete("single:" + record.ref.path);
      try {
        values.push(parse(record.data()));
      } catch {
        issues.push({
          path: record.ref.path,
          original: serializeLibraryRecovery(record.data()),
          error: "incompatible-library",
        });
      }
    }
    issueSources.set(source, issues);
    const all = currentIssues();
    for (const listener of issueListeners) listener(all);
    return values;
  }
  const intentTickets = new Map<string, () => void>();
  const missing = new Map<string, () => void>();
  const uid = () => {
    const id = session.scope().uid;
    if (!id) throw new Error("permission-denied");
    return id;
  };
  const online = () => {
    if ((globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine === false)
      throw new Error("offline");
  };
  const check = (op?: LibraryOperation) => {
    uid();
    if (op) intentTickets.get(op.opId)?.();
    if (op && (op.uid !== uid() || !equal(op.scope, session.scope())))
      throw new Error("stale-session");
  };
  const entries = () => collection(db, "folioAccounts/" + uid() + "/library");
  const offers = () =>
    query(
      collection(db, "folioLibraryOffers"),
      where("recipientUid", "==", uid()),
      where("revoked", "==", false),
      where("schema", "==", 2)
    );
  const sent = () =>
    query(collection(db, "folioLibraryOffers"), where("senderUid", "==", uid()));
  function readOffer(value: unknown): LibraryOffer {
    const o = value as Partial<LibraryOffer> | null;
    if (
      o?.schema !== 2 ||
      !o.id ||
      !Number.isSafeInteger(o.revision) ||
      typeof o.revoked !== "boolean"
    )
      throw new Error("incompatible-library");
    offerPath(o as LibraryOffer);
    identityId(String(o.recipientUid));
    libraryId(String(o.sourceId));
    parseDefinition(o.definition);
    return frozen(structuredClone(o)) as LibraryOffer;
  }
  function readVersion(value: unknown): LibraryVersion {
    const v = value as Partial<LibraryVersion> | null;
    if (v?.schema !== 1 || !Number.isSafeInteger(v.version) || Number(v.version) < 1)
      throw new Error("incompatible-library");
    libraryPath({ ownerUid: String(v.ownerUid), id: String(v.entryId) });
    parseDefinition(v.definition);
    return frozen(structuredClone(v)) as LibraryVersion;
  }
  function envelope(
    kind: LibraryOperation["kind"],
    entry: LibraryEntry | null,
    definition: LibraryDefinition | null,
    offer: LibraryOffer | null,
    targetId: string,
    baseRevision = entry?.revision ?? 0
  ): LibraryOperation {
    check();
    const opId =
      kind === "library-remove" && entry
        ? "remove_" + entry.lastOperation.opId
        : crypto.randomUUID();
    intentTickets.set(opId, session.ticket());
    return frozen(
      structuredClone({
        kind,
        entry,
        definition,
        offer,
        targetId,
        baseRevision,
        uid: uid(),
        opId,
        scope: session.scope(),
        authority: { characterRevision: null, assignment: null, campaignRevision: null },
      })
    );
  }
  function receipt(value: unknown, op: LibraryOperation): LibraryReceipt {
    const r = value as LibraryReceipt | null;
    if (!r || !equal(r.operation, op) || r.revision !== op.baseRevision + 1)
      throw new Error("intent-mismatch");
    return frozen(structuredClone(r));
  }
  function watch<T>(
    source: string,
    q: Query,
    parse: (v: unknown) => T,
    onData: (v: T[]) => void,
    onError: (e: Error) => void
  ) {
    check();
    const stop = onSnapshot(
      q,
      session.guard((s: QuerySnapshot) => {
        try {
          onData(records(source, s, parse));
        } catch (e) {
          onError(e as Error);
        }
      }),
      session.guard(onError)
    );
    return session.track(stop);
  }
  const api = {
    removeIntent(entry: LibraryEntry) {
      parseEntry(entry);
      if (entry.ownerUid !== uid()) throw new Error("permission-denied");
      return envelope("library-remove", entry, null, null, entry.id);
    },
    watchIssues(onIssues: (issues: LibraryIssue[]) => void) {
      ensureIssues();
      const callback = session.guard(onIssues);
      issueListeners.add(callback);
      callback(currentIssues());
      return session.track(() => issueListeners.delete(callback));
    },
    async list() {
      const done = session.ticket();
      const s = await getDocsFromServer(entries());
      done();
      check();
      return records("entries", s, parseEntry);
    },
    async load(id: string) {
      const done = session.ticket();
      const s = await getDocFromServer(doc(db, libraryPath({ ownerUid: uid(), id })));
      done();
      check();
      if (!s.exists()) {
        missing.set(uid() + "/" + id, session.ticket());
        return null;
      }
      missing.delete(uid() + "/" + id);
      return single(s.ref.path, s.data(), parseEntry);
    },
    async readVersion(ref: LibraryRef, version: number) {
      const done = session.ticket();
      done();
      check();
      const s = await getDocFromServer(
        doc(db, libraryPath(ref) + "/versions/" + String(version))
      );
      done();
      check();
      return single(s.ref.path, s.data(), readVersion);
    },
    async listVersions(id: string) {
      const done = session.ticket();
      const s = await getDocsFromServer(
        collection(db, libraryPath({ ownerUid: uid(), id }) + "/versions")
      );
      done();
      check();
      return records("versions:" + id, s, readVersion).sort(
        (a, b) => b.version - a.version
      );
    },
    async listOffers() {
      const done = session.ticket();
      const s = await getDocsFromServer(offers());
      done();
      check();
      return records("incoming", s, readOffer);
    },
    async listSentOffers() {
      const done = session.ticket();
      const s = await getDocsFromServer(sent());
      done();
      check();
      return records("sent", s, readOffer);
    },
    async readGrant(offer: LibraryOffer) {
      const done = session.ticket();
      done();
      check();
      const s = await getDocFromServer(
        doc(db, "folioAccounts/" + offer.recipientUid + "/receipts/" + grantId(offer))
      );
      done();
      check();
      return s.exists() ? frozen(s.data() as GrantReceipt) : null;
    },
    watchSentOffers(
      onData: (offers: LibraryOffer[]) => void,
      onError: (e: Error) => void
    ) {
      return watch(
        "sent",
        query(sent(), where("schema", "==", 2)),
        readOffer,
        onData,
        onError
      );
    },
    watchOffers(onData: (offers: LibraryOffer[]) => void, onError: (e: Error) => void) {
      return watch("incoming", offers(), readOffer, onData, onError);
    },
    watchEntries(onData: (entries: LibraryEntry[]) => void, onError: (e: Error) => void) {
      return watch("entries", entries(), parseEntry, onData, onError);
    },
    saveIntent(
      base: LibraryEntry | null,
      draft: LibraryDefinition,
      id = base?.id ?? crypto.randomUUID()
    ) {
      check();
      libraryId(id);
      if (base) {
        parseEntry(base);
        if (base.ownerUid !== uid() || base.id !== id)
          throw new Error("permission-denied");
      } else if (!missing.has(uid() + "/" + id)) throw new Error("unloaded-entry");
      if (!base) missing.get(uid() + "/" + id)?.();
      return envelope("library-save", base, parseDefinition(draft), null, id);
    },
    async publishIntent(base: LibraryEntry, preview: LibraryDefinition) {
      const done = session.ticket();
      done();
      check();
      parseEntry(base);
      parseDefinition(preview);
      if (base.ownerUid !== uid()) throw new Error("permission-denied");
      if (!preview.name.trim() || !equal(base.draft, preview))
        throw new Error("invalid-operation");
      if (base.stableVersion) {
        const stable = await api.readVersion(base, base.stableVersion);
        done();
        check();
        if (equal(stable.definition, preview)) return null;
      }
      return envelope("library-publish", base, preview, null, base.id);
    },
    offerIntent(version: LibraryVersion, recipientUid: string) {
      check();
      readVersion(version);
      identityId(recipientUid);
      if (version.ownerUid !== uid()) throw new Error("permission-denied");
      const id = crypto.randomUUID();
      const offer: LibraryOffer = {
        schema: 2,
        senderUid: uid(),
        id,
        recipientUid,
        sourceId: version.entryId,
        sourceVersion: version.version,
        definition: version.definition,
        revoked: false,
        revision: 1,
        lastOperation: { uid: uid(), opId: "" },
      };
      const op = envelope("library-offer", null, null, offer, id);
      return frozen({
        ...op,
        offer: { ...offer, lastOperation: { uid: uid(), opId: op.opId } },
      });
    },
    async acceptIntent(offer: LibraryOffer, existing: LibraryEntry | null = null) {
      check();
      readOffer(offer);
      if (offer.recipientUid !== uid() || offer.revoked)
        throw new Error("permission-denied");
      if (
        existing &&
        (existing.ownerUid !== uid() ||
          existing.provenance?.source.ownerUid !== offer.senderUid ||
          existing.provenance.source.id !== offer.sourceId)
      )
        throw new Error("invalid-operation");
      const done = session.ticket();
      const accepted = await api.readGrant(offer);
      done();
      check();
      if (accepted) throw new Error("invalid-operation");
      return envelope(
        "library-accept",
        existing,
        offer.definition,
        offer,
        existing?.id ?? grantId(offer)
      );
    },
    revokeIntent(offer: LibraryOffer) {
      check();
      readOffer(offer);
      if (offer.senderUid !== uid()) throw new Error("permission-denied");
      return envelope("library-revoke", null, null, offer, offer.id, offer.revision);
    },
    async reconcile(op: LibraryOperation) {
      const done = session.ticket();
      done();
      check(op);
      online();
      const s = await getDocFromServer(doc(db, receiptPath(op)));
      done();
      check(op);
      return s.exists() ? receipt(s.data(), op) : null;
    },
    async commit(op: LibraryOperation, localCheck: () => void = () => {}) {
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
      libraryId(op.targetId);
      if (op.definition) parseDefinition(op.definition);
      try {
        return await runTransaction(db, async (tx) => {
          fence();
          const user = await tx.get(doc(db, "users/" + op.uid));
          if (!user.exists() || user.data().status === "blocked")
            throw new Error("permission-denied");
          const rp = doc(db, receiptPath(op));
          const oldReceipt = await tx.get(rp);
          if (oldReceipt.exists()) {
            fence();
            return receipt(oldReceipt.data(), op);
          }
          const lastOperation = { uid: op.uid, opId: op.opId };
          if (op.kind === "library-remove") {
            const ref = doc(db, libraryPath({ ownerUid: op.uid, id: op.targetId }));
            const current = await tx.get(ref);
            if (
              !op.entry ||
              op.definition !== null ||
              op.offer !== null ||
              op.opId !== "remove_" + op.entry.lastOperation.opId ||
              op.entry.ownerUid !== op.uid ||
              op.entry.id !== op.targetId
            )
              throw new Error("invalid-operation");
            if (
              !current.exists() ||
              !equal(current.data(), op.entry) ||
              op.baseRevision !== op.entry.revision
            )
              throw new Error("stale-base");
            fence();
            tx.delete(ref);
          } else if (op.kind === "library-offer" || op.kind === "library-revoke") {
            const offer = op.offer;
            if (!offer || offer.senderUid !== op.uid)
              throw new Error("invalid-operation");
            const ref = doc(db, offerPath(offer));
            const current = await tx.get(ref);
            if (op.kind === "library-offer") {
              if (current.exists()) throw new Error("stale-base");
              const source = readVersion(
                (
                  await tx.get(
                    doc(
                      db,
                      libraryPath({ ownerUid: op.uid, id: offer.sourceId }) +
                        "/versions/" +
                        String(offer.sourceVersion)
                    )
                  )
                ).data()
              );
              if (!equal(source.definition, offer.definition))
                throw new Error("invalid-operation");
              fence();
              tx.set(ref, { ...offer, lastOperation });
            } else {
              if (!current.exists() || !equal(current.data(), offer) || offer.revoked)
                throw new Error("stale-base");
              fence();
              tx.set(ref, {
                ...offer,
                revoked: true,
                revision: op.baseRevision + 1,
                lastOperation,
              });
            }
          } else {
            const ref = doc(db, libraryPath({ ownerUid: op.uid, id: op.targetId }));
            const snap = await tx.get(ref);
            const current = snap.exists() ? parseEntry(snap.data()) : null;
            if ((current?.revision ?? 0) !== op.baseRevision || !equal(current, op.entry))
              throw new Error("stale-base");
            let provenance = current?.provenance ?? null;
            let grant: GrantReceipt | null = null;
            if (op.kind === "library-accept") {
              const offer = op.offer;
              if (!offer || offer.recipientUid !== op.uid)
                throw new Error("permission-denied");
              const remote = await tx.get(doc(db, offerPath(offer)));
              if (!remote.exists() || !equal(remote.data(), offer) || offer.revoked)
                throw new Error("permission-denied");
              const gr = doc(
                db,
                "folioAccounts/" + op.uid + "/receipts/" + grantId(offer)
              );
              if ((await tx.get(gr)).exists()) throw new Error("invalid-operation");
              if (
                current &&
                (current.provenance?.source.ownerUid !== offer.senderUid ||
                  current.provenance.source.id !== offer.sourceId)
              )
                throw new Error("invalid-operation");
              if (!current && op.targetId !== grantId(offer))
                throw new Error("invalid-operation");
              provenance = {
                source: { ownerUid: offer.senderUid, id: offer.sourceId },
                sourceVersion: offer.sourceVersion,
                senderUid: offer.senderUid,
                offerId: offer.id,
                grantId: grantId(offer),
              };
              grant = {
                schema: 2,
                senderUid: offer.senderUid,
                offerId: offer.id,
                recipientUid: op.uid,
                sourceId: offer.sourceId,
                sourceVersion: offer.sourceVersion,
                entryId: op.targetId,
                version: (current?.stableVersion ?? 0) + 1,
                operationId: op.opId,
              };
            }
            if (!op.definition) throw new Error("invalid-operation");
            const publish = op.kind !== "library-save";
            if (publish && !op.definition.name.trim())
              throw new Error("invalid-operation");
            if (
              op.kind === "library-publish" &&
              (!current || !equal(current.draft, op.definition))
            )
              throw new Error("invalid-operation");
            if (op.kind === "library-publish" && current?.stableVersion) {
              const stable = readVersion(
                (
                  await tx.get(
                    doc(
                      db,
                      libraryPath(current) + "/versions/" + String(current.stableVersion)
                    )
                  )
                ).data()
              );
              if (equal(stable.definition, op.definition))
                throw new Error("unchanged-version");
            }
            const next: LibraryEntry = {
              schema: 1,
              ownerUid: op.uid,
              id: op.targetId,
              revision: op.baseRevision + 1,
              draft: op.definition,
              stableVersion: (current?.stableVersion ?? 0) + (publish ? 1 : 0),
              provenance,
              lastOperation,
            };
            fence();
            tx.set(ref, next);
            if (publish)
              tx.set(doc(db, ref.path + "/versions/" + String(next.stableVersion)), {
                schema: 1,
                ownerUid: op.uid,
                entryId: op.targetId,
                version: next.stableVersion,
                definition: op.definition,
                provenance,
                operationId: op.opId,
              } satisfies LibraryVersion);
            if (grant)
              tx.set(
                doc(
                  db,
                  "folioAccounts/" +
                    op.uid +
                    "/receipts/" +
                    grantId({ senderUid: grant.senderUid, id: grant.offerId })
                ),
                grant
              );
          }
          const result: LibraryReceipt = { operation: op, revision: op.baseRevision + 1 };
          fence();
          tx.set(rp, result);
          return frozen(result);
        });
      } catch (error) {
        fence();
        if ((error as { code?: string }).code === "permission-denied") {
          const existing = await api.reconcile(op);
          fence();
          if (existing) return existing;
        }
        throw error;
      }
    },
  };
  return api;
}
export type { LibraryRepository } from "./model";
