/**
 * TOOL-NAME SINGLE-SOURCE GUARD (#107).
 *
 * A tool is BOTH a proficiency (right-rail / Bio chip) and an equipment item (the
 * bag). The two surfaces used to NAME the same physical tool independently — the
 * proficiency catalogue (`src/lib/tools.ts`) carried hardcoded BiText while the
 * inventory catalogue (`src/i18n/<locale>/srd/equipment.json`) carried its own, keyed by
 * the SAME tool id — so in Italian one surface read "Strumenti da Scasso" and the
 * other "Strumenti da Ladro" for the very same Thieves' Tools. (It was ALSO a
 * rule-9 violation — a translatable string living in TypeScript — that the
 * `no-srd-strings-in-data` guard never caught because it only scans `src/data/**`,
 * not `src/lib/**`.)
 *
 * The fix: tool names live in ONE place — the SRD equipment catalogue keyed by the
 * tool id — and EVERY surface resolves the name from there. This guard makes the
 * drift class IMPOSSIBLE to reintroduce by pinning, red-before / green-after:
 *
 *   (a) `src/lib/tools.ts` carries NO BiText / display string — id + category only.
 *   (b) every catalogue tool id has its name defined in the equipment catalogue
 *       (EN + IT), and NOWHERE else (the single source).
 *   (c) the proficiency-surface string a tool resolves to is BYTE-IDENTICAL to the
 *       inventory-surface string, in BOTH locales (no drift by construction).
 *
 * Pure unit-level — no Firebase, no render.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { readSrc, SRC_ROOT } from "./__helpers__/src-files";
import { SRD_TOOLS_2024 } from "@/lib/tools";
import { evaluateGrants } from "@/lib/grants";
import { resolveGrantSourcesForToolChoices } from "@/lib/resolve-grant-sources";
import { displayToolProficiencies } from "@/lib/views/sheet-view";
import { srd } from "../_harness/loc";

const LOCALES = ["en", "it"] as const;

describe("tool-name single source (#107)", () => {
  it("(a) src/lib/tools.ts carries NO BiText / display string — id + category only", () => {
    const text = readSrc(resolve(SRC_ROOT, "lib", "tools.ts"));
    // A BiText leaf `name: { en: "…", it: "…" }` — the exact shape the strip removed.
    expect(text).not.toMatch(/name\s*:\s*\{\s*en\s*:/);
    // No `it:`/`en:` natural-language property assignment lingering in the catalogue.
    expect(text).not.toMatch(/\bit\s*:\s*"[^"]*\s[^"]*"/);
  });

  it("(b) every tool id resolves a name from the equipment catalogue (EN + IT), the single source", () => {
    for (const tool of SRD_TOOLS_2024) {
      for (const locale of LOCALES) {
        const name = srd("equipment", tool.id, "name", locale);
        expect(
          name,
          `${tool.id} ${locale} name missing from equipment catalogue`
        ).toBeTruthy();
      }
    }
  });

  it("(c) the proficiency surface and the inventory surface read ONE identical name per tool, in both locales", () => {
    // For each concrete (pickable) tool, store it as a toolChoices id, derive the
    // proficiency display string (the right-rail / Bio surface) and compare it to
    // the inventory item's name (the bag surface) — they MUST be byte-identical.
    for (const tool of SRD_TOOLS_2024) {
      if (tool.pickable === false) continue; // umbrellas are never a concrete item
      const agg = evaluateGrants(
        resolveGrantSourcesForToolChoices({ "slot-0": [tool.id] })
      );
      for (const locale of LOCALES) {
        const proficiencyName = displayToolProficiencies([], [], agg, locale);
        const inventoryName = srd("equipment", tool.id, "name", locale);
        expect(
          proficiencyName,
          `${tool.id} ${locale}: proficiency "${proficiencyName}" != inventory "${inventoryName}"`
        ).toBe(inventoryName);
      }
    }
  });

  it("Thieves' Tools reads the official IT SRD 5.2.1 term — 'Arnesi da Scasso' — on BOTH surfaces", () => {
    const agg = evaluateGrants(
      resolveGrantSourcesForToolChoices({ "slot-0": ["thieves-tools"] })
    );
    // Proficiency surface.
    expect(displayToolProficiencies([], [], agg, "it")).toBe("Arnesi da Scasso");
    expect(displayToolProficiencies([], [], agg, "en")).toBe("Thieves' Tools");
    // Inventory surface — the SAME canonical strings.
    expect(srd("equipment", "thieves-tools", "name", "it")).toBe("Arnesi da Scasso");
    expect(srd("equipment", "thieves-tools", "name", "en")).toBe("Thieves' Tools");
  });
});
