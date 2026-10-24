/** Shared transaction seam for every physical magic-item resource consumer. The
 * controller itself is {@link "@/lib/item-resource-controller"}; this is its React
 * context. */

import { createContext, useContext } from "react";
import type { ItemResourceCommandApi } from "@/lib/item-resource-controller";

export {
  createItemResourceBoundaryCycle,
  createItemResourcePaymentCycle,
  type CommittedItemResourceBoundary,
  type CommittedItemResourceCommand,
  type ItemResourceCommandApi,
} from "@/lib/item-resource-controller";

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
