/**
 * The fight in the top bar (the classic CombatPip; D&D Beyond's player-view initiative
 * flags, BG3's active portrait): while my character is in a campaign fight, the round
 * and whose turn it is, with that creature's art; gold when it is mine. A tap opens my
 * character's Play screen. Nothing shows outside a fight.
 */
import { lazy, Suspense } from "react";

import { useCombatStatusStore } from "@/features/campaigns/combat-status-store";

// The drawing loads only once a fight shows: the frame paints every screen, and this
// keeps the fight rows (and the engine behind them) off their first paint.
const CombatPipBody = lazy(() =>
  import("./CombatPipBody").then((m) => ({ default: m.CombatPipBody }))
);

export function CombatPip() {
  const status = useCombatStatusStore((s) => s.status);
  if (!status) return null;
  return (
    <Suspense fallback={null}>
      <CombatPipBody status={status} />
    </Suspense>
  );
}
