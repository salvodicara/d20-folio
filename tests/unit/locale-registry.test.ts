/**
 * The locale registry (`src/lib/locale.ts`): adding a language is a data change.
 * Each language is one registry entry plus its catalogue folders; no component
 * decides "is this Italian?" by hand, so a third language never needs a code hunt.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { LOCALES, LOCALE_REGISTRY, asLocale, intlTag, usesMetric } from "@/lib/locale";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("locale registry", () => {
  it("lists every registered language, in registry order", () => {
    expect(LOCALES).toEqual(Object.keys(LOCALE_REGISTRY));
  });

  it.each(Object.keys(LOCALE_REGISTRY))("%s has its catalogue folders", (code) => {
    expect(existsSync(path.join(ROOT, "src/i18n", code, "ui"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/i18n", code, "srd"))).toBe(true);
  });

  it("reads browser tags and falls back to English", () => {
    expect(asLocale("it")).toBe("it");
    expect(asLocale("it-IT")).toBe("it");
    expect(asLocale("en-GB")).toBe("en");
    expect(asLocale("fr")).toBe("en");
    expect(asLocale(undefined)).toBe("en");
  });

  it("carries each language's number format and measurement system", () => {
    expect(intlTag("en")).toBe("en-US");
    expect(intlTag("it")).toBe("it-IT");
    expect(usesMetric("en")).toBe(false);
    expect(usesMetric("it")).toBe(true);
  });

  it("no source file decides a language by comparing with a hard-coded code", () => {
    // `git grep` exits 1 when nothing matches: no hits is the passing case.
    const grep = spawnSync(
      "git",
      ["grep", "-nE", `(===|!==) ?"(it|en)"|"(it|en)" ?(===|!==)`, "--", "src"],
      { cwd: ROOT, encoding: "utf8" }
    );
    expect(grep.status === 0 || grep.status === 1).toBe(true);
    expect(grep.stdout.split("\n").filter(Boolean)).toEqual([]);
  });
});
