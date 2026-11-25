/**
 * The reaction trigger tokens a resolved action answers. The engine stamps each as a
 * `combat.reactionTrigger_<token>` text ref (the trigger line's words), so the token is
 * read back from the ref, never from prose.
 */
import type { RawResolvedAction } from "@/lib/smart-tracker";

const TRIGGER_PREFIX = "combat.reactionTrigger_";

/** Every trigger token the reaction answers (a reaction may answer several). */
export function reactionTriggersOf(a: Pick<RawResolvedAction, "summary">): string[] {
  const texts = a.summary.triggers ?? (a.summary.trigger ? [a.summary.trigger] : []);
  return texts.flatMap((t) =>
    "ui" in t && t.ui.startsWith(TRIGGER_PREFIX)
      ? [t.ui.slice(TRIGGER_PREFIX.length)]
      : []
  );
}
