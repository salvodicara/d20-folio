/**
 * SellButton — "Sell for 37 gp 5 sp" on a priced catalogue row: one tap sells ONE at
 * half the list price (SRD "Selling Treasure"), undoable and logged by the caller.
 */
import { useTranslation } from "react-i18next";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { coinsText } from "@/lib/play/purchase";

export function SellButton({ cp, onSell }: { cp: number; onSell: () => void }) {
  const { t } = useTranslation();
  if (cp <= 0) return null;
  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="secondary"
        title={t("equipment.sellHint")}
        onClick={(e) => {
          e.stopPropagation();
          onSell();
        }}
      >
        <Icon as={Coins} size="sm" decorative />
        {t("equipment.sell", { price: coinsText(cp, t) })}
      </Button>
    </div>
  );
}
