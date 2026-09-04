/**
 * The Storage seam of the map background — design addendum §7
 * (docs/superpowers/specs/2026-09-04-v2-stage-5-minimum-map-design.md).
 *
 * One object per background, `campaigns/{campaignId}/maps/{mapId}.jpeg`, `mapId` a fresh UUID —
 * never the encounter id, so a later "scenes" stage can reuse an image across encounters
 * without a rename. The encounter log carries the reference (`MapBackground`: path for delete
 * and quota, token URL for display, image size, grid); this module never touches Firestore.
 *
 * Same boundary as `combat-io.ts`: it takes the `FirebaseStorage` instance from the caller and
 * never imports the app singleton, so `tests/rules/map-io.emulator.test.ts` runs this exact
 * code on the Storage emulator under an authenticated context.
 *
 * Two ceilings, stated honestly. `MAP_MAX_BYTES` per file is enforced here AND by
 * `storage.rules`. `MAP_QUOTA_BYTES` per campaign is enforced here only, from Storage's own
 * metadata (`listAll` + `getMetadata` over the campaign's prefix — the truth, with nothing to
 * drift): rules cannot sum a prefix, so the quota is a client-side courtesy and the £1
 * kill-switch is the real backstop. Compression (`image-compress.ts`, longest side
 * `MAP_MAX_PX`, JPEG `MAP_QUALITY`) is the caller's step before the upload.
 */
import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  listAll,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";
import { isMapGrid } from "./combat/map";
import type { MapBackground } from "./combat/types";

/** Longest side after compression: a 40 × 30-cell map at 100 px per cell. */
export const MAP_MAX_PX = 4096;
/** JPEG quality after compression. */
export const MAP_QUALITY = 0.85;
/** Per-file ceiling, mirrored in `storage.rules`. */
export const MAP_MAX_BYTES = 8 * 1024 * 1024;
/** Per-campaign ceiling, summed from Storage metadata. */
export const MAP_QUOTA_BYTES = 100 * 1024 * 1024;
export const MAP_CONTENT_TYPE = "image/jpeg";

/** The same long, immutable cache policy every user image has (`storage.ts`): a re-upload
 *  mints a fresh token URL, so a replaced image is never served stale. */
const MAP_UPLOAD_META = {
  contentType: MAP_CONTENT_TYPE,
  cacheControl: "public, max-age=31536000, immutable",
} as const;

/** A fresh map id. Ids only need to be unique. */
export function newMapId(): string {
  return crypto.randomUUID();
}

export function mapsPrefix(campaignId: string): string {
  return `campaigns/${campaignId}/maps`;
}

export function mapBackgroundPath(campaignId: string, mapId: string): string {
  return `${mapsPrefix(campaignId)}/${mapId}.jpeg`;
}

export interface MapUsage {
  readonly bytes: number;
  readonly files: number;
}

/** What the campaign's map backgrounds occupy, from Storage's own metadata. */
export async function campaignMapUsage(
  storage: FirebaseStorage,
  campaignId: string
): Promise<MapUsage> {
  const listing = await listAll(ref(storage, mapsPrefix(campaignId)));
  const sizes = await Promise.all(listing.items.map((item) => getMetadata(item)));
  return {
    bytes: sizes.reduce((total, meta) => total + meta.size, 0),
    files: listing.items.length,
  };
}

export type MapUploadRefusal =
  | { readonly kind: "malformed-grid" }
  | { readonly kind: "too-large"; readonly bytes: number; readonly limit: number }
  | {
      readonly kind: "over-quota";
      readonly used: number;
      readonly adding: number;
      readonly quota: number;
    };

/** Thrown before any byte is sent; the surface reads `refusal` to explain. */
export class MapUploadRefused extends Error {
  readonly refusal: MapUploadRefusal;
  constructor(refusal: MapUploadRefusal) {
    super(`map upload refused: ${refusal.kind}`);
    this.name = "MapUploadRefused";
    this.refusal = refusal;
  }
}

export interface MapUploadArgs {
  readonly campaignId: string;
  /** Already compressed (`compressImage(file, MAP_MAX_PX, MAP_QUALITY)`). */
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly cellPx: number;
  readonly origin: { readonly x: number; readonly y: number };
  /** Test seams; the app uses the defaults. `mapId` in particular: the object is cached as
   *  `immutable` for a year, so reusing an id would serve the OLD image — the app always mints
   *  a fresh one. */
  readonly mapId?: string;
  readonly maxBytes?: number;
  readonly quotaBytes?: number;
}

/**
 * Upload a compressed background and return the reference the `map` table op carries. Refuses
 * (without uploading) a grid the reducer would reject (`isMapGrid` — so no orphan lands in
 * Storage for a `map` op that then fails), a blob over `maxBytes`, or one that would push the
 * campaign's maps over `quotaBytes` — the quota read happens first, so a refused upload costs
 * one listing and no bytes.
 *
 * Residues, stated: the quota is check-then-act, so two uploads racing each other can overshoot
 * it by one file (a courtesy, not a fence); and the reducer never deletes Storage objects — a
 * `map: null`, a replacement or an `undo` of a `map` op leaves the object in place (the
 * surface owns `deleteMapBackground`, and an undo after a delete yields a dead URL).
 */
export async function uploadMapBackground(
  storage: FirebaseStorage,
  args: MapUploadArgs
): Promise<MapBackground> {
  if (!isMapGrid(args)) throw new MapUploadRefused({ kind: "malformed-grid" });
  const limit = args.maxBytes ?? MAP_MAX_BYTES;
  if (args.blob.size > limit) {
    throw new MapUploadRefused({ kind: "too-large", bytes: args.blob.size, limit });
  }
  const quota = args.quotaBytes ?? MAP_QUOTA_BYTES;
  const usage = await campaignMapUsage(storage, args.campaignId);
  if (usage.bytes + args.blob.size > quota) {
    throw new MapUploadRefused({
      kind: "over-quota",
      used: usage.bytes,
      adding: args.blob.size,
      quota,
    });
  }
  const path = mapBackgroundPath(args.campaignId, args.mapId ?? newMapId());
  const object = ref(storage, path);
  await uploadBytes(object, args.blob, MAP_UPLOAD_META);
  const url = await getDownloadURL(object);
  return {
    path,
    url,
    width: args.width,
    height: args.height,
    cellPx: args.cellPx,
    origin: args.origin,
    bytes: args.blob.size,
  };
}

/** Delete a background by its stored path; a missing object is a safe no-op. */
export async function deleteMapBackground(
  storage: FirebaseStorage,
  path: string
): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "storage/object-not-found") throw err;
  }
}
