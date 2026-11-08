/**
 * An object as the target of an area or an attack (SRD 5.2.1 "Object"): immune to
 * Poison and Psychic damage, failing every saving throw, with the AC and Hit Points
 * the DM gives it (and any resistance its material gives). Pure and engine-ready: the
 * damage tray names an object as a target through `@/lib/play/object-targets` once
 * that control exists (edge-case M1, owner-gated), and reads it from here.
 */
import {
  OBJECT_DEFENSES,
  resolveDamageIntake,
  type DamageDefenses,
  type DamageInstance,
  type ResolvedDamageIntake,
} from "@/lib/damage-intake";
import type { DamageType } from "@/types/damage";

/** One object the DM has put in play as a target. */
export interface ObjectTarget {
  readonly kind: "object";
  readonly name: string;
  readonly armorClass: number;
  readonly hp: { readonly current: number; readonly max: number };
  readonly defenses: DamageDefenses;
}

/** An object as a target: the SRD's object defenses plus what its material adds. */
export function objectTarget(input: {
  name: string;
  armorClass: number;
  maxHp: number;
  currentHp?: number;
  /** The material's resistances, as the DM rules them. */
  resistances?: readonly DamageType[];
  /** The material's vulnerabilities, as the DM rules them. */
  vulnerabilities?: readonly DamageType[];
}): ObjectTarget {
  const max = Math.max(1, Math.floor(input.maxHp));
  return {
    kind: "object",
    name: input.name,
    armorClass: input.armorClass,
    hp: { current: Math.min(max, Math.max(0, input.currentHp ?? max)), max },
    defenses: {
      ...OBJECT_DEFENSES,
      resistances: new Set(input.resistances ?? []),
      vulnerabilities: new Set(input.vulnerabilities ?? []),
    },
  };
}

/** An object fails every saving throw, so an area's save never spares it. */
export function objectSaveOutcome(): "failed-save" {
  return "failed-save";
}

/** The object after one hit's parts: its defenses applied, its HP never below 0. */
export function objectAfterDamage(
  target: ObjectTarget,
  parts: ReadonlyArray<DamageInstance>
): { target: ObjectTarget; intake: ResolvedDamageIntake } {
  const intake = resolveDamageIntake(parts, target.defenses);
  return {
    target: {
      ...target,
      hp: { ...target.hp, current: Math.max(0, target.hp.current - intake.netTotal) },
    },
    intake,
  };
}
