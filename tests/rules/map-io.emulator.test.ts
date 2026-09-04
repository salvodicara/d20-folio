/// <reference types="node" />
/**
 * The map-background Storage adapter (`src/lib/map-io.ts`) against the REAL Storage emulator.
 *
 * EMULATOR-DEPENDENT — runs in the `pnpm test:rules` lane beside `storage-rules.test.ts`
 * (which proves the access matrix of the same prefix). This file proves the ADAPTER: the
 * upload returns the reference the `map` table op carries, the per-campaign usage is summed
 * from Storage's own metadata, a refused upload sends no bytes, and a delete is idempotent.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getDownloadURL, getMetadata, ref, type FirebaseStorage } from "firebase/storage";
import {
  MapUploadRefused,
  campaignMapUsage,
  deleteMapBackground,
  mapBackgroundPath,
  uploadMapBackground,
} from "@/lib/map-io";

const PROJECT_ID = "demo-d20folio";
/** One campaign (one Storage prefix) per test: `testEnv.clearStorage()` did not remove the
 *  previous test's objects on this emulator (observed 2026-09-04), and the usage sum is
 *  per-campaign by contract, so a fresh prefix is the honest isolation. */
let CAMPAIGN = "camp-maps-0";
let campaigns = 0;
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

let testEnv: RulesTestEnvironment;

function storageFor(uid: string): FirebaseStorage {
  return testEnv.authenticatedContext(uid).storage();
}

function blobOf(bytes: number): Blob {
  const data = new Uint8Array(bytes);
  data.set(JPEG_BYTES.subarray(0, Math.min(bytes, JPEG_BYTES.length)));
  return new Blob([data], { type: "image/jpeg" });
}

const GRID = { width: 2400, height: 1600, cellPx: 80, origin: { x: 0, y: 0 } };

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
    storage: {
      rules: readFileSync(resolve(__dirname, "../../storage.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  campaigns += 1;
  CAMPAIGN = `camp-maps-${campaigns}`;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", "dm"), { status: "active" });
    await setDoc(doc(db, "campaigns", CAMPAIGN), {
      name: "Maps",
      createdBy: "dm",
      dmUid: "dm",
      members: ["dm", "member"],
      memberDetails: {},
      status: "active",
      inviteCode: CAMPAIGN,
      treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [],
    });
  });
});

describe("map-io — upload, usage, refusal, delete", () => {
  it("uploads a compressed background and returns the reference the map op carries", async () => {
    const storage = storageFor("dm");
    const background = await uploadMapBackground(storage, {
      campaignId: CAMPAIGN,
      blob: blobOf(64),
      mapId: "m1",
      ...GRID,
    });
    expect(background.url).toContain(
      encodeURIComponent(mapBackgroundPath(CAMPAIGN, "m1"))
    );
    expect({ ...background, url: "" }).toEqual({
      path: mapBackgroundPath(CAMPAIGN, "m1"),
      url: "",
      width: 2400,
      height: 1600,
      cellPx: 80,
      origin: { x: 0, y: 0 },
      bytes: 64,
    });
    const meta = await getMetadata(ref(storage, background.path));
    expect(meta.contentType).toBe("image/jpeg");
    expect(meta.size).toBe(64);
    expect(meta.cacheControl).toContain("immutable");
    // A member may resolve the download URL (the read rule covers getDownloadURL).
    const member = storageFor("member");
    await expect(getDownloadURL(ref(member, background.path))).resolves.toContain(
      encodeURIComponent(background.path)
    );
  });

  it("refuses a grid the reducer would reject before sending a byte", async () => {
    const storage = storageFor("dm");
    await expect(
      uploadMapBackground(storage, {
        campaignId: CAMPAIGN,
        blob: blobOf(64),
        ...GRID,
        cellPx: 7,
      })
    ).rejects.toMatchObject({ refusal: { kind: "malformed-grid" } });
    expect(await campaignMapUsage(storage, CAMPAIGN)).toEqual({ bytes: 0, files: 0 });
  });

  it("sums the campaign's usage from Storage metadata, and a delete brings it back down", async () => {
    const storage = storageFor("dm");
    expect(await campaignMapUsage(storage, CAMPAIGN)).toEqual({ bytes: 0, files: 0 });
    await uploadMapBackground(storage, {
      campaignId: CAMPAIGN,
      blob: blobOf(100),
      ...GRID,
    });
    const second = await uploadMapBackground(storage, {
      campaignId: CAMPAIGN,
      blob: blobOf(250),
      ...GRID,
    });
    expect(await campaignMapUsage(storage, CAMPAIGN)).toEqual({ bytes: 350, files: 2 });
    await deleteMapBackground(storage, second.path);
    expect(await campaignMapUsage(storage, CAMPAIGN)).toEqual({ bytes: 100, files: 1 });
    // Idempotent: deleting the same path again is a no-op, not an error.
    await expect(deleteMapBackground(storage, second.path)).resolves.toBeUndefined();
  });

  it("refuses a file over the per-file limit and an upload that would exceed the quota, sending no bytes", async () => {
    const storage = storageFor("dm");
    await expect(
      uploadMapBackground(storage, {
        campaignId: CAMPAIGN,
        blob: blobOf(1_001),
        maxBytes: 1_000,
        ...GRID,
      })
    ).rejects.toMatchObject({
      name: "MapUploadRefused",
      refusal: { kind: "too-large", bytes: 1_001, limit: 1_000 },
    });
    await uploadMapBackground(storage, {
      campaignId: CAMPAIGN,
      blob: blobOf(600),
      ...GRID,
    });
    let refused: unknown;
    try {
      await uploadMapBackground(storage, {
        campaignId: CAMPAIGN,
        blob: blobOf(500),
        quotaBytes: 1_000,
        ...GRID,
      });
    } catch (err) {
      refused = err;
    }
    expect(refused).toBeInstanceOf(MapUploadRefused);
    expect((refused as MapUploadRefused).refusal).toEqual({
      kind: "over-quota",
      used: 600,
      adding: 500,
      quota: 1_000,
    });
    expect(await campaignMapUsage(storage, CAMPAIGN)).toEqual({ bytes: 600, files: 1 });
  });
});
