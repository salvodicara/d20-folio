/**
 * encounter-monster-speed — resolves a bestiary monster's printed walking speed for
 * its encounter card. A LAZY seam file (like `encounter-trait-chips.tsx`): it
 * statically reads the corpus (`getMonster`), so `party-encounter.tsx` reaches it
 * only through a dynamic `import("./encounter-monster-speed")` (eager-partition guard).
 */
import type { ReactNode } from "react";
import { getMonster } from "@/data/monsters";

export function MonsterStatBlockWalk({
  srdId,
  children,
}: {
  srdId: string;
  children: (walkFt: number | undefined) => ReactNode;
}) {
  return <>{children(getMonster(srdId)?.speeds.walk)}</>;
}
