/**
 * «Su quale arma?» on the Play screen (approved prototype cast-weapon): before a
 * weapon-binding spell (Magic Weapon, Shillelagh) is cast, the weapon it names, in hand
 * or in the pack, with what the spell does to it; a damage type when the spell offers
 * one. The cast then carries the pick (`executeAction(action, { weapon, damageType })`).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { WeaponPick } from "@/domains/play/weapon-pick-view";
import type { DamageType } from "@/types/damage";
import { Button, Chip, Choice, Dialog } from "@/ui";

export function PlayWeaponPick({
  spellName,
  choices,
  onCast,
  onClose,
}: {
  spellName: string;
  choices: WeaponPick[];
  onCast: (pick: WeaponPick, damageType?: DamageType) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState(
    (choices.find((c) => c.wielded) ?? choices[0])?.key ?? ""
  );
  const picked = choices.find((c) => c.key === key);
  const types = picked?.preview.damageTypeOptions ?? [];
  const [type, setType] = useState<DamageType | undefined>(undefined);
  const effect = (c: WeaponPick) =>
    [
      c.preview.bonus > 0 ? t("play.weapon.bonus", { bonus: c.preview.bonus }) : null,
      c.preview.attackAbility
        ? t("play.weapon.ability", {
            ability: t(`abilities.${c.preview.attackAbility}_short`),
          })
        : null,
      c.preview.damageDie ? c.preview.damageDie : null,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      // Glue the name's last two words so a narrow title never ends on one word.
      title={t("play.ask.castTitle", { name: spellName.replace(/ (\S+)$/, "\u00a0$1") })}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={!picked}
            onClick={() => picked && onCast(picked, type)}
          >
            {t("spells.cast")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <span className="f-lbl">{t("play.weapon.which")}</span>
        <div className="f-choices">
          {choices.map((c) => (
            <Choice key={c.key} on={c.key === key} onClick={() => setKey(c.key)}>
              <span className="f-choice-main">
                <span className="f-row-t">{c.name}</span>
                <span className="f-choice-s">
                  {[
                    c.wielded === true
                      ? t("play.weapon.wielded")
                      : c.wielded === false
                        ? t("play.weapon.packed")
                        : null,
                    effect(c),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </Choice>
          ))}
        </div>
      </div>
      {types.length > 0 && (
        <div className="f-ask">
          <span className="f-lbl">{t("custom.damageType")}</span>
          <div className="f-chips">
            {types.map((d) => (
              <Chip
                key={d}
                pressed={type === d}
                onClick={() => setType(type === d ? undefined : d)}
              >
                {t(`srd.damage_${d}`)}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
