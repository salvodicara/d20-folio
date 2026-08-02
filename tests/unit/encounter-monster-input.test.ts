/**
 * encounter-monster-input — the pure statblock → MonsterInput mapper (§D).
 *
 * `src/test/setup.fast.ts` has loaded EN + IT; ensuring the lazy `monster` kind
 * (the load-before-render gate the real lazy module awaits) makes `localizeSrd`
 * resolve real names — the SLICE-8 pattern. Table-driven over real corpus entries.
 */
import { describe, it, expect } from "vitest";
import { ensureSrdKind } from "@/i18n";
import { localizeSrd } from "@/i18n/resolver";
import { getMonster } from "@/data/monsters";
import { monsterXp } from "@/lib/monster";
import {
  customMonsterToInput,
  toMonsterInput,
} from "@/features/campaigns/encounter-monster-input";
import { xpForCr } from "@/lib/monster";
import type { Locale } from "@/lib/locale";
import type { CustomMonster } from "@/types/campaign";

await ensureSrdKind("monster");

const IDS = ["goblin-warrior", "brown-bear", "goblin-boss"] as const;
const LOCALES: Locale[] = ["en", "it"];

describe("toMonsterInput — pre-fill a monster group from its statblock", () => {
  for (const id of IDS) {
    const m = getMonster(id);
    if (!m) throw new Error(`pilot monster '${id}' missing from corpus`);
    for (const locale of LOCALES) {
      it(`${id} @ ${locale}: name = localized name, ac/maxHp copied, init blank, srdId stamped`, () => {
        const input = toMonsterInput(m, locale, 3);
        expect(input.name).toBe(localizeSrd("monster", m.id, "name", locale));
        expect(input.name.length).toBeGreaterThan(0);
        expect(input.ac).toBe(m.ac);
        expect(input.maxHp).toBe(m.hp.average);
        expect(input.count).toBe(3);
        expect(input.initiative).toBeNull(); // no dice — the DM rolls externally
        expect(input.srdId).toBe(m.id);
        expect(input.xp).toBe(monsterXp(m)); // SRD Step 3 — seeded per-token XP
        expect(input.notes).toBeUndefined(); // no prose copy (one home per fact)
        expect(input.creatureType).toBe(m.type); // Part B — carries the identity type
        expect(input.portraitUrl).toBeUndefined(); // canonical art is derived from srdId
      });
    }
  }

  it("stores no portrait copy for database monsters; render resolves the canonical id", () => {
    const m = getMonster("goblin-warrior");
    if (!m) throw new Error("goblin-warrior missing");
    const input = toMonsterInput(m, "en", 1);
    expect(input.srdId).toBe("goblin-warrior");
    expect(input.portraitUrl).toBeUndefined();
    expect(input.portraitCrop).toBeUndefined();
  });

  it("EN and IT names diverge for a translated entry (locale is actually threaded)", () => {
    const m = getMonster("goblin-warrior");
    if (!m) throw new Error("goblin-warrior missing");
    expect(toMonsterInput(m, "en", 1).name).not.toBe(toMonsterInput(m, "it", 1).name);
  });

  it("count passes through (1 for a single add)", () => {
    const m = getMonster("brown-bear");
    if (!m) throw new Error("brown-bear missing");
    expect(toMonsterInput(m, "en", 1).count).toBe(1);
  });
});

describe("customMonsterToInput — materialize a saved custom monster (Part A)", () => {
  const full: CustomMonster = {
    name: "Ashmaw Hound",
    ac: 14,
    maxHp: 33,
    creatureType: "monstrosity",
    cr: "2",
    notes: "hunts in pairs",
    portraitUrl: "https://x/monster-ashmaw.jpeg",
    portraitCrop: { x: 5, y: 5, width: 80, height: 80 },
  };

  it("copies identity + art, seeds XP from CR, adds count + typed initiative", () => {
    const input = customMonsterToInput(full, 3, 12);
    expect(input).toEqual({
      name: "Ashmaw Hound",
      ac: 14,
      maxHp: 33,
      count: 3,
      initiative: 12,
      xp: xpForCr(2),
      notes: "hunts in pairs",
      creatureType: "monstrosity",
      portraitUrl: "https://x/monster-ashmaw.jpeg",
      portraitCrop: { x: 5, y: 5, width: 80, height: 80 },
    });
  });

  it("defaults initiative to null (no dice) and omits absent optionals", () => {
    const input = customMonsterToInput({ name: "Wisp", ac: 10, maxHp: 4 }, 1);
    expect(input.initiative).toBeNull();
    expect(input.count).toBe(1);
    expect("xp" in input).toBe(false);
    expect("notes" in input).toBe(false);
    expect("creatureType" in input).toBe(false);
    expect("portraitUrl" in input).toBe(false);
    expect("portraitCrop" in input).toBe(false);
  });

  it("keeps a portraitUrl even without a crop (crop is optional)", () => {
    const input = customMonsterToInput(
      { name: "Wisp", ac: 10, maxHp: 4, portraitUrl: "https://x/w.jpeg" },
      1
    );
    expect(input.portraitUrl).toBe("https://x/w.jpeg");
    expect("portraitCrop" in input).toBe(false);
  });
});
