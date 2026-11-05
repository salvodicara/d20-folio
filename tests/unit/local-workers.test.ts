/**
 * A local test run takes at most a few workers (owner rule, 2026-11-05: the owner
 * works on this Mac while agents test); CI keeps its own settings.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { localWorkers } from "../../scripts/local-workers";

afterEach(() => vi.unstubAllEnvs());

describe("localWorkers", () => {
  it("defaults to 3 locally", () => {
    vi.stubEnv("CI", "");
    vi.stubEnv("FOLIO_LOCAL_WORKERS", "");
    expect(localWorkers()).toBe(3);
  });

  it("reads FOLIO_LOCAL_WORKERS, ignoring a value that isn't a positive integer", () => {
    vi.stubEnv("CI", "");
    vi.stubEnv("FOLIO_LOCAL_WORKERS", "2");
    expect(localWorkers()).toBe(2);
    vi.stubEnv("FOLIO_LOCAL_WORKERS", "zero");
    expect(localWorkers()).toBe(3);
  });

  it("leaves CI alone", () => {
    vi.stubEnv("CI", "true");
    vi.stubEnv("FOLIO_LOCAL_WORKERS", "2");
    expect(localWorkers()).toBeUndefined();
  });
});
