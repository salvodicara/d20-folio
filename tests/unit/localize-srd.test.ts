/**
 * `localizeSrd` resolver — R3 LOCK 1 (docs/ARCHITECTURE.md).
 *
 * The pure, throwing SRD string resolver: a present `(kind, key, field)` returns
 * the localized string; a MISSING one THROWS in dev/test (a missing SRD string is
 * a bug CI must catch). Custom content bypasses the resolver verbatim.
 *
 * Pure / fast-lane: imports only the static catalogues + the resolver.
 */
import { describe, it, expect } from "vitest";
import { localizeSrd, localizeSrdList, hasSrd, localizeCustom } from "@/i18n/resolver";
import { srdEn } from "@/i18n/srd-en";
import { srdSlug, srdArraySegment, srdKey } from "@/i18n/srd-key";

describe("localizeSrd (R3 LOCK 1)", () => {
  it("resolves a known SRD string in EN and IT", () => {
    expect(localizeSrd("spell", "fireball", "name", "en")).toMatch(/fireball/i);
    expect(localizeSrd("spell", "fireball", "name", "it")).toBeTruthy();
    // EN and IT differ for a translated spell name.
    expect(localizeSrd("spell", "fireball", "name", "it")).not.toBe(
      localizeSrd("spell", "fireball", "name", "en")
    );
  });

  it("resolves nested keys (a spell's material component)", () => {
    // `components.material` was lifted under the composite key "<id>.components".
    expect(localizeSrd("spell", "fireball.components", "material", "en")).toBeTruthy();
  });

  it("resolves across kinds (class-feature, condition, magic-item)", () => {
    expect(
      localizeSrd("class-feature", "bard-bardic-inspiration", "name", "en")
    ).toBeTruthy();
    expect(localizeSrd("condition", "blinded", "name", "it")).toBeTruthy();
  });

  it("THROWS on a missing kind/key/field (the lock)", () => {
    expect(() => localizeSrd("spell", "not-a-spell", "name", "en")).toThrow(
      /missing SRD string/
    );
    expect(() => localizeSrd("spell", "fireball", "not-a-field", "en")).toThrow(
      /missing SRD string/
    );
  });

  it("localizeSrdList returns condition effects as an array", () => {
    const effects = localizeSrdList("condition", "blinded", "effects", "en");
    expect(Array.isArray(effects)).toBe(true);
    expect(effects.length).toBeGreaterThan(0);
  });

  it("hasSrd reports presence without throwing", () => {
    expect(hasSrd("spell", "fireball", "higherLevels", "en")).toBe(true);
    expect(hasSrd("spell", "fireball", "nope", "en")).toBe(false);
    expect(hasSrd("spell", "nope", "name", "en")).toBe(false);
  });

  it("localizeCustom passes user text through verbatim (bypass path)", () => {
    expect(localizeCustom("My Homebrew Spell")).toBe("My Homebrew Spell");
  });
});

describe("srdEn — the canonical English-fact accessor (R3 STAGE 2)", () => {
  it("returns the canonical English value the engine parses facts from", () => {
    // A canonical English spell description (damage dice are now a STRUCTURED
    // `damageDice` fact — S12 — but the prose still carries the full rules text).
    expect(srdEn("spell", "fireball", "description")).toMatch(/\d+d6/);
    // Durations the engine branches on (≠ "Instantaneous").
    expect(srdEn("spell", "acid-splash", "duration")).toBe("Instantaneous");
  });

  it("is locale-INDEPENDENT — always English, never the active locale", () => {
    // Equal to the EN resolver value, and (for a translated entity) ≠ the IT one.
    expect(srdEn("spell", "fireball", "name")).toBe(
      localizeSrd("spell", "fireball", "name", "en")
    );
    expect(srdEn("spell", "fireball", "name")).not.toBe(
      localizeSrd("spell", "fireball", "name", "it")
    );
  });

  it("returns undefined on a miss (a fact lookup, not a display lookup — no throw)", () => {
    expect(srdEn("spell", "not-a-spell", "name")).toBeUndefined();
    expect(srdEn("spell", "fireball", "not-a-field")).toBeUndefined();
  });

  it("joins list leaves (condition effects) with newlines", () => {
    const effects = srdEn("condition", "blinded", "effects");
    expect(effects).toBeTruthy();
    expect(effects).toContain("\n");
  });
});

describe("srd-key — runtime reproduction of the codemod's stable key paths (R6 Wave 1)", () => {
  it("srdSlug mirrors the codemod slug (lowercase, strip apostrophes, non-alnum → '-')", () => {
    expect(srdSlug("Adrenaline Rush")).toBe("adrenaline-rush");
    expect(srdSlug("Hunter's Mark")).toBe("hunters-mark");
    expect(srdSlug("Celestial Resistance")).toBe("celestial-resistance");
  });

  it("srdArraySegment keys by id, then name-slug, then index — exactly like the codemod", () => {
    expect(srdArraySegment("actions", { id: "dash" }, 0)).toBe("actions.dash");
    expect(srdArraySegment("traits", { nameEn: "Adrenaline Rush" }, 1)).toBe(
      "traits.adrenaline-rush"
    );
    expect(srdArraySegment("actions", {}, 2)).toBe("actions.2");
  });

  it("srdKey composes a dotted catalogue key", () => {
    expect(srdKey("orc", "traits.adrenaline-rush")).toBe("orc.traits.adrenaline-rush");
    expect(
      srdKey("artificer-alchemist-experimental-elixir", "mechanics", "actions.0")
    ).toBe("artificer-alchemist-experimental-elixir.mechanics.actions.0");
  });

  it("the composed action key resolves the canonical English FACT via srdEn", () => {
    // The smart-tracker threads the composite key `<featureId>.mechanics.actions.<i>`
    // (field `description`) to srdEn for the reaction-trigger/heal-dice parse —
    // prove the key the engine builds resolves.
    const key = srdKey("barbarian-rage", "mechanics", "actions.0");
    expect(key).toBe("barbarian-rage.mechanics.actions.0");
    expect(srdEn("class-feature", key, "description")).toBeTruthy();
  });
});
