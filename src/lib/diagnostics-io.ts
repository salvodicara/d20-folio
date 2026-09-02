/**
 * Firestore seam for diagnostics (ADR-0008): automatic error reports written to the
 * top-level `diagnostics/{id}` collection (create-only for the reporting uid, read/delete
 * for the admin), read back by the admin inbox. Keeps `src/lib/diagnostics/*` Firebase-free.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  onErrorReport,
  seedBreadcrumbs,
  breadcrumbSnapshot,
  setDiagnosticsContext,
  type Breadcrumb,
  type DiagnosticsReport,
} from "@/lib/diagnostics";
import { useAuthStore } from "@/stores/authStore";

export const MAX_REPORTS_PER_USER_BUILD = 50;
export const MAX_REPORTS_PER_SESSION = 10;
const STORAGE_PREFIX = "d20-folio-diagnostics";

export function writeDiagnosticsReport(report: DiagnosticsReport): Promise<void> {
  return setDoc(doc(collection(db, "diagnostics")), {
    ...report,
    createdAt: serverTimestamp(),
  });
}

export function installDiagnosticsReporter(deps: {
  storage: Pick<Storage, "getItem" | "setItem">;
  write: (report: DiagnosticsReport) => Promise<void>;
}): () => void {
  let sessionCount = 0;
  const seen = new Set<string>();
  return onErrorReport((report) => {
    const dedupe = `${report.event} ${report.message}`;
    if (seen.has(dedupe) || sessionCount >= MAX_REPORTS_PER_SESSION) return;
    const key = `${STORAGE_PREFIX}:${report.uid}:${report.context.buildSha}`;
    const used = Number(deps.storage.getItem(key) ?? "0");
    if (!Number.isFinite(used) || used >= MAX_REPORTS_PER_USER_BUILD) return;
    seen.add(dedupe);
    sessionCount += 1;
    deps.storage.setItem(key, String(used + 1));
    void deps.write(report).catch(() => {
      // A report about a failure must never become a second failure.
    });
  });
}

/** A no-op in-memory storage shim for when `localStorage` throws (private mode). */
function memoryStorageShim(): Pick<Storage, "getItem" | "setItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

/** `crypto.randomUUID`, falling back to a `Math.random()` id (private mode / old WebKit). */
function safeSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `fallback-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

/** A `Storage`-shaped handle that never throws, even when `localStorage` itself does. */
function safeLocalStorage(): Pick<Storage, "getItem" | "setItem"> {
  try {
    // Touch it once — some browsers only throw on first access (quota / private mode).
    const probeKey = "__d20-folio-diagnostics-probe__";
    localStorage.setItem(probeKey, "1");
    localStorage.removeItem(probeKey);
    return localStorage;
  } catch {
    return memoryStorageShim();
  }
}

/**
 * Production installer — called once from `main.tsx`. Never throws: a diagnostics
 * layer must not be able to break boot (private-mode `crypto`/`localStorage` denials).
 */
export function installDiagnostics(): void {
  try {
    setDiagnosticsContext({
      sessionId: safeSessionId(),
      buildSha: __GIT_SHA__,
      appVersion: __APP_VERSION__,
      uid: useAuthStore.getState().user?.uid,
    });
    useAuthStore.subscribe((state) => setDiagnosticsContext({ uid: state.user?.uid }));
    installDiagnosticsReporter({
      storage: safeLocalStorage(),
      write: writeDiagnosticsReport,
    });
    void import("@/lib/diagnostics/idb")
      .then(async ({ loadBreadcrumbs, persistBreadcrumbs }) => {
        const previous = await loadBreadcrumbs();
        if (previous) seedBreadcrumbs(previous);
        let scheduled = false;
        let lastSize = -1;
        let lastNewest = -1;
        setInterval(() => {
          if (scheduled) return;
          const snapshot = breadcrumbSnapshot();
          const newest = snapshot.at(-1)?.t ?? -1;
          if (snapshot.length === lastSize && newest === lastNewest) return;
          lastSize = snapshot.length;
          lastNewest = newest;
          scheduled = true;
          // Guarded independently of idb.ts's own internal try/catch — a
          // diagnostics failure must never surface as an unhandled rejection
          // (error-log.ts would otherwise re-report it as a runtime error,
          // making a diagnostics failure cascade into a diagnostics report
          // about itself).
          persistBreadcrumbs(snapshot)
            .catch(() => {
              // IndexedDB write failed — breadcrumbs stay in memory only.
            })
            .finally(() => {
              scheduled = false;
            });
        }, 1000);
      })
      .catch(() => {
        // The lazy idb chunk failed to load (offline, chunk 404, IndexedDB
        // unavailable) — breadcrumbs simply never seed/persist this session.
      });
  } catch {
    // A diagnostics failure must never break boot.
  }
}

export interface AdminDiagnostic {
  id: string;
  uid: string;
  event: string;
  message: string;
  createdAt: Date | null;
  context: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
}

export async function listDiagnostics(max = 50): Promise<AdminDiagnostic[]> {
  const snap = await getDocs(
    query(collection(db, "diagnostics"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      uid: String(data.uid ?? ""),
      event: String(data.event ?? ""),
      message: String(data.message ?? ""),
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
      context:
        typeof data.context === "object" && data.context !== null
          ? (data.context as Record<string, unknown>)
          : {},
      breadcrumbs: Array.isArray(data.breadcrumbs)
        ? (data.breadcrumbs as Breadcrumb[])
        : [],
    };
  });
}

export async function purgeDiagnostics(ids: readonly string[]): Promise<number> {
  let purged = 0;
  for (const id of ids) {
    try {
      await deleteDoc(doc(db, "diagnostics", id));
      purged++;
    } catch (err) {
      console.warn("diagnostics purge failed (retried on next load):", id, err);
    }
  }
  return purged;
}
