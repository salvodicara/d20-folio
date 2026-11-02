/// <reference types="node" />
/**
 * Guard: every CI job runs on a pinned runner image.
 *
 * `ubuntu-latest` moved to 26.04 on 2026-11-02 and Playwright refused to install
 * Chromium there, so every e2e job of Verify went red at once. A `-latest` image
 * changes under us without a commit; a pinned one (`ubuntu-24.04`) only changes in
 * a reviewed diff. This guard reads every `runs-on:` in `.github/workflows/*.yml`
 * and `.github/actions/**` and fails on any `-latest` image.
 *
 * Blind spot: it reads the YAML text, so a runner chosen through an expression
 * (`runs-on: ${{ matrix.os }}`) is checked only for the literal text it contains.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function yamlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return yamlFiles(path);
    return /\.ya?ml$/.test(name) ? [path] : [];
  });
}

const FILES = [".github/workflows", ".github/actions"].flatMap((dir) => {
  try {
    return yamlFiles(join(ROOT, dir));
  } catch {
    return [];
  }
});

const RUNS_ON = FILES.flatMap((file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*runs-on:/.test(line))
    .map(({ line, index }) => ({
      where: `${relative(ROOT, file)}:${index + 1}`,
      value: line.replace(/^\s*runs-on:\s*/, "").trim(),
    }))
);

describe("CI runner images", () => {
  it("finds the workflow jobs it checks", () => {
    expect(RUNS_ON.length).toBeGreaterThan(0);
  });

  it("pins every runs-on to a fixed image, never a -latest one", () => {
    const floating = RUNS_ON.filter(({ value }) => /-latest\b/.test(value)).map(
      ({ where, value }) =>
        `${where}: "runs-on: ${value}" floats; pin the image (e.g. ubuntu-24.04).`
    );
    expect(floating).toEqual([]);
  });
});
