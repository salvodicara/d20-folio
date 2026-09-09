/**
 * Every official creation source explains itself — PD, rule 30 audit (2026-09-09).
 *
 * The guided flow renders a source's description through the locale catalogue
 * (`acquisition-presenters.ts` → `srdCatalogues(locale)[kind][id].description`),
 * so a class or species with no `description` in `src/i18n/{en,it}/srd/` opens an
 * EMPTY reading panel — the audit measured 12/12 classes and 9/9 species empty.
 * BG3 and D&D Beyond both put a flavour sentence beside every class and species
 * at the moment of choice (docs/superpowers/research/2026-09-09-pd/). This pins
 * the public SRD catalogue in BOTH locales; the private pack owns its own entries.
 */
import { describe, expect, it } from "vitest";
import { localizeSrd } from "@/i18n/resolver";
import { classTables } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import enClasses from "@/i18n/en/srd/classes.json";

/** Public SRD entries only: the private pack composes its own descriptions. */
const srdIds = (rows: readonly { id: string; source?: string }[]) =>
  rows.filter((row) => row.source === "SRD").map((row) => row.id);
/** Class tables carry no `source`; the public EN catalogue lists exactly the SRD classes. */
const SRD_CLASS_IDS = Object.keys(enClasses).filter((id) =>
  classTables.some((table) => table.id === id)
);
const subjects = [
  { kind: "class", ids: SRD_CLASS_IDS },
  { kind: "race", ids: srdIds(SRD_RACES) },
  { kind: "background", ids: srdIds(SRD_BACKGROUNDS) },
] as const;

describe("creation sources carry a description in EN and IT", () => {
  for (const { kind, ids } of subjects) {
    it(`${kind}: ${ids.length} SRD entries each resolve a non-empty description`, () => {
      expect(ids.length).toBeGreaterThan(0);
      const missing: string[] = [];
      for (const id of ids)
        for (const locale of ["en", "it"] as const) {
          let text = "";
          try {
            text = localizeSrd(kind, id, "description", locale);
          } catch {
            /* missing string → recorded below */
          }
          if (text.trim().length < 40) missing.push(`${kind}:${id}#${locale}`);
        }
      expect(
        missing,
        "sources whose description is missing or shorter than a sentence"
      ).toEqual([]);
    });
  }
  it("EN and IT descriptions differ (no untranslated English in IT)", () => {
    for (const { kind, ids } of subjects)
      for (const id of ids)
        expect(localizeSrd(kind, id, "description", "it"), `${kind}:${id}`).not.toBe(
          localizeSrd(kind, id, "description", "en")
        );
  });
});
