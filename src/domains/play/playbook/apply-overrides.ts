/**
 * Player edits on top of the generated steps. Keyed by step id and action id, so
 * they survive regeneration; an override naming nothing that exists is ignored.
 * Also the one place steps get their final order: slot, then priority, then id.
 */
import { ECONOMY_SLOTS, type PlaybookOverrides, type PlaybookStep } from "./types";

/** Added to a pinned step's priority, so pins lead their slot and the plan. */
export const PIN_BONUS = 1000;

export function applyOverrides(
  steps: ReadonlyArray<PlaybookStep>,
  overrides: PlaybookOverrides
): { kept: PlaybookStep[]; hidden: string[] } {
  const ids = new Set(steps.map((s) => s.id));
  const hiddenSet = new Set((overrides.hidden ?? []).filter((id) => ids.has(id)));
  const pins = (overrides.pinned ?? []).filter((id) => ids.has(id) && !hiddenSet.has(id));
  const kept = steps
    .filter((s) => !hiddenSet.has(s.id))
    .map((s): PlaybookStep => {
      let next = s;
      const preferred = overrides.preferred?.[s.id];
      const at = preferred ? s.options.findIndex((o) => o.actionId === preferred) : -1;
      if (at > 0) {
        const options = [...s.options];
        const [moved] = options.splice(at, 1);
        next = { ...next, options: moved ? [moved, ...options] : options };
      }
      const pinAt = pins.indexOf(s.id);
      if (pinAt >= 0) {
        next = {
          ...next,
          priority: next.priority + PIN_BONUS + (pins.length - pinAt),
          pinned: true,
          why: [...next.why, { key: "player-pinned" }],
        };
      }
      return next;
    })
    .sort(
      (x, y) =>
        ECONOMY_SLOTS.indexOf(x.slot) - ECONOMY_SLOTS.indexOf(y.slot) ||
        y.priority - x.priority ||
        (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
    );
  return { kept, hidden: [...hiddenSet] };
}
