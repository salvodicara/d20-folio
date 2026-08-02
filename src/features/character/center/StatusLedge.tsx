/**
 * StatusLedge — the BG3-style status-effect badge row, INTEGRATED into the turn
 * meter's chrome (the `status` grid row of the `.turn` combat altar), replacing
 * the old stack of floating full-width banners ("Concentrating on X…",
 * "Disadvantage on attacks (Frightened)").
 *
 * Grammar (owner ask, 2026-08-02): each active status is ONE compact, glanceable
 * badge — a coined icon socket + the status name, tinted by the app-wide
 * `--cond-*` condition palette (the same hues the rail chips + encounter cards
 * speak). Detail is EXPLAIN-ON-DEMAND (constitution §1): clicking a badge opens
 * the branded folio Popover with the full effect sentences — and, on the
 * concentration badge, the one-tap "Stop concentrating" action. Click-to-open
 * (the GlossaryTip precedent): identical with mouse, keyboard, and touch.
 *
 * The badge unit is the CAUSE (one badge per condition, however many limiters it
 * imposes) via `composeStatusBadges` — pure, unit-tested grouping over the SAME
 * `composeTurnLimiters` output the old banner read (single source of truth).
 * Statuses are read-outs of player-controlled state (override-first): conditions
 * toggle in the rail, concentration drops here or on the rail pill.
 *
 * NOT here (they are decisions/prompts, not statuses): the Prone one-tap Stand,
 * start-of-turn regen apply, the round-1 Death Strike reminder, and the
 * maintained-state keep/end prompt keep their action-banner register under the
 * meter — a call to action must not hide behind a click.
 */

import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownToLine,
  Ban,
  EyeOff,
  Ghost,
  Hand,
  Hourglass,
  Link,
  Moon,
  Mountain,
  Orbit,
  Skull,
  Sparkles,
  ZapOff,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { FocusMark } from "@/components/ui/folio-marks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocale } from "@/hooks/useLocale";
import { condColor, condInkColor } from "@/lib/condition-color";
import { concentrationLabel, conditionLabel } from "@/lib/views/tracker-view";
import { localeDistance } from "@/lib/utils";
import {
  composeStatusBadges,
  type StatusBadgeVM,
  type TurnLimiterVM,
} from "@/lib/views/combat-action-view";

/**
 * One glyph per SRD condition that can CURRENTLY render as a badge (BG3 status-icon
 * vocabulary; ids, never labels). A badge only exists for a condition that imposes a
 * turn LIMITER (`composeTurnLimiters` → blocked economy / attack Disadvantage /
 * Speed 0 / auto-fail saves), so this map deliberately covers ONLY the limiter-
 * causing conditions plus the `exhaustion` badge glyph.
 *
 * Omitted on purpose (their `CONDITION_GATES` entry carries no self-side turn
 * limiter, so no badge is ever composed for them today — eager-icon weight the
 * bundle budget must not pay for): `charmed`, `deafened`, and `invisible`
 * (Invisible grants self-side ADVANTAGE, not a limiter). SEAM: if any of these ever
 * gains a self-side limiter (or the ledge starts badging positive statuses), add its
 * id + glyph back here (charmed → Heart, deafened → EarOff, invisible → Eye).
 */
const CONDITION_ICONS: Record<string, LucideIcon> = {
  blinded: EyeOff,
  exhaustion: Hourglass,
  frightened: Ghost,
  grappled: Hand,
  incapacitated: Ban,
  paralyzed: ZapOff,
  petrified: Mountain,
  poisoned: Skull,
  prone: ArrowDownToLine,
  restrained: Link,
  stunned: Orbit,
  unconscious: Moon,
};

export function StatusLedge({
  limiters,
  concentration,
  concBlockedConditionId,
  readonly,
}: {
  /** The composed turn limiters (B3) — grouped into one badge per cause here. */
  limiters: TurnLimiterVM[];
  /** The concentrated-on spell (session value; `null` = not concentrating). */
  concentration: string | null;
  /** B1 — the first active condition that forbids holding concentration. */
  concBlockedConditionId: string | null;
  /** P10 glass case — a read-only viewer sees the badges, never the drop action. */
  readonly: boolean;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const badges = composeStatusBadges(limiters);
  if (!concentration && badges.length === 0) return null;

  // One localized sentence per limiter — the popover's effect lines. The cause is
  // NOT restated here (it IS the badge/popover rubric); the sentences stay
  // self-contained penalties ("Disadvantage on attack rolls", "Speed 0", …).
  const limiterText = (l: TurnLimiterVM): string => {
    switch (l.kind) {
      case "blockedEconomy":
        return t("combat.limiterBlockedEconomy", {
          slots: l.slots.map((s) => t(`combat.${s}`)).join(", "),
        });
      case "attackDisadvantage":
        return t(
          l.scoped
            ? "combat.limiterAttackDisadvantageScoped"
            : "combat.limiterAttackDisadvantage"
        );
      case "speedZero":
        return t("combat.speedZeroShort");
      case "autoFailSaves":
        return t("combat.limiterAutoFailSaves", {
          abilities: l.abilities.map((a) => t(`abilities.${a}_short`)).join("/"),
        });
      case "exhaustion":
        return t("combat.limiterExhaustion", {
          n: l.d20Penalty,
          speed: localeDistance(l.speedPenaltyFt, locale),
        });
      case "spellSlotLimit":
        return t("combat.limiterSpellSlotLimit", { n: l.count });
    }
  };

  const badgeLabel = (b: StatusBadgeVM): string => {
    switch (b.kind) {
      case "condition":
        return conditionLabel(b.conditionId, locale);
      case "exhaustion":
        return `${conditionLabel("exhaustion", locale)} ${b.level}`;
      case "slotLimit":
        return t("combat.spellSlotLimitBadge");
    }
  };

  return (
    <div className="status-ledge" role="group" aria-label={t("combat.statusEffects")}>
      {concentration && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="status-badge"
              data-kind="concentration"
              data-blocked={concBlockedConditionId ? "" : undefined}
            >
              <span className="sb-disc" aria-hidden>
                <FocusMark />
              </span>
              <span className="sb-label">
                {concentrationLabel(concentration, locale)}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            rubric={t("combat.concentration")}
            className="status-pop"
            side="bottom"
            align="start"
            collisionPadding={12}
          >
            <p className="sp-line">
              {t("combat.concentratingOn", {
                spell: concentrationLabel(concentration, locale),
              })}
            </p>
            {/* B1 — an active condition (Incapacitated family) forbids holding
                Concentration: name the cause. Override-first — the drop action
                beside it lets the player end it; the engine never auto-drops on
                a condition toggle. */}
            {concBlockedConditionId && (
              <p className="sp-note">
                {t("combat.concentrationBlockedNote", {
                  condition: conditionLabel(concBlockedConditionId, locale),
                })}
              </p>
            )}
            {!readonly && (
              <button
                type="button"
                className="conc-banner-drop"
                // #66 — `setConcentration("")` already emits the stopped-concentrating
                // toast WITH undo; dispatch it alone so dropping concentration fires
                // EXACTLY ONE toast (matches ResourceRail).
                onClick={() => useCharacterStore.getState().setConcentration("")}
              >
                {t("combat.clearConcentration")}
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}
      {badges.map((b) => {
        const iconId = b.kind === "condition" ? b.conditionId : "exhaustion";
        const IconGlyph =
          b.kind === "slotLimit" ? Sparkles : (CONDITION_ICONS[iconId] ?? Ban);
        const label = badgeLabel(b);
        const tint: CSSProperties | undefined =
          b.kind === "slotLimit"
            ? undefined
            : ({
                "--co": condColor(iconId),
                "--co-ink": condInkColor(iconId),
              } as CSSProperties);
        return (
          <Popover key={b.kind === "condition" ? `cond-${b.conditionId}` : b.kind}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="status-badge"
                data-kind={b.kind === "slotLimit" ? "advisory" : "condition"}
                style={tint}
              >
                <span className="sb-disc" aria-hidden>
                  <Icon as={IconGlyph} decorative />
                </span>
                <span className="sb-label">{label}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              rubric={label}
              className="status-pop"
              side="bottom"
              align="start"
              collisionPadding={12}
            >
              {b.limiters.map((l, i) => (
                <p key={i} className="sp-line">
                  {limiterText(l)}
                </p>
              ))}
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
