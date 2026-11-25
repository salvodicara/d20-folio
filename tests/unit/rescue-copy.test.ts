// @vitest-environment jsdom
/**
 * #1320 — the rescue copy: a sheet's unsaved local document, kept on this device when
 * the server holds a newer shape. Per account and per character, 30 days, cleared with
 * the account's drafts; a write that fails says so (no silent loss).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAccountDrafts,
  dropRescueCopy,
  keepRescueCopy,
  readRescueCopy,
  RESCUE_TTL_MS,
  type RescueCopy,
} from "@/lib/local-draft";

const copy = (savedAt: number): RescueCopy => ({
  savedAt,
  schema: 3,
  playVersion: 1,
  build: { name: "Mara" },
  state: { hp: { current: 7 } },
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the rescue copy", () => {
  it("is kept per account and per character, and read back", () => {
    expect(keepRescueCopy("u1", "c1", copy(1000))).toBe(true);
    expect(readRescueCopy("u1", "c1", 2000)).toEqual(copy(1000));
    expect(readRescueCopy("u1", "c2", 2000)).toBeNull();
    expect(readRescueCopy("u2", "c1", 2000)).toBeNull();
  });

  it("expires after 30 days and is then removed", () => {
    keepRescueCopy("u1", "c1", copy(1000));
    expect(readRescueCopy("u1", "c1", 1000 + RESCUE_TTL_MS - 1)).not.toBeNull();
    expect(readRescueCopy("u1", "c1", 1000 + RESCUE_TTL_MS + 1)).toBeNull();
    expect(readRescueCopy("u1", "c1", 1000)).toBeNull();
  });

  it("Discard removes it", () => {
    keepRescueCopy("u1", "c1", copy(1000));
    dropRescueCopy("u1", "c1");
    expect(readRescueCopy("u1", "c1", 2000)).toBeNull();
  });

  it("sign-out clears this account's copies, never another's", () => {
    keepRescueCopy("u1", "c1", copy(1000));
    keepRescueCopy("u2", "c1", copy(1000));
    clearAccountDrafts("u1");
    expect(readRescueCopy("u1", "c1", 2000)).toBeNull();
    expect(readRescueCopy("u2", "c1", 2000)).not.toBeNull();
  });

  it("a write the storage refuses reports false (the screen must not claim it is kept)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(keepRescueCopy("u1", "c1", copy(1000))).toBe(false);
  });

  it("a malformed stored copy reads as none", () => {
    localStorage.setItem("folio.rescue.u1.c1", "{not json");
    expect(readRescueCopy("u1", "c1", 2000)).toBeNull();
  });
});

describe("the rescue copy fits the device's storage", () => {
  it("the largest dev character (full inventory, spellbook, session) is far under the budget", async () => {
    const { DEV_SCENARIOS, buildDevScenario } = await import("@/lib/dev-scenarios");
    const { serializeCharacterEnvelope } = await import("@/lib/character-codec");
    const { MOCK_CHARACTER } = await import("@/lib/mock");
    const docs = [
      MOCK_CHARACTER,
      ...Object.keys(DEV_SCENARIOS).flatMap((id) => {
        const d = buildDevScenario(id);
        return d ? [d] : [];
      }),
    ];
    const sizes = docs.map((d) => {
      const env = serializeCharacterEnvelope(d);
      return JSON.stringify({
        v: 1,
        draft: {
          savedAt: 0,
          schema: 3,
          playVersion: 1,
          build: env.build,
          state: env.state,
        },
      }).length;
    });
    // localStorage holds about 5 MB per origin, shared with the drafts: one copy must
    // stay a small fraction of it (a whole table's sheets can be rescued at once).
    expect(Math.max(...sizes)).toBeLessThan(250_000);
  });
});
