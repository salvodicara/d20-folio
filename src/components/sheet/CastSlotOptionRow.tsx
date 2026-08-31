import { useTranslation } from "react-i18next";

import { spellLevelVar } from "@/components/shared/folio-colors";
import {
  damageAtSlotLevel,
  healAtSlotLevel,
  type CastSlotScalingFacts,
} from "@/lib/views/cast-slot-preview";

export interface CastSlotOptionRowProps {
  readonly baseLevel: number;
  readonly level: number;
  readonly onSelect: () => void;
  readonly pactMagic?: boolean;
  readonly remaining: number;
  readonly total: number;
  readonly upcast?: CastSlotScalingFacts;
}

/**
 * One non-mutating spell-slot choice. The whole row answers the surrounding
 * cast flow; the gem sockets are deliberately decorative so they cannot spend
 * a second slot before the engine commits the chosen payment.
 */
export function CastSlotOptionRow({
  baseLevel,
  level,
  onSelect,
  pactMagic = false,
  remaining,
  total,
  upcast,
}: CastSlotOptionRowProps) {
  const { t } = useTranslation();
  const available = Math.max(0, Math.min(total, remaining));
  const damage = damageAtSlotLevel(upcast, level);
  const heal = healAtSlotLevel(upcast, level);

  return (
    <button
      type="button"
      className="cl-opt cl-slot"
      style={{ ["--sl" as string]: spellLevelVar(level) }}
      onClick={onSelect}
    >
      <span className="cl-seal" aria-hidden>
        {level}
      </span>
      <span className="sr-only">
        {level === baseLevel
          ? t("combat.castSlotBaseAria", { level })
          : t("combat.castSlotUpAria", { level })}
      </span>
      <span className="cl-name" aria-hidden>
        {level === baseLevel
          ? t("combat.castLevelBase", { level })
          : t("combat.castLevelUp", { level })}
      </span>
      {damage && <span className="cl-dmg">{damage}</span>}
      {heal && <span className="cl-heal">{heal}</span>}
      {pactMagic && <span className="cl-tag">{t("combat.pactSlotBadge")}</span>}
      <span className="cl-slot-pips sc-pips" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={index >= available ? "sc-pip used" : "sc-pip"} />
        ))}
      </span>
      <span className="cl-count">
        {available}/{total}
      </span>
    </button>
  );
}
