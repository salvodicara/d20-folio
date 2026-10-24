/**
 * Monster trait facts — the few prose traits that move a number at the table
 * (Magic Resistance, Pack Tactics, Regeneration, …) declare it as a typed fact,
 * pinned against the English print of the public SRD bestiary:
 *
 *  - every trait whose text matches one of the patterns below declares exactly
 *    the fact the text states, with the printed numbers and damage types;
 *  - no other trait declares a fact (a fact never outruns its print);
 *  - the activity translator carries the fact and stops reporting the entry as a
 *    prose-only `text` gap.
 *
 * The cases come from `src/i18n/en/srd/monsters.json`, never a hand list.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { MonsterStatBlock, MonsterTraitFact, MonsterTraitRoll } from "@/data/types";
import { SRD_MONSTERS_A_B } from "@/data/monsters/a-b";
import { SRD_MONSTERS_C_D } from "@/data/monsters/c-d";
import { SRD_MONSTERS_E_G } from "@/data/monsters/e-g";
import { SRD_MONSTERS_H_K } from "@/data/monsters/h-k";
import { SRD_MONSTERS_L_M } from "@/data/monsters/l-m";
import { SRD_MONSTERS_N_P } from "@/data/monsters/n-p";
import { SRD_MONSTERS_Q_S } from "@/data/monsters/q-s";
import { SRD_MONSTERS_T_Z } from "@/data/monsters/t-z";
import { translateMonsterEntry } from "@/lib/activities";
import type { DamageType } from "@/types/damage";

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

/** "attack rolls and saving throws" → ["attack", "save"], printed order. */
function rolls(phrase: string): MonsterTraitRoll[] {
  return phrase.split(/ and |, /).map((part) => {
    const p = part.trim();
    if (/^(an )?melee attack rolls?$/.test(p)) return "melee-attack";
    if (/^(an )?attack rolls?$/.test(p)) return "attack";
    if (/^saving throws$/.test(p)) return "save";
    if (/^ability checks$/.test(p)) return "check";
    if (/^D20 Tests$/.test(p)) return "d20";
    throw new Error(`unknown roll phrase "${p}"`);
  });
}

const type = (word: string): DamageType => word.toLowerCase() as DamageType;

/** The fact the English print states, or undefined when it states none. */
function printedFact(text: string): MonsterTraitFact | undefined {
  let m: RegExpMatchArray | null;
  if (
    /has Advantage on saving throws against spells and other magical effects/.test(text)
  )
    return { kind: "advantage", rolls: ["save"], when: "vs-spells" };
  if (
    (m = text.match(
      /has Advantage on (an attack roll|attack rolls) against a creature if at least one of the [\w ]+'s allies is within 5 feet of the creature/
    ))
  )
    return { kind: "advantage", rolls: rolls(m[1] ?? ""), when: "ally-near-target" };
  if ((m = text.match(/^While Bloodied, the [\w ]+ has Advantage on ([\w ]+)\.$/)))
    return { kind: "advantage", rolls: rolls(m[1] ?? ""), when: "bloodied" };
  if ((m = text.match(/has Advantage on ([\w ]+) while it is Bloodied\.$/)))
    return { kind: "advantage", rolls: rolls(m[1] ?? ""), when: "bloodied" };
  if (
    (m = text.match(
      /(?:^|\. )While in sunlight, (?:the [\w ]+|it) has Disadvantage on ([\w ]+)\.$/
    ))
  )
    return { kind: "disadvantage", rolls: rolls(m[1] ?? ""), when: "sunlight" };
  if (
    (m = text.match(/^While in Bright Light, the [\w ]+ has Disadvantage on ([\w ]+)\.$/))
  )
    return { kind: "disadvantage", rolls: rolls(m[1] ?? ""), when: "bright-light" };
  if ((m = text.match(/regains (\d+) Hit Points at the start of each of its turns/))) {
    const off = text.match(/takes (\w+) or (\w+) damage, this trait doesn't function/);
    return {
      kind: "regeneration",
      amount: Number(m[1]),
      ...(off ? { suppressedBy: [type(off[1] ?? ""), type(off[2] ?? "")] } : {}),
      ...(/if it has at least 1 Hit Point/.test(text) ? { needsHp: true as const } : {}),
    };
  }
  if (
    (m = text.match(
      /is subjected to (\w+) damage, it (takes no damage and instead )?regains a number of Hit Points equal to the \1 damage dealt/
    ))
  )
    return {
      kind: "absorb",
      damageType: type(m[1] ?? ""),
      ...(m[2] ? { instead: true as const } : {}),
    };
  if (/deals double damage to objects and structures/.test(text))
    return { kind: "siege" };
  return undefined;
}

const TRAITS = SRD.flatMap((monster) =>
  (monster.traits ?? []).map((entry) => {
    const key = `${monster.id}.traits.${entry.id}`;
    return { monster, entry, key, text: EN[key]?.text ?? "" };
  })
);

describe("monster trait facts", () => {
  const printed = TRAITS.filter(({ text }) => printedFact(text) !== undefined);

  it("finds the printed table-changing traits in the bestiary text", () => {
    // Magic Resistance 33 + Pack Tactics 18 + the rest; a shrinking corpus fails here.
    expect(printed.length).toBeGreaterThanOrEqual(70);
  });

  it("every trait whose print states a fact declares exactly that fact", () => {
    for (const { entry, key, text } of printed) {
      expect(entry.kind, key).toBe("narrative");
      expect(entry.kind === "narrative" ? entry.fact : undefined, key).toEqual(
        printedFact(text)
      );
    }
  });

  it("no other entry declares a fact", () => {
    for (const { entry, key, text } of TRAITS) {
      if (printedFact(text) !== undefined) continue;
      expect(entry.kind === "narrative" ? entry.fact : undefined, key).toBeUndefined();
    }
    for (const monster of SRD) {
      for (const section of [
        monster.actions,
        monster.bonusActions,
        monster.reactions,
        monster.legendaryActions,
      ]) {
        for (const entry of section ?? []) {
          expect(
            entry.kind === "narrative" ? entry.fact : undefined,
            `${monster.id}.${entry.id}`
          ).toBeUndefined();
        }
      }
    }
  });

  it("the Troll regenerates 15 unless it took Acid or Fire damage", () => {
    const troll = TRAITS.find(({ key }) => key === "troll.traits.regeneration");
    expect(troll?.entry).toMatchObject({
      fact: { kind: "regeneration", amount: 15, suppressedBy: ["acid", "fire"] },
    });
  });

  it("the Vampire and its spawn have Disadvantage in sunlight (after the damage sentence)", () => {
    for (const key of ["vampire.traits.sunlight", "vampire-spawn.traits.sunlight"])
      expect(TRAITS.find((trait) => trait.key === key)?.entry, key).toMatchObject({
        fact: { kind: "disadvantage", rolls: ["attack", "check"], when: "sunlight" },
      });
  });

  it("the activity translator carries the fact instead of a prose gap", () => {
    for (const { monster, entry, key, text } of printed) {
      const { activity, gaps } = translateMonsterEntry(monster.id, "traits", entry);
      expect(gaps, key).toEqual([]);
      expect(activity.fact, key).toEqual(printedFact(text));
    }
    const prose = TRAITS.find(({ key }) => key === "aboleth.traits.probing-telepathy");
    expect(prose).toBeDefined();
    if (!prose) return;
    expect(
      translateMonsterEntry("aboleth", "traits", prose.entry).gaps.map((g) => g.field)
    ).toEqual(["text"]);
  });
});
