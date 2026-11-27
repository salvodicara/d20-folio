/**
 * The DM's hit from the Scontro tab (DDB's combat tracker: one number, Danni or Cura;
 * dnd5e's apply tray: the same entry on every chosen target). Each creature takes it on
 * its own path: a monster through its defenses, a character through their own damage
 * rule. The DM heals monsters only; a character's healing stays on their sheet.
 */
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { MonsterHpChange } from "@/features/campaigns/combat-lifecycle";
import type { DamageInstance } from "@/lib/damage-intake";
import type { DamageType } from "@/types/damage";

export interface DmTarget {
  id: string;
  kind: "pc" | "monster";
  name: string;
  hp: { current: number; max: number; temp: number };
  conditions: string[];
  memberUid?: string;
  characterId?: string;
  /** Monster: what the players see of it (set from «Per i giocatori»). */
  hidden?: boolean;
  revealed?: boolean;
  side?: "ally" | "enemy";
  /** A hero's death-save marks (a hero at 0 HP: the DM may tick them). */
  deathSaves?: { successes: number; failures: number };
}

export type DmEntry =
  | { kind: "damage"; amount: number; type?: DamageType }
  | { kind: "heal"; amount: number };

export type DmHitStep =
  | { kind: "monster"; monsterId: string; change: MonsterHpChange }
  | {
      kind: "pc";
      memberUid: string;
      characterId: string;
      maxHp: number;
      parts: DamageInstance[];
    };

/** The chosen creatures still in the fight, in turn order. */
export function dmTargets(
  rows: readonly EncounterCombatantView[],
  ids: readonly string[]
): DmTarget[] {
  const chosen = new Set(ids);
  return (
    rows
      // A PC row still loading holds placeholder HP 0/0 (#1306): not a target yet.
      .filter((r) => chosen.has(r.id) && !r.liveUnknown)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        hp: { current: r.currentHp, max: r.maxHp, temp: r.tempHp },
        conditions: r.conditions,
        ...(r.memberUid ? { memberUid: r.memberUid } : {}),
        ...(r.characterId ? { characterId: r.characterId } : {}),
        ...(r.kind === "monster"
          ? { hidden: r.hidden, revealed: r.revealed === true, side: r.side ?? "enemy" }
          : {}),
        ...(r.kind === "pc" && r.deathSaves ? { deathSaves: r.deathSaves } : {}),
      }))
  );
}

export function planDmHit(targets: readonly DmTarget[], entry: DmEntry): DmHitStep[] {
  if (entry.amount <= 0) return [];
  const parts: DamageInstance[] = [
    {
      amount: entry.amount,
      ...(entry.kind === "damage" && entry.type ? { type: entry.type } : {}),
    },
  ];
  return targets.flatMap((t): DmHitStep[] => {
    if (t.kind === "monster")
      return [
        {
          kind: "monster",
          monsterId: t.id,
          change:
            entry.kind === "heal"
              ? { kind: "heal", amount: entry.amount }
              : { kind: "damage", parts },
        },
      ];
    if (entry.kind === "heal" || !t.memberUid || !t.characterId) return [];
    return [
      {
        kind: "pc",
        memberUid: t.memberUid,
        characterId: t.characterId,
        maxHp: t.hp.max,
        parts,
      },
    ];
  });
}
