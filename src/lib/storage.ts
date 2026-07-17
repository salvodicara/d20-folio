/**
 * Firebase Storage helpers for portrait uploads.
 *
 * One file per character:
 *   users/{uid}/portraits/{charId}.jpeg — compressed original
 *
 * The original is never pre-cropped before upload.
 * Cropping is done entirely via CSS at render time using `portraitCrop`
 * metadata stored in CharacterDoc. Re-cropping is a metadata-only update
 * (no re-upload).
 */

import {
  ref,
  uploadBytes,
  getDownloadURL,
  getBlob,
  deleteObject,
} from "firebase/storage";
import { storage } from "@/lib/firebase";
import { withTimeout } from "@/lib/promise-timeout";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Upload metadata for every user image (portraits + campaign banners). The long,
 * `immutable` Cache-Control is what stops the browser re-fetching the image on each
 * in-app navigation (the "flicker / it reloads" the owner saw, most visible in dev
 * where the service worker is off). It's safe because a re-upload mints a FRESH
 * download token → a different URL → a clean cache miss, so a replaced image is never
 * served stale; the old URL going immutable is harmless (the app references the new
 * one). Pairs with the Workbox `firebasestorage` runtime cache for offline + repeat.
 */
const IMAGE_UPLOAD_META = {
  contentType: "image/jpeg",
  cacheControl: "public, max-age=31536000, immutable",
} as const;
/** Longest side (px) above which an image is downsampled before upload. */
const ORIGINAL_MAX_PX = 2000;
const ORIGINAL_QUALITY = 0.85;

// ─── Image compression ────────────────────────────────────────────────────────

/**
 * Compress an image file using a canvas.
 *
 * If the image is wider or taller than `maxPx`, it is scaled down
 * proportionally. The output is always a JPEG blob.
 *
 * @param file    - Source image file (any type the browser can decode)
 * @param maxPx   - Longest side limit in pixels (default 2000)
 * @param quality - JPEG quality 0–1 (default 0.85)
 */
export async function compressImage(
  file: Blob,
  maxPx = ORIGINAL_MAX_PX,
  quality = ORIGINAL_QUALITY
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height / width) * maxPx);
          width = maxPx;
        } else {
          width = Math.round((width / height) * maxPx);
          height = maxPx;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("canvas.toBlob returned null"));
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = URL.createObjectURL(file);
  });
}

// ─── Upload helpers ───────────────────────────────────────────────────────────

/**
 * Upload a portrait blob to Firebase Storage for a specific character.
 *
 * Writes to `users/{uid}/portraits/{charId}.jpeg`.
 * Overwrites any existing file for that character without accumulating orphans.
 * Validates size (max 5MB). Returns the download URL.
 */
export async function uploadPortrait(
  uid: string,
  charId: string,
  blob: Blob
): Promise<string> {
  if (blob.size > MAX_FILE_SIZE) {
    throw new Error("Portrait is too large (max 5MB)");
  }
  // Dev-bypass: never touch real Storage — hand back a local object URL so the
  // whole upload → crop → lightbox flow is exercisable offline (no auth), the
  // same seam the campaign banner already has.
  if (DEV_BYPASS_AUTH) return URL.createObjectURL(blob);
  const storageRef = ref(storage, `users/${uid}/portraits/${charId}.jpeg`);
  await uploadBytes(storageRef, blob, IMAGE_UPLOAD_META);
  return getDownloadURL(storageRef);
}

/**
 * Upload a portrait from a base64 data URL (e.g. from a JSON import).
 *
 * Converts the data URL to a Blob, validates size, then uploads to the
 * per-character path `users/{uid}/portraits/{charId}.jpeg`.
 * Returns the download URL.
 */
export async function uploadPortraitFromBase64(
  uid: string,
  charId: string,
  base64DataUrl: string
): Promise<string> {
  const [header, data] = base64DataUrl.split(",");
  const mimeMatch = /data:([^;]+);base64/.exec(header ?? "");
  const mime = mimeMatch?.[1] ?? "image/png";
  const binary = atob(data ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const rawBlob = new Blob([bytes], { type: mime });

  // Compress to JPEG (same as normal upload flow: max 2000px, 0.85 quality)
  const compressed = await compressImage(rawBlob);

  if (compressed.size > MAX_FILE_SIZE) {
    throw new Error("Portrait is too large (max 5MB)");
  }

  const storageRef = ref(storage, `users/${uid}/portraits/${charId}.jpeg`);
  await uploadBytes(storageRef, compressed, IMAGE_UPLOAD_META);
  return getDownloadURL(storageRef);
}

// ─── Export reader ────────────────────────────────────────────────────────────

/**
 * Hard cap on the SDK portrait read. The Storage SDK treats a network-dead read
 * (e.g. a CORS-blocked XHR, which surfaces as status 0) as RETRYABLE and backs
 * off against a minutes-long deadline (`maxOperationRetryTime`, ~2 min) — during
 * which the export appears completely dead: no file, no toast (the owner's "the
 * JSON never downloads at all" report, 2026-06-10). 8s is enough for any healthy
 * read of a ≤5MB portrait; past it the export must degrade to faceless + toast.
 */
const PORTRAIT_READ_TIMEOUT_MS = 8000;

/**
 * Read a portrait's bytes through the **Storage SDK** and return them as a base64
 * data URL — the JSON export's ONE portrait reader.
 *
 * Deliberately NOT a `fetch(downloadUrl)`: the display `<img>` requests that same
 * download URL no-cors, so the Workbox runtime cache holds an OPAQUE response
 * (status 0, unreadable body) under that exact URL, and any HTTP fetch of it is
 * served the opaque entry — the portrait then silently never embeds (the owner's
 * export bug; two rounds of cache-busting workarounds lived in `character-io`
 * before this). `getBlob(ref(url))` goes through the SDK's own channel — a
 * token-less `?alt=media` request that can never share a cache key with the
 * display URL — so the bytes are readable by construction, with no cache-busting
 * and no coupling to how display caches.
 *
 * The read is raced against {@link PORTRAIT_READ_TIMEOUT_MS}: the SDK retries
 * "network" failures (including a CORS-blocked response — bucket CORS is INFRA,
 * applied via `scripts/set-storage-cors.mjs`) for minutes, and the export must
 * NEVER hang on a portrait — a slow-dead read degrades to the faceless-export +
 * `portraitDropped` toast path promptly. The orphaned SDK retry loop keeps
 * fizzling in the background until its own deadline; it holds nothing up.
 *
 * Returns `null` only when the read genuinely fails (offline, the Storage object
 * was deleted, signed out, timed out) — the caller reports the drop, never silent.
 */
export async function portraitToDataUrl(portraitUrl: string): Promise<string | null> {
  try {
    const blob = await withTimeout(
      getBlob(ref(storage, portraitUrl)),
      PORTRAIT_READ_TIMEOUT_MS,
      "portrait read"
    );
    // bytes → base64 data URL (the exact reverse of the atob decode in
    // `uploadPortraitFromBase64`). Chunked so a large image can't blow the
    // argument-spread call-stack limit.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
  } catch (err) {
    // Observable, never silent — a dropped portrait must leave a breadcrumb.
    console.warn("portrait export: could not read the portrait from Storage", err);
    return null;
  }
}

// ─── Delete helpers ───────────────────────────────────────────────────────────

/**
 * Delete the portrait for a specific character from Firebase Storage.
 *
 * Ignores "object not found" errors so it is safe to call even if the
 * portrait was never uploaded.
 */
export async function deletePortrait(uid: string, charId: string): Promise<void> {
  if (DEV_BYPASS_AUTH) return; // no real object to delete in bypass
  try {
    await deleteObject(ref(storage, `users/${uid}/portraits/${charId}.jpeg`));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "storage/object-not-found") throw err;
  }
}

/**
 * N4 — upload a campaign banner to `campaigns/{campaignId}/banner.jpeg`, overwriting
 * any existing one (no orphans). Validates size; returns the download URL. The
 * campaign id is an unguessable invite code, so the path is the shared secret any
 * member of that campaign already holds.
 */
export async function uploadCampaignBanner(
  campaignId: string,
  blob: Blob
): Promise<string> {
  if (blob.size > MAX_FILE_SIZE) {
    throw new Error("Banner is too large (max 5MB)");
  }
  // Dev-bypass: never touch real Storage — hand back a local object URL so the
  // whole upload → crop → render flow is exercisable offline (no auth).
  if (DEV_BYPASS_AUTH) return URL.createObjectURL(blob);
  const storageRef = ref(storage, `campaigns/${campaignId}/banner.jpeg`);
  await uploadBytes(storageRef, blob, IMAGE_UPLOAD_META);
  return getDownloadURL(storageRef);
}

/** Delete a campaign's banner (safe if it was never uploaded). */
export async function deleteCampaignBanner(campaignId: string): Promise<void> {
  if (DEV_BYPASS_AUTH) return; // no real object to delete in bypass
  try {
    await deleteObject(ref(storage, `campaigns/${campaignId}/banner.jpeg`));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "storage/object-not-found") throw err;
  }
}

/**
 * Upload a base64-encoded portrait AND save its download URL on the parent
 * character document atomically (best-effort): if the Firestore write fails
 * after the upload succeeded, the orphan portrait file is deleted so it
 * cannot leak in Storage. The character is left in a "no portrait" state
 * which the player can retry — better than a forever orphan on the 5 GB
 * Storage free tier.
 *
 * Returns the URL on success, or `null` if the upload itself failed (the
 * character document isn't touched in that case).
 */
export async function uploadAndAttachPortrait(
  uid: string,
  charId: string,
  base64DataUrl: string,
  attach: (url: string) => Promise<void>
): Promise<string | null> {
  let url: string;
  try {
    url = await uploadPortraitFromBase64(uid, charId, base64DataUrl);
  } catch {
    return null; // Upload failed — nothing to clean up.
  }
  try {
    await attach(url);
    return url;
  } catch (writeErr) {
    // Firestore write failed after the upload succeeded. Roll back the
    // Storage object so it doesn't leak forever.
    await deletePortrait(uid, charId).catch(() => {
      // If the rollback also fails (extremely unusual), log and continue;
      // we can't get the system into a worse state by re-throwing.
      console.warn("portrait upload rollback failed for", { uid, charId });
    });
    throw writeErr;
  }
}
