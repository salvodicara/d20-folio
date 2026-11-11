/**
 * Italian wording guard. Expertise is "Maestria"; Weapon Mastery is "Padronanza
 * d'Armi" (the class-feature catalogue's word). No Italian string may pair
 * "Maestria" with weapons ("Maestria nelle armi", "Maestria d'arma"), so the two
 * rules never read as one.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/i18n/it/ui", "src/i18n/it/srd"];
const MAESTRIA_WITH_WEAPONS =
  /maestria\s+(?:nelle|delle|d[ei]ll?e?|con le|d['’])\s*arm[ie]/i;

function strings(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === "string") out.push([path, value]);
  else if (value && typeof value === "object")
    for (const [key, inner] of Object.entries(value))
      strings(inner, `${path}.${key}`, out);
}

describe("Italian: Expertise (Maestria) is never Weapon Mastery", () => {
  it("no Italian string pairs Maestria with weapons", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of readdirSync(root).filter((f) => f.endsWith(".json"))) {
        const all: Array<[string, string]> = [];
        strings(JSON.parse(readFileSync(join(root, file), "utf8")), file, all);
        for (const [path, text] of all)
          if (MAESTRIA_WITH_WEAPONS.test(text)) hits.push(path);
      }
    }
    expect(hits).toEqual([]);
  });
});
