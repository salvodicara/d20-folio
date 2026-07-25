/**
 * encounter-monster-input — the ONE pure mapper from a bestiary statblock to a
 * {@link MonsterInput} the encounter reducers commit. No React, no Firebase (it
 * imports only types + `localizeSrd`), so it is trivially unit-testable and stays
 * on the pure side of the data↔UI seam.
 *
 * It runs only AFTER the lazy `monster` catalogue is resident (called from the
 * lazy `encounter-bestiary` module, whose factory gates on `ensureSrdKind`), so
 * `localizeSrd("monster", …)` is safe here.
 */

import { localizeSrd } from "@/i18n/resolver";
import { monsterXp } from "@/lib/monster";
import type { MonsterStatBlock } from "@/data/types";
import type { Locale } from "@/lib/locale";
import type { MonsterInput } from "./encounter";

/**
 * Pre-fill a picker-added monster group from its statblock: the ACTIVE-locale name
 * (stored as the one free user string — renameable after), the printed AC, the
 * 2024 average HP, the chosen count, a BLANK initiative (no dice — the DM rolls
 * externally, golden rule 21), the additive `srdId` reference, and the per-token
 * XP via `monsterXp` (SRD Step 3 — the encounter budget readout deducts it). No
 * `notes` pre-fill: the statblock facts live behind the DM disclosure, so copying
 * prose into `notes` would create a second drifting copy (golden rule 6).
 */
export function toMonsterInput(
  m: MonsterStatBlock,
  locale: Locale,
  count: number
): MonsterInput {
  return {
    name: localizeSrd("monster", m.id, "name", locale),
    ac: m.ac,
    maxHp: m.hp.average,
    count,
    initiative: null,
    srdId: m.id,
    xp: monsterXp(m),
  };
}
