/**
 * Monster save conditions — a save entry declares the conditions its "Failure:"
 * clause prints ("the target has the Poisoned condition"), so the DM's damage tray
 * can offer them. Pinned against the English print of the public SRD bestiary:
 *
 *  - every save entry declares exactly the conditions the first Failure clause
 *    names after "has the …", printed order, up to the Success clause or a later
 *    stage ("Failure by 5 or More", "Second Failure");
 *  - a sentence that only describes a condition the target already has ("While
 *    Charmed, the target has the Incapacitated condition") adds nothing;
 *  - no entry declares a condition its print does not name.
 *
 * The cases come from `src/i18n/en/srd/monsters.json`, never a hand list. Blind
 * spot: the content pack's prints (its save entries declare none yet, so the tray
 * offers no condition chip there).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { MonsterStatBlock, MonsterSaveEntry } from "@/data/types";
import { SRD_MONSTERS_A_B } from "@/data/monsters/a-b";
import { SRD_MONSTERS_C_D } from "@/data/monsters/c-d";
import { SRD_MONSTERS_E_G } from "@/data/monsters/e-g";
import { SRD_MONSTERS_H_K } from "@/data/monsters/h-k";
import { SRD_MONSTERS_L_M } from "@/data/monsters/l-m";
import { SRD_MONSTERS_N_P } from "@/data/monsters/n-p";
import { SRD_MONSTERS_Q_S } from "@/data/monsters/q-s";
import { SRD_MONSTERS_T_Z } from "@/data/monsters/t-z";

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

const EN = JSON.parse(
  readFileSync(join(process.cwd(), "src/i18n/en/srd/monsters.json"), "utf8")
) as Readonly<Record<string, { name: string; text?: string }>>;

const SECTIONS = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
] as const;

/** The conditions the English Failure clause imposes, printed order. */
function printedFailureConditions(text: string): string[] {
  const failure = text.split(/\bFailure:/)[1];
  if (failure === undefined) return [];
  const clause =
    failure.split(
      /\b(?:Success:|Failure or Success:|Failure by \d+ or More:|First Failure:|Second Failure:)/
    )[0] ?? "";
  const out: string[] = [];
  for (const sentence of clause.split(/(?<=\.)\s+/)) {
    if (/^While [A-Z]\w+,/.test(sentence.trim())) continue;
    for (const match of sentence.matchAll(
      /\bhas the ([A-Z]\w+(?:(?:, and |, | and )[A-Z]\w+)*) conditions?\b/g
    )) {
      for (const name of (match[1] ?? "").split(/, and |, | and /)) {
        const id = name.toLowerCase();
        if (!out.includes(id)) out.push(id);
      }
    }
  }
  return out;
}

const saves = SRD.flatMap((monster) =>
  SECTIONS.flatMap((section) =>
    (monster[section] ?? []).flatMap((entry) =>
      entry.kind === "save"
        ? [{ key: `${monster.id}.${section}.${entry.id}`, entry }]
        : []
    )
  )
) as ReadonlyArray<{ key: string; entry: MonsterSaveEntry }>;

describe("monster save conditions", () => {
  it("covers the SRD's save entries", () => {
    expect(saves.length).toBeGreaterThan(150);
    expect(saves.filter(({ entry }) => entry.conditions).length).toBeGreaterThan(60);
  });

  it.each(saves.map(({ key, entry }) => [key, entry] as const))(
    "%s declares the conditions its Failure clause prints",
    (key, entry) => {
      const text = EN[key]?.text ?? "";
      expect([...(entry.conditions ?? [])]).toEqual(printedFailureConditions(text));
    }
  );

  it("reads the print's shapes", () => {
    expect(
      printedFailureConditions(
        "Wisdom Saving Throw: DC 13. Failure: The target has the Charmed condition. While Charmed, the target has the Incapacitated condition. Success: The target is immune."
      )
    ).toEqual(["charmed"]);
    expect(
      printedFailureConditions(
        "Failure: 9 damage, and the target has the Frightened and Incapacitated conditions. Failure by 5 or More: it has the Unconscious condition."
      )
    ).toEqual(["frightened", "incapacitated"]);
    expect(printedFailureConditions("Failure: 59 (17d6) Fire damage.")).toEqual([]);
  });
});
