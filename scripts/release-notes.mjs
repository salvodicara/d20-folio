#!/usr/bin/env node
// scripts/release-notes.mjs — PERMANENT release tooling.
//
// This is NOT a one-off migration script: golden rule 10's "delete once spent"
// does NOT apply. It runs on every `just release` (and for backfills), so it
// lives here permanently.
//
// It projects the curated `CHANGELOG.md` section for a version onto the GitHub
// release body, so the release notes stay a faithful, self-contained mirror of
// the single source of truth (`CHANGELOG.md`) — never a "see CHANGELOG" pointer,
// never GitHub's raw commit dump (docs/RELEASE.md, golden rule 17).
//
//   node scripts/release-notes.mjs <version>     # e.g. 0.16.5 (a leading "v" is fine)
//
// Prints the release BODY to stdout: the version's curated CHANGELOG content
// (its `## <version>` heading stripped — the GitHub release title already shows
// the version) followed by a "Full changelog:" compare link to the previous tag.
// Exits non-zero if the version has no CHANGELOG section.
//
// Dependency-free — Node stdlib only. `just release` feeds the output to
// `gh release create --notes-file`.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = "salvodicara/d20-folio";
const CHANGELOG_URL = new URL("../CHANGELOG.md", import.meta.url);

/** Strip a single leading "v" so `v0.16.5` and `0.16.5` are equivalent. */
export function normalizeVersion(version) {
  return String(version).trim().replace(/^v/, "");
}

/**
 * Slice the curated CHANGELOG body for `version` out of `changelog`: everything
 * AFTER its `## <version>` heading line up to (but excluding) the next `## `
 * heading, trimmed. The redundant version heading itself is dropped. Throws if
 * the version's section is not found.
 */
export function extractSection(changelog, version) {
  const wanted = normalizeVersion(version);
  const lines = changelog.split("\n");
  const isVersionHeading = (line) => /^##\s+\S/.test(line);
  const headingVersion = (line) => {
    const match = /^##\s+(\S+)/.exec(line);
    return match ? match[1] : null;
  };

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingVersion(lines[i]) === wanted) {
      start = i;
      break;
    }
  }
  if (start === -1) {
    throw new Error(`No CHANGELOG.md section found for version ${wanted}`);
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isVersionHeading(lines[i])) {
      end = i;
      break;
    }
  }

  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

/**
 * The full release BODY for `version`: the curated section plus a compare-link
 * footer to `prevTag`. When `prevTag` is falsy (no earlier tag) the footer is
 * omitted gracefully.
 */
export function buildReleaseNotes(changelog, version, prevTag) {
  const wanted = normalizeVersion(version);
  const body = extractSection(changelog, wanted);
  if (!prevTag) return body;
  const thisTag = `v${wanted}`;
  return `${body}\n\n**Full changelog:** https://github.com/${REPO}/compare/${prevTag}...${thisTag}`;
}

/**
 * The highest `vX.Y.Z` tag strictly less than `version`, or null. Git-backed;
 * any failure (git absent, no tags) yields null so the compare footer is simply
 * omitted — robust whether or not `version`'s own tag exists yet.
 */
function previousTag(version) {
  const cur = normalizeVersion(version).split(".").map(Number);
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  try {
    const out = execFileSync("git", ["tag", "--sort=-v:refname"], { encoding: "utf8" });
    const tags = out
      .split("\n")
      .map((tag) => tag.trim())
      .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
    for (const tag of tags) {
      if (cmp(tag.slice(1).split(".").map(Number), cur) < 0) return tag;
    }
  } catch {
    // no git / no tags → no compare footer
  }
  return null;
}

function main() {
  const version = process.argv[2];
  if (!version) {
    process.stderr.write("usage: node scripts/release-notes.mjs <version>\n");
    process.exit(1);
  }
  const changelog = readFileSync(CHANGELOG_URL, "utf8");
  let body;
  try {
    body = buildReleaseNotes(changelog, version, previousTag(version));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`${body}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
