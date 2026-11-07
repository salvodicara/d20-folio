/**
 * The DM's «Danni e cure» on the Scontro tab: who it lands on (every chosen creature, each
 * one a chip the DM can drop), one number, the damage type when it matters, Danni or
 * Cura (D&D Beyond's combat tracker: tap the HP, type, Damage; dnd5e's apply tray: the
 * same entry on every target). With one creature chosen, its conditions toggle below.
 * The look follows the player's own «Danni e cure» (PlayHp).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { DmEntry, DmTarget } from "@/domains/combat/dm-hit-plan";
import { SRD_CONDITIONS } from "@/data/conditions";
import type { Locale } from "@/lib/locale";
import { conditionLabel } from "@/lib/views/tracker-view";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage";
import { Button, Chip, Dialog, Field } from "@/ui";

const COMMON: readonly DamageType[] = ["slashing", "piercing", "bludgeoning"];
/** Exhaustion has levels: it stays on the character's sheet. */
const TOGGLES = SRD_CONDITIONS.map((c) => c.id).filter((id) => id !== "exhaustion");

export function DmHitDialog({
  targets,
  locale,
  onHit,
  onCondition,
  onClose,
}: {
  targets: readonly DmTarget[];
  locale: Locale;
  onHit: (targets: readonly DmTarget[], entry: DmEntry) => void;
  onCondition: (target: DmTarget, conditionId: string, active: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  const [text, setText] = useState("");
  const [type, setType] = useState<DamageType | undefined>(undefined);
  const [allTypes, setAllTypes] = useState(false);
  const chosen = targets.filter((x) => !dropped.has(x.id));
  const amount = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
  const healable = chosen.some((x) => x.kind === "monster");
  const shown = allTypes ? DAMAGE_TYPES : COMMON;
  const only = chosen.length === 1 ? chosen[0] : undefined;
  const commit = (entry: DmEntry) => {
    onHit(chosen, entry);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={t("play.hp.title")}
      closeLabel={t("common.close")}
    >
      <div className="f-ask">
        <span className="f-lbl">{t("fight.dm.on")}</span>
        <div className="f-chips">
          {targets.map((x) => (
            <Chip
              key={x.id}
              pressed={!dropped.has(x.id)}
              onClick={() => {
                const next = new Set(dropped);
                if (next.has(x.id)) next.delete(x.id);
                else next.add(x.id);
                setDropped(next);
              }}
            >
              {x.name + "\u00a0· " + `${x.hp.current}/${x.hp.max}`}
            </Chip>
          ))}
        </div>
      </div>
      <div className="f-ask">
        <Field
          label={t("play.hp.amount")}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          className="f-in f-in-big"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="f-ask">
        <div className="f-chips">
          {shown.map((d) => (
            <Chip
              key={d}
              pressed={type === d}
              onClick={() => setType(type === d ? undefined : d)}
            >
              {t(`srd.damage_${d}`)}
            </Chip>
          ))}
          {!allTypes && (
            <Chip pressed={false} onClick={() => setAllTypes(true)}>
              {t("play.hp.otherType")}
            </Chip>
          )}
        </div>
      </div>
      <div className="f-hp-acts f-ask">
        <Button
          kind="danger"
          wide
          disabled={!amount || chosen.length === 0}
          onClick={() =>
            amount && commit({ kind: "damage", amount, ...(type ? { type } : {}) })
          }
        >
          {t("mechanics.cast.optionDamage")}
        </Button>
        <Button
          kind="primary"
          wide
          disabled={!amount || !healable}
          onClick={() => amount && commit({ kind: "heal", amount })}
        >
          {t("combat.heal")}
        </Button>
      </div>
      {chosen.some((x) => x.kind === "pc") && (
        <p className="f-quiet f-ask">{t("fight.dm.pcRule")}</p>
      )}
      {only && (
        <div className="f-ask">
          <span className="f-lbl">{t("fight.dm.conditions")}</span>
          <div className="f-chips">
            {TOGGLES.map((id) => {
              const on = only.conditions.includes(id);
              return (
                <Chip key={id} pressed={on} onClick={() => onCondition(only, id, !on)}>
                  {conditionLabel(id, locale)}
                </Chip>
              );
            })}
          </div>
        </div>
      )}
    </Dialog>
  );
}
