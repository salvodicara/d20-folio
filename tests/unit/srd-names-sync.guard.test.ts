/**
 * Guard: the SRD-free `@/data/srd-names` localization source must stay EXACTLY in
 * sync with the full SRD data (#78). `srd-i18n` reads names from srd-names so a
 * glance (roster card) can localize without importing the multi-megabyte SRD — but
 * that only stays correct if the extracted names never drift. This test imports the
 * full data and fails the build the moment a name (or its IT translation) diverges,
 * or a class/subclass/race/background is added/removed without updating srd-names.
 */
import { describe, it, expect } from "vitest";
import { srd } from "../_harness/loc";
import { classTables } from "@/data/classes";
import { RACES_BY_ID } from "@/data/races";
import { BACKGROUNDS_BY_ID } from "@/data/backgrounds";
import {
  CLASS_NAMES,
  SUBCLASS_NAMES,
  RACE_NAMES,
  BACKGROUND_NAMES,
} from "@/data/srd-names";

const sortById = <T extends { id: string }>(a: T[]) =>
  [...a].sort((x, y) => x.id.localeCompare(y.id));
const sortByEn = <T extends { en: string }>(a: T[]) =>
  [...a].sort((x, y) => x.en.localeCompare(y.en));

describe("srd-names stays in sync with the full SRD data", () => {
  it("classes — every class name + IT matches, no extras/omissions", () => {
    const fromData = classTables.map((c) => ({
      en: srd("class", c.id, "name", "en"),
      it: srd("class", c.id, "name", "it"),
    }));
    const fromNames = CLASS_NAMES.map((n) => ({ en: n.en, it: n.it }));
    expect(sortByEn(fromNames)).toEqual(sortByEn(fromData));
  });

  it("subclasses — every id + name + IT matches", () => {
    const fromData = classTables.flatMap((c) =>
      c.subclasses.map((s) => ({
        id: s.id,
        en: srd("subclass", s.id, "name", "en"),
        it: srd("subclass", s.id, "name", "it"),
      }))
    );
    const fromNames = SUBCLASS_NAMES.map((s) => ({
      id: s.id,
      en: s.name.en,
      it: s.name.it,
    }));
    expect(sortById(fromNames)).toEqual(sortById(fromData));
  });

  it("races — every id + name + IT matches", () => {
    const fromData = [...RACES_BY_ID.keys()].map((id) => ({
      id,
      // The race name now lives in the SRD catalogue (`race` kind); `srd-names.ts`
      // (the eager bypass roster) must stay in sync with it.
      en: srd("race", id, "name", "en"),
      it: srd("race", id, "name", "it"),
    }));
    const fromNames = RACE_NAMES.map((r) => ({ id: r.id, en: r.name.en, it: r.name.it }));
    expect(sortById(fromNames)).toEqual(sortById(fromData));
  });

  it("backgrounds — every id + name + IT matches", () => {
    const fromData = [...BACKGROUNDS_BY_ID.entries()].map(([id, b]) => ({
      id,
      en: srd("background", b.id, "name", "en"),
      it: srd("background", b.id, "name", "it"),
    }));
    const fromNames = BACKGROUND_NAMES.map((b) => ({
      id: b.id,
      en: b.name.en,
      it: b.name.it,
    }));
    expect(sortById(fromNames)).toEqual(sortById(fromData));
  });
});
