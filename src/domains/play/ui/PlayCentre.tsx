/**
 * The Play screen's centre column (approved prototype x-play): the turn strip (round,
 * whose turn, Action · Bonus · Reaction · Movement, «Fine turno»), «Cosa ti conviene
 * fare», and the actions table with D&D Beyond's filters. Each row's button (Attacca,
 * Lancia, Usa, Reagisci) commits through the engine's one turn flow (`executeAction`);
 * its state is the shared `actionCtaView` for this turn, so it reads as the old sheet's.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { playActionsView, type PlayActionRow } from "@/domains/play/play-actions-view";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { resolveReplaceAttackWithCast } from "@/lib/smart-tracker";
import {
  blockReasonLine,
  type ActionCtaVerb,
  type ActionTurnState,
} from "@/lib/views/action-cta-view";
import { maxReplaceAttackSpellLevel } from "@/lib/views/combat-action-view";
import { playbookView } from "@/domains/play/playbook/playbook-view";
import { useTurnState, useSheetCombat } from "@/features/character/center/turn-state";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { turnBarView, type TurnBarSlot } from "@/lib/views/turn-bar-view";
import { actionIcon } from "@/domains/play/action-icon";
import type { ActionGroup } from "@/lib/views/action-row-view";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Icon, Tabs } from "@/ui";

import { ActionIcon } from "./ActionIcon";

type Filter = "all" | "attacks" | "actions" | "bonus" | "reactions" | "other" | "limited";
const FILTERS: Filter[] = [
  "all",
  "attacks",
  "actions",
  "bonus",
  "reactions",
  "other",
  "limited",
];
// Existing labels where the app already has them; the rest are Play's own.
const FILTER_KEY: Record<Filter, string> = {
  all: "play.filter.all",
  attacks: "combat.attacksPerAction",
  actions: "combat.action",
  bonus: "combat.bonus",
  reactions: "combat.reaction",
  other: "report.types.other",
  limited: "play.filter.limited",
};
const GROUP_KEY: Record<ActionGroup, string> = {
  actions: "combat.actions",
  bonus: "play.group.bonus",
  reactions: "combat.reactions",
  other: "report.types.other",
};
/** The action types' shapes (BG3): a filter or a group of that type shows its own. */
const SHAPE: Partial<Record<Filter | ActionGroup, string>> = {
  actions: "action",
  bonus: "bonus",
  reactions: "reaction",
};
const signed = (n: number) => (n >= 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

/** This turn as the combat store holds it, in the shape the button view reads. */
function usePlayTurn(doc: CharacterDoc): ActionTurnState {
  const selected = useCombatStore((s) => s.selected);
  const budget = useCombatStore((s) => s.budget);
  const attackBudget = useCombatStore((s) => s.attackBudget);
  const attacksUsed = useCombatStore((s) => s.attacksUsed);
  const attackSwings = useCombatStore((s) => s.attackSwings);
  const reactionUsed = useCombatStore((s) => s.reactionUsed);
  const reactionUsedId = useCombatStore((s) => s.reactionUsedId);
  const movementUsedFt = useCombatStore((s) => s.movementUsedFt);
  const warMagicMax = useMemo(
    () => maxReplaceAttackSpellLevel(resolveReplaceAttackWithCast(doc)),
    [doc]
  );
  return useMemo(
    () => ({
      selected,
      budget,
      attackBudget,
      attacksUsed,
      attackSwingIds: attackSwings.map((s) => s.actionId),
      reactionUsed,
      reactionUsedId,
      movementUsedFt,
      warMagicMax,
    }),
    [
      selected,
      budget,
      attackBudget,
      attacksUsed,
      attackSwings,
      reactionUsed,
      reactionUsedId,
      movementUsedFt,
      warMagicMax,
    ]
  );
}

export function PlayCentre({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const turn = usePlayTurn(doc);
  const actions = playActionsView(doc, locale, turn);
  const keep = (group: ActionGroup, row: PlayActionRow) =>
    filter === "all" ||
    (filter === "attacks" && row.attack) ||
    (filter === "limited" && row.limited) ||
    filter === group;
  return (
    <section className="f-pn f-centre" data-c="act" aria-label={t("combat.actions")}>
      <Tabs
        label={t("combat.actions")}
        items={[{ id: "actions" as const, label: t("combat.actions") }]}
        value="actions"
        onChange={() => undefined}
      />
      <div className="f-pnb f-stack">
        <TurnStrip doc={doc} locale={locale} />
        <Playbook doc={doc} locale={locale} />
        <div className="f-filters" role="group" aria-label={t("play.filterLabel")}>
          {FILTERS.filter((f) => actions.counts[f] > 0).map((f) => (
            <Chip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
              {SHAPE[f] && (
                <i className="f-shape" data-kind={SHAPE[f]} aria-hidden="true" />
              )}
              {t(FILTER_KEY[f])}
            </Chip>
          ))}
        </div>
        <div className="f-act f-act-head" aria-hidden="true">
          <span />
          <span>{t("common.name")}</span>
          <span>{t("spells.range")}</span>
          <span>{t("play.table.hit")}</span>
          <span>{t("play.table.effect")}</span>
          <span />
        </div>
        {actions.groups.map(({ group, rows }) => {
          const shown = rows.filter((r) => keep(group, r));
          if (shown.length === 0) return null;
          return (
            <section key={group} className="f-act-group" data-group={group}>
              <h3 className="f-act-gh">
                {SHAPE[group] && (
                  <i className="f-shape" data-kind={SHAPE[group]} aria-hidden="true" />
                )}
                {t(GROUP_KEY[group])}
              </h3>
              {shown.map((row) => (
                <ActionLine key={row.id} row={row} locale={locale} />
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function TurnStrip({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const fight = useSheetCombat();
  const { round, phase, currentActorName } = useTurnState();
  const { handleEndTurn } = useTurnEconomy();
  const selected = useCombatStore((s) => s.selected);
  const budget = useCombatStore((s) => s.budget);
  const reactionUsed = useCombatStore((s) => s.reactionUsed);
  const movementUsedFt = useCombatStore((s) => s.movementUsedFt);
  const speedFt = sheetNumbers(doc).speed.total;
  const slots = turnBarView({
    mode: fight ? "combat" : "exploration",
    selected,
    budget,
    reaction: { used: reactionUsed },
    movement: { usedFt: movementUsedFt, speedFt },
  });
  const title = !fight
    ? t("diary.explore")
    : [
        t("combatChronicle.round", { n: round }),
        phase === "my-turn" || phase === "solo"
          ? t("play.turnMine")
          : (currentActorName ?? ""),
      ]
        .filter(Boolean)
        .join(" · ");
  const slotLabel = (s: TurnBarSlot) =>
    s.kind === "move"
      ? localeDistance(Math.max(0, s.budget - s.used), locale)
      : t(`combat.${s.kind}`);
  return (
    <div className="f-turn" data-fight={fight ? "" : undefined}>
      <b className="f-turn-t">{title}</b>
      <ul className="f-turn-slots">
        {slots.map((s) => (
          <li
            key={s.kind}
            data-kind={s.kind}
            data-spent={s.state === "spent" || undefined}
          >
            <i aria-hidden="true" />
            {slotLabel(s)}
          </li>
        ))}
      </ul>
      {fight && (phase === "my-turn" || phase === "solo") && (
        <Button kind="primary" icon="u-next" onClick={handleEndTurn}>
          {t("play.endTurn")}
        </Button>
      )}
    </div>
  );
}

function Playbook({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const fight = useSheetCombat();
  const { round } = useTurnState();
  // The engine's context builder is coming; for now the mode and the round.
  const view = playbookView(doc, locale, {
    mode: fight ? "combat" : "exploration",
    round,
  });
  const lines = open ? view.steps : view.plan;
  if (lines.length === 0) return null;
  return (
    <div className="f-playbook">
      <button
        type="button"
        className="f-playbook-h"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{t("play.playbookTitle")}</span>
        <Icon name="u-expand" />
      </button>
      <ul className="f-playbook-lines">
        {lines.map((l) => (
          <li key={l.stepId} data-status={l.status}>
            <span>
              {l.before}
              {l.strong && <b>{l.strong}</b>}
              {l.after}
            </span>
            {open && l.why && <span className="f-tl-by">{l.why}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const VERB_KEY: Record<ActionCtaVerb, string> = {
  attack: "combat.attack",
  cast: "spells.cast",
  use: "common.use",
  react: "play.react",
};

function ActionLine({ row, locale }: { row: PlayActionRow; locale: Locale }) {
  const { t } = useTranslation();
  const { executeAction } = useTurnEconomy();
  const readonly = useSheetReadonly();
  const { cta } = row;
  const reason = cta.reason ? blockReasonLine(cta.reason, t, locale) : null;
  const sub = [
    row.level === 0
      ? t("spells.cantrip")
      : row.level !== null
        ? t("play.spellLevel", { level: row.level })
        : null,
    row.concentration ? t("play.concentration") : null,
    row.uses
      ? t("play.uses", { current: row.uses.current, total: row.uses.total })
      : null,
  ].filter(Boolean);
  const hit =
    row.attackBonus !== undefined
      ? signed(row.attackBonus)
      : row.saveDc !== undefined
        ? [
            t("play.dc", { dc: row.saveDc }),
            row.saveAbility ? t(`abilities.${row.saveAbility}_short`) : null,
          ]
            .filter(Boolean)
            .join(" ")
        : "";
  const effect = row.damage
    ? [row.damage, row.damageType ? t(`srd.damage_${row.damageType}`) : null]
        .filter(Boolean)
        .join(" ")
    : row.healing
      ? t("play.healing", { amount: row.healing })
      : "";
  return (
    <div className="f-act" data-blocked={row.blocked || undefined}>
      <ActionIcon icon={actionIcon(row)} />
      <div className="f-row-main">
        <div className="f-row-t">{row.name}</div>
        {sub.length > 0 && <div className="f-row-s">{sub.join(" · ")}</div>}
        {/* the phone reads the numbers under the name (D&D Beyond's phone row) */}
        {(hit || effect) && (
          <div className="f-row-s f-act-m">
            {[hit, effect].filter(Boolean).join("\u00a0· ")}
          </div>
        )}
        {reason && !cta.state.spent && <div className="f-row-s f-act-why">{reason}</div>}
      </div>
      <span className="f-act-c">{row.range ?? ""}</span>
      <span className="f-act-c">{hit}</span>
      <span className="f-act-c f-act-e">{effect}</span>
      {!readonly && (
        <Button
          kind="ghost"
          disabled={cta.state.disabled}
          data-live={cta.state.emphasis || undefined}
          data-dim={cta.state.dimmed || undefined}
          title={
            cta.attacksLeft
              ? t("combat.attacksRemainingStatus", {
                  remaining: cta.attacksLeft.remaining,
                  total: cta.attacksLeft.total,
                })
              : undefined
          }
          aria-label={`${cta.state.spent ? t("combat.used") : t(VERB_KEY[cta.verb])}: ${row.name}`}
          onClick={() => executeAction(row.action)}
        >
          {cta.state.spent ? t("combat.used") : t(VERB_KEY[cta.verb])}
        </Button>
      )}
    </div>
  );
}
