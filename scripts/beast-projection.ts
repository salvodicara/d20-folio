/**
 * The Polymorph projection rule (C1, §D.1) — the ONE shared derivation.
 *
 * The eager `src/data/beasts/beasts.ts` catalogue is a GENERATED 2024 projection
 * of the monster corpus (the authored source of truth). The sync script
 * (`sync-beast-projection.ts`, retired when spent) writes it; this derivation is
 * what the projection guard (`tests/unit/beast-monster-projection.guard.test.ts`)
 * asserts against — numbers, attack rows, and trait lists can never drift (golden
 * rule 6, discharged by CI construction). Runtime `beasts.ts` imports NOTHING from
 * `data/monsters`; this module never enters the client bundle.
 *
 * PURE + node-safe: imports ONLY types from `../src/data/types` (relative, so it
 * runs under plain `node` type-stripping like `scripts/i18n/check-i18n.ts`),
 * imported by BOTH the projection guard test and the sync script — one derivation,
 * no drift pair. It PERMANENTLY outlives the sync script (the guard owns it forever).
 */
import type {
  BeastStatBlock,
  MonsterAttackEntry,
  MonsterStatBlock,
} from "../src/data/types";

type MonsterSenses = NonNullable<MonsterStatBlock["senses"]>;
type BeastSenses = NonNullable<BeastStatBlock["senses"]>;

/** The sense fields a Beast block can represent (its `senses` shape). A monster's
 *  `blindBeyond` flag has no Beast field, so it is dropped by the projection. */
const BEAST_SENSE_KEYS = [
  "darkvisionFt",
  "blindsightFt",
  "tremorsenseFt",
  "truesightFt",
] as const;

/** Does the monster carry any sense a Beast block can represent? */
function hasBeastSense(senses: MonsterSenses): boolean {
  return BEAST_SENSE_KEYS.some((k) => senses[k] !== undefined);
}

/** The Beast-relevant subset of a monster's senses (omitting `blindBeyond`). */
function pickBeastSenses(senses: MonsterSenses): BeastSenses {
  const out: { -readonly [K in keyof BeastSenses]?: BeastSenses[K] } = {};
  for (const k of BEAST_SENSE_KEYS) {
    const v = senses[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Project a monster statblock to its eager Polymorph {@link BeastStatBlock}.
 *
 * Flattening rules (exact): attack-kind actions ONLY (save/spellcasting/narrative
 * never project); per attack the FIRST `damage` clause only (riders drop — the Play
 * board renders one primary clause per row); top-level id stays stable (persisted
 * `session.polymorphForm.beastId` byte-safe); optional-field OMISSION is matched via
 * conditional spreads so the guard's `toEqual` sees absent, never present-`undefined`.
 */
export function beastProjectionFromMonster(m: MonsterStatBlock): BeastStatBlock {
  const size = m.sizes[0];
  if (size === undefined) {
    throw new Error(`[beast-projection] ${m.id} has no size`);
  }
  const attacks: BeastStatBlock["attacks"] = m.actions
    .filter((e): e is MonsterAttackEntry => e.kind === "attack")
    .map((e) => {
      const primary = e.damage[0];
      if (primary === undefined) {
        throw new Error(
          `[beast-projection] ${m.id}: attack "${e.id}" has no damage clause`
        );
      }
      const base = {
        nameKey: `attack.${e.id}`,
        toHit: e.toHit,
        damageDice: primary.dice,
        damageType: primary.damageType,
      };
      return e.rangeFt
        ? {
            ...base,
            range: { nearFt: e.rangeFt.near, farFt: e.rangeFt.far ?? e.rangeFt.near },
          }
        : { ...base, reachFt: e.reachFt ?? 5 };
    });
  return {
    id: m.id,
    cr: m.cr,
    size,
    ac: m.ac,
    hp: m.hp.average,
    speeds: m.speeds,
    abilityScores: m.abilityScores,
    attacks,
    ...(m.senses && hasBeastSense(m.senses) ? { senses: pickBeastSenses(m.senses) } : {}),
    ...(m.traits?.length ? { traits: m.traits.map((t) => `trait.${t.id}`) } : {}),
  };
}
