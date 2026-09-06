import { readFileSync, readdirSync, existsSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  writeBatch,
  deleteDoc,
  disableNetwork,
  enableNetwork,
} from "firebase/firestore";
import { getBytes, uploadBytes, ref, listAll } from "firebase/storage";
import {
  createIdentityRepository,
  SessionController,
  scopedAsset,
  parseCharacter,
} from "../../src/lib/identity";
import type { Firestore } from "firebase/firestore";
let env: RulesTestEnvironment;
const campaign = (id = "camp") => ({
  schema: 1,
  id,
  name: "Campaign",
  dmUid: "dm",
  members: ["dm", "owner", "member"],
  revision: 0,
  archived: false,
  joinOpen: true,
});
const character = (id = "one") => ({
  schema: 1,
  ownerUid: "owner",
  id,
  name: "Character",
  speciesId: "elf",
  classId: "wizard",
  level: 2,
  revision: 0,
  currentAssignment: null,
  sheet: { build: { name: "Character" }, state: {} },
  portraitPath: null,
});
const cp = (id = "one") => "folioAccounts/owner/characters/" + id;
const rp = (id = "one", camp = "camp") =>
  "folioCampaigns/" + camp + "/roster/owner~" + id;
const db = (uid: string) => env.authenticatedContext(uid).firestore();
beforeAll(async () => {
  const projectId = process.env.IDENTITY_RULES_PROJECT_ID ?? "demo-d20folio";
  if (!["demo-d20folio", "demo-d20folio-admin-review"].includes(projectId))
    throw new Error("identity tests require an explicit demo project");
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});
describe("administrator matrix", () => {
  it("supports validated owner account access and character enumeration without assignment authority", async () => {
    const admin = db("admin");
    await assertSucceeds(
      setDoc(doc(admin, "folioAccounts/owner"), {
        schema: 1,
        displayName: "Owner",
        locale: "en",
      })
    );
    await assertSucceeds(getDoc(doc(admin, "folioAccounts/owner")));
    await assertSucceeds(getDocs(collection(admin, "folioAccounts")));
    await assertSucceeds(updateDoc(doc(admin, "folioAccounts/owner"), { locale: "it" }));
    await assertFails(updateDoc(doc(admin, "folioAccounts/owner"), { role: "admin" }));
    await assertSucceeds(getDocs(collection(admin, "folioAccounts/owner/characters")));
    await assertSucceeds(setDoc(doc(admin, cp("three")), character("three")));
    await assertFails(
      updateDoc(doc(admin, cp()), { revision: 1, currentAssignment: null })
    );
  });
  it("supports immutable addressed offer administration and artwork while preserving source versions", async () => {
    const admin = db("admin"),
      path = "folioAccounts/owner/offers/gift";
    await assertSucceeds(
      setDoc(doc(admin, path), {
        schema: 1,
        senderUid: "owner",
        recipientUid: "member",
        sourceId: "book",
        sourceVersion: 1,
        revoked: false,
      })
    );
    await assertSucceeds(getDoc(doc(admin, path)));
    await assertSucceeds(getDocs(collection(admin, "folioAccounts/owner/offers")));
    await assertFails(updateDoc(doc(admin, path), { sourceVersion: 2 }));
    const art = ref(env.authenticatedContext("admin").storage(), path + "/art.png");
    await assertSucceeds(
      uploadBytes(art, new Uint8Array([1]), { contentType: "image/png" })
    );
    await assertSucceeds(getBytes(art));
    await assertSucceeds(listAll(ref(env.authenticatedContext("admin").storage(), path)));
    await assertFails(
      uploadBytes(art, new Uint8Array([2]), { contentType: "image/png" })
    );
    await assertFails(
      uploadBytes(
        ref(env.authenticatedContext("owner").storage(), path + "/art.png"),
        new Uint8Array([3]),
        { contentType: "image/png" }
      )
    );
    await assertSucceeds(updateDoc(doc(admin, path), { revoked: true }));
    await assertSucceeds(getBytes(art));
    await assertFails(getDoc(doc(db("member"), path)));
  });
  it("admin campaign controls preserve revision, DM membership and reciprocal invitation constraints", async () => {
    const admin = db("admin");
    const batch = writeBatch(admin);
    batch.update(doc(admin, "folioCampaigns/camp"), {
      name: "Renamed",
      joinOpen: false,
      revision: 1,
    });
    batch.set(doc(admin, "folioInvites/camp"), {
      id: "camp",
      name: "Renamed",
      joinOpen: false,
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(
      updateDoc(doc(admin, "folioCampaigns/camp"), {
        members: ["dm", "owner"],
        revision: 2,
      })
    );
    await assertFails(
      updateDoc(doc(admin, "folioCampaigns/camp"), { members: ["owner"], revision: 3 })
    );
    await assertFails(
      updateDoc(doc(admin, "folioCampaigns/camp"), { revision: 2, joinOpen: true })
    );
    await assertFails(
      setDoc(doc(admin, "folioInvites/camp"), {
        id: "camp",
        name: "Forged",
        joinOpen: true,
      })
    );
  });
  it("repository DM operations honor trusted administrator authority without making the admin a member", async () => {
    const { repo } = repository("admin");
    await repo.setJoinOpen("camp", false);
    await repo.revokeMember("camp", "owner");
    const result = (await getDoc(doc(db("admin"), "folioCampaigns/camp"))).data();
    expect(result?.members).toEqual(["dm", "member"]);
    expect(result?.joinOpen).toBe(false);
  });
  it("blocked administrator has none of the expanded account, campaign, offer or artwork rights", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "folioAccounts/owner"), {
        schema: 1,
        displayName: "Owner",
        locale: "en",
      });
      await setDoc(doc(ctx.firestore(), "folioAccounts/owner/offers/gift"), {
        schema: 1,
        senderUid: "owner",
        recipientUid: "member",
        sourceId: "book",
        sourceVersion: 1,
        revoked: false,
      });
      await uploadBytes(
        ref(ctx.storage(), "folioAccounts/owner/offers/gift/art.png"),
        new Uint8Array([1]),
        { contentType: "image/png" }
      );
      await updateDoc(doc(ctx.firestore(), "users/admin"), { status: "blocked" });
    });
    const admin = db("admin");
    await assertFails(getDoc(doc(admin, "folioAccounts/owner")));
    await assertFails(updateDoc(doc(admin, "folioAccounts/owner"), { locale: "it" }));
    await assertFails(getDocs(collection(admin, "folioAccounts/owner/characters")));
    await assertFails(getDocs(collection(admin, "folioAccounts/owner/offers")));
    await assertFails(
      updateDoc(doc(admin, "folioAccounts/owner/offers/gift"), { revoked: true })
    );
    await assertFails(
      updateDoc(doc(admin, "folioCampaigns/camp"), { members: ["dm"], revision: 1 })
    );
    await assertFails(
      getBytes(
        ref(
          env.authenticatedContext("admin").storage(),
          "folioAccounts/owner/offers/gift/art.png"
        )
      )
    );
  });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const uid of ["owner", "member", "dm", "other", "admin", "blocked"])
      await setDoc(doc(ctx.firestore(), "users", uid), {
        status: uid === "blocked" ? "blocked" : "active",
        role: uid === "admin" ? "admin" : "user",
      });
    for (const id of ["camp", "other"])
      await setDoc(doc(ctx.firestore(), "folioCampaigns", id), campaign(id));
    for (const id of ["one", "two"])
      await setDoc(doc(ctx.firestore(), cp(id)), character(id));
  });
});
async function attach(id = "one", camp = "camp") {
  const store = db("owner");
  const b = writeBatch(store);
  b.update(doc(store, cp(id)), {
    revision: 1,
    currentAssignment: { campaignId: camp, assignmentId: "assignment-" + id, version: 1 },
  });
  b.set(doc(store, rp(id, camp)), {
    ownerUid: "owner",
    characterId: id,
    assignmentId: "assignment-" + id,
    version: 1,
  });
  return b.commit();
}
describe("new identity direct ACL and assignment bypasses", () => {
  it("admits two sibling PCs with reciprocal assignment and DM immutable inspection", async () => {
    await assertSucceeds(attach());
    await assertSucceeds(attach("two"));
    expect((await getDocs(collection(db("dm"), "folioCampaigns/camp/roster"))).size).toBe(
      2
    );
    for (const id of ["one", "two"]) {
      await assertSucceeds(getDoc(doc(db("dm"), cp(id))));
      await assertFails(
        updateDoc(doc(db("dm"), cp(id)), { revision: 2, name: "stolen" })
      );
    }
  });
  it("denies target without reciprocity and roster forgery without owner assignment", async () => {
    await assertFails(
      updateDoc(doc(db("owner"), cp()), {
        revision: 1,
        currentAssignment: { campaignId: "camp", assignmentId: "fake", version: 1 },
      })
    );
    await assertFails(
      setDoc(doc(db("owner"), rp()), {
        ownerUid: "owner",
        characterId: "one",
        assignmentId: "fake",
        version: 1,
      })
    );
  });
  it.each([
    0,
    "camp",
    {},
    { campaignId: "camp" },
    { campaignId: "camp", assignmentId: "x", version: -1 },
  ])("rejects malformed claim %j", async (claim) => {
    await assertFails(
      updateDoc(doc(db("owner"), cp()), { revision: 1, currentAssignment: claim })
    );
  });
  it("owner can release after membership revocation but cannot use stale claim to read or move a live PC", async () => {
    await attach();
    await assertFails(
      updateDoc(doc(db("owner"), cp()), {
        revision: 2,
        currentAssignment: { campaignId: "other", assignmentId: "x", version: 2 },
      })
    );
    await updateDoc(doc(db("dm"), "folioCampaigns/camp"), {
      members: ["dm", "member"],
      revision: 1,
    });
    await assertFails(getDoc(doc(db("member"), cp())));
    await assertSucceeds(
      updateDoc(doc(db("owner"), cp()), { revision: 2, currentAssignment: null })
    );
  });
  it("current members read only reciprocal characters; outsider, blocked and anonymous denied", async () => {
    await attach();
    await assertSucceeds(getDoc(doc(db("member"), cp())));
    for (const uid of ["other", "blocked"]) await assertFails(getDoc(doc(db(uid), cp())));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), cp())));
    await assertSucceeds(getDoc(doc(db("admin"), cp())));
    await assertFails(getDocs(collection(db("dm"), "folioAccounts/owner/characters")));
  });
  it("owner private notes/imports and DM narrative are separate literal paths, unknown descendants deny all", async () => {
    await attach();
    const notes = cp() + "/private/notes";
    await assertSucceeds(setDoc(doc(db("owner"), notes), { text: "private" }));
    for (const uid of ["member", "dm", "other", "blocked"])
      await assertFails(getDoc(doc(db(uid), notes)));
    await assertSucceeds(getDoc(doc(db("admin"), notes)));
    await assertSucceeds(
      setDoc(doc(db("dm"), "folioCampaigns/camp/dmNotes/main"), { text: "DM private" })
    );
    await assertFails(getDoc(doc(db("member"), "folioCampaigns/camp/dmNotes/main")));
    for (const uid of ["owner", "dm", "admin"]) {
      await assertFails(setDoc(doc(db(uid), cp() + "/unknown/x"), { x: 1 }));
      await assertFails(getDocs(collection(db(uid), "folioCampaigns/camp/unknown")));
    }
  });
  it("blocks cross-owner writes and stale revisions even for an admin", async () => {
    for (const uid of ["dm", "member", "admin"])
      await assertFails(
        updateDoc(doc(db(uid), cp()), { revision: 1, currentAssignment: null })
      );
    await assertFails(
      updateDoc(doc(db("owner"), cp()), { revision: 0, currentAssignment: null })
    );
  });
  it("owner recovery checks live old membership at commit even when the client did not read it", async () => {
    await attach();
    await updateDoc(doc(db("dm"), "folioCampaigns/camp"), {
      members: ["dm", "member"],
      revision: 1,
    });
    await updateDoc(doc(db("dm"), "folioCampaigns/camp"), {
      members: ["dm", "member", "owner"],
      revision: 2,
    });
    const store = db("owner"),
      b = writeBatch(store);
    b.update(doc(store, cp()), {
      revision: 2,
      currentAssignment: { campaignId: "other", assignmentId: "new", version: 2 },
    });
    b.set(doc(store, rp("one", "other")), {
      ownerUid: "owner",
      characterId: "one",
      assignmentId: "new",
      version: 2,
    });
    b.delete(doc(store, rp()));
    await assertFails(b.commit());
  });
  it("authenticated private asset get/list respects owner and DM ACL and revocation", async () => {
    const bytes = new Uint8Array([1, 2]);
    const path = cp() + "/private/photo.png";
    await assertSucceeds(
      uploadBytes(ref(env.authenticatedContext("owner").storage(), path), bytes, {
        contentType: "image/png",
      })
    );
    for (const uid of ["member", "dm", "blocked"]) {
      await assertFails(getBytes(ref(env.authenticatedContext(uid).storage(), path)));
      await assertFails(
        listAll(ref(env.authenticatedContext(uid).storage(), cp() + "/private"))
      );
    }
    await assertSucceeds(
      getBytes(ref(env.authenticatedContext("owner").storage(), path))
    );
    const dp = "folioCampaigns/camp/dmNotes/photo.png";
    await assertSucceeds(
      uploadBytes(ref(env.authenticatedContext("dm").storage(), dp), bytes, {
        contentType: "image/png",
      })
    );
    await assertFails(getBytes(ref(env.authenticatedContext("member").storage(), dp)));
    await updateDoc(doc(db("dm"), "folioCampaigns/camp"), {
      dmUid: "member",
      revision: 1,
    });
    await assertFails(getBytes(ref(env.authenticatedContext("dm").storage(), dp)));
  });
  it("keeps addressed acceptance immutable and requires active exact source version at commit", async () => {
    const source = "folioAccounts/owner/offers/gift";
    await assertSucceeds(
      setDoc(doc(db("owner"), source), {
        schema: 1,
        senderUid: "owner",
        recipientUid: "member",
        sourceId: "book",
        sourceVersion: 2,
        revoked: false,
      })
    );
    await assertFails(getDoc(doc(db("other"), source)));
    const receipt = "folioAccounts/member/receipts/owner~gift";
    await assertFails(
      setDoc(doc(db("owner"), receipt), {
        senderUid: "owner",
        offerId: "gift",
        sourceId: "book",
        sourceVersion: 2,
      })
    );
    await assertFails(
      setDoc(doc(db("member"), receipt), {
        senderUid: "owner",
        offerId: "gift",
        sourceId: "book",
        sourceVersion: 1,
      })
    );
    await assertSucceeds(
      setDoc(doc(db("member"), receipt), {
        senderUid: "owner",
        offerId: "gift",
        sourceId: "book",
        sourceVersion: 2,
      })
    );
    await assertFails(updateDoc(doc(db("member"), receipt), { sourceVersion: 3 }));
    await assertSucceeds(updateDoc(doc(db("owner"), source), { revoked: true }));
    await assertFails(getDoc(doc(db("member"), source)));
    await assertSucceeds(getDoc(doc(db("member"), receipt)));
    await assertFails(deleteDoc(doc(db("member"), receipt)));
  });
});
function repository(owner = "owner", campaignId: string | null = "camp") {
  const session = new SessionController();
  session.transition({ uid: owner, campaignId, activeCharacterId: null });
  const store = db(owner) as unknown as Firestore;
  return {
    session,
    store,
    repo: createIdentityRepository(store, session),
  };
}
describe("identity revocation, offline and copy evidence", () => {
  it("does not publish inert roster references after owner membership revocation", async () => {
    const owner = repository(),
      dm = repository("dm");
    await owner.repo.assign("one", "camp");
    let latest: unknown[] = [];
    dm.repo.watchRoster(
      "camp",
      (rows) => {
        latest = rows;
      },
      (error) => {
        throw error;
      }
    );
    await vi.waitFor(() => expect(latest).toHaveLength(1));
    await dm.repo.revokeMember("camp", "owner");
    await vi.waitFor(() => expect(latest).toHaveLength(0));
    dm.session.revoke();
  });
  it("revocation clears all scope views and registered assets before reporting denial", async () => {
    const owner = repository();
    await owner.repo.assign("one", "camp");
    const viewer = repository("dm");
    const releases: string[] = [];
    await scopedAsset(() => Promise.resolve(new ArrayBuffer(2)), viewer.session, {
      create: () => "blob:private",
      revoke: (url) => releases.push(url),
    });
    let denied!: (error: Error) => void;
    const denial = new Promise<Error>((r) => {
      denied = r;
    });
    let seen!: (value: unknown) => void;
    const ready = new Promise((r) => {
      seen = r;
    });
    const snapshots: unknown[] = [];
    viewer.repo.watchCharacter(
      { ownerUid: "owner", id: "one" },
      (value) => {
        snapshots.push(value);
        if (value) seen(value);
      },
      denied
    );
    await ready;
    await owner.repo.release("one");
    const error = await denial;
    expect((error as Error & { code: string }).code).toBe("permission-denied");
    expect(snapshots.at(-1)).toBeNull();
    expect(releases).toEqual(["blob:private"]);
    expect(viewer.session.scope()).toEqual({
      uid: "dm",
      campaignId: null,
      activeCharacterId: null,
    });
  });
  it("restores only owner data from cache while offline and rejects assignment without claiming a commit", async () => {
    const { repo, session, store } = repository();
    await repo.savePrivateNotes({ ownerUid: "owner", id: "one" }, "cached");
    await getDoc(doc(store, cp() + "/private/notes"));
    await repo.ensureIdentity("Owner", "en");
    await getDoc(doc(store, "users/owner"));
    await getDoc(doc(store, "folioAccounts/owner"));
    await disableNetwork(store);
    vi.stubGlobal("navigator", { onLine: false });
    try {
      await repo.ensureIdentity("Preserved", "it");
      await expect(repo.assign("one", "camp")).rejects.toThrow("offline");
      const value = await new Promise<string>((resolve, reject) => {
        repo.watchPrivateNotes(
          { ownerUid: "owner", id: "one" },
          (text) => {
            if (text) resolve(text);
          },
          reject
        );
      });
      expect(value).toBe("cached");
      session.transition({ uid: "other", campaignId: null, activeCharacterId: null });
    } finally {
      vi.unstubAllGlobals();
      await enableNetwork(store);
      session.revoke();
    }
  });
  it("getAfter source denies atomic revoke plus receipt and receipt IDs cannot be duplicated", async () => {
    const store = db("owner");
    const source = "folioAccounts/owner/offers/self";
    await setDoc(doc(store, source), {
      schema: 1,
      senderUid: "owner",
      recipientUid: "owner",
      sourceId: "book",
      sourceVersion: 1,
      revoked: false,
    });
    const receipt = {
      senderUid: "owner",
      offerId: "self",
      sourceId: "book",
      sourceVersion: 1,
    };
    await assertFails(
      setDoc(doc(store, "folioAccounts/owner/receipts/duplicate"), receipt)
    );
    const batch = writeBatch(store);
    batch.update(doc(store, source), { revoked: true });
    batch.set(doc(store, "folioAccounts/owner/receipts/owner~self"), receipt);
    await assertFails(batch.commit());
  });
  it("admin has the accepted private-data and DM-note authority; blocked admin has none", async () => {
    await setDoc(doc(db("owner"), cp() + "/private/notes"), { text: "owner private" });
    await assertSucceeds(getDoc(doc(db("admin"), cp() + "/private/notes")));
    await assertSucceeds(
      setDoc(doc(db("admin"), "folioCampaigns/camp/dmNotes/main"), {
        text: "administrator",
      })
    );
    const path = cp() + "/private/a.png";
    await uploadBytes(
      ref(env.authenticatedContext("owner").storage(), path),
      new Uint8Array([1]),
      { contentType: "image/png" }
    );
    await assertSucceeds(
      getBytes(ref(env.authenticatedContext("admin").storage(), path))
    );
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), "users/admin"), { status: "blocked" })
    );
    await assertFails(getDoc(doc(db("admin"), cp() + "/private/notes")));
    await assertFails(getBytes(ref(env.authenticatedContext("admin").storage(), path)));
  });
  it.skipIf(!existsSync("content-pack/fixtures/team"))(
    "migrates six fixture COPIES, applies twice, joins, revokes, releases and rejoins without changing source bytes",
    async () => {
      const owner = repository(),
        dm = repository("dm");
      const dir = "content-pack/fixtures/team";
      const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
      expect(files).toHaveLength(6);
      for (const file of files) {
        const original = readFileSync(dir + "/" + file, "utf8");
        const id = await owner.repo.importLegacy(original);
        expect(await owner.repo.importLegacy(original)).toBe(id);
        await owner.repo.assign(id, "camp");
        const sheet = await dm.repo.inspect({ ownerUid: "owner", id });
        expect(sheet.name.length > 0).toBe(true);
        await dm.repo.revokeMember("camp", "owner");
        await owner.repo.release(id);
        await env.withSecurityRulesDisabled((ctx) =>
          updateDoc(doc(ctx.firestore(), "folioCampaigns/camp"), {
            members: ["dm", "member", "owner"],
          })
        );
        await owner.repo.assign(id, "camp");
        expect((await dm.repo.inspect({ ownerUid: "owner", id })).id).toBe(id);
        expect(await owner.repo.recoverImport(id)).toBe(original);
        expect(readFileSync(dir + "/" + file, "utf8") === original).toBe(true);
      }
    }
  );
});
describe("identity repository committed transitions", () => {
  it("bootstraps a new authenticated profile without self-promoting", async () => {
    const { repo } = repository("fresh", null);
    await repo.saveAccount({ displayName: "New owner", locale: "en" });
    expect(
      (await getDoc(doc(db("fresh"), "folioAccounts/fresh"))).data()?.displayName
    ).toBe("New owner");
    expect((await getDoc(doc(db("fresh"), "users/fresh"))).data()?.role).toBeUndefined();
  });
  it("ensures identity before subscriptions while preserving an existing account locale", async () => {
    const { repo } = repository("fresh", null);
    await repo.ensureIdentity("First", "it");
    await repo.ensureIdentity("Changed", "en");
    expect((await getDoc(doc(db("fresh"), "folioAccounts/fresh"))).data()).toEqual({
      schema: 1,
      displayName: "First",
      locale: "it",
    });
  });
  it("races two sibling assignments without losing either row and rejects one same-PC competing claim", async () => {
    const { repo } = repository();
    await Promise.all([repo.assign("one", "camp"), repo.assign("two", "camp")]);
    expect((await getDocs(collection(db("dm"), "folioCampaigns/camp/roster"))).size).toBe(
      2
    );
    await repo.release("one");
    const results = await Promise.allSettled([
      repo.assign("one", "camp"),
      repo.assign("one", "other"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const c = parseCharacter((await getDoc(doc(db("owner"), cp()))).data());
    expect(c.currentAssignment).not.toBeNull();
    expect(
      (
        await getDoc(
          doc(db("owner"), rp("one", c.currentAssignment?.campaignId ?? "missing"))
        )
      ).exists()
    ).toBe(true);
  });
  it("recovers a revoked assignment online and owner releases after campaign deletion", async () => {
    const { repo } = repository();
    await repo.assign("one", "camp");
    await repository("dm").repo.revokeMember("camp", "owner");
    await repo.assign("one", "other");
    expect(
      parseCharacter((await getDoc(doc(db("owner"), cp()))).data()).currentAssignment
        ?.campaignId
    ).toBe("other");
    await env.withSecurityRulesDisabled((ctx) =>
      deleteDoc(doc(ctx.firestore(), "folioCampaigns/other"))
    );
    await repo.release("one");
    expect((await getDoc(doc(db("owner"), cp()))).data()?.currentAssignment).toBeNull();
  });
  it("releases an obsolete claim whose reciprocal row is already missing", async () => {
    const { repo } = repository();
    await repo.assign("one", "camp");
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), rp())));
    await repo.release("one");
    expect((await getDoc(doc(db("owner"), cp()))).data()?.currentAssignment).toBeNull();
  });
  it("creates a private campaign, joins through a minimal invitation and revokes future invitations", async () => {
    const dm = repository("dm", null).repo;
    const id = await dm.createCampaign("New table");
    const owner = repository("owner", null).repo;
    expect(await owner.getInvite(id)).toEqual({ id, name: "New table", joinOpen: true });
    await assertFails(getDoc(doc(db("owner"), "folioCampaigns/" + id)));
    await owner.joinCampaign(id);
    expect(
      (await getDoc(doc(db("owner"), "folioCampaigns/" + id))).data()?.members
    ).toEqual(["dm", "owner"]);
    await dm.setJoinOpen(id, false);
    await expect(repository("other", null).repo.joinCampaign(id)).rejects.toThrow(
      "invite-closed"
    );
    await owner.leaveCampaign(id);
    await assertFails(getDoc(doc(db("owner"), "folioCampaigns/" + id)));
  });
  it("imports idempotently from copies and retrieves exact owner-only original while DM reads projected sheet", async () => {
    const { repo } = repository();
    const original =
      ' {"schema":3,"build":{"name":"New","race":"elf","classes":[{"classId":"wizard","level":2}],"lore":{"backstory":"private"}},"state":{"currency":{"gp":20}},"unknown":"recover"} ';
    const id = await repo.importLegacy(original);
    expect(await repo.importLegacy(original)).toBe(id);
    expect(await repo.recoverImport(id)).toBe(original);
    await repo.assign(id, "camp");
    const inspected = await repository("dm").repo.inspect({ ownerUid: "owner", id });
    expect(inspected.sheet.build).not.toHaveProperty("lore");
    expect(inspected.sheet.state.currency).toEqual({ gp: 20 });
    await assertFails(getDoc(doc(db("dm"), cp(id) + "/private/import")));
    await expect(
      repository("dm", "other").repo.inspect({ ownerUid: "owner", id })
    ).rejects.toThrow("wrong-campaign");
  });
  it("watches membership queries, synchronously clears private notes on scope change and fences manually unsubscribed callbacks", async () => {
    const { repo, session } = repository();
    await repo.savePrivateNotes({ ownerUid: "owner", id: "one" }, "private");
    const memberships = await new Promise<unknown[]>((resolve, reject) => {
      let stop = () => {};
      stop = repo.watchMemberships((rows) => {
        if (rows.length) {
          resolve(rows);
          queueMicrotask(stop);
        }
      }, reject);
    });
    expect(memberships).toHaveLength(2);
    const notes: string[] = [];
    await new Promise<void>((resolve, reject) => {
      repo.watchPrivateNotes(
        { ownerUid: "owner", id: "one" },
        (value) => {
          notes.push(value);
          if (value === "private") resolve();
        },
        reject
      );
    });
    session.transition({ uid: "other", campaignId: null, activeCharacterId: null });
    expect(notes.at(-1)).toBe("");
  });
});
