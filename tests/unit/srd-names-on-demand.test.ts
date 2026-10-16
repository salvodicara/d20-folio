/**
 * The name index's on-demand path: only EN and the loaded locale's names ride
 * startup, so a label saved in another language ("Elfo" read in an English
 * session) resolves after the read seam's gate fetches the other locales' names.
 *
 * The test setup loads Italian for every suite, so each case re-imports the
 * modules fresh (`vi.resetModules`): a registry with English only, the state of
 * an English session before anything Italian has loaded.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

async function freshEnglishSession() {
  vi.resetModules();
  const names = await import("@/data/srd-names");
  const index = await import("@/i18n/srd-name-index");
  return { names, index };
}

describe("srd-names: names of a locale that isn't loaded arrive on demand", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts with English only, then resolves an Italian label once the gate fetches it", async () => {
    const { names, index } = await freshEnglishSession();
    expect(index.nameLocales()).toEqual(["en"]);

    await names.ensureNamesFor(["Elfo", "Viandante"]);

    expect(index.nameLocales()).toEqual(["en", "it"]);
    expect(names.raceIdByName("Elfo")).toBe("elf");
    expect(names.backgroundIdByName("Sapiente")).toBe("sage");
    expect(names.resolveClassId("Mago")).toBe("wizard");
    expect(names.subclassIdByName("Invocatore")).toBe("evoker");
  });

  it("a sync miss keeps the label (lower-cased, still matchable) and starts the fetch", async () => {
    const { names, index } = await freshEnglishSession();
    expect(names.raceIdByName("Elfo")).toBe("elfo");
    await index.loadNameLocales();
    expect(names.raceIdByName("Elfo")).toBe("elf");
    expect(names.raceIdByName("elfo")).toBe("elf");
  });

  it("an id or an English name needs no fetch", async () => {
    const { names, index } = await freshEnglishSession();
    await names.ensureNamesFor(["elf", "Wizard", ""]);
    expect(index.nameLocales()).toEqual(["en"]);
  });

  it("the codec gate resolves a stored Italian race before the sync parse", async () => {
    const { index } = await freshEnglishSession();
    const codec = await import("@/lib/character-codec");
    await codec.ensureBuildNames({ race: "Elfo", background: "Accolito" });
    expect(index.nameLocales()).toContain("it");
    const names = await import("@/data/srd-names");
    expect(names.raceIdByName("Elfo")).toBe("elf");
    expect(names.backgroundIdByName("Accolito")).toBe("acolyte");
  });
});
