/**
 * Interface strings write the ellipsis as one character («…»), never three dots
 * («...»), in English and in Italian (design reset «BG3 craft», slice 7). The SRD
 * catalogues are rules text and keep their source's punctuation.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");

/** Every string value in a catalogue, with its dotted key. */
const strings = (value: unknown, key = ""): [string, string][] =>
  typeof value === "string"
    ? [[key, value]]
    : value && typeof value === "object"
      ? Object.entries(value).flatMap(([k, v]) => strings(v, key ? `${key}.${k}` : k))
      : [];

describe("UI strings use the ellipsis character", () => {
  it.each(["en", "it"])("%s", (locale) => {
    const dir = join(ROOT, "src/i18n", locale, "ui");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(10);
    const dotted = files.flatMap((file) =>
      strings(JSON.parse(readFileSync(join(dir, file), "utf8")))
        .filter(([, text]) => text.includes("..."))
        .map(([key]) => `${file}: ${key}`)
    );
    expect(dotted).toEqual([]);
  });
});
