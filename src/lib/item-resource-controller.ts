/**
 * One prepare/input/commit controller for typed physical-item resources (a wand's
 * charges, a staff's recharge at dawn). Combat actions and out-of-combat casts share
 * it, so they share the same planner, input prompt, CAS boundary, redo facts and
 * causal undo.
 *
 * No React and no store: the character, the writes, the input prompt and the
 * conflict notice arrive as ports, so any UI (or a test) can drive it.
 */
import { MAGIC_ITEMS_BY_ID, SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { canSpendCopy } from "@/lib/item-copies";
import { homebrewItemCatalogue, itemCopyItemId } from "@/lib/homebrew-items";
import {
  prepareItemResourceBoundary,
  prepareItemResourceBoundaryReplay,
  prepareItemResourceBoundaryRevert,
  type ItemResourceBoundaryFact,
  type ItemResourceBoundaryInputRequest,
  type ItemResourceOperationBatchResult,
  type ItemResourceOperationEntry,
  type ItemResourceRecoveryBoundary,
  type PreparedItemResourceBoundary,
} from "@/lib/item-resource-boundaries";
import {
  answerItemResourceInputs,
  prepareItemResourceCommand,
  prepareItemResourceRevert,
  type ItemResourceCommandRecipe,
  type PreparedItemResourceCommand,
} from "@/lib/item-resource-commands";
import type {
  ItemResourceOperation,
  ResourceApplyResult,
  ResourceInputRequest,
  ResourceItemBinding,
  ResourceItemSpec,
} from "@/lib/resources";
import type { CharacterDoc } from "@/types/character";

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

/** The numbers the player entered, by request kind; null when they cancelled. */
export type ItemResourceInputAnswer = ReadonlyMap<
  ResourceInputRequest["kind"],
  number
> | null;

export interface ItemResourceCommandPorts {
  /** The live character, or null when none is open. */
  character: () => CharacterDoc | null;
  readonly: () => boolean;
  applyOperation: (
    item: ResourceItemSpec,
    binding: ResourceItemBinding,
    operation: ItemResourceOperation
  ) => ResourceApplyResult;
  applyOperations: (
    entries: readonly ItemResourceOperationEntry[]
  ) => ItemResourceOperationBatchResult;
  /** Ask the player for the table facts (a rolled recharge); resolves on answer. */
  requestInput: (
    sourceName: string,
    requests: readonly ResourceInputRequest[]
  ) => Promise<ItemResourceInputAnswer>;
  /** The live state no longer matches what was reviewed. */
  notifyConflict: () => void;
  /** The item's display name; `copyNumber` when the character carries several. */
  itemName: (itemId: string, copyNumber: number | null) => string;
  occurrenceId?: () => string;
}

/** The typed pools behind an item id: the catalogue item, or the character's own
 *  structured homebrew copy (whose item id is its instanceId). */
function itemDefinition(
  character: CharacterDoc,
  itemId: string
): ResourceItemSpec | null {
  const item =
    MAGIC_ITEMS_BY_ID.get(itemId) ??
    homebrewItemCatalogue(character.character.equipment).find(({ id }) => id === itemId);
  return item?.resources?.length ? { itemId: item.id, resources: item.resources } : null;
}

/** A spend is legal only while the exact physical copy is still an active item
 * source. This is rechecked after every input interval and on redo; semantic
 * reverts deliberately remain legal after unequip so undo can always restore. */
function hasActiveSpendOwner(
  character: CharacterDoc,
  identity: ItemResourceCommandRecipe["identity"]
): boolean {
  return canSpendCopy(character, identity.itemId, identity.instanceId);
}

const landed = (status: string) => status === "applied" || status === "already-applied";

export function createItemResourceCommands(
  ports: ItemResourceCommandPorts
): ItemResourceCommandApi {
  const occurrenceId = ports.occurrenceId ?? (() => crypto.randomUUID());
  const { notifyConflict, requestInput } = ports;

  const commit: ItemResourceCommandApi["commit"] = (prepared) => {
    const character = ports.character();
    if (
      prepared.recipe.kind === "spend" &&
      (!character || !hasActiveSpendOwner(character, prepared.recipe.identity))
    ) {
      notifyConflict();
      return null;
    }
    const result = ports.applyOperation(
      prepared.item,
      prepared.binding,
      prepared.operation
    );
    if (landed(result.status)) return { prepared };
    notifyConflict();
    return null;
  };

  const commitBoundary: ItemResourceCommandApi["commitBoundary"] = (prepared) => {
    if (landed(ports.applyOperations(prepared.entries).status)) return { prepared };
    notifyConflict();
    return null;
  };

  return {
    prepare: async (initialRecipe, sourceName) => {
      const character = ports.character();
      if (!character || ports.readonly()) return null;
      const identity = initialRecipe.identity;
      const item = itemDefinition(character, identity.itemId);
      if (!item) {
        notifyConflict();
        return null;
      }
      if (initialRecipe.kind === "spend" && !hasActiveSpendOwner(character, identity)) {
        notifyConflict();
        return null;
      }

      // Freeze the observed revision across the input flow. A remote/local edit
      // while the prompt is open then loses the store CAS instead of silently
      // rebasing the player's reviewed command onto different state.
      const state = character.session.itemResources?.[identity.instanceId];
      const commandOccurrenceId = occurrenceId();
      let recipe: ItemResourceCommandRecipe = initialRecipe;
      for (;;) {
        const result = prepareItemResourceCommand({
          item,
          state,
          recipe,
          occurrenceId: commandOccurrenceId,
        });
        if (result.status === "prepared") return result.prepared;
        if (result.status !== "pending-input") {
          notifyConflict();
          return null;
        }
        const answers = await requestInput(sourceName, result.requests);
        if (!answers) return null;
        recipe = answerItemResourceInputs(recipe, result.requests, answers);
      }
    },

    prepareBoundary: async (trigger) => {
      const character = ports.character();
      if (!character || ports.readonly()) return null;
      // Freeze the candidate set for the complete input interval. The store's
      // whole-batch CAS revalidates every addressed physical copy at commit.
      const equipment = structuredClone(character.character.equipment);
      const itemResources = structuredClone(character.session.itemResources);
      const facts: ItemResourceBoundaryFact[] = [];
      const boundaryOccurrenceId = occurrenceId();

      for (;;) {
        const result = prepareItemResourceBoundary({
          trigger,
          occurrenceId: boundaryOccurrenceId,
          equipment,
          catalogue: SRD_MAGIC_ITEMS,
          itemResources,
          facts,
        });
        if (result.status === "prepared") return result.prepared;
        if (result.status !== "pending-input") {
          notifyConflict();
          return null;
        }

        // Group by exact physical resource. Different request kinds for one copy
        // share a prompt; another copy gets its own answer map, so equal kinds can
        // never collide across two wands.
        const groups = new Map<
          string,
          {
            identity: ItemResourceBoundaryInputRequest["identity"];
            requests: ItemResourceBoundaryInputRequest[];
          }
        >();
        for (const pending of result.requests) {
          const group = groups.get(pending.identity.key) ?? {
            identity: pending.identity,
            requests: [],
          };
          group.requests.push(pending);
          groups.set(pending.identity.key, group);
        }
        for (const group of groups.values()) {
          const copies = equipment.filter(
            (entry) => itemCopyItemId(entry) === group.identity.itemId
          );
          const copyIndex = copies.findIndex(
            (entry) => entry.instanceId === group.identity.instanceId
          );
          const sourceName = ports.itemName(
            group.identity.itemId,
            copies.length > 1 && copyIndex >= 0 ? copyIndex + 1 : null
          );
          const requests: ResourceInputRequest[] = group.requests.map((request) => ({
            kind: request.kind,
            resourceId: request.resourceId,
            roll: request.roll,
            min: request.min,
            max: request.max,
          }));
          const answers = await requestInput(sourceName, requests);
          if (!answers) return null;
          for (const request of group.requests) {
            const value = answers.get(request.kind);
            if (value === undefined) {
              notifyConflict();
              return null;
            }
            facts.push({
              identity: structuredClone(group.identity),
              kind: request.kind,
              value,
            });
          }
        }
      }
    },

    commit,
    commitBoundary,

    replay: (committed) => {
      const { prepared } = committed;
      const character = ports.character();
      if (!character) return null;
      if (
        prepared.recipe.kind === "spend" &&
        !hasActiveSpendOwner(character, prepared.recipe.identity)
      ) {
        notifyConflict();
        return null;
      }
      const state = character.session.itemResources?.[prepared.binding.instanceId];
      const result = prepareItemResourceCommand({
        item: prepared.item,
        state,
        recipe: prepared.recipe,
        occurrenceId: occurrenceId(),
      });
      // Redo reuses the originally entered facts and never asks again. If the live
      // state now needs different facts, the old act no longer applies.
      if (result.status !== "prepared") {
        notifyConflict();
        return null;
      }
      return commit(result.prepared);
    },

    revert: (committed) => {
      const { prepared } = committed;
      const state =
        ports.character()?.session.itemResources?.[prepared.binding.instanceId];
      if (!state) {
        notifyConflict();
        return false;
      }
      const result = prepareItemResourceRevert({
        prepared,
        state,
        occurrenceId: occurrenceId(),
      });
      if (result.status !== "planned") {
        notifyConflict();
        return false;
      }
      if (
        landed(
          ports.applyOperation(prepared.item, prepared.binding, result.operation).status
        )
      )
        return true;
      notifyConflict();
      return false;
    },

    revertBoundary: (committed) => {
      const result = prepareItemResourceBoundaryRevert({
        original: committed.prepared,
        occurrenceId: occurrenceId(),
        itemResources: ports.character()?.session.itemResources,
      });
      if (result.status !== "prepared") {
        notifyConflict();
        return false;
      }
      if (landed(ports.applyOperations(result.prepared.entries).status)) return true;
      notifyConflict();
      return false;
    },

    replayBoundary: (committed) => {
      const result = prepareItemResourceBoundaryReplay({
        original: committed.prepared,
        occurrenceId: occurrenceId(),
        itemResources: ports.character()?.session.itemResources,
      });
      // Redo is fact-preserving and prompt-free. A newly required input means the
      // original act no longer applies to live state, so leave redo available.
      if (result.status !== "prepared") {
        notifyConflict();
        return null;
      }
      return commitBoundary(result.prepared);
    },
  };
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

/** The one open input prompt: what to ask, keyed so each opening is a fresh form. */
export interface PendingItemResourceInput {
  key: number;
  sourceName: string;
  requests: readonly ResourceInputRequest[];
}

/**
 * The input prompt as a plain channel: `request` opens it and resolves when the
 * player answers (`settle`); a UI renders `current()` and re-renders on `subscribe`.
 * Only one prompt is open at a time: a second request while one is open fails
 * closed (null) rather than stranding the first command.
 */
export function createItemResourceInputPrompt() {
  let pending: PendingItemResourceInput | null = null;
  let resolve: ((answer: ItemResourceInputAnswer) => void) | null = null;
  let nextKey = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    request: (
      sourceName: string,
      requests: readonly ResourceInputRequest[]
    ): Promise<ItemResourceInputAnswer> =>
      new Promise((done) => {
        if (resolve) {
          done(null);
          return;
        }
        resolve = done;
        nextKey += 1;
        pending = { key: nextKey, sourceName, requests };
        emit();
      }),
    settle: (answer: ItemResourceInputAnswer): void => {
      const done = resolve;
      resolve = null;
      pending = null;
      emit();
      done?.(answer);
    },
    current: (): PendingItemResourceInput | null => pending,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
