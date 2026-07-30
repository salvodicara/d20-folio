/**
 * Review-step components — the `CharacterPreviewCard` (the at-a-glance cartouche
 * shared with the cockpit chrome), the `HpModeSelector` (average / rolled HP),
 * the `ReviewLedger` (every choice, attributed to the step it was made on —
 * Constitution §2.4), and the `MissingRequirements` "almost there" explainer.
 * Display names arrive already localized; the class seal glyph is the
 * component-layer `classRoleSeal`. No SRD-string reads.
 */
import { useTranslation } from "react-i18next";
import { BookMarked, ListChecks, ChevronRight, ShieldCheck } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WizardForkTab } from "@/features/wizard/chrome";
import { classRoleSeal } from "./class-roles";
import type { GuidedStep } from "./steps";

/** One recap row: the step's label, the choices made there, a one-tap jump. */
export interface ReviewLedgerRow {
  step: GuidedStep;
  label: string;
  value: string;
}

/**
 * The review recap — every choice the journey collected, grouped by the step
 * that owns it (§2.4: choices attributed to their sources), each row a one-tap
 * jump back to its step. Rows ride the same quiet row recipe as the
 * requirements explainer; the container stays neutral (a summary, not an ask).
 */
export function ReviewLedger({
  rows,
  onJump,
}: {
  rows: ReviewLedgerRow[];
  onJump: (step: GuidedStep) => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <div className="create-needs review-ledger">
      <p className="create-needs-head">
        <Icon as={BookMarked} size="xs" decorative />
        {t("common.reviewChoices")}
      </p>
      <ul className="create-needs-list">
        {rows.map((r) => (
          <li key={r.step}>
            <button type="button" className="create-need" onClick={() => onJump(r.step)}>
              <span className="review-ledger-k">{r.label}</span>
              <span className="create-need-label">{r.value}</span>
              <Icon as={ChevronRight} className="create-need-chev" decorative />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The "almost there, just finish these" explainer beneath a disabled Create
 * button. Fed the SAME `missingRequirements` list that gates `canCreate`, so the
 * button and the explanation can never disagree. In the guided wizard each row
 * deep-links to the step that fixes it; in quick mode they render static.
 */
export function MissingRequirements({
  items,
  onJump,
}: {
  items: { key: string; label: string; step: GuidedStep }[];
  onJump?: (step: GuidedStep) => void;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div className="create-needs" role="status">
      <p className="create-needs-head">
        <Icon as={ListChecks} size="xs" decorative />
        {t("create.missingTitle")}
      </p>
      <ul className="create-needs-list">
        {items.map((r) =>
          onJump ? (
            <li key={r.key}>
              <button
                type="button"
                className="create-need"
                onClick={() => onJump(r.step)}
              >
                <span className="create-need-dot" aria-hidden />
                <span className="create-need-label">{r.label}</span>
                <Icon as={ChevronRight} className="create-need-chev" decorative />
              </button>
            </li>
          ) : (
            <li key={r.key} className="create-need static">
              <span className="create-need-dot" aria-hidden />
              <span className="create-need-label">{r.label}</span>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

export function CharacterPreviewCard({
  name,
  className,
  raceName,
  bgName,
  level,
  hp,
  ac,
  pb,
  dc,
  hitDie,
  classId,
  tip,
  savingThrows,
}: {
  name: string;
  className: string;
  raceName: string;
  bgName: string;
  level: number;
  hp: number;
  ac: number;
  pb: number;
  dc: number | null;
  hitDie: number;
  classId: string;
  tip: string;
  savingThrows: string[];
}) {
  const { t } = useTranslation();
  const info = classRoleSeal(classId);
  return (
    // S9 (owner 2026-06-11) — the summary wears the wizard's gold ceremony:
    // the hero-altar voice (accent border, radial gold glow, gilt class seal),
    // not a plain info card.
    <section className="wiz-summary" aria-label={t("create.yourCharacter")}>
      <div className="wiz-summary-head">
        <span className="wiz-summary-seal" aria-hidden>
          <Icon as={info.icon} size="lg" decorative />
        </span>
        <div className="min-w-0">
          <p className="wiz-summary-name">{name || t("create.yourCharacter")}</p>
          <p className="wiz-summary-sub">
            {[raceName, `${className || t("create.chooseClass")} ${level}`, bgName]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {/* Key stats — the SAME carved `.vital` cells as the cockpit header. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="vital">
          <span className="v-num">{hp || "—"}</span>
          <span className="v-lbl">{t("stats.hp")}</span>
        </div>
        <div className="vital">
          <span className="v-num">{ac}</span>
          <span className="v-lbl">{t("stats.ac")}</span>
        </div>
        <div className="vital">
          <span className="v-num">+{pb}</span>
          <span className="v-lbl">{t("stats.pb")}</span>
        </div>
        <div className={cn("vital", dc && "caster")}>
          <span className="v-num">{dc ? dc : `d${hitDie}`}</span>
          <span className="v-lbl">{dc ? t("stats.dc") : t("stats.hitDie")}</span>
        </div>
      </div>
      {/* Saving-throw proficiencies — gilt chips with a shield glyph. */}
      {savingThrows.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {savingThrows.map((st) => (
            <Badge
              key={st}
              size="sm"
              glyph={<Icon as={ShieldCheck} size="xs" decorative />}
            >
              {t(`abilities.${st}_short`)} {t("abilities.saveTooltip")}
            </Badge>
          ))}
        </div>
      )}
      {tip && <p className="wiz-summary-tip">{tip}</p>}
    </section>
  );
}

export function HpModeSelector({
  mode,
  onModeChange,
  rolledHp,
  onRolledHpChange,
  averageHp,
  hpBonus = 0,
  hitDie,
  level,
}: {
  mode: "average" | "rolled";
  onModeChange: (m: "average" | "rolled") => void;
  rolledHp: number | null;
  onRolledHpChange: (v: number | null) => void;
  averageHp: number;
  /** Flat HP on top of the die math (hp-per-level grants — Dwarven Toughness,
   *  Tough). Folded into the badge so this number always EQUALS the summary
   *  card's HP (one source, golden rule 6); the die hints stay die-only. */
  hpBonus?: number;
  hitDie: number;
  level: number;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="wiz-fork" role="group" aria-label={t("create.hpLabel")}>
          <WizardForkTab
            active={mode === "average"}
            onClick={() => onModeChange("average")}
          >
            {t("create.hpAverage")}
          </WizardForkTab>
          <WizardForkTab
            active={mode === "rolled"}
            onClick={() => onModeChange("rolled")}
          >
            {t("create.hpRolled")}
          </WizardForkTab>
        </div>
        {mode === "average" && (
          <span className="ml-auto self-center font-mono text-sm font-bold text-accent tnum">
            {averageHp + hpBonus} {t("stats.hp")}
          </span>
        )}
      </div>

      {mode === "average" && (
        <p className="on-art text-xs text-text-muted">
          {t("create.hpAverageHint", { hitDie, avg: Math.floor(hitDie / 2) + 1, level })}
        </p>
      )}

      {mode === "rolled" && (
        <div className="space-y-1">
          <p className="on-art text-xs text-text-muted">
            {t("create.hpRolledHint", { hitDie })}
          </p>
          <Input
            type="number"
            min={level}
            max={hitDie * level}
            value={rolledHp ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onRolledHpChange(val === "" ? null : parseInt(val) || null);
            }}
            onBlur={(e) => {
              const val = e.target.value;
              if (val === "") return;
              onRolledHpChange(
                Math.max(level, Math.min(hitDie * level, parseInt(val) || level))
              );
            }}
            placeholder={String(averageHp)}
            aria-label={t("create.hpRolled")}
            className="num tnum"
          />
          <p className="on-art text-[length:var(--text-micro)] text-text-muted">
            {t("create.hpRolledRange", { min: level, max: hitDie * level })}
          </p>
        </div>
      )}
    </div>
  );
}
