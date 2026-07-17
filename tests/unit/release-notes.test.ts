import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildReleaseNotes,
  extractSection,
  normalizeVersion,
} from "../../scripts/release-notes.mjs";

// The real project CHANGELOG — the single source of truth the script projects.
const changelog = readFileSync(
  fileURLToPath(new URL("../../CHANGELOG.md", import.meta.url)),
  "utf8"
);

describe("release-notes projection", () => {
  it("extracts the v0.16.5 curated section without its heading, stopping at the next version", () => {
    const section = extractSection(changelog, "0.16.5");
    expect(section.startsWith("## 0.16.5")).toBe(false);
    expect(section).toContain("A D&D 2024 mechanics-accuracy pass");
    expect(section).toContain("### Spells");
    expect(section).toContain("### Classes & species");
    // Must not bleed into the previous published version's section.
    expect(section).not.toContain("## 0.16.4");
    expect(section).not.toContain("reliability sweep");
  });

  it("treats a leading v as equivalent to the bare version", () => {
    expect(normalizeVersion("v0.16.5")).toBe("0.16.5");
    expect(extractSection(changelog, "v0.16.5")).toBe(
      extractSection(changelog, "0.16.5")
    );
  });

  it("appends the compare-link footer when a previous tag is supplied", () => {
    const body = buildReleaseNotes(changelog, "0.16.5", "v0.16.4");
    expect(body).toContain(
      "**Full changelog:** https://github.com/salvodicara/d20-folio/compare/v0.16.4...v0.16.5"
    );
    // The curated body still leads.
    expect(body.startsWith("**A D&D 2024 mechanics-accuracy pass")).toBe(true);
  });

  it("omits the compare footer when there is no previous tag", () => {
    const body = buildReleaseNotes(changelog, "0.16.5", null);
    expect(body).not.toContain("**Full changelog:**");
  });

  it("throws for a version with no CHANGELOG section", () => {
    expect(() => extractSection(changelog, "9.9.9")).toThrow(/No CHANGELOG.md section/);
  });
});
