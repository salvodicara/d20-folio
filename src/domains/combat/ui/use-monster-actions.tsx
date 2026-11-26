/**
 * The DM's monster actions and traits on each monster line of the Scontro tab (the
 * classic EncounterMonsterActions and trait chips): a chip per printed attack or save
 * («Scimitarra +4 · 1d6+2 Tagliente», «Soffio di fuoco TS DES · CD 21 · 17d6 Fuoco»),
 * the Multiattack line as reference text, and the traits that change a roll as plain
 * chips (Magic Resistance, Pack Tactics). A tap on an action opens its tray; Apply is one
 * move with its undo. A group line and a homebrew creature show none yet; Regeneration's
 * one-tap heal stays in the classic hub for now.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { getMonster } from "@/data/monsters";
import { dmTargets } from "@/domains/combat/dm-hit-plan";
import { monsterActionSteps } from "@/domains/combat/monster-action-steps";
import { MonsterActionDialog } from "@/domains/combat/ui/MonsterActionDialog";
import { dmMoves, useFightMove, type Toaster } from "@/domains/combat/ui/fight-moves";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import { traitFactLabel } from "@/features/campaigns/encounter-trait-facts";
import { useLazySrdKind } from "@/hooks/useLazySrdKind";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { srdKey } from "@/i18n/srd-key";
import type { Locale } from "@/lib/locale";
import {
  monsterActionDamageTypes,
  monsterActionDice,
  monsterActions,
  monsterTrayPlan,
  type MonsterAction,
} from "@/lib/play/monster-action";
import { rankAttackers } from "@/lib/views/combat-chronicle-view";
import type { EncounterMonster, EncounterState } from "@/types/campaign";
import { Chip } from "@/ui";

type T = ReturnType<typeof useTranslation>["t"];

/** «+4 · 1d6+2 Tagliente» or «TS DES · CD 21 · 17d6 Fuoco». */
function numbersLine(action: MonsterAction, t: T, hp: EncounterMonster["hp"]): string {
  const types = monsterActionDamageTypes(action);
  const damage = monsterActionDice(action, hp)
    .map((dice, i) =>
      [dice, ...(types[i] ?? []).map((type) => t(`srd.damage_${type}`))].join(" ").trim()
    )
    .join(" + ");
  const check =
    action.toHit !== undefined
      ? `${action.toHit >= 0 ? "+" : ""}${String(action.toHit)}`
      : action.save
        ? t("combat.cunningStrikeSave", {
            ability: t(`abilities.${action.save.ability}_short`),
            dc: action.save.dc,
          })
        : "";
  return [check, damage].filter(Boolean).join(" · ");
}

export function useMonsterActions(
  campaignId: string,
  encounter: EncounterState,
  fighters: ReadonlyArray<EncounterCombatantView>,
  uid: string,
  locale: Locale,
  onToast: Toaster
) {
  const { t } = useTranslation();
  const move = useFightMove(onToast);
  const [open, setOpen] = useState<{ monsterId: string; action: MonsterAction } | null>(
    null
  );
  const monsterOf = (id: string | undefined) => {
    const m = encounter.combatants.find((c) => c.id === id);
    return m?.kind === "monster" ? m : undefined;
  };
  const blockOf = (m: EncounterMonster | undefined) =>
    m?.srdId ? getMonster(m.srdId) : undefined;
  // The actions' names live in the lazy monster catalogue: wait for it (a fresh load
  // has not opened «Aggiungi mostri», which loads it too).
  const named = useLazySrdKind(
    "monster",
    encounter.combatants.some((c) => c.kind === "monster" && c.srdId !== undefined)
  );

  const stripFor = (ids: readonly string[]) => {
    if (!named || ids.length !== 1) return null;
    const monster = monsterOf(ids[0]);
    const block = blockOf(monster);
    if (!monster || !block) return null;
    const actions = monsterActions(block);
    const facts = (block.traits ?? []).flatMap((entry) =>
      entry.kind === "narrative" && entry.fact ? [entry.fact] : []
    );
    const multiattackKey = srdKey(block.id, "actions", "multiattack");
    const multiattack =
      block.actions.some((entry) => entry.id === "multiattack") &&
      hasSrd("monster", multiattackKey, "text", locale);
    if (actions.length === 0 && facts.length === 0) return null;
    const name = (action: MonsterAction) =>
      localizeSrd(
        "monster",
        srdKey(block.id, action.section, action.entryId),
        "name",
        locale
      );
    return (
      <div className="f-monster-acts">
        {actions.length > 0 && (
          <div
            className="f-chips"
            role="group"
            aria-label={t("fight.actions.title", { name: monster.name })}
          >
            {actions.map((action) => (
              <Chip
                key={`${action.section}:${action.entryId}`}
                pressed={false}
                onClick={() => setOpen({ monsterId: monster.id, action })}
              >
                {`${name(action)} ${numbersLine(action, t, monster.hp)}`}
              </Chip>
            ))}
          </div>
        )}
        {multiattack && (
          <p className="f-quiet">
            <b>{localizeSrd("monster", multiattackKey, "name", locale)}.</b>{" "}
            {localizeSrd("monster", multiattackKey, "text", locale)}
          </p>
        )}
        {facts.length > 0 && (
          <div
            className="f-chips"
            role="group"
            aria-label={t("fight.actions.traits", { name: monster.name })}
          >
            {facts.map((fact, i) => (
              <Chip key={`${fact.kind}:${String(i)}`}>
                {traitFactLabel(fact, (key, args) => t(key, args))}
              </Chip>
            ))}
          </div>
        )}
      </div>
    );
  };

  const monster = monsterOf(open?.monsterId);
  const block = blockOf(monster);
  const dialog =
    named && open && monster && block
      ? (() => {
          const { primary, more } = rankAttackers(fighters, monster.id, null);
          const candidates = [...primary, ...more];
          const title = localizeSrd(
            "monster",
            srdKey(block.id, open.action.section, open.action.entryId),
            "name",
            locale
          );
          return (
            <MonsterActionDialog
              key={`${monster.id}:${open.action.entryId}`}
              title={title}
              numbers={`${monster.name} · ${numbersLine(open.action, t, monster.hp)}`}
              candidates={candidates}
              ownSide={more}
              // a save is usually an area: every opponent starts picked; an attack
              // picks its one opponent only when there is no choice to make
              initiallyPicked={
                open.action.save || primary.length === 1 ? primary.map((r) => r.id) : []
              }
              planFor={(targetIds) => monsterTrayPlan(open.action, targetIds)}
              onClose={() => setOpen(null)}
              onApply={(plan, rows, total) =>
                move(
                  dmMoves.monsterAction(
                    campaignId,
                    uid,
                    monsterActionSteps(
                      monster.id,
                      plan,
                      rows,
                      total,
                      dmTargets(
                        fighters,
                        rows.map((r) => r.targetId)
                      )
                    )
                  ),
                  t("fight.actions.applied", { name: title })
                )
              }
            />
          );
        })()
      : null;
  return { stripFor, dialog };
}
