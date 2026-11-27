/**
 * The DM's monster actions and traits on each monster line of the Scontro tab (the
 * classic EncounterMonsterActions and trait chips): a compact chip per printed attack or
 * save, its name and roll («Scimitarra +4», «Soffio di fuoco CD 21»), the whole line
 * («Scimitarra +4 · 1d6+2 Tagliente») in its title and in the tray it opens,
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

/** The roll: «+4» or «TS DES · CD 21»; `short`, the chip's «+4» or «CD 21». */
function checkOf(action: MonsterAction, t: T, short = false): string {
  if (action.toHit !== undefined)
    return `${action.toHit >= 0 ? "+" : ""}${String(action.toHit)}`;
  if (!action.save) return "";
  if (short) return t("play.dc", { dc: action.save.dc });
  return t("combat.cunningStrikeSave", {
    ability: t(`abilities.${action.save.ability}_short`),
    dc: action.save.dc,
  });
}

/** «+4 · 1d6+2 Tagliente» or «TS DES · CD 21 · 17d6 Fuoco»; a separator never starts a line. */
function numbersLine(action: MonsterAction, t: T, hp: EncounterMonster["hp"]): string {
  const types = monsterActionDamageTypes(action);
  const damage = monsterActionDice(action, hp)
    .map((dice, i) =>
      [dice, ...(types[i] ?? []).map((type) => t(`srd.damage_${type}`))].join(" ").trim()
    )
    .join(" + ");
  return [checkOf(action, t), damage].filter(Boolean).join("\u00a0· ");
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
            {actions.map((action) => {
              // One compact line, the name and the roll (Foundry's and D&D Beyond's
              // encounter rows); the damage is in the title and in the tray it opens.
              const whole = `${name(action)} ${numbersLine(action, t, monster.hp)}`;
              const roll = checkOf(action, t, true);
              return (
                <Chip
                  key={`${action.section}:${action.entryId}`}
                  pressed={false}
                  title={whole}
                  ariaLabel={whole}
                  onClick={() => setOpen({ monsterId: monster.id, action })}
                >
                  {/* a narrow column cuts the name, never the roll */}
                  <span className="f-chip-t">{name(action)}</span>
                  {roll && (
                    <>
                      {" "}
                      <span className="f-chip-roll">{roll}</span>
                    </>
                  )}
                </Chip>
              );
            })}
          </div>
        )}
        {multiattack && (
          // One line on the row; the whole text is on the monster card (its name).
          <p
            className="f-quiet f-monster-multi"
            title={localizeSrd("monster", multiattackKey, "text", locale)}
          >
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
