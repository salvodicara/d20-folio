import { describe, it, expect } from "vitest";
import { primaryClassEntry } from "@/lib/classes";
import { buildGrantedFeatures } from "@/lib/character-build";
import { classFeatures } from "@/data/classes";
import { raceFeatureEntries } from "@/data/races";
import { FEATS_BY_ID } from "@/data/feats";
import { MOCK_CHARACTER } from "@/lib/mock";

const idSet = (refs: { srdId: string }[]) => new Set(refs.map((r) => r.srdId));

describe("buildGrantedFeatures (the C2/H2 fix — species + feats reach the character)", () => {
  it("injects ALL species traits for the chosen race alongside class features", () => {
    const raceId = "orc";
    const ids = idSet(
      buildGrantedFeatures({
        classId: "barbarian",
        level: 1,
        subclassId: "",
        raceId,
        originFeat: "lucky",
      })
    );
    const orcTraitIds = raceFeatureEntries
      .filter((e) => e.raceId === raceId)
      .map((e) => e.id);
    expect(orcTraitIds.length).toBeGreaterThan(0);
    for (const id of orcTraitIds) expect(ids.has(id)).toBe(true);
    // a known level-1 class feature is still present
    expect(ids.has("barbarian-rage")).toBe(true);
  });

  it("injects the origin feat when it exists in the SRD feat index", () => {
    const ids = idSet(
      buildGrantedFeatures({
        classId: "barbarian",
        level: 1,
        subclassId: "",
        raceId: "human",
        originFeat: "skilled",
      })
    );
    expect(FEATS_BY_ID.has("skilled")).toBe(true);
    expect(ids.has("skilled")).toBe(true);
  });

  it("ignores a feat slug that isn't a real SRD feat", () => {
    const ids = idSet(
      buildGrantedFeatures({
        classId: "barbarian",
        level: 1,
        subclassId: "",
        raceId: "human",
        bgFeat: "not-a-real-feat",
      })
    );
    expect(ids.has("not-a-real-feat")).toBe(false);
  });

  it("includes class features only at or below the character level", () => {
    const lo = idSet(
      buildGrantedFeatures({
        classId: "barbarian",
        level: 1,
        subclassId: "",
        raceId: "human",
      })
    );
    const hi = idSet(
      buildGrantedFeatures({
        classId: "barbarian",
        level: 5,
        subclassId: "",
        raceId: "human",
      })
    );
    expect(lo.has("barbarian-extra-attack")).toBe(false); // a level-5 feature
    expect(hi.has("barbarian-extra-attack")).toBe(true);
  });

  it("includes a subclass's features only when that subclass is selected", () => {
    const classId = "bard";
    const subFeature = classFeatures.find((f) => f.class === classId && f.subclass);
    if (!subFeature?.subclass)
      throw new Error("test fixture: no subclass feature found for bard");
    const withSub = idSet(
      buildGrantedFeatures({
        classId,
        level: 20,
        subclassId: subFeature.subclass,
        raceId: "human",
      })
    );
    const withoutSub = idSet(
      buildGrantedFeatures({ classId, level: 20, subclassId: "", raceId: "human" })
    );
    expect(withSub.has(subFeature.id)).toBe(true);
    expect(withoutSub.has(subFeature.id)).toBe(false);
  });

  it("OWN-34 — the mock (Bard 9 · College of Lore · Elf) derives its subclass + species sources", () => {
    // The Features tab unions this derivation onto features[] (display-only), so the
    // mock — whose hand-authored features[] omits subclass + species — still shows
    // every source. Lock that the derivation surfaces the previously-absent ones.
    const cd = MOCK_CHARACTER.character;
    const cdEntry = primaryClassEntry(cd);
    const ids = idSet(
      buildGrantedFeatures({
        classId: cdEntry.classId,
        level: cdEntry.level,
        subclassId: cdEntry.subclassId ?? "",
        raceId: cd.race.toLowerCase(),
      })
    );
    // College of Lore subclass features (were absent from the mock's features[]).
    const subclassIds = classFeatures
      .filter((f) => f.subclass === cdEntry.subclassId && f.level <= cdEntry.level)
      .map((f) => f.id);
    expect(subclassIds.length).toBeGreaterThan(0);
    for (const id of subclassIds) expect(ids.has(id)).toBe(true);
    // Elf species traits (also absent from the mock's features[]).
    const speciesIds = raceFeatureEntries
      .filter((e) => e.raceId === cd.race.toLowerCase())
      .map((e) => e.id);
    expect(speciesIds.length).toBeGreaterThan(0);
    for (const id of speciesIds) expect(ids.has(id)).toBe(true);
  });

  it("collapses the Fighting Style placeholder when its concrete style is granted (#38)", () => {
    // A Paladin's Fighting Style resolves to the concrete `paladin-fighting-style-defense`
    // class feature (auto-Defense); the generic `paladin-fighting-style` placeholder
    // must NOT ALSO appear (it read as a duplicate/ghost card — devotion-paladin scenario).
    const ids = idSet(
      buildGrantedFeatures({
        classId: "paladin",
        level: 6,
        subclassId: "oath-of-devotion",
        raceId: "human",
      })
    );
    expect(ids.has("paladin-fighting-style-defense")).toBe(true); // the chosen style stays
    expect(ids.has("paladin-fighting-style")).toBe(false); // the placeholder collapses
  });

  it("keeps a Fighting Style placeholder with no concrete sibling (Fighter picks a feat)", () => {
    // Fighter/Ranger have no `<placeholder>-<style>` class feature — the chosen style is
    // a fighting-style FEAT — so the placeholder must remain to surface the picker slot.
    const ids = idSet(
      buildGrantedFeatures({
        classId: "fighter",
        level: 7,
        subclassId: "champion",
        raceId: "human",
      })
    );
    expect(ids.has("fighter-fighting-style")).toBe(true);
    // Champion's SECOND slot is a distinct placeholder, not a concrete variant — it stays.
    expect(ids.has("fighter-champion-additional-fighting-style")).toBe(true);
  });

  it("dedupes by srdId (e.g. same feat as both origin and background)", () => {
    const refs = buildGrantedFeatures({
      classId: "barbarian",
      level: 20,
      subclassId: "berserker",
      raceId: "orc",
      originFeat: "skilled",
      bgFeat: "skilled",
    });
    const ids = refs.map((r) => r.srdId);
    expect(ids.length).toBe(new Set(ids).size);
    expect(ids.filter((i) => i === "skilled")).toHaveLength(1);
  });
});
