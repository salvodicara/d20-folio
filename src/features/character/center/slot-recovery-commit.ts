/**
 * Restore the expended slots a player picked from a recovery (M12): checked against
 * the rule and the live slots at commit (and again on redo), one undoable act whose
 * undo spends them again. Normal slots only; Pact Magic slots aren't recovered here.
 */
import { slotUsageKey } from "@/lib/cast-options";
import { validSlotRecovery, type SlotRecoveryRule } from "@/lib/play/slot-recovery";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";

export function recoverSlots(
  rule: SlotRecoveryRule,
  slotLevels: ReadonlyArray<number>,
  message: (count: number) => string
): boolean {
  if (slotLevels.length === 0 || !validSlotRecovery(rule, slotLevels)) return false;
  return (
    registerUndoableToast(
      { message: message(slotLevels.length) },
      () => {
        const cs = useCharacterStore.getState();
        const live = cs.character;
        if (!live || cs.readonly) return null;
        const used = new Map(
          live.character.spellSlots
            .filter((row) => !row.pactMagic)
            .map((row) => [
              row.level,
              live.session.spellSlots[slotUsageKey(row)]?.used ?? 0,
            ])
        );
        for (const level of slotLevels) {
          const left = used.get(level) ?? 0;
          if (left < 1) return null;
          used.set(level, left - 1);
        }
        for (const level of slotLevels) cs.restoreSpellSlot(level);
        return () => {
          const now = useCharacterStore.getState();
          for (const level of slotLevels) now.useSpellSlot(level);
        };
      },
      { turnScoped: false }
    ) !== null
  );
}
