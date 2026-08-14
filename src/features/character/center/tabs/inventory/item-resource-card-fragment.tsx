/** Shared typed-resource facts and controls for inventory item cards. */

import { RefreshCw, Zap } from "lucide-react";
import type { TFunction } from "i18next";
import type { ItemResourceVM } from "@/lib/views/item-resource-view";
import { ChargeUse } from "./ChargeUse";
import {
  itemResourceCountLabel,
  itemResourceRecoveryLabel,
} from "./inventory-card-helpers";

export function itemResourceCardFragment({
  resources,
  isPlay,
  onSpend,
  t,
}: {
  resources: readonly ItemResourceVM[];
  isPlay: boolean;
  onSpend: (resource: ItemResourceVM) => void;
  t: TFunction;
}) {
  const availableResources = resources.filter(
    (resource) => resource.available && !resource.disabled
  );

  return {
    unavailable: availableResources.length !== resources.length,
    hasControls: isPlay && availableResources.length > 0,
    facts: resources.flatMap((resource) => [
      {
        label: t(resource.labelKey),
        value: itemResourceCountLabel(resource, t),
        icon: Zap,
      },
      {
        label: t("magicItems.resourceRecovery"),
        value: itemResourceRecoveryLabel(resource, t),
        icon: RefreshCw,
      },
    ]),
    controls:
      isPlay &&
      availableResources.map((resource) => {
        const resourceLabel = t(resource.labelKey);
        return (
          <ChargeUse
            key={resource.identity.key}
            current={resource.current}
            max={resource.capacity}
            disabled={!resource.canSpend}
            uninitializedLabel={t("magicItems.resourceNeedsRoll")}
            onUse={() => onSpend(resource)}
            chargesLabel={resourceLabel}
            useLabel={t("common.use")}
            useTitle={t("magicItems.useResource", { resource: resourceLabel })}
          />
        );
      }),
  };
}
