/**
 * Damage and healing application in the SRD 5.2.1 order:
 * flat adjustments → resistance (halve, round down) → vulnerability (double) → temporary HP →
 * hit points → 0-HP consequences (dying for PCs, dead for everything else; massive damage kills).
 */
import type { DamageType, Entity } from "./types";

export interface DamagePacket {
  readonly amount: number;
  readonly type: DamageType;
}

export interface DamageOptions {
  readonly flatReduction?: number;
}

export interface DamageResult {
  readonly entity: Entity;
  readonly taken: number; // damage that reached temp HP + HP
  readonly hpZero: boolean;
}

function adjustPacket(entity: Entity, packet: DamagePacket, flat: number): number {
  if (entity.stats.immunities.includes(packet.type)) return 0;
  let amount = Math.max(0, packet.amount - flat);
  if (entity.stats.resistances.includes(packet.type)) amount = Math.floor(amount / 2);
  if (entity.stats.vulnerabilities.includes(packet.type)) amount *= 2;
  return amount;
}

export function applyDamage(
  entity: Entity,
  packets: readonly DamagePacket[],
  options: DamageOptions
): DamageResult {
  const flat = options.flatReduction ?? 0;
  let total = 0;
  for (const packet of packets) total += adjustPacket(entity, packet, flat);
  if (total === 0) return { entity, taken: 0, hpZero: false };

  let remaining = total;
  let tempHp = entity.vitals.tempHp;
  if (tempHp) {
    const absorbed = Math.min(tempHp.amount, remaining);
    remaining -= absorbed;
    tempHp =
      tempHp.amount - absorbed > 0
        ? { ...tempHp, amount: tempHp.amount - absorbed }
        : null;
  }
  const hp = Math.max(0, entity.vitals.hp - remaining);
  const overflow = remaining - entity.vitals.hp;
  const hpZero = hp === 0 && entity.vitals.hp > 0;

  let life = entity.vitals.life;
  let deathSaves = entity.vitals.deathSaves;
  if (hp === 0) {
    if (overflow >= entity.stats.maxHp) life = "dead";
    else if (entity.kind === "pc") {
      if (entity.vitals.hp === 0 && life !== "alive") {
        // damage while already at 0: one failure (two on a critical hit — decided by the caller)
        deathSaves = { ...deathSaves, failures: deathSaves.failures + 1 };
        life = deathSaves.failures >= 3 ? "dead" : "dying";
      } else {
        life = "dying";
      }
    } else {
      life = "dead";
    }
  }

  return {
    entity: { ...entity, vitals: { ...entity.vitals, hp, tempHp, life, deathSaves } },
    taken: total,
    hpZero,
  };
}

export function applyHealing(entity: Entity, amount: number): Entity {
  if (entity.vitals.life === "dead" || amount <= 0) return entity;
  const hp = Math.min(entity.stats.maxHp, entity.vitals.hp + amount);
  const wasDown = entity.vitals.hp === 0;
  return {
    ...entity,
    vitals: {
      ...entity.vitals,
      hp,
      life: "alive",
      deathSaves: wasDown ? { successes: 0, failures: 0 } : entity.vitals.deathSaves,
    },
  };
}
