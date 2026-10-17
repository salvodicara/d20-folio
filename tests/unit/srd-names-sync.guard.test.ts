/**
 * Guard: the SRD-free `@/data/srd-names` index must stay EXACTLY in sync with the
 * full SRD data (#78). `srd-i18n` reads names from srd-names so a glance (roster
 * card) can localize without importing the multi-megabyte SRD; the index derives
 * its entries from the name catalogues, so this pins the two directions the
 * catalogues can't: every class/subclass/race/background in the data has an entry
 * (and no entry lacks one), named in every locale as the catalogue names it.
 */
import { describe, it, expect } from "vitest";
import { srd } from "../_harness/loc";
import { LOCALES } from "@/lib/locale";
import type { SrdKind } from "@/i18n/srd-en";
import { classTables } from "@/data/classes";
import { RACES_BY_ID } from "@/data/races";
import { BACKGROUNDS_BY_ID } from "@/data/backgrounds";
import {
  classNames,
  subclassNames,
  raceNames,
  backgroundNames,
  resolveClassId,
  subclassIdByName,
  raceIdByName,
  backgroundIdByName,
} from "@/data/srd-names";
import type { LocaleText } from "@/data/types";

const named = (kind: SrdKind, id: string): { id: string; name: LocaleText } => ({
  id,
  name: Object.fromEntries(
    LOCALES.map((locale) => [locale, srd(kind, id, "name", locale)])
  ) as LocaleText,
});

const sortById = <T extends { id: string }>(a: readonly T[]) =>
  [...a].sort((x, y) => x.id.localeCompare(y.id));

describe("srd-names stays in sync with the full SRD data", () => {
  it("classes — every class named in every locale, no extras/omissions", () => {
    const fromData = classTables.map((c) => named("class", c.id).name);
    const byEn = (a: readonly LocaleText[]) =>
      [...a].sort((x, y) => x.en.localeCompare(y.en));
    expect(byEn(classNames().map((c) => c.name))).toEqual(byEn(fromData));
  });

  it("subclasses — every id named in every locale", () => {
    const fromData = classTables.flatMap((c) =>
      c.subclasses.map((s) => named("subclass", s.id))
    );
    expect(sortById(subclassNames())).toEqual(sortById(fromData));
  });

  it("races — every id named in every locale", () => {
    const fromData = [...RACES_BY_ID.keys()].map((id) => named("race", id));
    expect(sortById(raceNames())).toEqual(sortById(fromData));
  });

  it("backgrounds — every id named in every locale", () => {
    const fromData = [...BACKGROUNDS_BY_ID.keys()].map((id) => named("background", id));
    expect(sortById(backgroundNames())).toEqual(sortById(fromData));
  });

  it("a stored label in any locale resolves to its id", () => {
    for (const locale of LOCALES) {
      expect(resolveClassId(srd("class", "wizard", "name", locale))).toBe("wizard");
      expect(subclassIdByName(srd("subclass", "evoker", "name", locale))).toBe("evoker");
      expect(raceIdByName(srd("race", "elf", "name", locale))).toBe("elf");
      expect(backgroundIdByName(srd("background", "sage", "name", locale))).toBe("sage");
    }
    // The Italian names, spelled out: the index reads them from the IT catalogue.
    expect(resolveClassId("Mago")).toBe("wizard");
    expect(subclassIdByName("Invocatore")).toBe("evoker");
    expect(raceIdByName("Elfo")).toBe("elf");
    expect(backgroundIdByName("Sapiente")).toBe("sage");
  });
});
