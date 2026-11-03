/**
 * Italian copy never puts a gendered past participle after a name it cannot know the
 * gender of («{{name}} clonato» reads wrong for Mara; owner's tables, 2026-11-03). The
 * verb or the noun goes first instead («Clonato: {{name}}», «Rimosso dalla campagna:
 * {{name}}»), or a form that does not agree («hai lanciato {{spell}}», «si stabilizza»).
 * A number placeholder ({{count}} minuto) is not a name and may agree.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve("src/i18n/it/ui");
const NUMBERS = new Set([
  "count",
  "n",
  "round",
  "level",
  "amount",
  "value",
  "total",
  "minutes",
  "hours",
  "max",
  "min",
  "from",
  "to",
  "of",
  "charges",
  "days",
  "dice",
  "number",
  "current",
  "hp",
]);
// «{{x}}», optionally «è stato/a» or «viene», then a word ending -ato/-ata/-ito/-ita/-uto/-uta.
const GENDERED =
  /\{\{(\w+)\}\} (?:è stat[oa] |è |viene )?[a-zàèéìòù]+(?:at|it|ut)[oa]\b/g;

function strings(value: unknown, at: string, out: Array<[string, string]>) {
  if (typeof value === "string") out.push([at, value]);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) strings(v, at ? `${at}.${k}` : k, out);
}

describe("Italian copy is gender-neutral after a name", () => {
  it("no gendered participle follows a name placeholder", () => {
    const hits: string[] = [];
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
      const all: Array<[string, string]> = [];
      strings(JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")), "", all);
      for (const [key, text] of all)
        for (const m of text.matchAll(GENDERED))
          if (!NUMBERS.has(m[1] ?? "")) hits.push(`${file} ${key}: ${text}`);
    }
    expect(hits).toEqual([]);
  });
});
