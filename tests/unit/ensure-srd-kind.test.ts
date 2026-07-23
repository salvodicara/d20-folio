/**
 * The lazy SRD-kind tier — `ensureSrdKind` + the registry surface
 * (docs/ARCHITECTURE.md → "The lazy SRD-kind tier").
 *
 * A lazy kind (`monster`) carries no engine facts, so it is NOT bundled with EN:
 * `ensureSrdKind` loads it per-locale on demand and marks it resident so a
 * later-loaded locale carries it. These tests pin the three guarantees §H commit 1
 * names: loads for every registered locale, resident-reload on `ensureLocale`, and
 * that an un-ensured lazy key hits the throwing missing path (lock 1).
 *
 * `src/test/setup.fast.ts` has already loaded EN + IT, so both locales are
 * registered here; the `monster` kind is NOT resident until ensured.
 */
import { describe, it, expect, vi } from "vitest";
import { ensureSrdKind } from "@/i18n";
import { hasSrdKind, residentLazySrdKinds } from "@/i18n/srd-en";
import { localizeSrd } from "@/i18n/resolver";

describe("ensureSrdKind — the lazy SRD-kind tier", () => {
  it("a lazy kind is not resident and not loaded before it is ensured", () => {
    expect(residentLazySrdKinds()).not.toContain("monster");
    expect(hasSrdKind("en", "monster")).toBe(false);
    expect(hasSrdKind("it", "monster")).toBe(false);
  });

  it("an eager kind is always present for a registered locale", () => {
    expect(hasSrdKind("en", "spell")).toBe(true);
    expect(hasSrdKind("it", "beasts")).toBe(true);
  });

  it("resolving a lazy-kind key before ensure hits the throwing missing path (lock 1)", () => {
    expect(() => localizeSrd("monster", "any-id", "name", "en")).toThrow(
      /missing SRD string/
    );
  });

  it("loads the kind for EVERY registered locale and marks it resident", async () => {
    await ensureSrdKind("monster");
    expect(residentLazySrdKinds()).toContain("monster");
    expect(hasSrdKind("en", "monster")).toBe(true);
    expect(hasSrdKind("it", "monster")).toBe(true);
  });

  it("is idempotent — a second ensure is a harmless no-op", async () => {
    await ensureSrdKind("monster");
    await ensureSrdKind("monster");
    expect(hasSrdKind("en", "monster")).toBe(true);
    expect(hasSrdKind("it", "monster")).toBe(true);
  });
});

describe("ensureLocale carries a resident lazy kind into a later-loaded locale (B.4)", () => {
  it("a fresh locale loaded after the kind is resident resolves it immediately", async () => {
    // The other tests run with both locales already loaded; the resident-reload
    // path only fires on a locale's FIRST load. Reset the i18n singleton and
    // bootstrap only the detected locale, then load the second locale by hand.
    vi.resetModules();
    const i18nMod = await import("@/i18n");
    const srdMod = await import("@/i18n/srd-en");
    await i18nMod.i18nReady; // loads only the detected locale (EN in the test env)

    const loadedNow = srdMod.loadedSrdLocales();
    const fresh = (["en", "it"] as const).find((l) => !loadedNow.includes(l));
    expect(fresh, "a fresh bootstrap should leave one locale unloaded").toBeDefined();
    if (!fresh) return;

    await i18nMod.ensureSrdKind("monster"); // resident; loaded for the detected locale
    expect(srdMod.hasSrdKind(fresh, "monster")).toBe(false); // fresh locale not loaded yet

    await i18nMod.ensureLocale(fresh); // first load → the resident-reload attaches monster
    expect(srdMod.hasSrdKind(fresh, "monster")).toBe(true);
  });
});
