/**
 * Dawn and dusk for the items that recover at them (M18). With a time of day set,
 * the clock fires them when passing time or a rest crosses 06:00 or 18:00; with no
 * time set, the table declares them by hand (TableClockControl). Either way it is
 * the same boundary: prepared through the item-resource commands (it may ask for the
 * physical roll), committed as one batch, undone with its own toast.
 */
import type { ItemResourceCommandApi } from "@/lib/item-resource-controller";
import { createItemResourceBoundaryCycle } from "@/lib/item-resource-controller";
import type { TableClockBoundary } from "@/lib/views/item-resource-boundary-view";
import { registerUndoableToast } from "@/stores/undoStore";

/** Recover what recovers at `kind`, with its undo toast. False when nothing did. */
export async function declareClockBoundary(
  commands: ItemResourceCommandApi,
  kind: TableClockBoundary,
  message: string
): Promise<boolean> {
  const prepared = await commands.prepareBoundary({ kind });
  if (!prepared || prepared.entries.length === 0) return false;
  const cycle = createItemResourceBoundaryCycle(commands, prepared);
  registerUndoableToast(
    { message },
    () => {
      const committed = cycle.apply();
      return committed ? () => commands.revertBoundary(committed) : null;
    },
    { turnScoped: false }
  );
  return true;
}
