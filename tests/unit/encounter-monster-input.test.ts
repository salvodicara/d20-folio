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
import { toMonsterInput } from "@/features/campaigns/encounter-monster-input";
import type { Locale } from "@/lib/locale";

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
        expect(input.notes).toBeUndefined(); // no prose copy (one home per fact)
      });
    }
  }

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
