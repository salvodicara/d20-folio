/**
 * getClosedIssueNumbers — the admin bug-inbox closure lookup.
 *
 * Pins: a successful fetch yields the set of closed issue numbers; a non-OK response
 * OR a thrown fetch resolves to `null` (unknown → caller shows all); the result is
 * cached for the session (one network round-trip regardless of callers).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getClosedIssueNumbers,
  GITHUB_REPO,
  __resetClosedIssueCache,
} from "@/lib/github-issue-state";

function page(numbers: number[]): Response {
  return {
    ok: true,
    json: () => Promise.resolve(numbers.map((n) => ({ number: n }))),
  } as unknown as Response;
}

beforeEach(() => {
  __resetClosedIssueCache();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GITHUB_REPO", () => {
  it("pins the tracker (env-overridable; the Cloud Function's GITHUB_REPO default)", () => {
    expect(GITHUB_REPO).toBe("salvodicara/d20-folio");
  });
});

describe("getClosedIssueNumbers", () => {
  it("collects the closed issue numbers from the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([10, 11, 42]));
    vi.stubGlobal("fetch", fetchMock);

    const closed = await getClosedIssueNumbers();
    expect(closed).not.toBeNull();
    expect(closed?.has(11)).toBe(true);
    expect(closed?.has(42)).toBe(true);
    expect(closed?.has(999)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The lookup reads the SHARED repo constant — never a second hardcoded copy.
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/${GITHUB_REPO}/issues?state=closed&per_page=100`,
      expect.anything()
    );
  });

  it("resolves to null on a non-OK response (e.g. a private repo 404)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getClosedIssueNumbers()).toBeNull();
  });

  it("resolves to null when fetch throws (offline)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await getClosedIssueNumbers()).toBeNull();
  });

  it("caches the result for the session (one fetch across repeat callers)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([5]));
    vi.stubGlobal("fetch", fetchMock);
    const a = await getClosedIssueNumbers();
    const b = await getClosedIssueNumbers();
    expect(a).toBe(b); // same cached set instance
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
