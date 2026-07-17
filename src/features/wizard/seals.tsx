/**
 * Wizard seal atoms — thin wrappers over the app's canonical icon grammar
 * (golden rule 3 + the owner's round-6 correction: production icon recipes,
 * nothing invented).
 *
 *  - `SpellLevelSeal` — the cockpit's chromatic spell LEVEL seal (`.uc-seal
 *    lvl`, the SpellPicker / action-card recipe). Cantrips render the
 *    localized `spells.cantripSeal` glyph (EN "CAN" / IT "TRC"), never a
 *    bespoke "C" (owner round-6 correction).
 */
import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { spellLevelVar, spellLevelInkVar } from "@/components/shared/folio-colors";

/**
 * The GOLD socket seal — the wizard's ONE icon medallion (owner 2026-06-11:
 * every picker icon wears the same gold, never the cockpit's per-kind
 * pigments). Same physical mark as the feat list's star socket.
 */
export function SocketSeal({ icon }: { icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <span className="wiz-socket" aria-hidden>
      <Icon as={icon} size="sm" decorative />
    </span>
  );
}

export function SpellLevelSeal({ level }: { level: number }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn("uc-seal", "lvl", level === 0 && "cantrip")}
      style={{
        ["--sl" as string]: spellLevelVar(level),
        ["--sl-ink" as string]: spellLevelInkVar(level),
      }}
      aria-hidden
    >
      {level === 0 ? t("spells.cantripSeal") : level}
    </span>
  );
}
