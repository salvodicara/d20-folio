import { defaultCombatState, reduceMemberCombatEffects } from "@/lib/combat-state";
import { writeCombatState } from "@/lib/combat-state-io";
import { useCharacterStore } from "@/stores/characterStore";
import type { CombatState } from "@/types/combat-state";
import type { MemberCombatEffect } from "@/types/campaign";

interface MemberEffectDelivery {
  uid: string;
  characterId: string;
  epoch: number;
  effects: ReadonlyArray<MemberCombatEffect>;
  maxHp: number;
  combatState: CombatState | null;
}

/** Apply one idempotent peer-effect batch to the target owner's live sheet and store. */
export async function deliverMemberEffects({
  uid,
  characterId,
  epoch,
  effects,
  maxHp,
  combatState,
}: MemberEffectDelivery): Promise<void> {
  const base = combatState ?? defaultCombatState(maxHp);
  const next = reduceMemberCombatEffects(base, epoch, effects, maxHp);
  if (next === base) return;
  const characterStore = useCharacterStore.getState();
  if (characterStore.character?.id === characterId)
    characterStore.hydrateCombatState(next);
  await writeCombatState(uid, characterId, next);
}
