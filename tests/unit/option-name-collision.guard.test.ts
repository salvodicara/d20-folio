/// <reference types="node" />
/**
 * Guard: an option a feature grants never takes another feature's name.
 *
 * The Thief's Supreme Sneak option «Stealth Attack» was «Attacco Furtivo» in Italian,
 * which is Sneak Attack itself, so the Cunning Strike row read «Attacco Furtivo −1d6»:
 * spend Sneak Attack dice to get Sneak Attack. The official Italian SRD 5.2.1 calls it
 * «Attacco nascosto». This guard reads each class-feature catalogue (public, and the
 * pack's when present) in each language and fails on an option entry
 * (`<feature>.grants.<option>`) whose name equals a DIFFERENT feature's name.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const CATALOGUES = ["src", "content-pack"]
  .flatMap((base) =>
    ["en", "it"].map((lang) =>
      join(ROOT, base, "i18n", lang, "srd", "class-features.json")
    )
  )
  .filter(existsSync);

type Entry = { name?: unknown };

function collisions(file: string): string[] {
  const entries = Object.entries(
    JSON.parse(readFileSync(file, "utf8")) as Record<string, Entry>
  );
  const named = (key: string, entry: Entry) =>
    typeof entry.name === "string" ? [{ key, name: entry.name.toLowerCase() }] : [];
  const features = entries.flatMap(([key, entry]) =>
    key.includes(".grants.") ? [] : named(key, entry)
  );
  return entries.flatMap(([key, entry]) => {
    if (!key.includes(".grants.")) return [];
    const owner = key.split(".grants.")[0];
    return named(key, entry).flatMap(({ name }) =>
      features
        .filter((f) => f.name === name && f.key !== owner)
        .map((f) => `${key} is named like ${f.key} ("${String(entry.name)}")`)
    );
  });
}

describe("feature option names", () => {
  it("reads the class-feature catalogues", () => {
    expect(CATALOGUES.length).toBeGreaterThanOrEqual(2);
  });

  it.each(CATALOGUES.map((file) => [file.replace(ROOT, ""), file]))(
    "%s: no option shares another feature's name",
    (_label, file) => {
      expect(collisions(file)).toEqual([]);
    }
  );
});
