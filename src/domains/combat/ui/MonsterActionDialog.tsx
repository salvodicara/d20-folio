/**
 * A monster's printed action on the Scontro tab (the classic MonsterActionTray, in the
 * new frame; D&D Beyond and Foundry roll the attack and the table applies): on whom,
 * then for each target Hit · Miss · Critical for an attack, or «Saved» for a save, the
 * rolled total, and Apply. The app never rolls. A save starts with every opponent
 * picked (an area); an attack with its one opponent when there is no choice.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import {
  ATTACK_OUTCOMES,
  initialTrayRow,
  parseRolledTotal,
  rowAmount,
  rowNeedsTotal,
  setAttackOutcome,
  toggleSaved,
  type DamageTrayPlan,
  type TrayRow,
} from "@/lib/play/damage-tray";
import { Button, Chip, Dialog, Field } from "@/ui";

export function MonsterActionDialog({
  title,
  numbers,
  candidates,
  ownSide = [],
  initiallyPicked,
  planFor,
  onApply,
  onClose,
}: {
  title: string;
  /** «+4 · 1d6+2 Tagliente» or «TS DES · CD 21 · 17d6 Fuoco». */
  numbers: string;
  /** The creatures it can strike: its opponents first, its own side after. */
  candidates: ReadonlyArray<EncounterCombatantView>;
  /** The monster's own side, shown last under its own label (Foundry's and Roll20's
   *  target pickers keep the heroes apart from the creatures). */
  ownSide?: ReadonlyArray<EncounterCombatantView>;
  initiallyPicked: ReadonlyArray<string>;
  planFor: (ids: readonly string[]) => DamageTrayPlan;
  onApply: (plan: DamageTrayPlan, rows: TrayRow[], total: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<readonly string[]>(initiallyPicked);
  const [edits, setEdits] = useState<Record<string, TrayRow>>({});
  const [text, setText] = useState("");
  const chosen = candidates.filter((c) => picked.includes(c.id));
  const plan = planFor(chosen.map((c) => c.id));
  const rows = chosen.map(
    (c) =>
      edits[c.id] ??
      initialTrayRow(
        plan,
        c.id,
        c.defenses,
        c.creatureType,
        { current: c.currentHp, max: c.maxHp },
        c.conditions
      )
  );
  const total = parseRolledTotal(text);
  const needsTotal = rows.some((row) => rowNeedsTotal(row, plan));
  // An attack row starts at «Hit» (the classic tray's default); a miss needs no total.
  const ready = rows.length > 0 && (!needsTotal || total !== null);
  const edit = (row: TrayRow) => setEdits((all) => ({ ...all, [row.targetId]: row }));
  const own = new Set(ownSide.map((c) => c.id));
  const groups = [
    {
      key: "heroes",
      rows: candidates.filter((c) => c.kind === "pc" && !own.has(c.id)),
    },
    {
      key: "allies",
      rows: candidates.filter((c) => c.kind !== "pc" && !own.has(c.id)),
    },
    { key: "ownSide", rows: candidates.filter((c) => own.has(c.id)) },
  ].filter((g) => g.rows.length > 0);
  const toggle = (id: string) =>
    setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={title}
      closeLabel={t("common.close")}
      actions={
        <Button
          kind="primary"
          wide
          disabled={!ready}
          onClick={() => {
            if (!ready) return;
            onApply(plan, rows, total ?? 0);
            onClose();
          }}
        >
          {t("combat.apply")}
        </Button>
      }
    >
      <p className="f-quiet f-ask">{numbers}</p>
      <div className="f-ask">
        <span className="f-lbl">{t("campaignHub.encounterActionOnWhom")}</span>
        <div
          className="f-target-groups"
          role="group"
          aria-label={t("campaignHub.encounterActionOnWhom")}
        >
          {groups.map((g) => (
            <div key={g.key} className="f-target-group">
              <span className="f-quiet">
                {g.key === "allies"
                  ? t("combat.targetAllies")
                  : t(`fight.actions.group.${g.key}`)}
              </span>
              <div className="f-chips">
                {g.rows.map((c) => (
                  <Chip
                    key={c.id}
                    pressed={picked.includes(c.id)}
                    onClick={() => toggle(c.id)}
                  >
                    {c.name}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {rows.map((row, i) => {
        const target = chosen[i];
        if (!target) return null;
        const amount = total !== null ? rowAmount(total, row, plan) : null;
        return (
          <div key={row.targetId} className="f-ask">
            <span className="f-lbl">{target.name}</span>
            <div className="f-chips">
              {row.attack !== undefined || plan.attack
                ? ATTACK_OUTCOMES.map((o) => (
                    <Chip
                      key={o}
                      pressed={row.attack === o}
                      onClick={() => edit(setAttackOutcome(row, o, plan))}
                    >
                      {t(`combat.damageTray.outcome.${o}`)}
                    </Chip>
                  ))
                : null}
              {plan.save && (
                <Chip pressed={row.saved} onClick={() => edit(toggleSaved(row, plan))}>
                  {t("combat.damageTray.saved")}
                </Chip>
              )}
            </div>
            {amount !== null && amount > 0 && (
              <p className="f-help">{t("fight.actions.rowDamage", { count: amount })}</p>
            )}
          </div>
        );
      })}
      {plan.effect === "damage" && chosen.length > 0 && (
        <div className="f-ask">
          <Field
            label={t("combat.damageTray.total")}
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      )}
    </Dialog>
  );
}
