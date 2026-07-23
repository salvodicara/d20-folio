/**
 * SRD 5.2.1 monster corpus — the t–z tranche (ids beginning t–z).
 * IDs + numbers ONLY; every display string lives in the lazy `monster`
 * catalogue (`src/i18n/{en,it}/srd/monsters.json`). Cite "SRD 5.2.1" in a
 * per-entry source comment — never the book title, never an excluded creature.
 */
import type { MonsterStatBlock } from "@/data/types";

export const SRD_MONSTERS_T_Z: ReadonlyArray<MonsterStatBlock> = [];
