/**
 * Mounts the item-resource controller ({@link createItemResourceCommands}) with the
 * live store, the toast and the input modal as its ports.
 *
 * It is deliberately mounted above both TurnEconomyProvider and the tab body:
 * combat actions and out-of-combat spell casts therefore share the same planner,
 * modal, CAS boundary, redo facts, and causal undo protocol.
 */

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { ItemResourceInputModal } from "@/components/sheet/ItemResourceInputModal";
import {
  createItemResourceCommands,
  createItemResourceInputPrompt,
} from "@/lib/item-resource-controller";
import { localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";
import { useCharacterStore } from "@/stores/characterStore";
import {
  usePublishPlayPrompt,
  type PlayPrompts,
} from "@/features/character/center/playPromptStore";
import { useToastStore } from "@/stores/toastStore";
import { ItemResourceCommandContext } from "./useItemResourceCommands";

export function ItemResourceCommandProvider({
  children,
  renderPrompts = true,
}: {
  children: ReactNode;
  /** Draw the old sheet's input dialog; false when the screen draws its own (playPromptStore). */
  renderPrompts?: boolean;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [prompt] = useState(createItemResourceInputPrompt);
  const pendingInput = useSyncExternalStore(prompt.subscribe, prompt.current);

  // An unmounted sheet answers nothing: the waiting command ends without paying.
  useEffect(() => () => prompt.settle(null), [prompt]);

  const value = useMemo(
    () =>
      createItemResourceCommands({
        character: () => useCharacterStore.getState().character,
        readonly: () => useCharacterStore.getState().readonly,
        applyOperation: (item, binding, operation) =>
          useCharacterStore
            .getState()
            .applyItemResourceOperation(item, binding, operation),
        applyOperations: (entries) =>
          useCharacterStore.getState().applyItemResourceOperations(entries),
        requestInput: prompt.request,
        notifyConflict: () =>
          useToastStore.getState().showToast({
            message: t("magicItems.resourceConflict"),
            duration: 5000,
          }),
        notifySpeechBlocked: () =>
          useToastStore.getState().showToast({
            message: t("magicItems.commandWordBlocked"),
            duration: 4000,
          }),
        itemName: (itemId, copyNumber) => {
          const name = localizeSrd("magic-item", itemId, "name", locale);
          return copyNumber === null
            ? name
            : t("magicItems.resourceCopy", { name, number: copyNumber });
        },
      }),
    [locale, prompt, t]
  );

  const inputPrompt: PlayPrompts["item-resource-input"] | null = useMemo(
    () =>
      pendingInput
        ? {
            request: {
              sourceName: pendingInput.sourceName,
              requests: pendingInput.requests,
            },
            onConfirm: (answers) => prompt.settle(answers),
            onCancel: () => prompt.settle(null),
          }
        : null,
    [pendingInput, prompt]
  );
  usePublishPlayPrompt("item-resource-input", inputPrompt);

  return (
    <ItemResourceCommandContext.Provider value={value}>
      {children}
      {renderPrompts && (
        <ItemResourceInputModal
          key={pendingInput?.key ?? "closed"}
          request={inputPrompt?.request ?? null}
          onConfirm={(answers) => prompt.settle(answers)}
          onCancel={() => prompt.settle(null)}
        />
      )}
    </ItemResourceCommandContext.Provider>
  );
}
