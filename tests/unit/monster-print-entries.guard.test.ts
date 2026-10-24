/**
 * The stat-block print readers, read whole: a monster written as TEXT becomes the
 * same structured entries the SRD bestiary declares. For every public SRD entry,
 * `printedEntries` over its English name and text yields exactly the declared
 * entry — kind, to-hit, reach and range, damage, save and DC, spell lists, hit
 * conditions, Multiattack, moves, breathing, trait facts — so a homebrew monster's
 * print reads the way the catalogue's does. The few entries where the catalogue
 * and its print part ways are listed below with why; the list is exact, so an
 * entry that starts to agree (or a new one that disagrees) fails here.
 *
 * Recharge and most N/Day limits are not part of the catalogue's English name or
 * text (the bestiary keeps them as data), so the header limit is compared only
 * where the text prints it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";

import type { MonsterEntry, MonsterStatBlock } from "@/data/types";
import { SRD_MONSTERS_A_B } from "@/data/monsters/a-b";
import { SRD_MONSTERS_C_D } from "@/data/monsters/c-d";
import { SRD_MONSTERS_E_G } from "@/data/monsters/e-g";
import { SRD_MONSTERS_H_K } from "@/data/monsters/h-k";
import { SRD_MONSTERS_L_M } from "@/data/monsters/l-m";
import { SRD_MONSTERS_N_P } from "@/data/monsters/n-p";
import { SRD_MONSTERS_Q_S } from "@/data/monsters/q-s";
import { SRD_MONSTERS_T_Z } from "@/data/monsters/t-z";
import { printedEntries } from "@/lib/activities/monster-print-entries";
import {
  printedEntryHeader,
  printedSpellId,
  printedUses,
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
const read = (path: string) =>
  JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as Readonly<
    Record<string, { name?: string; text?: string }>
  >;
const EN = read("src/i18n/en/srd/monsters.json");
const EN_SPELLS = read("src/i18n/en/srd/spells.json");
const SECTIONS = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
] as const;

/** Where the catalogue and its English print part ways, and why. */
const DIVERGENT: Readonly<Record<string, string>> = {
  // The print casts one spell with its own ability; the catalogue keeps it prose.
  "adult-white-dragon.legendaryActions.frightful-presence": "one-spell cast kept prose",
  "ancient-white-dragon.legendaryActions.frightful-presence": "one-spell cast kept prose",
  "cloaker.bonusActions.phantasms": "one-spell cast kept prose",
  "doppelganger.actions.read-thoughts": "one-spell cast kept prose",
  "drider.bonusActions.magic-of-the-spider-queen": "one-spell cast kept prose",
  "ghost.actions.etherealness": "one-spell cast kept prose",
  "vampire.legendaryActions.beguile": "one-spell cast kept prose",
  // The catalogue declares a cast whose print borrows Spellcasting's ability.
  "couatl.bonusActions.divine-aid": "same ability as Spellcasting, declared",
  "cultist-fanatic.bonusActions.spiritual-weapon":
    "same ability as Spellcasting, declared",
  // The catalogue's 1/Day is not in the English name or text.
  "dust-mephit.actions.sleep": "per-day limit only in data",
  "ice-mephit.actions.fog-cloud": "per-day limit only in data",
  // The catalogue counts conditions a "While…"/"Until…" sentence describes.
  "behir.bonusActions.swallow": "state-sentence conditions declared",
  "djinni.actions.create-whirlwind": "state-sentence conditions declared",
  "lamia.actions.corrupting-touch": "state-sentence conditions declared",
  "shambling-mound.actions.engulf": "state-sentence conditions declared",
  "water-elemental.actions.whelm": "state-sentence conditions declared",
  // Three staged roars, each its own save: the catalogue keeps it prose.
  "sphinx-of-valor.actions.roar": "staged saves kept prose",
};

function withoutLimits(entry: MonsterEntry): MonsterEntry {
  const rest: Partial<MonsterEntry> = { ...entry };
  delete rest.recharge;
  delete rest.uses;
  return rest as MonsterEntry;
}

const cases = SRD.flatMap((monster) => {
  const sources = SECTIONS.flatMap((section) =>
    (monster[section] ?? []).map((entry) => {
      const key = `${monster.id}.${section}.${entry.id}`;
      return {
        section,
        id: entry.id,
        name: EN[key]?.name ?? "",
        text: EN[key]?.text ?? "",
      };
    })
  );
  const declared = SECTIONS.flatMap((section) => monster[section] ?? []);
  return printedEntries(sources).map(({ section, entry }, index) => ({
    key: `${monster.id}.${section}.${entry.id}`,
    text: sources[index]?.text ?? "",
    declared: declared[index] as MonsterEntry,
    printed: entry,
  }));
});

describe("a stat block read from its print alone", () => {
  it("covers the whole SRD bestiary", () => {
    expect(cases.length).toBe(1326);
  });

  it("reads every SRD entry as the catalogue declares it, but the listed ones", () => {
    const parted = cases
      .filter(
        ({ declared, printed }) =>
          !isDeepStrictEqual(withoutLimits(declared), withoutLimits(printed))
      )
      .map(({ key }) => key);
    expect(parted.sort()).toEqual(Object.keys(DIVERGENT).sort());
  });

  it("reads the per-day limit an entry's text opens with", () => {
    const limited = cases.filter(({ text }) => printedUses(text));
    expect(limited.length).toBeGreaterThanOrEqual(36);
    for (const { key, declared, printed, text } of limited) {
      expect(printed.uses, key).toEqual(printedUses(text));
      expect(declared.uses, key).toEqual(printedUses(text));
    }
  });

  it("names every SRD spell by its catalogue id", () => {
    const spells = Object.entries(EN_SPELLS).filter(
      ([id, entry]) => !id.includes(".") && entry.name
    );
    expect(spells.length).toBeGreaterThan(300);
    for (const [id, entry] of spells)
      expect(printedSpellId(entry.name ?? ""), id).toBe(id);
  });
});

describe("printedEntryHeader — the limit a homebrew entry's name prints", () => {
  it.each([
    ["Fire Breath (Recharge 5–6)", { name: "Fire Breath", recharge: 5 }],
    ["Gaze (Recharge 6)", { name: "Gaze", recharge: 6 }],
    ["Misty Step (3/Day)", { name: "Misty Step", uses: { count: 3, per: "day" } }],
    [
      "Legendary Resistance (3/Day, or 4/Day in Lair)",
      { name: "Legendary Resistance", uses: { count: 3, per: "day" } },
    ],
    [
      "Howl (Recharges after a Short or Long Rest)",
      { name: "Howl", uses: { count: 1, per: "short-or-long-rest" } },
    ],
    [
      "Tidal Wave (Recharges after a Long Rest)",
      { name: "Tidal Wave", uses: { count: 1, per: "long-rest" } },
    ],
    ["Bite (Vampire Form Only)", { name: "Bite (Vampire Form Only)" }],
    ["Club", { name: "Club" }],
  ])("%s", (name, header) => {
    expect(printedEntryHeader(name)).toEqual(header);
  });
});
