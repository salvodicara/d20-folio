/**
 * Every public SRD stat-block entry declares exactly what its English print says
 * the DM can apply in one tap (src/lib/activities/monster-print.ts):
 *
 *  - an attack declares the conditions its Hit clause gives, the gate and the
 *    save they ride;
 *  - a prose entry declares the damage it deals to other creatures with no roll,
 *    the one attack or save of the block it uses, how it moves the monster and
 *    what the monster breathes;
 *  - a Multiattack declares its routine over the block's own entries;
 *  - an attack declares the amount its Hit clause swaps in while the monster itself
 *    is Bloodied (a swarm's "or 2 (1d4) Piercing damage if the swarm is Bloodied");
 *  - an attack's Hit clause and a save's Failure clause declare the generic riders
 *    they print: a push or pull, a Speed reduction, a Hit Point maximum drain by
 *    the damage taken, a swallow;
 *  - no entry declares one its print does not state.
 *
 * The cases come from `src/i18n/en/srd/monsters.json`, never a hand list. Blind
 * spot: the content pack's prints (guarded in the pack's own tests).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { EffectRiders, MonsterEntry, MonsterStatBlock } from "@/data/types";
import { SRD_MONSTERS_A_B } from "@/data/monsters/a-b";
import { SRD_MONSTERS_C_D } from "@/data/monsters/c-d";
import { SRD_MONSTERS_E_G } from "@/data/monsters/e-g";
import { SRD_MONSTERS_H_K } from "@/data/monsters/h-k";
import { SRD_MONSTERS_L_M } from "@/data/monsters/l-m";
import { SRD_MONSTERS_N_P } from "@/data/monsters/n-p";
import { SRD_MONSTERS_Q_S } from "@/data/monsters/q-s";
import { SRD_MONSTERS_T_Z } from "@/data/monsters/t-z";
import {
  printedAttack,
  printedAutomaticDamage,
  printedBreathing,
  printedHitConditions,
  printedMovement,
  printedMultiattack,
  printedPerformedEntry,
  printedRiders,
  type PrintedEntryName,
} from "@/lib/activities/monster-print";

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

/** The generic riders a clause prints, every key present (absent = undefined). */
function riders(clause: string) {
  const read = printedRiders(clause);
  return {
    forcedMovement: read.forcedMovement,
    speedReduction: read.speedReduction,
    hpMaxReduction: read.hpMaxReduction,
    swallows: read.swallows,
  };
}

/** The one-tap facts the print states for this entry, in the data's shape. */
function printed(entry: MonsterEntry, text: string, names: PrintedEntryName[]) {
  if (entry.kind === "attack") {
    const hit = printedHitConditions(text);
    return {
      conditions: hit?.conditions,
      conditionsIf: hit?.gated,
      conditionSave: hit?.save,
      bloodiedDamage: printedAttack(text)?.bloodiedDamage,
      ...riders(text.match(/\bHit: (.*)$/s)?.[1] ?? ""),
    };
  }
  if (entry.kind === "save") return riders(text.match(/\bFailure: (.*)$/s)?.[1] ?? "");
  if (entry.kind === "narrative") {
    const multiattack = names.find((n) => n.entryId === entry.id)?.name ?? "";
    if (/^Multiattack\b/.test(multiattack))
      return {
        damage: undefined,
        performs: undefined,
        multiattack: printedMultiattack(text, names),
        movement: undefined,
        breathes: undefined,
      };
    const damage = printedAutomaticDamage(text);
    return {
      damage: damage.length > 0 ? damage : undefined,
      performs: printedPerformedEntry(text, names),
      multiattack: undefined,
      movement: printedMovement(text),
      breathes: printedBreathing(text),
    };
  }
  return {};
}

function declared(entry: MonsterEntry) {
  const declaredRiders = (riding: EffectRiders) => ({
    forcedMovement: riding.forcedMovement,
    speedReduction: riding.speedReduction,
    hpMaxReduction: riding.hpMaxReduction,
    swallows: riding.swallows,
  });
  if (entry.kind === "attack")
    return {
      conditions: entry.conditions,
      conditionsIf: entry.conditionsIf,
      conditionSave: entry.conditionSave,
      bloodiedDamage: entry.bloodiedDamage,
      ...declaredRiders(entry),
    };
  if (entry.kind === "save") return declaredRiders(entry);
  if (entry.kind === "narrative")
    return {
      damage: entry.damage,
      performs: entry.performs,
      multiattack: entry.multiattack,
      movement: entry.movement,
      breathes: entry.breathes,
    };
  return {};
}

const cases = SRD.flatMap((monster) => {
  const names: PrintedEntryName[] = SECTIONS.flatMap((section) =>
    (monster[section] ?? []).map((entry) => ({
      section,
      entryId: entry.id,
      name: EN[`${monster.id}.${section}.${entry.id}`]?.name ?? "",
      kind: entry.kind,
    }))
  );
  return SECTIONS.flatMap((section) =>
    (monster[section] ?? []).map((entry) => {
      const key = `${monster.id}.${section}.${entry.id}`;
      return { key, entry, text: EN[key]?.text ?? "", names };
    })
  );
});

describe("monster print corpus", () => {
  it("covers the SRD bestiary and finds each pattern", () => {
    expect(cases.length).toBe(1326);
    const attacks = cases.filter(
      ({ entry }) => entry.kind === "attack" && entry.conditions
    );
    expect(attacks.length).toBeGreaterThan(80);
    expect(
      cases.filter(({ entry }) => entry.kind === "narrative" && entry.damage).length
    ).toBeGreaterThan(8);
    expect(
      cases.filter(({ entry }) => entry.kind === "narrative" && entry.performs).length
    ).toBeGreaterThan(25);
    const prose = cases.filter(({ entry }) => entry.kind === "narrative");
    // 176 of 178 Multiattacks (Hydra's heads and Clay Golem's Hasten stay text).
    expect(
      prose.filter(({ entry }) => entry.kind === "narrative" && entry.multiattack).length
    ).toBe(176);
    expect(
      prose.filter(({ entry }) => entry.kind === "narrative" && entry.movement).length
    ).toBe(80);
    expect(
      prose.filter(({ entry }) => entry.kind === "narrative" && entry.breathes).length
    ).toBe(40);
    // The generic riders an attack's Hit or a save's Failure prints.
    const riding = cases.flatMap(({ entry }) =>
      entry.kind === "attack" || entry.kind === "save" ? [entry] : []
    );
    expect(riding.filter((entry) => entry.forcedMovement).length).toBe(8);
    expect(riding.filter((entry) => entry.speedReduction).length).toBe(4);
    // Life Drain-style: by the damage taken (the dice drains over days stay text).
    expect(riding.filter((entry) => entry.hpMaxReduction).length).toBe(7);
    // Behir, Purple Worm, Remorhaz, Tarrasque (the Kraken's is Restrained only).
    expect(riding.filter((entry) => entry.swallows).length).toBe(4);
    // Every SRD swarm's attack prints its smaller amount while the swarm is Bloodied.
    expect(
      riding.filter((entry) => entry.kind === "attack" && entry.bloodiedDamage).length
    ).toBe(7);
  });

  it.each(cases.map(({ key, entry, text, names }) => [key, entry, text, names] as const))(
    "%s declares what its print states",
    (_key, entry, text, names) => {
      expect(declared(entry)).toEqual(printed(entry, text, names));
    }
  );
});
