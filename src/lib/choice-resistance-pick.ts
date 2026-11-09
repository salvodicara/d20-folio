/**
 * One tap on a `choice-resistance` slot's option: toggles the pick within the slot's
 * cap. A single-pick slot replaces its pick; a full multi-pick slot ignores the tap
 * (null), so an over-cap state is unreachable.
 */
import type { DamageType } from "@/types/damage";

export function nextChoiceResistancePicks(
  picked: ReadonlyArray<DamageType>,
  amount: number,
  type: DamageType
): DamageType[] | null {
  if (picked.includes(type)) return picked.filter((d) => d !== type);
  if (picked.length < amount) return [...picked, type];
  return amount === 1 ? [type] : null;
}
