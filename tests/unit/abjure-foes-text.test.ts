/**
 * Abjure Foes (SRD 5.2.1, Paladin 9): the targets are a number of creatures equal to
 * the Charisma modifier (minimum one), and the Frightened condition lasts 1 minute or
 * until the target takes any damage — no repeat save. The sheet's text said «each
 * enemy» and «save ends» in both languages (code check of the upcoming features,
 * 2026-11-13).
 */
import { describe, expect, it } from "vitest";

import en from "@/i18n/en/srd/class-features.json";
import it_ from "@/i18n/it/srd/class-features.json";
import enProse from "@/i18n/en/srd-prose/class-features.json";

type Entry = { description?: string; summary?: string; gist?: string };
const pick = (cat: unknown, key: string) => (cat as Record<string, Entry>)[key];

describe("Abjure Foes text states the rule", () => {
  it("English: the CHA-modifier cap and the end on damage, never «each enemy» or «save ends»", () => {
    const text = [
      pick(en, "paladin-abjure-foes")?.description,
      pick(en, "paladin-abjure-foes.mechanics.actions.0")?.description,
      pick(en, "paladin-abjure-foes.mechanics.actions.0")?.summary,
      pick(enProse, "paladin-abjure-foes")?.gist,
    ].join(" | ");
    expect(pick(en, "paladin-abjure-foes")?.description).toMatch(
      /Charisma modifier \(minimum one\)/
    );
    expect(pick(en, "paladin-abjure-foes")?.description).toMatch(
      /until it takes any damage/
    );
    expect(text).not.toMatch(/each enemy|save ends|^Enemies|: enemies/i);
  });

  it("Italian: the CAR-modifier cap and the end on damage, never «ogni nemico» or «TS pone fine»", () => {
    const entry = pick(it_, "paladin-abjure-foes");
    const action = pick(it_, "paladin-abjure-foes.mechanics.actions.0");
    const text = [
      entry?.description,
      entry?.gist,
      action?.description,
      action?.summary,
    ].join(" | ");
    expect(entry?.description).toMatch(/modificatore di Carisma \(minimo una\)/);
    expect(entry?.description).toMatch(/finché non subisce danni/);
    expect(text).not.toMatch(/ogni nemico|TS pone fine|nemici/i);
  });
});
