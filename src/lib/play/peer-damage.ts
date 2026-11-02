/**
 * A hit someone else lands on a PC (the DM's monster, the DM's party card, an ally's
 * area spell), through the target's OWN damage rule — the same `takeDamage` the player's
 * own entry runs: temporary hit points first, 0 HP → Unconscious, a hit while dying is a
 * death-save failure (a critical, two), massive damage kills outright, and a concentrating
 * target still standing has a Concentration save to roll (edge-case family M1,
 * docs/architecture/2026-11-edge-cases.md).
 *
 * Pure: the target's whole sheet and its combat state in, the next combat state out. A
 * peer writes only the combat roots it may touch (HP, conditions, death saves, pending
 * Concentration saves); Concentration itself is the owner's, and the owner's sheet ends
 * it when it hydrates a 0-HP state (`characterStore.hydrateCombatState`).
 */
import { concentrationSaveDc } from "@/lib/compute";
import { damageQueuesConcentrationSave } from "@/lib/character-d20-tests";
import type { CharacterDoc } from "@/types/character";
import type { CombatState, PendingConcentrationSave } from "@/types/combat-state";

import { takeDamage, type DamageOptions } from "./damage";

export function peerDamageState(
  doc: CharacterDoc,
  current: CombatState,
  amount: number,
  opts: DamageOptions = {},
  newId: () => string = () => crypto.randomUUID()
): CombatState {
  const damage = Math.max(0, Math.floor(amount));
  if (damage === 0) return current;
  // The target as it stands now: its sheet with the fresh combat roots folded in.
  const standing: CharacterDoc = {
    ...doc,
    session: {
      ...doc.session,
      hp: { ...doc.session.hp, current: current.hp.current, temp: current.hp.temp },
      conditions: [...current.conditions],
      deathSucc: current.deathSaves.successes,
      deathFail: current.deathSaves.failures,
    },
  };
  const taken = takeDamage(standing, damage, opts);
  if (!taken) return current;
  const hp = { current: taken.session.hp.current, temp: taken.session.hp.temp };
  // Still standing and concentrating: the hit asks a save (DC from the whole hit,
  // temporary hit points included). At 0 HP, Concentration simply ends.
  const held = standing.session.concentration;
  const save: PendingConcentrationSave | null =
    hp.current > 0 && held !== "" && damageQueuesConcentrationSave(standing)
      ? {
          id: newId(),
          spell: held,
          damage,
          difficultyClass: concentrationSaveDc(damage),
        }
      : null;
  return {
    ...current,
    hp,
    conditions: [...taken.session.conditions],
    deathSaves: { successes: taken.session.deathSucc, failures: taken.session.deathFail },
    ...(save
      ? {
          pendingConcentrationSaves: [...(current.pendingConcentrationSaves ?? []), save],
        }
      : hp.current === 0 && (current.pendingConcentrationSaves?.length ?? 0) > 0
        ? { pendingConcentrationSaves: [] }
        : {}),
  };
}
