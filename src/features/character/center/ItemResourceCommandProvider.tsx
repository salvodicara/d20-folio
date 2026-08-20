/**
 * One prepare/input/commit controller for typed physical-item resources.
 *
 * It is deliberately mounted above both TurnEconomyProvider and the tab body:
 * combat actions and out-of-combat spell casts therefore share the same planner,
 * modal, CAS boundary, redo facts, and causal undo protocol.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ItemResourceInputModal } from "@/components/sheet/ItemResourceInputModal";
import { MAGIC_ITEMS_BY_ID, SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { attunementSatisfied } from "@/lib/attunement";
import {
  prepareItemResourceBoundary,
  prepareItemResourceBoundaryReplay,
  prepareItemResourceBoundaryRevert,
  type ItemResourceBoundaryFact,
  type ItemResourceBoundaryInputRequest,
} from "@/lib/item-resource-boundaries";
import {
  answerItemResourceInputs,
  prepareItemResourceCommand,
  prepareItemResourceRevert,
  type ItemResourceCommandRecipe,
} from "@/lib/item-resource-commands";
import type { ResourceInputRequest, ResourceItemSpec } from "@/lib/resources";
import { localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import type { CharacterDoc } from "@/types/character";
import {
  ItemResourceCommandContext,
  type ItemResourceCommandApi,
} from "./useItemResourceCommands";

interface PendingInput {
  key: number;
  sourceName: string;
  requests: readonly ResourceInputRequest[];
}

type InputAnswer = ReadonlyMap<ResourceInputRequest["kind"], number> | null;

function occurrenceId(): string {
  return crypto.randomUUID();
}

function itemDefinition(itemId: string): ResourceItemSpec | null {
  const item = MAGIC_ITEMS_BY_ID.get(itemId);
  return item?.resources?.length ? { itemId: item.id, resources: item.resources } : null;
}

/** A spend is legal only while the exact physical copy is still an active item
 * source. This is rechecked after every input interval and on redo; semantic
 * reverts deliberately remain legal after unequip so undo can always restore. */
function hasActiveSpendOwner(
  character: CharacterDoc,
  identity: ItemResourceCommandRecipe["identity"]
): boolean {
  const owners = character.character.equipment.filter(
    (entry) =>
      !("custom" in entry) &&
      entry.srdId === identity.itemId &&
      entry.instanceId === identity.instanceId
  );
  const owner = owners[0];
  if (
    owners.length !== 1 ||
    !owner ||
    "custom" in owner ||
    owner.equipped !== true ||
    !attunementSatisfied(owner)
  ) {
    return false;
  }
  const state = character.session.itemResources?.[identity.instanceId];
  return (
    !state ||
    (state.itemId === identity.itemId &&
      state.instanceId === identity.instanceId &&
      state.disposition === "magical")
  );
}

export function ItemResourceCommandProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null);
  const inputResolver = useRef<((answer: InputAnswer) => void) | null>(null);
  const nextInputKey = useRef(0);

  const notifyConflict = useCallback(() => {
    useToastStore.getState().showToast({
      message: t("magicItems.resourceConflict"),
      duration: 5000,
    });
  }, [t]);

  const settleInput = useCallback((answer: InputAnswer) => {
    const resolve = inputResolver.current;
    inputResolver.current = null;
    setPendingInput(null);
    resolve?.(answer);
  }, []);

  useEffect(
    () => () => {
      inputResolver.current?.(null);
      inputResolver.current = null;
    },
    []
  );

  const requestInput = useCallback(
    (
      sourceName: string,
      requests: readonly ResourceInputRequest[]
    ): Promise<InputAnswer> =>
      new Promise((resolve) => {
        // A Radix modal makes the underlying sheet inert, so normal interaction
        // cannot overlap requests. Still fail closed if a programmatic caller
        // races one: never replace the resolver and strand the first command.
        if (inputResolver.current) {
          resolve(null);
          return;
        }
        inputResolver.current = resolve;
        nextInputKey.current += 1;
        setPendingInput({ key: nextInputKey.current, sourceName, requests });
      }),
    []
  );

  const prepare = useCallback<ItemResourceCommandApi["prepare"]>(
    async (initialRecipe, sourceName) => {
      const store = useCharacterStore.getState();
      const character = store.character;
      if (!character || store.readonly) return null;
      const identity = initialRecipe.identity;
      const item = itemDefinition(identity.itemId);
      if (!item) {
        notifyConflict();
        return null;
      }
      if (initialRecipe.kind === "spend" && !hasActiveSpendOwner(character, identity)) {
        notifyConflict();
        return null;
      }

      // Freeze the observed revision across the input flow. A remote/local edit
      // while the modal is open then loses the store CAS instead of silently
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
    [notifyConflict, requestInput]
  );

  const prepareBoundary = useCallback<ItemResourceCommandApi["prepareBoundary"]>(
    async (trigger) => {
      const store = useCharacterStore.getState();
      const character = store.character;
      if (!character || store.readonly) return null;
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
        // share a modal; another copy gets its own answer map, so equal kinds can
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
            (entry) => !("custom" in entry) && entry.srdId === group.identity.itemId
          );
          const copyIndex = copies.findIndex(
            (entry) =>
              !("custom" in entry) && entry.instanceId === group.identity.instanceId
          );
          const itemName = localizeSrd(
            "magic-item",
            group.identity.itemId,
            "name",
            locale
          );
          const sourceName =
            copies.length > 1 && copyIndex >= 0
              ? t("magicItems.resourceCopy", {
                  name: itemName,
                  number: copyIndex + 1,
                })
              : itemName;
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
    [locale, notifyConflict, requestInput, t]
  );

  const commit = useCallback<ItemResourceCommandApi["commit"]>(
    (prepared) => {
      const store = useCharacterStore.getState();
      if (
        prepared.recipe.kind === "spend" &&
        (!store.character ||
          !hasActiveSpendOwner(store.character, prepared.recipe.identity))
      ) {
        notifyConflict();
        return null;
      }
      const result = store.applyItemResourceOperation(
        prepared.item,
        prepared.binding,
        prepared.operation
      );
      if (result.status === "applied" || result.status === "already-applied") {
        return { prepared };
      }
      notifyConflict();
      return null;
    },
    [notifyConflict]
  );

  const commitBoundary = useCallback<ItemResourceCommandApi["commitBoundary"]>(
    (prepared) => {
      const result = useCharacterStore
        .getState()
        .applyItemResourceOperations(prepared.entries);
      if (result.status === "applied" || result.status === "already-applied") {
        return { prepared };
      }
      notifyConflict();
      return null;
    },
    [notifyConflict]
  );

  const replay = useCallback<ItemResourceCommandApi["replay"]>(
    (committed) => {
      const { prepared } = committed;
      const character = useCharacterStore.getState().character;
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
      // Redo reuses the originally entered facts and never opens new UI. If the
      // live state now needs different facts, the old act no longer applies.
      if (result.status !== "prepared") {
        notifyConflict();
        return null;
      }
      return commit(result.prepared);
    },
    [commit, notifyConflict]
  );

  const revert = useCallback<ItemResourceCommandApi["revert"]>(
    (committed) => {
      const { prepared } = committed;
      const character = useCharacterStore.getState().character;
      const state = character?.session.itemResources?.[prepared.binding.instanceId];
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
      const applied = useCharacterStore
        .getState()
        .applyItemResourceOperation(prepared.item, prepared.binding, result.operation);
      if (applied.status === "applied" || applied.status === "already-applied") {
        return true;
      }
      notifyConflict();
      return false;
    },
    [notifyConflict]
  );

  const revertBoundary = useCallback<ItemResourceCommandApi["revertBoundary"]>(
    (committed) => {
      const itemResources = useCharacterStore.getState().character?.session.itemResources;
      const result = prepareItemResourceBoundaryRevert({
        original: committed.prepared,
        occurrenceId: occurrenceId(),
        itemResources,
      });
      if (result.status !== "prepared") {
        notifyConflict();
        return false;
      }
      const applied = useCharacterStore
        .getState()
        .applyItemResourceOperations(result.prepared.entries);
      if (applied.status === "applied" || applied.status === "already-applied") {
        return true;
      }
      notifyConflict();
      return false;
    },
    [notifyConflict]
  );

  const replayBoundary = useCallback<ItemResourceCommandApi["replayBoundary"]>(
    (committed) => {
      const itemResources = useCharacterStore.getState().character?.session.itemResources;
      const result = prepareItemResourceBoundaryReplay({
        original: committed.prepared,
        occurrenceId: occurrenceId(),
        itemResources,
      });
      // Redo is fact-preserving and UI-free. A newly required input means the
      // original act no longer applies to live state, so leave redo available.
      if (result.status !== "prepared") {
        notifyConflict();
        return null;
      }
      return commitBoundary(result.prepared);
    },
    [commitBoundary, notifyConflict]
  );

  const value = useMemo<ItemResourceCommandApi>(
    () => ({
      prepare,
      commit,
      replay,
      revert,
      prepareBoundary,
      commitBoundary,
      replayBoundary,
      revertBoundary,
    }),
    [
      commit,
      commitBoundary,
      prepare,
      prepareBoundary,
      replay,
      replayBoundary,
      revert,
      revertBoundary,
    ]
  );

  return (
    <ItemResourceCommandContext.Provider value={value}>
      {children}
      <ItemResourceInputModal
        key={pendingInput?.key ?? "closed"}
        request={
          pendingInput
            ? {
                sourceName: pendingInput.sourceName,
                requests: pendingInput.requests,
              }
            : null
        }
        onConfirm={(answers) => settleInput(answers)}
        onCancel={() => settleInput(null)}
      />
    </ItemResourceCommandContext.Provider>
  );
}
