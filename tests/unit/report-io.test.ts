/**
 * report-io — the reporter's Firestore/Storage submit path (OWN-37).
 *
 * Regression (P10): submitting OFFLINE used to await `setDoc`'s server ack —
 * which never arrives offline — so the dialog spun forever and its designed
 * "queued" success copy was unreachable. Offline, the submit must resolve
 * immediately (the write is durable in Firestore's offline cache) and must
 * skip the Storage upload (Storage has no offline queue).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const setDocMock = vi.fn<() => Promise<void>>();
const uploadBytesMock = vi.fn<() => Promise<unknown>>();

vi.mock("@/lib/firebase", () => ({ db: {}, storage: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: "rep-1" })),
  setDoc: (...args: unknown[]) => setDocMock(...(args as [])),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => "ts"),
}));
vi.mock("firebase/storage", () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: (...args: unknown[]) => uploadBytesMock(...(args as [])),
  getDownloadURL: vi.fn(() => Promise.resolve("url")),
}));

import { submitReport } from "@/features/report/report-io";
import type { ReportForm } from "@/features/report/types";

const FORM: ReportForm = {
  type: "bug",
  screen: "character",
  severity: "medium",
  title: "Test",
  description: "",
};

function setOnline(value: boolean) {
  // Node's global navigator has no onLine — stub the whole object.
  vi.stubGlobal("navigator", { onLine: value });
}

describe("submitReport", () => {
  beforeEach(() => {
    setDocMock.mockReset();
    uploadBytesMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offline: resolves immediately (fire-and-queue) and skips the Storage upload", async () => {
    setOnline(false);
    // The server ack never arrives offline — the promise stays pending forever.
    setDocMock.mockReturnValue(new Promise<never>(() => {}));

    const result = await submitReport(FORM, "uid-1", "en", new Blob(["x"]));
    expect(result.reportId).toBe("rep-1");
    expect(setDocMock).toHaveBeenCalledTimes(1); // the doc write IS queued
    expect(uploadBytesMock).not.toHaveBeenCalled(); // Storage has no offline queue
  });

  it("online: awaits the server ack (a rejected write surfaces to the dialog)", async () => {
    setOnline(true);
    setDocMock.mockRejectedValue(new Error("denied"));
    await expect(submitReport(FORM, "uid-1", "en", null)).rejects.toThrow("denied");
  });
});
