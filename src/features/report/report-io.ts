/**
 * report-io — Firestore + Storage IO for the in-app bug / feature reporter
 * (OWN-37).
 *
 * A client PWA can't safely hold a GitHub token, so the flow is:
 *   1. write `/bug_reports/{id}` (status "new")              ← here
 *   2. upload the screenshot to `bug-reports/{uid}/{id}.png` ← here
 *   3. patch the doc with `screenshotPath`                   ← here
 *   4. a Cloud Function (onCreate) opens a GitHub issue and writes
 *      `issueNumber` / `issueUrl` / status "opened" back to the doc.
 * The dialog subscribes (`subscribeToReport`) to surface "opened as #NN".
 *
 * This module DOES import Firebase — keep it OUT of unit tests (it is excluded
 * from the pure-modules guard list and mocked where a component test needs it).
 * It mirrors the existing `firestore.ts` / `storage.ts` conventions: `addDoc` +
 * `serverTimestamp` + `stripUndefined` for writes, a `ref` + `uploadBytes` for
 * the image.
 */

import { collection, doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { stripUndefined } from "@/lib/strip-undefined";
import { collectDebugContext } from "./collect-debug-context";
import type { BugReportDoc, ReportForm } from "./types";

/** The screenshot Storage path for a given report. */
function screenshotPath(uid: string, reportId: string): string {
  return `bug-reports/${uid}/${reportId}.png`;
}

/** What a successful submit returns to the dialog. */
export interface SubmitResult {
  /** The Firestore document id (so the caller can subscribe for the issue number). */
  reportId: string;
}

/**
 * Submit a report. Captures the debug context here (single source of truth), writes
 * the doc, then — if a screenshot was provided — uploads it and patches the doc with
 * its Storage path. The screenshot step is best-effort: a failed upload still leaves
 * a usable report (the function just won't have an image to link).
 *
 * @param form           the user-entered + auto-detected fields
 * @param reporterUid    the signed-in user's uid (rules require it == auth.uid)
 * @param locale         the active locale (so the maintainer reads the report's language)
 * @param screenshotBlob optional PNG/JPEG blob captured via html2canvas
 */
export async function submitReport(
  form: ReportForm,
  reporterUid: string,
  locale: string,
  screenshotBlob?: Blob | null
): Promise<SubmitResult> {
  // A client-generated id lets us name the Storage object deterministically
  // (bug-reports/{uid}/{id}.png) BEFORE the doc settles, and keeps the write
  // idempotent. `doc(collection(...))` mints a fresh id without a round-trip.
  const reportRef = doc(collection(db, "bug_reports"));
  const reportId = reportRef.id;

  // Upload the screenshot FIRST so its Storage path + download URL can be written
  // into the create itself. Two reasons this must happen at create time, not after:
  //   1. The function triggers on document CREATE — a screenshot patched in later
  //      would arrive too late to reach the GitHub issue.
  //   2. The reporter can only CREATE the doc; `update` is admin-only (firestore.rules),
  //      so a post-create patch would be denied anyway.
  // Best-effort: a failed screenshot must not fail the whole report (the text is the
  // valuable part), so we swallow errors and create the doc without an image.
  // OFFLINE-QUEUED SUBMIT: Firestore's offline persistence accepts the doc
  // write locally and flushes it on reconnect, but `setDoc`'s promise resolves
  // only on SERVER ack — awaiting it offline would spin the dialog forever
  // (the designed "queued" success copy could never show). Storage uploads
  // have NO offline queue at all, so the screenshot is skipped offline (the
  // text is the valuable part, and the function triggers on doc CREATE).
  const offline = !navigator.onLine;

  let screenshot: Pick<BugReportDoc, "screenshotPath" | "screenshotUrl"> | undefined;
  if (screenshotBlob && !offline) {
    try {
      const path = screenshotPath(reporterUid, reportId);
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, screenshotBlob, { contentType: "image/png" });
      screenshot = { screenshotPath: path, screenshotUrl: await getDownloadURL(fileRef) };
    } catch (err) {
      console.warn("bug-report screenshot upload failed (report still sent):", err);
    }
  }

  const payload: Omit<BugReportDoc, "issueNumber" | "issueUrl"> = {
    ...form,
    status: "new",
    reporterUid,
    locale,
    debugContext: collectDebugContext(),
    ...screenshot,
  };

  const write = setDoc(reportRef, {
    ...(stripUndefined(payload) as Record<string, unknown>),
    createdAt: serverTimestamp(),
  });
  if (offline) {
    // Fire-and-queue: the local write is already durable in the offline cache;
    // the promise settles whenever the connection returns.
    write.catch(() => {});
    return { reportId };
  }
  await write;

  return { reportId };
}

/** The fields the dialog watches for the function's write-back. */
export interface ReportProgress {
  status: BugReportDoc["status"];
  issueNumber?: number;
  issueUrl?: string;
}

/**
 * Subscribe to a report doc to learn when the Cloud Function has opened the
 * GitHub issue (so the success state can show "opened as #NN" instead of a bare
 * "Sent"). Returns an unsubscribe — call it on dialog close / unmount.
 */
export function subscribeToReport(
  reportId: string,
  callback: (progress: ReportProgress) => void
): () => void {
  const reportRef = doc(db, "bug_reports", reportId);
  return onSnapshot(
    reportRef,
    (snap) => {
      const data = snap.data();
      if (!data) return;
      callback({
        status:
          data.status === "opened" ? "opened" : data.status === "error" ? "error" : "new",
        issueNumber: typeof data.issueNumber === "number" ? data.issueNumber : undefined,
        issueUrl: typeof data.issueUrl === "string" ? data.issueUrl : undefined,
      });
    },
    () => {
      // A subscription failure is non-fatal — the report was already written; the
      // user just won't see the live "opened as #NN" upgrade. Stay silent.
    }
  );
}
