/**
 * `heroic-inspiration-on-rest` primitive — Human's Resourceful trait grants
 * Heroic Inspiration whenever the character finishes a Long Rest.
 *
 * Verified against the offline wiki scrape (species/human.json → bodyText):
 *   "Resourceful. You gain Heroic Inspiration whenever you finish a Long Rest."
 *
 * Covers the three seam stages end-to-end:
 *   1. evaluator — the kind aggregates into `heroicInspirationOnLongRest` (OR).
 *   2. data — the Human Resourceful trait carries the grant + bilingual copy.
 *   3. consumer — `gainsHeroicInspirationOnLongRest` resolves the aggregate for
 *      a real CharacterDoc, and is override-first (decides the default only;
 *      never reads or mutates the live `session.inspiration` state).
 */
import { describe, expect, it } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { raceFeatureIndex, raceTraitCatKey } from "@/data/races";
import { gainsHeroicInspirationOnLongRest } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";
import { srd } from "../_harness/loc";

describe("heroic-inspiration-on-rest — evaluator (OR)", () => {
  it("defaults to false with no grant", () => {
    expect(evaluateGrants([]).heroicInspirationOnLongRest).toBe(false);
  });

  it("flips true when any source carries the grant", () => {
    const sources: GrantSource[] = [
      {
        id: "a",
        name: { en: "A", it: "A" },
        grants: [{ type: "heroic-inspiration-on-rest" }],
      },
    ];
    expect(evaluateGrants(sources).heroicInspirationOnLongRest).toBe(true);
  });

  it("merges OR — multiple granting sources still resolve to a single true", () => {
    const sources: GrantSource[] = [
      {
        id: "a",
        name: { en: "A", it: "A" },
        grants: [{ type: "heroic-inspiration-on-rest" }],
      },
      {
        id: "b",
        name: { en: "B", it: "B" },
        grants: [{ type: "heroic-inspiration-on-rest" }],
      },
    ];
    expect(evaluateGrants(sources).heroicInspirationOnLongRest).toBe(true);
  });

  it("is INDEPENDENT of the combat-turn variant (different aggregates)", () => {
    const turnStart: GrantSource[] = [
      {
        id: "champion",
        name: { en: "Heroic Warrior", it: "Guerriero Eroico" },
        grants: [{ type: "heroic-inspiration-at-turn-start" }],
      },
    ];
    const out = evaluateGrants(turnStart);
    expect(out.heroicInspirationAtTurnStart).toBe(true);
    // The turn-start trigger must NOT bleed into the rest trigger.
    expect(out.heroicInspirationOnLongRest).toBe(false);
  });
});

describe("heroic-inspiration-on-rest — Human Resourceful data", () => {
  it("Resourceful is a Human trait with bilingual copy (EN + IT)", () => {
    const trait = raceFeatureIndex.get("human-resourceful");
    expect(trait).toBeDefined();
    expect(trait?.raceId).toBe("human");
    const key = trait ? raceTraitCatKey(trait) : "";
    expect(srd("race", key, "name", "en")).toBe("Resourceful");
    expect(srd("race", key, "name", "it")).toBe("Pieno di Risorse");
    expect(srd("race", key, "description", "en")).toMatch(
      /Heroic Inspiration .* Long Rest/
    );
    expect(srd("race", key, "description", "it")).toMatch(/Ispirazione Eroica/);
  });

  it("Resourceful carries the heroic-inspiration-on-rest grant", () => {
    const g = raceFeatureIndex.get("human-resourceful")?.grants ?? [];
    expect(g).toContainEqual({ type: "heroic-inspiration-on-rest" });
  });

  it("the Resourceful trait flips the aggregate through the pipeline", () => {
    const trait = raceFeatureIndex.get("human-resourceful");
    if (!trait) throw new Error("human-resourceful trait missing");
    const sources: GrantSource[] = [{ id: trait.id, grants: trait.grants }];
    expect(evaluateGrants(sources).heroicInspirationOnLongRest).toBe(true);
  });
});

describe("gainsHeroicInspirationOnLongRest — consumer", () => {
  it("returns true for a Human carrying the Resourceful race trait", () => {
    const doc = makeCharacterDoc({
      features: [{ srdId: "human-resourceful" }],
    });
    expect(gainsHeroicInspirationOnLongRest(doc)).toBe(true);
  });

  // S4 ROOT-CAUSE — Resourceful is a RACE trait, NOT a feature ref. A real Human
  // stores it via the race (empty/feature-list-without-it), so the consumer must
  // resolve the FULL grant sources (race included). BEFORE the S4 fix the consumer
  // read `resolveGrantSourcesForFeatures` only, so a real Human (`race: "human"`,
  // no trait in `features[]`) returned FALSE — the auto-grant never fired.
  it("returns true for a real Human by RACE even with no trait in features[]", () => {
    const doc = makeCharacterDoc({ race: asRaceId("human"), features: [] });
    expect(gainsHeroicInspirationOnLongRest(doc)).toBe(true);
  });

  it("returns false for a NON-Human character without any granting source", () => {
    const doc = makeCharacterDoc({ race: asRaceId("elf"), features: [] });
    expect(gainsHeroicInspirationOnLongRest(doc)).toBe(false);
  });

  it("is unaffected by the current inspiration state — it decides the DEFAULT, not the live value", () => {
    // Override-first: the consumer reports whether a Long Rest SHOULD grant
    // Inspiration. It must not read the existing `session.inspiration` toggle,
    // so the result is identical whether the player currently holds it or not.
    const granted = makeCharacterDoc(
      { race: asRaceId("human"), features: [{ srdId: "human-resourceful" }] },
      { inspiration: true }
    );
    const notGranted = makeCharacterDoc(
      { race: asRaceId("human"), features: [{ srdId: "human-resourceful" }] },
      { inspiration: false }
    );
    expect(gainsHeroicInspirationOnLongRest(granted)).toBe(true);
    expect(gainsHeroicInspirationOnLongRest(notGranted)).toBe(true);
    // A non-Human who has manually toggled Inspiration on still reports false —
    // the override (their manual toggle) is theirs to keep; the auto-grant
    // default does not retroactively claim it.
    const manualNonHuman = makeCharacterDoc(
      { race: asRaceId("elf"), features: [] },
      { inspiration: true }
    );
    expect(gainsHeroicInspirationOnLongRest(manualNonHuman)).toBe(false);
  });

  it("does not mutate the passed CharacterDoc (pure consumer)", () => {
    const doc = makeCharacterDoc(
      { race: asRaceId("human"), features: [{ srdId: "human-resourceful" }] },
      { inspiration: false }
    );
    gainsHeroicInspirationOnLongRest(doc);
    expect(doc.session.inspiration).toBe(false);
  });
});
