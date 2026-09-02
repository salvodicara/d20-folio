import type {
  Ability,
  ConditionId,
  DamageType,
  Entity,
  EntityKind,
  LifeState,
} from "@/lib/combat/types";

const ZERO: Record<Ability, number> = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };

export function testEntity(opts: {
  id: string;
  kind?: EntityKind;
  hp?: number;
  maxHp?: number;
  ac?: number;
  tempHp?: number;
  life?: LifeState;
  deathSaves?: { successes: number; failures: number };
  resistances?: DamageType[];
  immunities?: DamageType[];
  vulnerabilities?: DamageType[];
  conditionImmunities?: ConditionId[];
  saves?: Partial<Record<Ability, number>>;
  abilities?: Partial<Record<Ability, number>>;
  attacksPerAction?: number;
  controllerUid?: string;
  mechanics?: string[];
  resources?: Entity["resources"];
}): Entity {
  const maxHp = opts.maxHp ?? (opts.hp !== undefined && opts.hp > 0 ? opts.hp : 10);
  return {
    id: opts.id,
    kind: opts.kind ?? "monster",
    label: `label:${opts.id}`,
    controllerUid: opts.controllerUid ?? "dm",
    controlledBy: null,
    origin: { kind: "table" },
    stats: {
      ac: opts.ac ?? 12,
      maxHp,
      speed: 30,
      proficiency: 2,
      abilities: { ...ZERO, ...opts.abilities },
      saves: { ...ZERO, ...opts.saves },
      spellSaveDc: 13,
      spellAttack: 5,
      attacksPerAction: opts.attacksPerAction ?? 1,
      resistances: opts.resistances ?? [],
      immunities: opts.immunities ?? [],
      vulnerabilities: opts.vulnerabilities ?? [],
      conditionImmunities: opts.conditionImmunities ?? [],
    },
    vitals: {
      hp: opts.hp ?? maxHp,
      tempHp: opts.tempHp ? { amount: opts.tempHp, source: null } : null,
      deathSaves: opts.deathSaves ?? { successes: 0, failures: 0 },
      life: opts.life ?? "alive",
      exhaustion: 0,
    },
    resources: opts.resources ?? {},
    concentration: null,
    turn: {
      action: 0,
      bonus: 0,
      reaction: 0,
      attacksUsed: 0,
      movementUsed: 0,
      claims: [],
    },
    overrides: {},
    reveal: { block: false, hp: false },
    mechanics: opts.mechanics ?? [],
  };
}
