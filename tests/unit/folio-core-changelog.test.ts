/// <reference types="node" />
/**
 * Every change to the rules core's public surface (`packages/folio-core/api.txt`) is a
 * semver decision written down in `packages/folio-core/CHANGELOG.md`: each version lists
 * the names it adds (`+ value x`) and removes (`- type Y`). Replaying the changelog from
 * empty must give exactly `api.txt`, its newest version is the package's version, and the
 * version step matches what changed: a removal (or rename) breaks callers, so it takes a
 * major bump (a minor one while the major is 0); an addition takes at least a minor bump
 * (a patch one while the major is 0).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./__helpers__/static-import-graph";

const CORE = join(REPO_ROOT, "packages/folio-core");

interface CoreRelease {
  version: string;
  added: string[];
  removed: string[];
}

/** The changelog's releases, oldest first. */
function parseCoreChangelog(text: string): CoreRelease[] {
  const releases: CoreRelease[] = [];
  for (const line of text.split("\n")) {
    const heading = /^## (\d+\.\d+\.\d+)\b/.exec(line);
    if (heading) {
      releases.push({ version: heading[1] ?? "", added: [], removed: [] });
      continue;
    }
    const change = /^([+-]) ((?:type|value) \S+)\s*$/.exec(line);
    const current = releases.at(-1);
    if (!change || !current) continue;
    (change[1] === "+" ? current.added : current.removed).push(change[2] ?? "");
  }
  return releases.reverse();
}

type Bump = "major" | "minor" | "patch" | "none";

function bump(from: string, to: string): Bump {
  const [a, b] = [from, to].map((v) => v.split(".").map(Number));
  for (const [index, kind] of (["major", "minor", "patch"] as const).entries()) {
    const delta = (b?.[index] ?? 0) - (a?.[index] ?? 0);
    if (delta !== 0) return delta > 0 ? kind : "none";
  }
  return "none";
}

const RANK: Record<Bump, number> = { none: 0, patch: 1, minor: 2, major: 3 };

/** What is wrong with the changelog against the surface and the package version. */
function changelogProblems(
  releases: CoreRelease[],
  surface: string[],
  packageVersion: string
): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  releases.forEach((release, index) => {
    for (const name of release.removed) {
      if (!names.delete(name))
        problems.push(`${release.version} removes "${name}", which is not public`);
    }
    for (const name of release.added) {
      if (names.has(name))
        problems.push(`${release.version} adds "${name}", which is already public`);
      names.add(name);
    }
    const previous = releases[index - 1];
    if (!previous) return;
    const step = bump(previous.version, release.version);
    if (step === "none") {
      problems.push(`${release.version} does not come after ${previous.version}`);
      return;
    }
    const zero = previous.version.startsWith("0.");
    const breaking: Bump = zero ? "minor" : "major";
    const feature: Bump = zero ? "patch" : "minor";
    if (release.removed.length > 0 && RANK[step] < RANK[breaking])
      problems.push(
        `${release.version} removes names, so it needs a ${breaking} bump over ${previous.version}`
      );
    else if (release.added.length > 0 && RANK[step] < RANK[feature])
      problems.push(
        `${release.version} adds names, so it needs a ${feature} bump over ${previous.version}`
      );
  });
  const missing = surface.filter((name) => !names.has(name));
  const extra = [...names].filter((name) => !surface.includes(name));
  if (missing.length > 0)
    problems.push(`api.txt has names no release adds: ${missing.join(", ")}`);
  if (extra.length > 0)
    problems.push(`the changelog keeps names api.txt no longer has: ${extra.join(", ")}`);
  const newest = releases.at(-1)?.version;
  if (newest !== packageVersion)
    problems.push(
      `the newest release is ${newest ?? "missing"}, the package is ${packageVersion}`
    );
  return problems;
}

describe("the rules core's changelog", () => {
  it("replays to exactly api.txt, at the package's version, with semver steps", () => {
    const surface = readFileSync(join(CORE, "api.txt"), "utf8")
      .split("\n")
      .filter(Boolean);
    const { version } = JSON.parse(readFileSync(join(CORE, "package.json"), "utf8")) as {
      version: string;
    };
    const releases = parseCoreChangelog(readFileSync(join(CORE, "CHANGELOG.md"), "utf8"));
    expect(changelogProblems(releases, surface, version)).toEqual([]);
  });

  const base: CoreRelease = {
    version: "1.0.0",
    added: ["value a", "value b"],
    removed: [],
  };

  it("a name in api.txt that no release adds is refused", () => {
    expect(changelogProblems([base], ["value a", "value b", "value c"], "1.0.0")).toEqual(
      ["api.txt has names no release adds: value c"]
    );
  });

  it("a removal needs a major bump, an addition a minor one", () => {
    const removal = { version: "1.1.0", added: [], removed: ["value b"] };
    expect(changelogProblems([base, removal], ["value a"], "1.1.0")).toEqual([
      "1.1.0 removes names, so it needs a major bump over 1.0.0",
    ]);
    const addition = { version: "1.0.1", added: ["value c"], removed: [] };
    expect(
      changelogProblems([base, addition], ["value a", "value b", "value c"], "1.0.1")
    ).toEqual(["1.0.1 adds names, so it needs a minor bump over 1.0.0"]);
    expect(
      changelogProblems(
        [base, { ...addition, version: "1.1.0" }],
        ["value a", "value b", "value c"],
        "1.1.0"
      )
    ).toEqual([]);
  });

  it("while the major is 0, a removal takes a minor bump and an addition a patch", () => {
    const zero = { ...base, version: "0.24.1" };
    expect(
      changelogProblems(
        [zero, { version: "0.24.2", added: [], removed: ["value b"] }],
        ["value a"],
        "0.24.2"
      )
    ).toEqual(["0.24.2 removes names, so it needs a minor bump over 0.24.1"]);
    expect(
      changelogProblems(
        [zero, { version: "0.24.2", added: ["value c"], removed: [] }],
        ["value a", "value b", "value c"],
        "0.24.2"
      )
    ).toEqual([]);
  });

  it("the newest release is the package's version", () => {
    expect(changelogProblems([base], ["value a", "value b"], "1.0.1")).toEqual([
      "the newest release is 1.0.0, the package is 1.0.1",
    ]);
  });

  it("reads the newest release first in the file, oldest last", () => {
    const text = [
      "# Changelog",
      "## 0.25.0 — later",
      "- value b",
      "## 0.24.1 — first",
      "+ value a",
      "+ value b",
      "some prose that is not a change",
    ].join("\n");
    expect(parseCoreChangelog(text)).toEqual([
      { version: "0.24.1", added: ["value a", "value b"], removed: [] },
      { version: "0.25.0", added: [], removed: ["value b"] },
    ]);
  });
});
