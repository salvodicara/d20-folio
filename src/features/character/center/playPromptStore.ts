/**
 * The questions a play move asks the player mid-flow (which slot level, how many
 * points from the pool, on whom, how to pay, which form…), as data any screen can
 * draw. The flow lives in TurnEconomyProvider and ItemResourceCommandProvider: they
 * publish each open question here with its answer callbacks, and a screen renders
 * its own dialog from it. The old sheet keeps the providers' built-in dialogs; the
 * new Play screen turns those off (`renderPrompts={false}`) and draws its own.
 *
 * A kind is present while its question is open, absent once answered or cancelled.
 */
import type { LocText } from "@/lib/loc-text";
import type { HitPointDiceOffer } from "@/lib/play/hit-point-dice";
import type { SlotRecoveryRule } from "@/lib/play/slot-recovery";
import { useLayoutEffect } from "react";
import { create } from "zustand";

import type { ComponentProps } from "react";
import type { ArcaneRecoveryModal } from "@/components/sheet/ArcaneRecoveryModal";
import type { CastLevelModal } from "@/components/sheet/CastLevelModal";
import type { DivineInterventionModal } from "@/components/sheet/DivineInterventionModal";
import type { ItemResourceInputModal } from "@/components/sheet/ItemResourceInputModal";
import type { PaymentPickerModal } from "@/components/sheet/PaymentPickerModal";
import type { PoolSpendModal } from "@/components/sheet/PoolSpendModal";
import type { TargetPickerModal } from "@/components/sheet/TargetPickerModal";

/** Each open question: what to show and how to answer it. */
export interface PlayPrompts {
  /** Which slot level (upcast, free casts, Metamagic) for a spell. */
  "cast-level": NonNullableRequest<ComponentProps<typeof CastLevelModal>>;
  /** How many points to spend from a pool (Lay on Hands). */
  "pool-spend": NonNullableRequest<ComponentProps<typeof PoolSpendModal>>;
  /** "On whom?" before an action commits. */
  target: NonNullableRequest<ComponentProps<typeof TargetPickerModal>>;
  /** Which way to pay (the primary cost or an alternate). */
  payment: NonNullableRequest<ComponentProps<typeof PaymentPickerModal>>;
  /** Which slots Arcane Recovery restores. */
  "arcane-recovery": NonNullableRequest<ComponentProps<typeof ArcaneRecoveryModal>>;
  /** Which Cleric spell Divine Intervention casts. */
  "divine-intervention": DivineInterventionPrompt;
  /** Which form a shape-changing spell takes. */
  "form-picker": { spellId: string; onClose: () => void };
  /** Amounts a magic item's resource needs (charges to spend, a die entered). */
  "item-resource-input": NonNullableRequest<
    ComponentProps<typeof ItemResourceInputModal>
  >;
  /** A potion drunk while another still runs: the d100 on the DM's mixing table (an
   *  offer, never a block). `onConfirm(null)` skips it. */
  "potion-mixing": {
    potions: LocText[];
    onConfirm: (roll: number | null) => void;
  };
  /** Expended slots a cast lets the player recover (M12): which ones, within the
   *  rule's budget and ceiling. `onConfirm` gets the slot levels picked. */
  "slot-recovery": {
    source: LocText;
    rule: SlotRecoveryRule;
    expended: ReadonlyArray<{ level: number; expended: number }>;
    onConfirm: (slotLevels: number[]) => void;
    onCancel: () => void;
  };
  /** Hit Point Dice a rule lets the player spend (Necromancy Adept): how many, and
   *  the total they rolled. `onCancel` spends none. */
  "hit-point-dice": {
    source: LocText;
    offer: HitPointDiceOffer;
    /** The die sizes the pool holds ("d8", "d10/d6"). */
    sizes: string;
    /** The lowest and highest total `count` of them can roll. */
    range: (count: number) => { min: number; max: number };
    onConfirm: (count: number, rolled: number) => void;
    onCancel: () => void;
  };
}

export type PlayPromptKind = keyof PlayPrompts;

type NonNullableRequest<P> = P extends { request: infer R }
  ? Omit<P, "request"> & { request: NonNullable<R> }
  : P;

type DivineInterventionProps = ComponentProps<typeof DivineInterventionModal>;
type DivineInterventionPrompt = Omit<DivineInterventionProps, "pool"> & {
  pool: NonNullable<DivineInterventionProps["pool"]>;
};

interface PlayPromptState {
  open: Partial<PlayPrompts>;
}

export const usePlayPromptStore = create<PlayPromptState>(() => ({ open: {} }));

function publish<K extends PlayPromptKind>(kind: K, prompt: PlayPrompts[K] | null): void {
  const { open } = usePlayPromptStore.getState();
  if (prompt === null) {
    if (!(kind in open)) return;
    usePlayPromptStore.setState({
      open: Object.fromEntries(Object.entries(open).filter(([key]) => key !== kind)),
    });
    return;
  }
  usePlayPromptStore.setState({ open: { ...open, [kind]: prompt } });
}

/**
 * Publish one question while the calling component holds it open (null = none),
 * and take it back when the component unmounts.
 */
export function usePublishPlayPrompt<K extends PlayPromptKind>(
  kind: K,
  prompt: PlayPrompts[K] | null
): void {
  useLayoutEffect(() => publish(kind, prompt), [kind, prompt]);
  useLayoutEffect(() => () => publish(kind, null), [kind]);
}

/** The open question of one kind, or undefined. */
export function usePlayPrompt<K extends PlayPromptKind>(
  kind: K
): PlayPrompts[K] | undefined {
  return usePlayPromptStore((s) => s.open[kind]);
}
