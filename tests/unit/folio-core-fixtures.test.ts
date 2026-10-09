/**
 * The @d20-folio/core fixtures stay honest: each committed character export, read by
 * the app's own `parseCharacter` and derived by `deriveCharacter`, gives exactly its
 * committed `*.expected.json` — the same numbers `scripts/core-smoke.mjs` then demands
 * from the BUILT package. If the engine changes a number on purpose, regenerate the
 * expected file; a drift here is a real change in what the sheet shows.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseCharacter } from "@/lib/character-codec";
import { deriveCharacter } from "@/lib/views/derive-character";

const dir = path.resolve(import.meta.dirname, "../../packages/folio-core/fixtures");
const files = readdirSync(dir).filter(
  (f) => f.endsWith(".json") && !f.endsWith(".expected.json")
);

describe("@d20-folio/core fixtures", () => {
  it("has fixtures", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s derives its expected sheet", (file) => {
    const parsed = parseCharacter(readFileSync(path.join(dir, file), "utf-8"));
    if (!parsed.success) throw new Error(parsed.error);
    const now = new Date();
    const sheet = deriveCharacter({
      id: file,
      createdAt: now,
      updatedAt: now,
      ...parsed.doc,
    });
    const expected: unknown = JSON.parse(
      readFileSync(path.join(dir, file.replace(".json", ".expected.json")), "utf-8")
    );
    expect({
      level: sheet.level,
      ac: sheet.ac,
      hpMax: sheet.hp.max,
      initiativeBonus: sheet.initiativeBonus,
      passives: sheet.passives,
      saves: sheet.saves.map((s) => s.bonus),
      spellSaveDc: sheet.spellcasting?.saveDc ?? null,
    }).toEqual(expected);
  });
});
