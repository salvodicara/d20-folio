/**
 * A target chip's name, read live: the «On whom?» step is built when the dialog
 * opens, and in a fresh session an ally's sheet may not have loaded yet (its row
 * name is still empty). The chip follows the fight, then the party, as they load.
 */
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";
import type { TargetCandidate } from "./target-step";

export function useLiveTargetName(): (c: TargetCandidate) => string {
  const rows = useCombatStatusStore((s) => s.status?.view.rows);
  const party = usePartyRosterStore((s) => s.party);
  return (c) =>
    c.name ||
    rows?.find((r) => r.id === c.id)?.name ||
    party?.members.find((m) => m.ref.combatantId === c.id)?.name ||
    "";
}
