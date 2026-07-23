/**
 * Monster corpus — aggregated index (the `spells.ts` pattern).
 *
 * Pure data accessors over the composed {@link MONSTERS} (public SRD + content
 * pack), sorted by (cr, id) so the browse order is deterministic and identical in
 * both build modes. Names/prose resolve through the LAZY `monster` catalogue.
 *
 * **Nothing eager may import this module** — the bestiary corpus is reachable ONLY
 * through the lazy compendium specs barrel (+ the future encounter picker), so it
 * never joins the eager startup closure (the bundle-budget ratchet is the guard,
 * `vite.config.ts` → the `srd-monsters` chunk).
 */
import type { CreatureType, MonsterStatBlock } from "@/data/types";
import { mergePack } from "@/lib/pack-merge";
import { packMonsters } from "@pack";
import { SRD_MONSTERS_A_B } from "./a-b";
import { SRD_MONSTERS_C_D } from "./c-d";
import { SRD_MONSTERS_E_G } from "./e-g";
import { SRD_MONSTERS_H_K } from "./h-k";
import { SRD_MONSTERS_L_M } from "./l-m";
import { SRD_MONSTERS_N_P } from "./n-p";
import { SRD_MONSTERS_Q_S } from "./q-s";
import { SRD_MONSTERS_T_Z } from "./t-z";

/**
 * All monsters — public SRD + content pack, sorted (cr, id) so the browse order
 * is deterministic and identical in both build modes (spells.ts precedent).
 */
export const MONSTERS: ReadonlyArray<MonsterStatBlock> = mergePack(
  "monster",
  [
    ...SRD_MONSTERS_A_B,
    ...SRD_MONSTERS_C_D,
    ...SRD_MONSTERS_E_G,
    ...SRD_MONSTERS_H_K,
    ...SRD_MONSTERS_L_M,
    ...SRD_MONSTERS_N_P,
    ...SRD_MONSTERS_Q_S,
    ...SRD_MONSTERS_T_Z,
  ],
  packMonsters
).sort((a, b) => a.cr - b.cr || a.id.localeCompare(b.id));

/** id → stat block, built once. */
const MONSTER_INDEX: ReadonlyMap<string, MonsterStatBlock> = new Map(
  MONSTERS.map((m) => [m.id, m])
);

/** The monster stat block for `id`, or `undefined` when unknown. */
export function getMonster(id: string): MonsterStatBlock | undefined {
  return MONSTER_INDEX.get(id);
}

/**
 * CR/type filter for the encounter picker + difficulty calc (later consumers).
 * Bounds inclusive; an omitted bound is open. Preserves the composed (cr, id) sort.
 */
export function filterMonsters(opts: {
  crMin?: number;
  crMax?: number;
  type?: CreatureType;
}): ReadonlyArray<MonsterStatBlock> {
  return MONSTERS.filter(
    (m) =>
      (opts.crMin === undefined || m.cr >= opts.crMin) &&
      (opts.crMax === undefined || m.cr <= opts.crMax) &&
      (opts.type === undefined || m.type === opts.type)
  );
}
