/** Standalone one-unit spend flow for a physical item's typed resource. */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { itemResourceSpend } from "@/lib/item-resource-commands";
import type { ItemResourceVM } from "@/lib/views/item-resource-view";
import { registerUndoableToast } from "@/stores/undoStore";
import {
  createItemResourcePaymentCycle,
  useOptionalItemResourceCommands,
} from "./center/useItemResourceCommands";

export function useItemResourceSpend() {
  const { t } = useTranslation();
  const commands = useOptionalItemResourceCommands();

  const spend = useCallback(
    async (resource: ItemResourceVM, sourceName: string): Promise<boolean> => {
      if (!commands) return false;
      const prepared = await commands.prepare(
        itemResourceSpend(resource.identity, 1),
        sourceName
      );
      if (!prepared) return false;

      const cycle = createItemResourcePaymentCycle(commands, prepared);
      const capacity =
        prepared.operation.after.resources[resource.identity.resourceId]?.capacity ??
        resource.capacity ??
        prepared.receipt.after;
      return (
        registerUndoableToast(
          {
            message: t("magicItems.resourceSpentToast", {
              name: sourceName,
              remaining: prepared.receipt.after,
              capacity,
              unit: t(resource.unitKey),
            }),
          },
          () => {
            const committed = cycle.apply();
            return committed ? () => commands.revert(committed) : null;
          },
          { turnScoped: false }
        ) !== null
      );
    },
    [commands, t]
  );

  return { available: commands != null, spend };
}
