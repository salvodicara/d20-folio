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
import { monsterXp, xpForCr } from "@/lib/monster";
import type { MonsterStatBlock } from "@/data/types";
import type { Locale } from "@/lib/locale";
import type { CustomMonster, MonsterArt } from "@/types/campaign";
import type { MonsterInput } from "./encounter";

/**
 * Pre-fill a picker-added monster group from its statblock: the ACTIVE-locale name
 * (stored as the one free user string — renameable after), the printed AC, the
 * 2024 average HP, the chosen count, a BLANK initiative (no dice — the DM rolls
 * externally, golden rule 21), the additive `srdId` reference, and the per-token
 * XP via `monsterXp` (SRD Step 3 — the encounter budget readout deducts it). No
 * `notes` pre-fill: the statblock facts live behind the DM disclosure, so copying
 * prose into `notes` would create a second drifting copy (golden rule 6).
 *
 * Part B — `creatureType` seeds the card's type-glyph fallback, and `art` (the DM's SRD
 * portrait OVERRIDE for this monster, if any) is COPIED onto the combatant so every
 * viewer sees the same face beside the hero portraits (the shared-fact reason ac/name
 * are copied). No override → the glyph default renders.
 */
export function toMonsterInput(
  m: MonsterStatBlock,
  locale: Locale,
  count: number,
  art?: MonsterArt
): MonsterInput {
  return {
    name: localizeSrd("monster", m.id, "name", locale),
    ac: m.ac,
    maxHp: m.hp.average,
    count,
    initiative: null,
    srdId: m.id,
    xp: monsterXp(m),
    creatureType: m.type,
    ...(art ? { portraitUrl: art.portraitUrl, portraitCrop: art.portraitCrop } : {}),
  };
}

/**
 * Materialize a SAVED custom monster (a library template) into a {@link MonsterInput}
 * for the encounter (Part A): copy its identity facts + art, add the per-add `count` +
 * typed `initiative` (`null` = blank; no dice), and seed the per-token XP from its CR
 * (SRD Step 3 — `xpForCr`), exactly as the manual custom form does. The stored template
 * carries no play state, so `addMonster` re-seeds tokens/conditions fresh — a re-add is
 * a clean copy, never the previous fight's spent HP.
 */
export function customMonsterToInput(
  entry: CustomMonster,
  count: number,
  initiative: number | null = null
): MonsterInput {
  const cr = entry.cr?.trim();
  const notes = entry.notes?.trim();
  return {
    name: entry.name,
    ac: entry.ac,
    maxHp: entry.maxHp,
    count,
    initiative,
    ...(cr ? { xp: xpForCr(Number(cr)) } : {}),
    ...(notes ? { notes } : {}),
    ...(entry.creatureType ? { creatureType: entry.creatureType } : {}),
    ...(entry.portraitUrl
      ? {
          portraitUrl: entry.portraitUrl,
          ...(entry.portraitCrop ? { portraitCrop: entry.portraitCrop } : {}),
        }
      : {}),
  };
}
