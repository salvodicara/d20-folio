/**
 * useTurnEconomy — the context seam for the cockpit's shared action-economy
 * commit loop. The single owner (`TurnEconomyProvider`) holds the per-slot undo
 * refs + the one End-Turn that finalizes them; both the persistent center
 * `ThisTurnTracker` (End Turn) and the Play-tab action cards (commit) consume
 * the same instance through `useTurnEconomy()`, so there is no split-brain undo.
 *
 * Pure (non-component) module — the context, its hook, and the slot helper live
 * here so `TurnEconomyProvider.tsx` can stay a components-only file (React
 * Fast-Refresh), mirroring the `use-hp-controls` / `HpBar` split.
 */

import { createContext, useContext } from "react";
import type { EconomySlot } from "@/stores/combatStore";
import type { ResolvedAction, ActiveMaintainedEffect } from "@/lib/smart-tracker";
import type { RiderVM } from "@/lib/views/rider-view";
import type { CunningStrikeVM } from "@/lib/views/cunning-strike-view";

/** The economy commit surface shared by the center meter + the Play-tab cards. */
export interface TurnEconomyApi {
  /** Tap an action card: commit its cost immediately (reversal lives on the
   *  session undo system — 5s toast · masthead · ⌘Z; the CTA grammar). */
  handleSelect: (action: ResolvedAction) => void;
  /** Use a reaction (immediate-commit on another creature's turn). */
  handleUseReaction: (action: ResolvedAction) => void;
  /**
   * Spend a CONSUMABLE on-hit rider on an attack card (Psi Warrior Psionic
   * Strike → a Psionic Energy Die; Lifedrinker → a Hit Point Die). Debits the
   * backing resource ONCE, logs the spend, and surfaces a 5s undo toast — the
   * SAME immediate-commit-with-undo model an action commit uses. NEVER auto-
   * spent (override-first): the tap IS the explicit commit. `action` names the
   * attack the rider rode (the log + toast); `rider` carries the spend target.
   */
  spendRider: (action: ResolvedAction, rider: RiderVM) => void;
  /**
   * S6 — apply a Rogue **Cunning Strike** option on an attack card: debit the
   * once-per-turn Sneak Attack use (the `rogue-sneak-attack` tracker), log the
   * choice, and surface a 5s undo toast — the SAME immediate-commit-with-undo
   * model. NEVER auto-applied (override-first): the tap IS the explicit commit.
   * `action` names the attack the option rode (log + toast); `option` carries the
   * chosen effect.
   */
  applyCunningStrike: (action: ResolvedAction, option: CunningStrikeVM) => void;
  /** End Turn — pure bookkeeping; ALSO finalizes this turn's per-slot undos. */
  handleEndTurn: () => void;
  /**
   * USE-APPLIES (Task 2) — active `maintained` states (Rage) whose maintenance
   * condition WASN'T met on the turn that just ended, surfaced as a dismissible
   * keep/end prompt on the turn meter. Minimum-interaction default = the state
   * stays ACTIVE (the player may maintain off-app — took damage outside tracked
   * combat); the banner offers one-tap `End` (drop it) or `Keep` (dismiss). The
   * engine never silently kills the state.
   */
  maintenancePrompts: ActiveMaintainedEffect[];
  /** Keep an unmaintained state active (dismiss its prompt). */
  keepMaintainedEffect: (activeKey: string) => void;
  /** End an unmaintained state now (clears its `activeFeatures` toggle). */
  endMaintainedEffect: (activeKey: string) => void;
}

export const TurnEconomyContext = createContext<TurnEconomyApi | null>(null);

/** Economy slot for a resolved action (free actions consume neither A nor B). */
export function getEconomySlot(action: ResolvedAction): EconomySlot {
  if (action.type === "action") return "action";
  if (action.type === "bonus") return "bonus";
  return "free";
}

/** Consume the shared turn-economy API. Throws if no provider is mounted. */
export function useTurnEconomy(): TurnEconomyApi {
  const ctx = useContext(TurnEconomyContext);
  if (!ctx) {
    throw new Error("useTurnEconomy must be used within a <TurnEconomyProvider>");
  }
  return ctx;
}
