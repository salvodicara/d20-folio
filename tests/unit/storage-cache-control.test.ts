/**
 * Regression — portrait uploads carry the immutable Cache-Control header.
 *
 * **The owner-reported bug:** portrait previews "reloaded" every time the user
 * navigated away from the roster and back. The persistent-cache half of the fix
 * is the upload metadata: every portrait blob is written with
 * `cacheControl: "public, max-age=31536000, immutable"` so the browser and the
 * PWA runtime cache can serve it WITHOUT a revalidation round-trip.
 *
 * This is safe because a *changed* portrait gets a new download URL (the
 * `?token=` rotates on re-upload), so `immutable` only ever pins a URL to its
 * exact bytes. If a future refactor drops the header, portraits start
 * revalidating on every load again — this test fails first.
 *
 * Firebase is mocked (the pure-modules guard auto-exempts a test that
 * `vi.mock`s `@/lib/firebase` + `firebase/storage`), so it runs in CI with no
 * VITE_FIREBASE_API_KEY.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

interface UploadMeta {
  contentType?: string;
  cacheControl?: string;
}

const uploadBytes = vi.fn<
  (storageRef: unknown, blob: Blob, meta?: UploadMeta) => Promise<void>
>(() => Promise.resolve());
const getDownloadURL = vi.fn<(storageRef: unknown) => Promise<string>>(() =>
  Promise.resolve("https://example/download?token=abc")
);
const ref = vi.fn<(storage: unknown, path: string) => { path: string }>(
  (_storage, path) => ({ path })
);
const getBlob = vi.fn<(storageRef: unknown) => Promise<Blob>>();

vi.mock("@/lib/firebase", () => ({ storage: { __mock: "storage" } }));
vi.mock("firebase/storage", () => ({
  ref: (storage: unknown, path: string) => ref(storage, path),
  uploadBytes: (storageRef: unknown, blob: Blob, meta?: UploadMeta) =>
    uploadBytes(storageRef, blob, meta),
  getDownloadURL: (storageRef: unknown) => getDownloadURL(storageRef),
  getBlob: (storageRef: unknown) => getBlob(storageRef),
  deleteObject: vi.fn(() => Promise.resolve()),
}));

import { uploadPortrait, portraitToDataUrl } from "@/lib/storage";

const EXPECTED_META = {
  contentType: "image/jpeg",
  cacheControl: "public, max-age=31536000, immutable",
};

describe("uploadPortrait — immutable Cache-Control metadata", () => {
  beforeEach(() => {
    uploadBytes.mockClear();
    getDownloadURL.mockClear();
    ref.mockClear();
  });

  it("writes the blob with the immutable, 1-year Cache-Control header", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    await uploadPortrait("uid-1", "char-1", blob);

    expect(uploadBytes).toHaveBeenCalledTimes(1);
    const meta = uploadBytes.mock.calls[0]?.[2];
    expect(meta).toEqual(EXPECTED_META);
  });

  it("uploads to the per-character path and returns the download URL", async () => {
    const blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    const url = await uploadPortrait("uid-9", "char-9", blob);

    expect(ref).toHaveBeenCalledWith(
      expect.anything(),
      "users/uid-9/portraits/char-9.jpeg"
    );
    expect(url).toBe("https://example/download?token=abc");
  });

  it("rejects an over-sized blob before touching Storage", async () => {
    const tooBig = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/jpeg" });
    await expect(uploadPortrait("uid", "char", tooBig)).rejects.toThrow(/too large/i);
    expect(uploadBytes).not.toHaveBeenCalled();
  });
});

// REGRESSION (owner's export bug, settled 2026-06-10): the JSON export reads
// portrait bytes through the Storage SDK — never an HTTP fetch of the download
// URL, whose service-worker cache entry is OPAQUE (no-cors display) and
// unreadable. `portraitToDataUrl` is that ONE reader: getBlob → data URL, or
// null when Storage genuinely can't serve the bytes (the caller reports the
// drop — `portraitDropped` → toast, never silent).
describe("portraitToDataUrl — the export's Storage-SDK portrait reader", () => {
  const DOWNLOAD_URL =
    // The REAL bucket domain (new-style, matches VITE_FIREBASE_STORAGE_BUCKET) —
    // not the stale legacy `d20-folio.appspot.com`.
    "https://firebasestorage.googleapis.com/v0/b/d20-folio.firebasestorage.app/o/" +
    "users%2Fu1%2Fportraits%2Fc1.jpeg?alt=media&token=tok-1";

  beforeEach(() => {
    ref.mockClear();
    getBlob.mockReset();
  });

  it("resolves the SDK ref FROM the stored download URL and yields a data URL", async () => {
    getBlob.mockResolvedValue(
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
    );
    const out = await portraitToDataUrl(DOWNLOAD_URL);

    // The ref is derived from the doc's portraitUrl (the SDK parses the path);
    // the bytes come from getBlob — no global fetch involved at all.
    expect(ref).toHaveBeenCalledWith(expect.anything(), DOWNLOAD_URL);
    expect(getBlob).toHaveBeenCalledTimes(1);
    expect(out).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null when the SDK read fails (offline / object gone) — caller reports the drop", async () => {
    getBlob.mockRejectedValue(new Error("storage/object-not-found"));
    await expect(portraitToDataUrl(DOWNLOAD_URL)).resolves.toBeNull();
  });

  it("returns null when the URL is not a Storage object at all (ref throws)", async () => {
    ref.mockImplementationOnce(() => {
      throw new Error("storage/invalid-url");
    });
    await expect(portraitToDataUrl("blob:http://localhost/junk")).resolves.toBeNull();
    expect(getBlob).not.toHaveBeenCalled();
  });

  // REGRESSION (owner 2026-06-10 — "the JSON never downloads at all"): when the
  // bucket had no CORS config, the browser blocked the XHR (status 0) and the
  // Storage SDK treated it as a RETRYABLE network error, backing off against a
  // minutes-long deadline — `getBlob` neither resolved nor rejected for ~2 min,
  // so the export flow appeared completely dead (no file, no toast). The read is
  // now raced against an 8s cap: a hanging getBlob must degrade PROMPTLY to the
  // null → faceless-export + `portraitDropped`-toast path. Failed before the fix
  // (the promise below never settles), passes after.
  it("resolves null promptly when getBlob hangs (SDK retry loop) — never blocks the export", async () => {
    vi.useFakeTimers();
    try {
      getBlob.mockImplementation(() => new Promise<Blob>(() => {})); // hangs forever
      let settled: string | null | undefined;
      const read = portraitToDataUrl(DOWNLOAD_URL).then((v) => (settled = v));

      // Just under the cap: still pending (a healthy slow read is given its 8s)…
      await vi.advanceTimersByTimeAsync(7_999);
      expect(settled).toBeUndefined();

      // …at the cap: the read gives up and degrades to the reported-drop path.
      await vi.advanceTimersByTimeAsync(1);
      await read;
      expect(settled).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
