import { describe, expect, it } from "vitest";
import { creationSources } from "@/lib/character-creation/catalogue-source";
describe("creation catalogue source inventory", () => {
  it("exposes the full source catalogue rather than the mock's sample options", () => {
    expect(creationSources("class").length).toBeGreaterThanOrEqual(12);
    expect(creationSources("species").length).toBeGreaterThanOrEqual(9);
    expect(creationSources("spell").length).toBeGreaterThan(100);
    expect(creationSources("feat").length).toBeGreaterThan(20);
    expect(creationSources("invocation").length).toBeGreaterThan(20);
    for (const kind of [
      "class",
      "species",
      "background",
      "feat",
      "spell",
      "equipment",
      "invocation",
    ] as const) {
      const entries = creationSources(kind);
      expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
      expect(entries.every((entry) => entry.name.trim().length > 0)).toBe(true);
    }
  });
  it("retains typed first-level class declarations and canonical spell identity", () => {
    const wizard = creationSources("class").find((entry) => entry.id === "wizard");
    expect(wizard?.kind).toBe("class");
    if (wizard?.kind !== "class") throw new Error("Wizard missing");
    expect(wizard.value.hitDie).toBe(6);
    expect(wizard.features.length).toBeGreaterThan(0);
    expect(
      wizard.features.every((feature) => feature.level === 1 && !feature.subclass)
    ).toBe(true);
    expect(wizard.key).toBe("class:wizard");
    const spell = creationSources("spell").find((entry) => entry.id === "magic-missile");
    expect(spell?.value).toMatchObject({ id: "magic-missile", level: 1 });
  });
});
