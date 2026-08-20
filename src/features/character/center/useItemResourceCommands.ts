/** Shared transaction seam for every physical magic-item resource consumer. */

import { createContext, useContext } from "react";
import type {
  ItemResourceCommandRecipe,
  PreparedItemResourceCommand,
} from "@/lib/item-resource-commands";
import type {
  ItemResourceRecoveryBoundary,
  PreparedItemResourceBoundary,
} from "@/lib/item-resource-boundaries";

export interface CommittedItemResourceCommand {
  prepared: PreparedItemResourceCommand;
}

export interface CommittedItemResourceBoundary {
  prepared: PreparedItemResourceBoundary;
}

export interface ItemResourceCommandApi {
  /** Resolve all table-entered facts without mutating character state. */
  prepare: (
    recipe: ItemResourceCommandRecipe,
    sourceName: string
  ) => Promise<PreparedItemResourceCommand | null>;
  /** Apply a prepared operation at the caller's atomic commit boundary. */
  commit: (prepared: PreparedItemResourceCommand) => CommittedItemResourceCommand | null;
  /** Redo with the same table facts, but a fresh occurrence and live revision. */
  replay: (
    committed: CommittedItemResourceCommand
  ) => CommittedItemResourceCommand | null;
  /** Causal LIFO revert; false leaves the undo entry available for retry. */
  revert: (committed: CommittedItemResourceCommand) => boolean;
  /** Resolve every table fact for one exact recovery boundary before mutation. */
  prepareBoundary: (
    trigger: ItemResourceRecoveryBoundary
  ) => Promise<PreparedItemResourceBoundary | null>;
  /** Commit all prepared physical copies in one whole-batch CAS. */
  commitBoundary: (
    prepared: PreparedItemResourceBoundary
  ) => CommittedItemResourceBoundary | null;
  /** Redo only the original entries with the original table facts. */
  replayBoundary: (
    committed: CommittedItemResourceBoundary
  ) => CommittedItemResourceBoundary | null;
  /** Reverse the complete boundary in causal LIFO order. */
  revertBoundary: (committed: CommittedItemResourceBoundary) => boolean;
}

/** Bind one prepared first commit to fact-preserving, fresh-occurrence redos. */
export function createItemResourcePaymentCycle(
  commands: ItemResourceCommandApi,
  prepared: PreparedItemResourceCommand
): { apply: () => CommittedItemResourceCommand | null } {
  let first: PreparedItemResourceCommand | null = prepared;
  let latest: CommittedItemResourceCommand | null = null;
  return {
    apply: () => {
      const committed = first
        ? commands.commit(first)
        : latest
          ? commands.replay(latest)
          : null;
      first = null;
      if (committed) latest = committed;
      return committed;
    },
  };
}

/** Bind one prepared recovery batch to fact-preserving, fresh-occurrence redos. */
export function createItemResourceBoundaryCycle(
  commands: ItemResourceCommandApi,
  prepared: PreparedItemResourceBoundary
): { apply: () => CommittedItemResourceBoundary | null } {
  let first: PreparedItemResourceBoundary | null = prepared;
  let latest: CommittedItemResourceBoundary | null = null;
  return {
    apply: () => {
      const committed = first
        ? commands.commitBoundary(first)
        : latest
          ? commands.replayBoundary(latest)
          : null;
      first = null;
      if (committed) latest = committed;
      return committed;
    },
  };
}

export const ItemResourceCommandContext = createContext<ItemResourceCommandApi | null>(
  null
);

export function useItemResourceCommands(): ItemResourceCommandApi {
  const context = useContext(ItemResourceCommandContext);
  if (!context) {
    throw new Error(
      "useItemResourceCommands must be used within an <ItemResourceCommandProvider>"
    );
  }
  return context;
}

/** Isolated legacy component tests may omit the cockpit provider; typed-item
 * consumers must fail closed when this returns null. Production always mounts it. */
export function useOptionalItemResourceCommands(): ItemResourceCommandApi | null {
  return useContext(ItemResourceCommandContext);
}
