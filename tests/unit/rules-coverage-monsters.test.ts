/**
 * The "Monster stat blocks" row of docs/RULES_COVERAGE.md is counted, not
 * estimated, over the public SRD bestiary. Rule: 1-tap = the entry opens the DM's
 * damage tray from the encounter card (`monsterActions`: printed attacks and
 * saves, prose that deals damage with no roll, moves that use one of them) or is
 * Regeneration's one-tap heal; reference = everything else (Multiattack,
 * Spellcasting, prose, the facts the card only shows). Auto and impossible are 0.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { MonsterStatBlock } from "@/data/types";
import { SRD_MONSTERS_A_B } from "@/data/monsters/a-b";
import { SRD_MONSTERS_C_D } from "@/data/monsters/c-d";
import { SRD_MONSTERS_E_G } from "@/data/monsters/e-g";
import { SRD_MONSTERS_H_K } from "@/data/monsters/h-k";
import { SRD_MONSTERS_L_M } from "@/data/monsters/l-m";
import { SRD_MONSTERS_N_P } from "@/data/monsters/n-p";
import { SRD_MONSTERS_Q_S } from "@/data/monsters/q-s";
import { SRD_MONSTERS_T_Z } from "@/data/monsters/t-z";
import { MONSTER_ACTION_SECTIONS, monsterActions } from "@/lib/play/monster-action";

const SRD: ReadonlyArray<MonsterStatBlock> = [
  ...SRD_MONSTERS_A_B,
  ...SRD_MONSTERS_C_D,
  ...SRD_MONSTERS_E_G,
  ...SRD_MONSTERS_H_K,
  ...SRD_MONSTERS_L_M,
  ...SRD_MONSTERS_N_P,
  ...SRD_MONSTERS_Q_S,
  ...SRD_MONSTERS_T_Z,
];

describe("RULES_COVERAGE monster row", () => {
  it("states the counted 1-tap / reference split of the public bestiary", () => {
    let entries = 0;
    let tap = 0;
    for (const block of SRD) {
      const actions = new Set(
        monsterActions(block).map(({ section, entryId }) => `${section}:${entryId}`)
      );
      for (const section of MONSTER_ACTION_SECTIONS)
        for (const entry of block[section] ?? []) {
          entries += 1;
          const regeneration =
            entry.kind === "narrative" && entry.fact?.kind === "regeneration";
          if (actions.has(`${section}:${entry.id}`) || regeneration) tap += 1;
        }
    }
    const row = `Monster stat blocks (${SRD.length}, ${entries} entries)`;
    const line = readFileSync("docs/RULES_COVERAGE.md", "utf8")
      .split("\n")
      .find((l) => l.includes(row));
    expect(line, row).toBeDefined();
    expect(line).toMatch(new RegExp(`\\| 0 / ${tap} / ${entries - tap} / 0 +\\|`));
  });
});
