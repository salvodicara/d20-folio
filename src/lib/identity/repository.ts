import {
  collection,
  doc,
  getDocFromServer,
  getDocFromCache,
  onSnapshot,
  query,
  where,
  runTransaction,
  setDoc,
  arrayUnion,
  arrayRemove,
  increment,
  type Firestore,
  type Query,
  type DocumentData,
  type DocumentReference,
} from "firebase/firestore";
import {
  characterPath,
  identityId,
  rosterId,
  parseCharacter,
  parseCampaign,
  object,
  frozen,
  type CharacterRef,
  type FolioCharacter,
  type FolioAccount,
  type FolioCampaign,
  type RosterEntry,
} from "./model";
import { dryRunMigration, recoverMigration, type MigrationPlan } from "./migration";
import type { SessionController } from "./session";
export interface FolioInvite {
  id: string;
  name: string;
  joinOpen: boolean;
}
export function createIdentityRepository(db: Firestore, session: SessionController) {
  const uid = () => {
    const value = session.scope().uid;
    if (!value) throw new Error("unauthenticated");
    return identityId(value);
  };
  const cp = (id: string) => characterPath({ ownerUid: uid(), id });
  const camp = (id: string) => "folioCampaigns/" + identityId(id);
  const online = () => {
    const browserOnline = (globalThis as { navigator?: { onLine?: boolean } }).navigator
      ?.onLine;
    if (browserOnline === false) throw new Error("offline");
  };
  const write = <T>(action: () => Promise<T>) => {
    online();
    return session.runWrite(action);
  };
  function watch<T>(
    target: Query | DocumentReference,
    decode: (data: DocumentData[]) => T,
    empty: T,
    next: (value: T) => void,
    error: (error: Error) => void,
    ownerCache = false
  ): () => void {
    let live = true;
    const deliver = session.guard((value: T) => {
      if (live) next(value);
    });
    const failed = session.guard((e: Error) => {
      if (live) {
        const code = (e as Error & { code?: string }).code;
        if (code === "permission-denied") {
          session.transition({
            ...session.scope(),
            campaignId: null,
            activeCharacterId: null,
          });
          error(e);
        } else if (code === "unavailable") {
          error(e);
        } else {
          next(empty);
          error(e);
        }
      }
    });
    const unsubscribe =
      target.type === "document"
        ? onSnapshot(
            target,
            { includeMetadataChanges: true },
            (s) => {
              if (s.metadata.fromCache && !ownerCache) return;
              try {
                deliver(decode(s.exists() ? [s.data()] : []));
              } catch (e) {
                failed(e as Error);
              }
            },
            failed
          )
        : onSnapshot(
            target,
            { includeMetadataChanges: true },
            (s) => {
              if (s.metadata.fromCache && !ownerCache) return;
              try {
                deliver(decode(s.docs.map((d) => d.data())));
              } catch (e) {
                failed(e as Error);
              }
            },
            failed
          );
    return session.track(() => {
      if (live) {
        live = false;
        unsubscribe();
        next(empty);
      }
    });
  }
  function scopedCharacter(value: DocumentData): Readonly<FolioCharacter> {
    const c = parseCharacter(value);
    if (
      c.ownerUid !== uid() &&
      c.currentAssignment?.campaignId !== session.scope().campaignId
    )
      throw new Error("wrong-campaign");
    return c;
  }
  async function assignment(id: string, campaignId: string | null): Promise<void> {
    const ownerUid = uid();
    const path = cp(id);
    const check = session.ticket();
    return write(() =>
      runTransaction(db, async (tx) => {
        check();
        const snapshot = await tx.get(doc(db, path));
        if (!snapshot.exists()) throw new Error("not-found");
        const current = parseCharacter(snapshot.data());
        const revision = current.revision + 1;
        if (campaignId !== null) {
          const target = await tx.get(doc(db, camp(campaignId)));
          if (!target.exists()) throw new Error("not-found");
          const c = parseCampaign(target.data());
          if (c.archived || !c.members.includes(ownerUid)) throw new Error("not-member");
          if (current.currentAssignment?.campaignId === campaignId) return;
        }
        if (campaignId === null && current.currentAssignment === null) return;
        const previousRow = current.currentAssignment
          ? doc(
              db,
              camp(current.currentAssignment.campaignId) +
                "/roster/" +
                rosterId({ ownerUid, id })
            )
          : null;
        const previousRowExists = previousRow
          ? (await tx.get(previousRow)).exists()
          : false;
        // The rules inspect the previous campaign at COMMIT, including unreadable/reinstated claims.
        // A denied or unavailable read is never interpreted as revocation by this client.
        const next =
          campaignId === null
            ? null
            : { campaignId, assignmentId: crypto.randomUUID(), version: revision };
        check();
        tx.update(doc(db, path), { currentAssignment: next, revision });
        if (next)
          tx.set(
            doc(db, camp(next.campaignId) + "/roster/" + rosterId({ ownerUid, id })),
            {
              ownerUid,
              characterId: id,
              assignmentId: next.assignmentId,
              version: next.version,
            }
          );
        // Owner release remains possible after revocation: deleting this own stale ref is independently authorized.
        if (previousRow && previousRowExists) tx.delete(previousRow);
        tx.set(doc(db, path + "/history/" + String(revision)), {
          previous: current.currentAssignment,
          next,
          revision,
        });
      })
    );
  }
  const api = {
    watchOwnedCharacters(
      next: (value: Readonly<FolioCharacter>[]) => void,
      error: (error: Error) => void
    ) {
      return watch(
        collection(db, "folioAccounts/" + uid() + "/characters"),
        (rows) => rows.map(parseCharacter),
        [],
        next,
        error,
        true
      );
    },
    watchMemberships(
      next: (value: FolioCampaign[]) => void,
      error: (error: Error) => void
    ) {
      return watch(
        query(
          collection(db, "folioCampaigns"),
          where("members", "array-contains", uid())
        ),
        (rows) => rows.map(parseCampaign),
        [],
        next,
        error
      );
    },
    watchRoster(
      campaignId: string,
      next: (value: RosterEntry[]) => void,
      error: (error: Error) => void
    ) {
      if (session.scope().campaignId !== campaignId) throw new Error("wrong-campaign");
      let currentRows: RosterEntry[] = [];
      let members: readonly string[] = [];
      const publish = () =>
        next(currentRows.filter((row) => members.includes(row.ownerUid)));
      const stopCampaign = watch(
        doc(db, camp(campaignId)),
        (rows) => (rows[0] ? parseCampaign(rows[0]).members : []),
        [],
        (value) => {
          members = value;
          publish();
        },
        error
      );
      const stopRoster = watch(
        collection(db, camp(campaignId) + "/roster"),
        (rows) =>
          rows.map((row) => {
            if (
              typeof row.ownerUid !== "string" ||
              typeof row.characterId !== "string" ||
              typeof row.assignmentId !== "string" ||
              !Number.isInteger(row.version) ||
              row.version < 1 ||
              Object.keys(row).length !== 4
            )
              throw new Error("invalid-roster");
            identityId(row.ownerUid);
            identityId(row.characterId);
            return frozen(row as RosterEntry);
          }),
        [],
        (value) => {
          currentRows = value;
          publish();
        },
        error
      );
      return () => {
        stopCampaign();
        stopRoster();
      };
    },
    async inspect(ref: CharacterRef): Promise<Readonly<FolioCharacter>> {
      const check = session.ticket();
      const snapshot = await getDocFromServer(doc(db, characterPath(ref)));
      check();
      if (!snapshot.exists()) throw new Error("not-found");
      return scopedCharacter(snapshot.data());
    },
    watchCharacter(
      ref: CharacterRef,
      next: (value: Readonly<FolioCharacter> | null) => void,
      error: (error: Error) => void
    ) {
      return watch(
        doc(db, characterPath(ref)),
        (rows) => (rows[0] ? scopedCharacter(rows[0]) : null),
        null,
        next,
        error,
        ref.ownerUid === uid()
      );
    },
    watchAccount(
      next: (value: FolioAccount | null) => void,
      error: (error: Error) => void
    ) {
      return watch(
        doc(db, "folioAccounts/" + uid()),
        (rows) => {
          if (!rows[0]) return null;
          const a = object(rows[0]);
          if (
            a.schema !== 1 ||
            typeof a.displayName !== "string" ||
            (a.locale !== "en" && a.locale !== "it") ||
            Object.keys(a).length !== 3
          )
            throw new Error("invalid-account");
          return frozen<FolioAccount>({
            schema: 1,
            displayName: a.displayName,
            locale: a.locale,
          });
        },
        null,
        next,
        error,
        true
      );
    },
    watchAuthority(
      next: (value: { status: string; isAdmin: boolean } | null) => void,
      error: (error: Error) => void
    ) {
      return watch(
        doc(db, "users/" + uid()),
        (rows) =>
          rows[0]
            ? { status: String(rows[0].status), isAdmin: rows[0].role === "admin" }
            : null,
        null,
        next,
        error
      );
    },
    async ensureIdentity(displayName: string, locale: "en" | "it" = "en") {
      const owner = uid(),
        check = session.ticket();
      if (
        typeof displayName !== "string" ||
        displayName.length > 120 ||
        !["en", "it"].includes(locale)
      )
        throw new Error("invalid-account");
      try {
        await write(() =>
          runTransaction(db, async (tx) => {
            const target = doc(db, "users/" + owner);
            const existing = await tx.get(target);
            check();
            if (!existing.exists()) tx.set(target, { status: "active" });
          })
        );
        check();
        await write(() =>
          runTransaction(db, async (tx) => {
            const target = doc(db, "folioAccounts/" + owner);
            const existing = await tx.get(target);
            check();
            if (!existing.exists()) tx.set(target, { schema: 1, displayName, locale });
          })
        );
      } catch (error) {
        const code = (error as Error & { code?: string }).code;
        if (code !== "unavailable" && (error as Error).message !== "offline") throw error;
        // Only already-held OWNER data may restore offline. Foreign authorization
        // and administrator authority still require a current server response.
        try {
          const [authority, account] = await Promise.all([
            getDocFromCache(doc(db, "users/" + owner)),
            getDocFromCache(doc(db, "folioAccounts/" + owner)),
          ]);
          check();
          if (
            !authority.exists() ||
            authority.data().status === "blocked" ||
            !account.exists()
          )
            throw new Error("offline", { cause: error });
        } catch (cachedError) {
          check();
          throw new Error("offline", { cause: cachedError });
        }
      }
    },
    async saveAccount(account: Omit<FolioAccount, "schema">) {
      const owner = uid(),
        check = session.ticket();
      if (
        typeof account.displayName !== "string" ||
        account.displayName.length > 120 ||
        !["en", "it"].includes(account.locale)
      )
        throw new Error("invalid-account");
      await write(() =>
        runTransaction(db, async (tx) => {
          const user = doc(db, "users/" + owner);
          const existing = await tx.get(user);
          check();
          if (!existing.exists()) tx.set(user, { status: "active" });
        })
      );
      check();
      return write(() =>
        setDoc(doc(db, "folioAccounts/" + owner), { schema: 1, ...account })
      );
    },
    async getInvite(campaignId: string): Promise<FolioInvite | null> {
      const check = session.ticket();
      const snap = await getDocFromServer(
        doc(db, "folioInvites/" + identityId(campaignId))
      );
      check();
      if (!snap.exists()) return null;
      const x = snap.data();
      if (
        x.id !== campaignId ||
        typeof x.name !== "string" ||
        typeof x.joinOpen !== "boolean" ||
        Object.keys(x).length !== 3
      )
        throw new Error("invalid-invite");
      return frozen(x as FolioInvite);
    },
    async createCampaign(name: string): Promise<string> {
      const owner = uid();
      if (!name.trim() || name.length > 200) throw new Error("invalid-name");
      const id = crypto.randomUUID();
      await write(() =>
        runTransaction(db, (tx) => {
          tx.set(doc(db, camp(id)), {
            schema: 1,
            id,
            name,
            dmUid: owner,
            members: [owner],
            revision: 0,
            archived: false,
            joinOpen: true,
          });
          tx.set(doc(db, "folioInvites/" + id), { id, name, joinOpen: true });
          return Promise.resolve();
        })
      );
      return id;
    },
    async setJoinOpen(id: string, joinOpen: boolean) {
      const check = session.ticket();
      return write(() =>
        runTransaction(db, async (tx) => {
          const target = doc(db, camp(id));
          const snapshot = await tx.get(target);
          const c = parseCampaign(snapshot.data());
          if (c.dmUid !== uid()) {
            const authority = await tx.get(doc(db, "users/" + uid()));
            if (
              authority.data()?.role !== "admin" ||
              authority.data()?.status === "blocked"
            )
              throw new Error("not-dm");
          }
          check();
          tx.update(target, { joinOpen, revision: c.revision + 1 });
          tx.set(doc(db, "folioInvites/" + id), {
            id,
            name: c.name,
            joinOpen: joinOpen && !c.archived,
          });
        })
      );
    },
    async joinCampaign(id: string) {
      const owner = uid(),
        check = session.ticket();
      return write(() =>
        runTransaction(db, async (tx) => {
          const invite = await tx.get(doc(db, "folioInvites/" + identityId(id)));
          if (!invite.exists() || invite.data().joinOpen !== true)
            throw new Error("invite-closed");
          check();
          tx.update(doc(db, camp(id)), {
            members: arrayUnion(owner),
            revision: increment(1),
          });
        })
      );
    },
    async leaveCampaign(id: string) {
      const owner = uid();
      return write(() =>
        setDoc(
          doc(db, camp(id)),
          { members: arrayRemove(owner), revision: increment(1) },
          { merge: true }
        )
      );
    },
    async revokeMember(id: string, memberUid: string) {
      const check = session.ticket();
      return write(() =>
        runTransaction(db, async (tx) => {
          const target = doc(db, camp(id));
          const snapshot = await tx.get(target);
          const c = parseCampaign(snapshot.data());
          if (memberUid === c.dmUid) throw new Error("not-dm");
          if (c.dmUid !== uid()) {
            const authority = await tx.get(doc(db, "users/" + uid()));
            if (
              authority.data()?.role !== "admin" ||
              authority.data()?.status === "blocked"
            )
              throw new Error("not-dm");
          }
          check();
          tx.update(target, {
            members: c.members.filter((m) => m !== memberUid),
            revision: c.revision + 1,
          });
        })
      );
    },
    assign(id: string, campaignId: string) {
      return assignment(id, campaignId);
    },
    release(id: string) {
      return assignment(id, null);
    },
    watchPrivateNotes(
      ref: CharacterRef,
      next: (value: string) => void,
      error: (error: Error) => void
    ) {
      if (ref.ownerUid !== uid()) throw new Error("not-owner");
      return watch(
        doc(db, characterPath(ref) + "/private/notes"),
        (rows) => String(rows[0]?.text ?? ""),
        "",
        next,
        error,
        true
      );
    },
    savePrivateNotes(ref: CharacterRef, text: string) {
      if (ref.ownerUid !== uid()) throw new Error("not-owner");
      if (text.length > 100000) throw new Error("notes-too-large");
      return write(() =>
        setDoc(doc(db, characterPath(ref) + "/private/notes"), { text })
      );
    },
    watchDmNotes(
      id: string,
      next: (value: string) => void,
      error: (error: Error) => void
    ) {
      if (id !== session.scope().campaignId) throw new Error("wrong-campaign");
      return watch(
        doc(db, camp(id) + "/dmNotes/main"),
        (rows) => String(rows[0]?.text ?? ""),
        "",
        next,
        error
      );
    },
    saveDmNotes(id: string, text: string) {
      if (id !== session.scope().campaignId) throw new Error("wrong-campaign");
      if (text.length > 100000) throw new Error("notes-too-large");
      return write(() => setDoc(doc(db, camp(id) + "/dmNotes/main"), { text }));
    },
    dryRunImport(text: string, id: string) {
      return dryRunMigration(text, { ownerUid: uid(), id });
    },
    async applyImport(plan: MigrationPlan) {
      if (plan.character.ownerUid !== uid()) throw new Error("not-owner");
      const verified = dryRunMigration(plan.archive.original, {
        ownerUid: uid(),
        id: plan.character.id,
      });
      if (JSON.stringify(verified) !== JSON.stringify(plan))
        throw new Error("invalid-migration-plan");
      const check = session.ticket();
      await write(() =>
        runTransaction(db, async (tx) => {
          const target = doc(db, plan.destination);
          const existing = await tx.get(target);
          const archive = doc(db, plan.destination + "/private/import");
          const previous = await tx.get(archive);
          check();
          if (existing.exists()) {
            if (!previous.exists() || previous.data().original !== plan.archive.original)
              throw new Error("import-conflict");
            return;
          }
          tx.set(target, plan.character);
          tx.set(archive, plan.archive);
          tx.set(doc(db, plan.destination + "/private/notes"), {
            text: plan.privateNotes,
          });
        })
      );
      return plan.character.id;
    },
    async importLegacy(text: string): Promise<string> {
      const check = session.ticket();
      uid();
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      check();
      const id =
        "import-" +
        Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      return api.applyImport(api.dryRunImport(text, id));
    },
    async recoverImport(id: string): Promise<string> {
      const check = session.ticket();
      const snap = await getDocFromServer(doc(db, cp(id) + "/private/import"));
      check();
      if (!snap.exists()) throw new Error("not-found");
      return recoverMigration(snap.data());
    },
  };
  return api;
}
export type IdentityRepository = ReturnType<typeof createIdentityRepository>;
