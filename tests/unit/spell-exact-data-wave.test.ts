import { describe, expect, it } from "vitest";
import type { SrdSpellData } from "@/data/types";
import { SRD_SPELLS_LEVEL1 } from "@/data/spells/level1";
import { SRD_SPELLS_LEVEL2 } from "@/data/spells/level2";
import { SRD_SPELLS_LEVEL3 } from "@/data/spells/level3";

const SPELLS = [...SRD_SPELLS_LEVEL1, ...SRD_SPELLS_LEVEL2, ...SRD_SPELLS_LEVEL3];

function spell(id: string): SrdSpellData {
  const row = SPELLS.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`Missing spell ${id}`);
  return row;
}

describe("exact SRD spell mechanics", () => {
  it.each([
    [
      "feather-fall",
      { targeting: { affinity: "any", maxTargets: 5 } },
      ["reactionTrigger", "damageType", "damageTypes", "attackType"],
    ],
    [
      "hold-person",
      {
        saveAbility: "WIS",
        targeting: { affinity: "enemy", maxTargets: 1, maxTargetsPerUpcast: 1 },
      },
      ["damageType", "damageTypes", "attackType"],
    ],
    [
      "slow",
      {
        concentration: true,
        saveAbility: "WIS",
        targeting: { affinity: "enemy", maxTargets: 6 },
      },
      ["conditionApplication", "damageType", "damageTypes", "attackType"],
    ],
  ] as const)(
    "%s carries only its exact authored combat facts",
    (id, expected, absent) => {
      const row = spell(id);
      expect(row).toMatchObject(expected);
      for (const field of absent) expect(row[field], `${id}.${field}`).toBeUndefined();
    }
  );
});
