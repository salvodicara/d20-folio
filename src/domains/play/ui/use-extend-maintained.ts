/**
 * «Extend (Bonus Action)» on the End Turn prompt: commits the state's dedicated extend
 * action through the turn economy, so the Bonus Action is spent and the state counts
 * as kept going this turn. False when it cannot (`canExtendWithBonus`).
 */
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { Locale } from "@/lib/locale";
import { bonusExtendAction, canExtendWithBonus } from "../turn-model";

export function useExtendMaintained(locale: Locale): (activeKey: string) => boolean {
  const { executeAction } = useTurnEconomy();
  return (activeKey) => {
    const action = bonusExtendAction(activeKey, locale);
    if (!action || !canExtendWithBonus(activeKey, locale).ok) return false;
    executeAction(action);
    return true;
  };
}
