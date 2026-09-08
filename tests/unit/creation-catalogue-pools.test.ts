import { expect, it } from "vitest";
import { resolveCreationPool } from "@/lib/character-creation/catalogue-pools";
import {
  creationPool,
  CREATION_CATALOGUE,
  CREATION_RELEASE,
  CREATION_ADAPTER_VERSION,
} from "@/lib/character-creation/catalogue-policy";
import type { OriginBenefit } from "@/lib/homebrew/origins";
const fact = (benefit: OriginBenefit, source = "class:monk") => ({
  selectionId: "root",
  path: "root/choice",
  source: {
    kind: "catalogue" as const,
    catalogue: CREATION_CATALOGUE,
    release: CREATION_RELEASE,
    adapterVersion: CREATION_ADAPTER_VERSION,
    id: source,
  },
  benefit,
});

it("offers the full ritual catalogue and only level-one invocations", () => {
  const rituals = resolveCreationPool(
    creationPool({ kind: "spell", minimumLevel: 1, maximumLevel: 9, ritualOnly: true }),
    []
  );
  expect(rituals.length).toBeGreaterThan(10);
  expect(rituals.every((o) => o.snapshot?.definition.family === "spell")).toBe(true);
  const invocations = resolveCreationPool(
    creationPool({ kind: "invocation", maximumClassLevel: 1 }),
    []
  );
  expect(invocations).toHaveLength(5);
  expect(invocations.every((o) => o.snapshot?.definition.family === "feature")).toBe(
    true
  );
});
it("prepares only spells actually acquired in the spellbook", () => {
  const pool = creationPool({
    kind: "spell",
    classSpellLists: ["wizard"],
    minimumLevel: 1,
    maximumLevel: 1,
    acquiredPolicy: "spellbook",
  });
  expect(resolveCreationPool(pool, [])).toEqual([]);
  expect(
    resolveCreationPool(pool, [
      fact(
        {
          kind: "spell",
          id: "magic-missile",
          ability: "intelligence",
          policy: "spellbook",
        },
        "class:wizard"
      ),
    ]).map((o) => o.option.id)
  ).toEqual(["magic-missile"]);
});
it("keeps starting tools tied to their source instead of borrowing background proficiency", () => {
  const facts = [
    fact({ kind: "proficiency", category: "tool", id: "flute" }),
    fact(
      { kind: "proficiency", category: "tool", id: "thieves-tools" },
      "background:criminal"
    ),
  ];
  const pool = creationPool({
    kind: "equipment",
    categories: ["tool"],
    proficientOnly: true,
    proficiencySource: "class:monk",
  });
  expect(resolveCreationPool(pool, facts).map((o) => o.option.id)).toEqual(["flute"]);
});
it("offers expertise on acquired skills and respects restricted martial mastery", () => {
  const facts = [
    fact({ kind: "proficiency", category: "skill", id: "stealth" }),
    fact({
      kind: "training",
      category: "weapon",
      id: "martial-weapons-finesse-or-light",
    }),
  ];
  expect(
    resolveCreationPool(
      creationPool({ kind: "proficiency", categories: ["skill"], proficientOnly: true }),
      facts
    ).map((o) => o.option.id)
  ).toEqual(["stealth"]);
  const weapons = resolveCreationPool(
    creationPool({
      kind: "mastery",
      proficientOnly: true,
      properties: ["finesse", "light"],
    }),
    facts
  ).map((o) => o.option.id);
  expect(weapons).toContain("rapier");
  expect(weapons).not.toContain("greatsword");
});
