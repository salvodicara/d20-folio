// Type declarations for the plain-ESM release-notes tooling (release-notes.mjs),
// so TypeScript consumers (the unit test) get types for its pure exports.
export function normalizeVersion(version: string): string;
export function extractSection(changelog: string, version: string): string;
export function buildReleaseNotes(
  changelog: string,
  version: string,
  prevTag: string | null
): string;
