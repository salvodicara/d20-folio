/** Compact Resources-rail row for one exact physical-item counter. */

import { useState } from "react";
import { Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useItemResourceSpend } from "@/features/character/useItemResourceSpend";
import {
  itemResourceRecoveryTranslationKey,
  type ItemResourceVM,
} from "@/lib/views/item-resource-view";

export function ItemResourceRailRow({
  resource,
  itemLabel,
  interactive,
}: {
  resource: ItemResourceVM;
  /** Already-localized physical-copy label; never an opaque instance id. */
  itemLabel: string;
  /** False in edit/read-only glass-case modes. */
  interactive: boolean;
}) {
  const { t } = useTranslation();
  const { available: spendAvailable, spend: spendItemResource } = useItemResourceSpend();
  const [inFlight, setInFlight] = useState(false);
  const resourceLabel = t(resource.labelKey);
  const rowLabel = `${itemLabel} · ${resourceLabel}`;
  const unavailable = !resource.available || resource.disabled;
  const countLabel =
    resource.current == null || resource.capacity == null
      ? t("magicItems.resourceNeedsRoll")
      : `${resource.current} / ${resource.capacity} ${t(resource.unitKey)}`;
  const recoveryLabel =
    resource.recoveryTriggers.length === 0
      ? t("combat.resourceRecoveryNone")
      : resource.recoveryTriggers
          .map((trigger) => t(itemResourceRecoveryTranslationKey(trigger)))
          .join(" · ");
  const recoveryStyle =
    resource.recoveryTriggers.length === 1
      ? resource.recoveryTriggers[0]?.kind === "long-rest"
        ? "long"
        : resource.recoveryTriggers[0]?.kind
      : undefined;

  function spend(): void {
    if (
      !interactive ||
      unavailable ||
      !resource.canSpend ||
      !spendAvailable ||
      inFlight
    ) {
      return;
    }
    setInFlight(true);
    void (async () => {
      try {
        await spendItemResource(resource, itemLabel);
      } finally {
        setInFlight(false);
      }
    })();
  }

  return (
    <div className="trk">
      <span className="trk-name" title={rowLabel}>
        {rowLabel}
      </span>
      {unavailable && (
        <span className="trk-die">{t("magicItems.resourceUnavailable")}</span>
      )}
      <span className="trk-rec" data-r={recoveryStyle}>
        {recoveryLabel}
      </span>
      <span className="trk-pool" aria-label={`${resourceLabel}: ${countLabel}`}>
        {resource.current == null || resource.capacity == null ? (
          countLabel
        ) : (
          <>
            <b>{resource.current}</b>/{resource.capacity} {t(resource.unitKey)}
          </>
        )}
      </span>
      {interactive && !unavailable && (
        <div className="trk-ctrl">
          <Button
            variant="neutral"
            size="sm"
            iconOnly
            aria-label={t("magicItems.useResource", { resource: rowLabel })}
            title={t("magicItems.useResource", { resource: rowLabel })}
            loading={inFlight}
            disabled={!spendAvailable || !resource.canSpend || inFlight}
            onClick={spend}
          >
            <Icon as={Minus} size="sm" decorative />
          </Button>
        </div>
      )}
    </div>
  );
}
