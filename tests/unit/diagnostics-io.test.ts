import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  diagnosticsLog,
  resetDiagnostics,
  setDiagnosticsContext,
  type DiagnosticsReport,
} from "@/lib/diagnostics";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({ id: "d1" }),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: () => "server-ts",
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  deleteDoc: vi.fn(),
}));

import {
  installDiagnosticsReporter,
  MAX_REPORTS_PER_SESSION,
  MAX_REPORTS_PER_USER_BUILD,
} from "@/lib/diagnostics-io";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

beforeEach(() => {
  resetDiagnostics();
  setDiagnosticsContext({ sessionId: "s", buildSha: "sha1", appVersion: "1", uid: "u1" });
});

describe("diagnostics reporter", () => {
  it("writes one report per distinct error-level event", async () => {
    const written: DiagnosticsReport[] = [];
    installDiagnosticsReporter({
      storage: memoryStorage(),
      write: (r) => {
        written.push(r);
        return Promise.resolve();
      },
    });
    diagnosticsLog("error", "character.quarantine", {
      code: "malformed-entry",
      path: "build.spells[0]",
    });
    diagnosticsLog("error", "character.quarantine", {
      code: "malformed-entry",
      path: "build.spells[0]",
    });
    diagnosticsLog("error", "character.save-rejected", { message: "permission-denied" });
    await Promise.resolve();
    expect(written.map((r) => r.event)).toEqual([
      "character.quarantine",
      "character.save-rejected",
    ]);
  });

  it("caps writes per session and per user+build, and a failed write never throws", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "d20-folio-diagnostics:u1:sha1",
      String(MAX_REPORTS_PER_USER_BUILD - 1)
    );
    const write = vi.fn(() => Promise.reject(new Error("offline")));
    installDiagnosticsReporter({ storage, write });
    for (let i = 0; i < MAX_REPORTS_PER_SESSION + 5; i++)
      diagnosticsLog("error", `e.${i}`);
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(storage.getItem("d20-folio-diagnostics:u1:sha1")).toBe(
      String(MAX_REPORTS_PER_USER_BUILD)
    );
  });
});
