/**
 * encounter-monster-actions — the DM's one-tap monster actions (owner 2026-10-13): a
 * bestiary monster's printed attacks and saves as a row of chips on its encounter card
 * ("Scimitarra +4 · 1d6+2 Tagliente", "Soffio di fuoco TS DES · CD 21 · 17d6 Fuoco").
 * A tap opens the SAME damage tray a player's use opens ({@link DamageTrayPanel}),
 * with the encounter's other creatures to pick from; Apply lands each row:
 *  - a PC → the peer combat write the DM's PC card uses (`writeCampaignCombatEffect`),
 *    then the chronicle beat with the monster as attacker;
 *  - a monster → the DM's encounter apply path (`applyAdversaryDamage`), the beat
 *    carrying the attacker too;
 *  - the failed-save conditions the entry prints, on whoever failed;
 *  - one action line per target in the session log (Hit · Miss · Critical, saved or
 *    failed), which the feed folds into the damage line: "Goblin: Scimitarra → Lyra:
 *    colpito, 7 danni". Nobody is asked "Who struck?" for these.
 * Multiattack stays text: a reference line under the chips.
 *
 * A LAZY seam file (like `encounter-trait-chips.tsx`): it statically reads the corpus
 * (`getMonster`) and the monster catalogue, so `party-encounter.tsx` reaches it only
 * through a dynamic `import()` paired with `ensureSrdKind("monster")`.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DamageTrayPanel } from "@/components/shared/DamageTrayPanel";
import { trayRubric, trayTargetFromRow } from "@/components/shared/damage-tray-target";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { getMonster } from "@/data/monsters";
import type { EncounterMonster } from "@/types/campaign";
import { useLocale } from "@/hooks/useLocale";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { litText, type LocText } from "@/lib/loc-text";
import type { Locale } from "@/lib/locale";
import type { DamageTrayPlan, TrayRow } from "@/lib/play/damage-tray";
import {
  monsterActionDamageTypes,
  monsterActionDice,
  monsterActions,
  monsterTrayLandings,
  monsterTrayPlan,
  type MonsterAction,
} from "@/lib/play/monster-action";
import { rankAttackers } from "@/lib/views/combat-chronicle-view";
import { useToastStore } from "@/stores/toastStore";

import { writeCampaignCombatEffect } from "./campaign-io";
import { recordCondition, recordPcHp } from "./combat-chronicle";
import { setMonsterCondition } from "./encounter";
import type { EncounterCombatantView } from "./encounter-view";
import { applyAdversaryDamage } from "./encounter-world-command";
import type { ApplyFn, MonsterActionsContext } from "./party-encounter";

type T = ReturnType<typeof useTranslation>["t"];

/** The entry's name in both languages, frozen into the log line (players' devices may
 *  not hold the lazy monster catalogue). */
function entryName(monsterId: string, action: MonsterAction): LocText {
  const key = `${monsterId}.${action.section}.${action.entryId}`;
  const name = (locale: Locale): string | undefined =>
    hasSrd("monster", key, "name", locale)
      ? localizeSrd("monster", key, "name", locale)
      : undefined;
  const en = name("en");
  const it = name("it");
  return litText({ en: en ?? it ?? action.entryId, it: it ?? en ?? action.entryId });
}

/** "1d6+2 Tagliente + 2d6 Fuoco" — every printed clause, its type or its choices. */
function damageLine(action: MonsterAction, t: T, hp: EncounterMonster["hp"]): string {
  const types = monsterActionDamageTypes(action);
  return monsterActionDice(action, hp)
    .map((dice, index) =>
      [dice, ...(types[index] ?? []).map((type) => t(`srd.damage_${type}`))]
        .join(" ")
        .trim()
    )
    .join(" + ");
}

/** The chip's numbers: "+4 · 1d6+2 Tagliente" or "TS DES · CD 21 · 17d6 Fuoco". */
function numbersLine(action: MonsterAction, t: T, hp: EncounterMonster["hp"]): string {
  const check =
    action.toHit !== undefined
      ? `${action.toHit >= 0 ? "+" : ""}${action.toHit}`
      : action.save
        ? t("combat.cunningStrikeSave", {
            ability: t(`abilities.${action.save.ability}_short`),
            dc: action.save.dc,
          })
        : "";
  return [check, damageLine(action, t, hp)].filter(Boolean).join(" · ");
}

export function EncounterMonsterActions({
  monster,
  campaignId,
  apply,
  context,
}: {
  monster: EncounterMonster;
  campaignId: string;
  apply: ApplyFn;
  context: MonsterActionsContext;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [open, setOpen] = useState<MonsterAction | null>(null);
  const block = monster.srdId ? getMonster(monster.srdId) : undefined;
  const actions = useMemo(() => (block ? monsterActions(block) : []), [block]);
  if (!block || actions.length === 0) return null;
  const multiattack = block.actions.find((entry) => entry.id === "multiattack");
  const multiattackKey = `${block.id}.actions.multiattack`;
  const label = (action: MonsterAction) =>
    localizeSrd(
      "monster",
      `${block.id}.${action.section}.${action.entryId}`,
      "name",
      locale
    );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        className="flex min-w-0 flex-wrap gap-1.5"
        role="group"
        aria-label={t("campaignHub.encounterActionsGroup", { name: monster.name })}
      >
        {actions.map((action) => (
          <Button
            key={`${action.section}:${action.entryId}`}
            variant="secondary"
            size="sm"
            className="max-w-full"
            onClick={() => setOpen(action)}
          >
            <span>{label(action)}</span>
            <span className="font-normal tabular-nums text-text-muted">
              {numbersLine(action, t, monster.hp)}
            </span>
          </Button>
        ))}
      </div>
      {multiattack && hasSrd("monster", multiattackKey, "text", locale) && (
        <p className="text-xs leading-snug text-text-muted">
          <span className="font-semibold">
            {localizeSrd("monster", multiattackKey, "name", locale)}.
          </span>{" "}
          {localizeSrd("monster", multiattackKey, "text", locale)}
        </p>
      )}
      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        {open && (
          <MonsterActionTray
            key={`${open.section}:${open.entryId}`}
            monster={monster}
            action={open}
            title={label(open)}
            campaignId={campaignId}
            apply={apply}
            context={context}
            onClose={() => setOpen(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function MonsterActionTray({
  monster,
  action,
  title,
  campaignId,
  apply,
  context,
  onClose,
}: {
  monster: EncounterMonster;
  action: MonsterAction;
  title: string;
  campaignId: string;
  apply: ApplyFn;
  context: MonsterActionsContext;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  // The creatures it can strike: its opponents first, its own side after; never itself.
  const { primary, more } = useMemo(
    () => rankAttackers(context.rows, monster.id, null),
    [context.rows, monster.id]
  );
  const candidates = [...primary, ...more];
  // A save is usually an area: every opponent starts picked. An attack picks its one
  // opponent only when there is no choice to make.
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(action.save || primary.length === 1 ? primary.map((row) => row.id) : [])
  );
  const chosen = candidates.filter((row) => picked.has(row.id));
  const plan = monsterTrayPlan(
    action,
    chosen.map((row) => row.id)
  );
  const targets = chosen.map((row) => trayTargetFromRow(row, true));
  const dice = monsterActionDice(action, monster.hp).join(" + ");
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <DamageTrayPanel
      title={title}
      // "Goblin · +4 per colpire · Danni Taglienti"; the dice go under the total.
      rubric={[
        monster.name,
        action.toHit !== undefined
          ? t("campaignHub.encounterActionToHit", {
              bonus: `${action.toHit >= 0 ? "+" : ""}${action.toHit}`,
            })
          : null,
        trayRubric(plan, t, locale),
      ]
        .filter(Boolean)
        .join(" · ")}
      {...(dice ? { totalHint: t("combat.damageTray.totalHintDice", { dice }) } : {})}
      plan={plan}
      targets={targets}
      picker={
        <div
          className="mb-3 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t("campaignHub.encounterActionOnWhom")}
        >
          <span className="font-mono text-[length:var(--text-micro)] font-bold uppercase tracking-[0.12em] text-text-muted">
            {t("campaignHub.encounterActionOnWhom")}
          </span>
          {candidates.map((row) => (
            <button
              key={row.id}
              type="button"
              className="fchip"
              aria-pressed={picked.has(row.id)}
              onClick={() => toggle(row.id)}
            >
              {row.name}
            </button>
          ))}
        </div>
      }
      // A monster's plan never splits across targets: every row shares one total.
      onApply={(rows, [total = 0]) => {
        applyMonsterAction({
          campaignId,
          monster,
          source: entryName(monster.srdId ?? monster.id, action),
          plan,
          rows,
          total,
          targets: chosen,
          apply,
          context,
          t,
        });
        useToastStore.getState().showToast({
          message: t("combat.damageTray.appliedToast", { name: title }),
          duration: 4000,
        });
        onClose();
      }}
      onSkip={onClose}
    />
  );
}

/** Land every row: monster HP through the encounter apply path, PC HP through the
 *  peer combat write, conditions on whoever failed, and the results in the log. */
function applyMonsterAction({
  campaignId,
  monster,
  source,
  plan,
  rows,
  total,
  targets,
  apply,
  context,
  t,
}: {
  campaignId: string;
  monster: EncounterMonster;
  source: LocText;
  plan: DamageTrayPlan;
  rows: TrayRow[];
  total: number;
  targets: ReadonlyArray<EncounterCombatantView>;
  apply: ApplyFn;
  context: MonsterActionsContext;
  t: T;
}): void {
  const actorId = monster.id;
  const provenance = { actorId, action: source };
  const landings = monsterTrayLandings(plan, rows, total);
  const byId = new Map(targets.map((row) => [row.id, row]));

  // Each target's result, by the monster: the feed folds it into the damage line.
  const declared = landings.flatMap((landing) =>
    landing.outcome
      ? [
          {
            type: "event" as const,
            event: {
              kind: "action" as const,
              actor: actorId,
              source,
              targets: [landing.targetId],
              outcome: landing.outcome,
            },
          },
        ]
      : []
  );
  if (declared.length > 0) context.log(declared);

  const monsters = landings.filter(
    (landing) => byId.get(landing.targetId)?.kind !== "pc"
  );
  if (monsters.some((landing) => landing.amount > 0 || landing.conditions.length > 0)) {
    apply((encounter) =>
      monsters.reduce((next, { targetId, amount, conditions }) => {
        let out =
          amount > 0
            ? applyAdversaryDamage(next, campaignId, targetId, amount, provenance)
            : next;
        for (const conditionId of conditions) {
          const target = out.combatants.find((c) => c.id === targetId);
          if (target?.kind !== "monster" || target.conditions.includes(conditionId))
            continue;
          out = recordCondition(
            setMonsterCondition(out, targetId, conditionId, true),
            targetId,
            conditionId,
            true,
            provenance
          );
        }
        return out;
      }, encounter)
    );
  }

  for (const { targetId, amount, conditions } of landings) {
    const row = byId.get(targetId);
    if (row?.kind !== "pc" || !row.memberUid || !row.characterId) continue;
    const { memberUid, characterId, maxHp } = row;
    const failed = (error: unknown) => {
      console.error("Combat write failed", error);
      useToastStore
        .getState()
        .showToast({ message: t("campaignHub.combatWriteFailed"), duration: 6000 });
    };
    if (amount > 0)
      void writeCampaignCombatEffect(memberUid, characterId, null, maxHp, {
        kind: "hp",
        operation: { kind: "damage", amount },
      })
        .then(({ before, after }) =>
          apply((encounter) =>
            recordPcHp(encounter, {
              targetId,
              kind: "damage",
              amount,
              preCurrent: before.hp.current,
              postCurrent: after.hp.current,
              max: maxHp,
              attackerId: actorId,
              action: source,
              tempAbsorbed: Math.max(0, before.hp.temp - after.hp.temp),
            })
          )
        )
        .catch(failed);
    for (const conditionId of conditions) {
      if (row.conditions.includes(conditionId)) continue;
      void writeCampaignCombatEffect(memberUid, characterId, null, maxHp, {
        kind: "condition",
        operation: { kind: "add", conditionId },
      })
        .then(() =>
          apply((encounter) =>
            recordCondition(encounter, targetId, conditionId, true, provenance)
          )
        )
        .catch(failed);
    }
  }
}
