/// <reference types="node" />
/**
 * Guard: every job that runs in the official Playwright image uses the image of the
 * Playwright version in the lockfile. The image carries its own browser build; a
 * Playwright package of another version would look for a browser the image lacks,
 * and the job would fail (or download one, which the image is there to avoid).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

const lockedVersion = /^ {2}'@playwright\/test@([\d.]+)':/m.exec(
  readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8")
)?.[1];

const images = readdirSync(WORKFLOWS)
  .filter((name) => /\.ya?ml$/.test(name))
  .flatMap((name) =>
    [
      ...readFileSync(join(WORKFLOWS, name), "utf8").matchAll(
        /mcr\.microsoft\.com\/playwright:v([\d.]+)-(\w+)/g
      ),
    ].map((m) => ({ name, version: m[1], distro: m[2] }))
  );

const aptInstalls = readdirSync(WORKFLOWS)
  .filter((name) => /\.ya?ml$/.test(name))
  .flatMap((name) =>
    readFileSync(join(WORKFLOWS, name), "utf8")
      .split("\n")
      .flatMap((line, index) =>
        /playwright install\b.*--with-deps/.test(line) ? [`${name}:${index + 1}`] : []
      )
  );

describe("the Playwright container image", () => {
  it("no workflow installs the browser through apt (--with-deps): the image has it", () => {
    expect(aptInstalls).toEqual([]);
  });

  it("finds the lockfile's version and at least one job in the image", () => {
    expect(lockedVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(images.length).toBeGreaterThan(0);
  });

  it("matches the lockfile's Playwright, on Ubuntu 24.04 (noble) like the other jobs", () => {
    expect(
      images.filter((i) => i.version !== lockedVersion || i.distro !== "noble")
    ).toEqual([]);
  });
});
