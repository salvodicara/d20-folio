/**
 * Spells-tab summary sections — the brass cast-summary strip (Save DC / Spell Atk
 * / Prepared / Ability + inline slot cells), the prepared-over-limit warning
 * banner, and the spell-level filter chips. All presentational: fed the
 * presenter's {@link CastSummaryVM} + {@link SlotSummaryVM} + the level groups;
 * every override edits through the orchestrator's callbacks. Raw numbers are
 * formatted at this edge (`fmtMod`, "x / y"); APP labels resolve via `t(...)`.
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { BreakdownTip } from "@/components/shared/BreakdownTip";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import type {
  CastSummaryVM,
  SlotSummaryVM,
  SpellLevelGroupVM,
} from "@/lib/views/spells-view";
import { fmtMod } from "./spell-card-helpers";

/** Spell-level → chromatic seal CSS var (cantrip = --sl-c). */
function spellLevelVar(level: number): string {
  return level <= 0 ? "var(--sl-c)" : `var(--sl-${level})`;
}

export interface CastSummaryCallbacks {
  onSaveDCOverride: (value: number | null) => void;
  onAttackOverride: (value: number | null) => void;
  onPreparedMaxOverride: (value: number) => void;
  onPreparedMaxReset: () => void;
  onSlotTotal: (level: number, total: number, pactMagic: boolean) => void;
  onSlotReset: (level: number, pactMagic: boolean) => void;
}

export function SpellCastSummary({
  summary,
  slots,
  isEdit,
  onSaveDCOverride,
  onAttackOverride,
  onPreparedMaxOverride,
  onPreparedMaxReset,
  onSlotTotal,
  onSlotReset,
}: {
  summary: CastSummaryVM;
  slots: SlotSummaryVM[];
  isEdit: boolean;
} & CastSummaryCallbacks) {
  const { t } = useTranslation();
  const {
    saveDC,
    pureSaveDC,
    attackBonus,
    pureAttackBonus,
    saveDCBreakdown,
    attackBreakdown,
    ability,
    isPreparedCaster,
    preparedCount,
    preparedMax,
    purePreparedMax,
    overLimit,
  } = summary;

  return (
    <div className="cast-summary">
      {/* P2 — each stat's LABEL is a GlossaryTip trigger, so the role="img"
          combined readout moves onto the NUMBER (an interactive child inside a
          role="img" container would be hidden from AT). The readout applies
          ONLY to the STATIC number: in edit mode the InlineEditable owns its own
          aria-label, and a BreakdownTip is an interactive button that role="img"
          would hide from AT — so neither gets wrapped in role="img". */}
      {saveDC != null && (
        <div className="cast-stat">
          <span
            className="cs-num"
            role={isEdit || saveDCBreakdown.length > 1 ? undefined : "img"}
            aria-label={
              isEdit || saveDCBreakdown.length > 1
                ? undefined
                : `${t("spells.spellDC")}: ${saveDC}`
            }
          >
            {isEdit ? (
              <InlineEditable
                type="number"
                editable
                value={saveDC}
                computedValue={pureSaveDC ?? saveDC}
                min={1}
                max={40}
                onChange={(v) => onSaveDCOverride(v)}
                onReset={() => onSaveDCOverride(null)}
                ariaLabel={t("spells.spellDC")}
              />
            ) : saveDCBreakdown.length > 1 ? (
              <BreakdownTip label={String(saveDC)} lines={saveDCBreakdown} />
            ) : (
              saveDC
            )}
          </span>
          <span className="cs-lbl">
            <GlossaryTip term="spellSaveDc" rubric={t("spells.spellDC")} />
          </span>
        </div>
      )}
      {attackBonus != null && (
        <div className="cast-stat">
          <span
            className="cs-num"
            role={isEdit || attackBreakdown.length > 1 ? undefined : "img"}
            aria-label={
              isEdit || attackBreakdown.length > 1
                ? undefined
                : `${t("spells.spellAtk")}: ${fmtMod(attackBonus)}`
            }
          >
            {isEdit ? (
              <InlineEditable
                type="number"
                editable
                value={attackBonus}
                computedValue={pureAttackBonus ?? attackBonus}
                min={-10}
                max={30}
                format={fmtMod}
                onChange={(v) => onAttackOverride(v)}
                onReset={() => onAttackOverride(null)}
                ariaLabel={t("spells.spellAtk")}
              />
            ) : attackBreakdown.length > 1 ? (
              <BreakdownTip label={fmtMod(attackBonus)} lines={attackBreakdown} />
            ) : (
              fmtMod(attackBonus)
            )}
          </span>
          <span className="cs-lbl">
            <GlossaryTip term="spellAttack" rubric={t("spells.spellAtk")} />
          </span>
        </div>
      )}
      {isPreparedCaster && preparedMax > 0 && (
        <>
          <span className="div-vert" aria-hidden />
          <div className={cn("cast-stat", overLimit && "warn")}>
            <span
              className="cs-num"
              role={isEdit ? undefined : "img"}
              aria-label={
                isEdit
                  ? undefined
                  : `${t("spells.prepared")}: ${preparedCount} / ${preparedMax}`
              }
            >
              {preparedCount} /{" "}
              {isEdit ? (
                <InlineEditable
                  type="number"
                  editable
                  value={preparedMax}
                  computedValue={purePreparedMax}
                  min={0}
                  max={99}
                  onChange={onPreparedMaxOverride}
                  onReset={onPreparedMaxReset}
                  ariaLabel={t("spells.preparedMax")}
                />
              ) : (
                preparedMax
              )}
            </span>
            <span className="cs-lbl">
              <GlossaryTip term="preparedSpells" rubric={t("spells.prepared")} />
            </span>
          </div>
        </>
      )}
      <div
        className="cast-stat"
        role="img"
        aria-label={`${t("spells.ability")}: ${t(`abilities.${ability}`)}`}
      >
        <span className="cs-num" aria-hidden>
          {t(`abilities.${ability}_short`)}
        </span>
        <span className="cs-lbl" aria-hidden>
          {t("spells.ability")}
        </span>
      </div>

      {isEdit && slots.length > 0 && (
        <div className="cast-slots">
          {slots.map((slot) => (
            <div
              key={slot.pactMagic ? `pact-${slot.level}` : slot.level}
              className={cn(
                "slot-cell",
                "editing",
                slot.pactMagic && "pact",
                slot.remaining === 0 && "depleted"
              )}
              style={{ ["--sl" as string]: spellLevelVar(slot.level) }}
            >
              <span className="sc-lvl" aria-hidden>
                {slot.level}
                {slot.pactMagic ? "P" : ""}
              </span>
              <span className="sc-pips" aria-hidden>
                {Array.from({ length: slot.total }).map((_, i) => (
                  <span key={i} className={cn("sc-pip", i >= slot.remaining && "used")} />
                ))}
              </span>
              <Input
                type="number"
                min={1}
                max={9}
                value={slot.total}
                onChange={(e) => {
                  // Clamp min 1: a 0 override would filter the row out of
                  // `spellSlots`, stranding the override with no cell to reset from.
                  const val = Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1));
                  onSlotTotal(slot.level, val, slot.pactMagic);
                }}
                className="sm slot-edit"
                aria-label={t("spells.editSlotTotal", { level: slot.level })}
              />
              <span className="slot-edit-lbl" aria-hidden>
                {t("spells.slotTotalLabel")}
              </span>
              {slot.overridden && (
                <button
                  type="button"
                  className="inline-edit-reset"
                  onClick={() => onSlotReset(slot.level, slot.pactMagic)}
                  title={t("common.resetToAuto")}
                  aria-label={t("common.resetToAuto")}
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The prepared-over-limit warning banner (honest blank when within limit). */
export function PreparedOverLimitWarning({
  preparedCount,
  preparedMax,
  isEdit,
  onPreparedMaxOverride,
}: {
  preparedCount: number;
  preparedMax: number;
  isEdit: boolean;
  onPreparedMaxOverride: (value: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="prep-warn" role="status">
      <Icon as={AlertTriangle} size="sm" decorative />
      <span>
        {t("spells.prepared")} {preparedCount} / {preparedMax}{" "}
        <em>{t("spells.preparedOverLimit")}</em>
      </span>
      {isEdit && (
        <Input
          type="number"
          min={1}
          max={30}
          value={preparedMax}
          onChange={(e) => {
            const v = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1));
            onPreparedMaxOverride(v);
          }}
          className="sm"
          style={{ width: 48, marginLeft: "auto" }}
          aria-label={t("abilities.preparedMaxLabel")}
        />
      )}
    </div>
  );
}

/** The spell-level filter chips (All + one per populated level) + the
 * concentration facet (Constitution §2.5 — "which spells require
 * concentration?" is a one-tap answer, not a mental scan of the ◎ marks).
 * Renders nothing for an empty spellbook (an "All 0" chip filters nothing). */
export function SpellLevelFilter({
  levels,
  filterLevel,
  onFilter,
  concOnly,
  onToggleConc,
  concCount,
}: {
  levels: SpellLevelGroupVM[];
  filterLevel: number | "all";
  onFilter: (level: number | "all") => void;
  concOnly: boolean;
  onToggleConc: () => void;
  concCount: number;
}) {
  const { t } = useTranslation();
  if (levels.length === 0) return null;
  return (
    <div className="filters">
      <div className="fchip-group" role="group" aria-label={t("spells.filterByLevel")}>
        <button
          type="button"
          className="fchip"
          aria-pressed={filterLevel === "all"}
          onClick={() => onFilter("all")}
        >
          {t("common.all")}
          <span className="fc-count" aria-hidden>
            {levels.reduce((acc, g) => acc + g.spells.length, 0)}
          </span>
        </button>
        {levels.map((g) => (
          <button
            key={g.level}
            type="button"
            className="fchip"
            aria-pressed={filterLevel === g.level}
            onClick={() => onFilter(g.level)}
          >
            {g.level === 0
              ? t("spells.cantrips")
              : t("spells.levelShort", { level: g.level })}
            <span className="fc-count" aria-hidden>
              {g.spells.length}
            </span>
            <span className="sr-only">
              {t("spells.filterCount", { count: g.spells.length })}
            </span>
          </button>
        ))}
        {/* Honest blank: no concentration spells → no facet to offer. */}
        {concCount > 0 && (
          <button
            type="button"
            className="fchip"
            aria-pressed={concOnly}
            aria-label={t("spells.filterConcentration")}
            onClick={onToggleConc}
          >
            {t("spells.concentrationShort")}
            <span className="fc-count" aria-hidden>
              {concCount}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
