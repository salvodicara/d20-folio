import { describe, expect, it } from "vitest";
import {
  creationSources,
  type CreationSourceKind,
} from "@/lib/character-creation/catalogue-source";
import { classTables } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { SRD_FEATS } from "@/data/feats";
import { spells } from "@/data/spells";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_INVOCATIONS } from "@/data/invocations";

const catalogues = {
  class: classTables,
  species: SRD_RACES,
  background: SRD_BACKGROUNDS,
  feat: SRD_FEATS,
  spell: spells,
  equipment: SRD_EQUIPMENT,
  invocation: SRD_INVOCATIONS,
} satisfies Record<CreationSourceKind, readonly { id: string }[]>;
describe("creation catalogue source inventory", () => {
  it("exposes the full source catalogue rather than the mock's sample options", () => {
    for (const [kind, values] of Object.entries(catalogues)) {
      const sourceKind = kind as CreationSourceKind;
      const entries = creationSources(sourceKind);
      expect(entries.map((entry) => entry.key).sort()).toEqual(
        values.map((value) => `${kind}:${value.id}`).sort()
      );
      expect(Object.fromEntries(entries.map((entry) => [entry.id, entry.value]))).toEqual(
        Object.fromEntries(values.map((value) => [value.id, value]))
      );
      expect(entries.every((entry) => entry.kind === kind)).toBe(true);
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
