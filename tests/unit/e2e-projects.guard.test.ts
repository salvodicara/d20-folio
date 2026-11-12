/**
 * Every e2e spec runs somewhere. A spec the default `chromium` project ignores must be
 * picked up by another project, or it silently never runs in CI (the Signet suite
 * shipped dead for three weeks this way; a new-UI spec left out of the `new-ui`
 * project's list would do the same). Verify and PR CI run the projects, not files.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../folio-server-guard", () => ({
  FOLIO_SERVER_GUARD: "",
  folioServers: () => [],
}));
vi.mock("../../scripts/local-workers", () => ({ localWorkers: () => 1 }));

const { default: config } = await import("../../playwright.config");

type Pattern = string | RegExp | Array<string | RegExp> | undefined;
const list = (p: Pattern) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);
const hits = (p: Pattern, file: string) =>
  list(p).some((m) => (typeof m === "string" ? file.includes(m) : m.test(file)));

const SPEC_DIR = join(__dirname, "..", "e2e");
const specs = readdirSync(SPEC_DIR).filter((f) => f.endsWith(".spec.ts"));

// Lanes that run only when their variable is set (playwright.config.ts OFF_LANES).
const ON_REQUEST = /^_|visual-full\.spec\.ts$/;

describe("every e2e spec belongs to a project", () => {
  it("finds the specs", () => {
    expect(specs.length).toBeGreaterThan(50);
  });

  it.each(specs.filter((s) => !ON_REQUEST.test(s)))("%s runs in some project", (spec) => {
    const runsIn = (config.projects ?? []).filter(
      (p) =>
        (p.testMatch === undefined || hits(p.testMatch, spec)) &&
        !hits(p.testIgnore, spec)
    );
    expect(runsIn.map((p) => p.name)).not.toEqual([]);
  });
});
