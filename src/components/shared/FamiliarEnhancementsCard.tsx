/**
 * FamiliarEnhancementsCard — the shared render of a character's familiar
 * enhancements (Warlock Investment of the Chain Master). ONE component (golden
 * rule 6) mounted by BOTH the compendium invocation detail AND the Companions
 * rail's familiar stat-block modal, so the two can never drift.
 *
 * Pure display of the already-tested `resolveFamiliarEnhancements` view; the owner's
 * "Your Save DC" line reuses the spells-view presenter so it can't diverge from the
 * sheet. Override-first — the engine never commands the familiar (the player applies
 * the Bonus-Action attack / damage swap / Reaction manually). Renders `null` when no
 * source grants an enhancement.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InfoCard } from "@/components/shared/InfoCard";
import { primaryClassId } from "@/lib/classes";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { resolveFamiliarEnhancements } from "@/lib/compute";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import { localeDistance } from "@/lib/utils";
import type { CharacterDoc } from "@/types/character";
import type { Locale } from "@/lib/locale";

export function FamiliarEnhancementsCard({
  character,
  locale,
}: {
  character: CharacterDoc;
  locale: Locale;
}): ReactNode {
  const { t } = useTranslation();
  // The owner's effective spell save DC — reuse the spells-view presenter so the
  // familiar's "Your Save DC" line can't drift from the sheet (golden rule 6).
  const ownerSaveDc =
    buildSpellsViewModel(character, primaryClassId(character.character), locale, false)
      .castSummary?.saveDC ?? 0;
  const view = resolveFamiliarEnhancements(
    aggregateCharacterGrants(character.character, character.session).familiarEnhancements,
    ownerSaveDc
  );
  if (!view.present) return null;

  const rows: { label: string; value: string }[] = [];
  if (view.extraSpeedFt != null && view.extraSpeedModes.length > 0) {
    rows.push({
      label: view.extraSpeedModes.map((m) => t(`familiar.speedMode_${m}`)).join(" / "),
      value: localeDistance(view.extraSpeedFt, locale),
    });
  }
  if (view.bonusActionAttack) {
    rows.push({
      label: t("familiar.bonusActionAttack"),
      value: t("familiar.bonusActionAttackValue"),
    });
  }
  if (view.damageTypeConversion.length > 0) {
    rows.push({
      label: t("familiar.damageConversion"),
      value: view.damageTypeConversion.map((dt) => t(`srd.damage_${dt}`)).join(" / "),
    });
  }
  if (view.saveDc != null) {
    rows.push({ label: t("familiar.saveDc"), value: String(view.saveDc) });
  }
  if (view.reactionResistance) {
    rows.push({
      label: t("familiar.reactionResistance"),
      value: t("familiar.reactionResistanceValue"),
    });
  }

  return (
    <InfoCard>
      <div className="mb-2 text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
        {t("familiar.section")}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 text-[0.72rem] text-text-primary"
          >
            <span className="text-text-secondary">{r.label}</span>
            <span className="font-mono">{r.value}</span>
          </div>
        ))}
      </div>
    </InfoCard>
  );
}
