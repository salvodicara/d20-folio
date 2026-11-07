/**
 * Monster zones on the DM's Scontro (#752). «Lancia un incantesimo a zona» under the
 * monster whose turn it is: the spell, its level and the save DC from the stat block
 * (`monsterZoneEffect`). Under the caster's row, the zone's turn questions: «Dentro»
 * takes the rolled total and whether the creature saved, and lands the damage (a
 * monster through the encounter, with its defenses; a character through its sheet);
 * «Fuori» lets the question go.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  monsterZoneSpells,
  zoneHitAmount,
  zoneHitLine,
} from "@/domains/combat/monster-zones-view";
import {
  appendPersistentCombatEffect,
  revokePersistentCombatEffect,
  writeCampaignCombatEffect,
} from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { applyAdversaryDamageParts } from "@/features/campaigns/encounter-world-command";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import {
  useZoneHitStore,
  type PendingZoneHit,
} from "@/features/campaigns/zone-hit-store";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { parseRolledTotal } from "@/lib/play/damage-tray";
import { monsterZoneEffect, zoneHitDamage } from "@/lib/zones";
import { Button, Chip, Choice, Dialog, Field, Stepper } from "@/ui";

type Toaster = (message: string, undo?: () => void) => void;

export function MonsterZoneCast({
  campaignId,
  monsterId,
  monsterName,
  defaultDc,
  locale,
  onToast,
}: {
  campaignId: string;
  monsterId: string;
  monsterName: string;
  /** The stat block's spell save DC, when it prints one (`monsterSpellDc`). */
  defaultDc: number | null;
  locale: Locale;
  onToast: Toaster;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const spells = monsterZoneSpells(locale);
  const [spellId, setSpellId] = useState<string | null>(null);
  const [level, setLevel] = useState(1);
  const [dc, setDc] = useState(defaultDc ?? 13);
  const spell = spells.find((s) => s.id === spellId);
  const cast = () => {
    if (!spell) return;
    const effect = monsterZoneEffect({
      effectId: crypto.randomUUID(),
      monsterId,
      spellId: spell.id,
      castLevel: level,
      saveDc: dc,
    });
    void appendPersistentCombatEffect(campaignId, effect).catch(() =>
      onToast(t("combat.declareApplyFailed"))
    );
    setOpen(false);
    onToast(t("fight.zone.cast", { name: monsterName, spell: spell.name }), () => {
      void revokePersistentCombatEffect(campaignId, effect.id).catch(() => undefined);
    });
  };
  return (
    <>
      <Button kind="quiet" onClick={() => setOpen(true)}>
        {t("fight.zone.castOpen")}
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          color="res"
          title={t("fight.zone.castTitle", { name: monsterName })}
          closeLabel={t("common.close")}
          actions={
            <>
              <Button kind="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button kind="primary" disabled={!spell} onClick={cast}>
                {t("spells.cast")}
              </Button>
            </>
          }
        >
          <div className="f-ask">
            <div className="f-choices">
              {spells.map((s) => (
                <Choice
                  key={s.id}
                  on={s.id === spellId}
                  onClick={() => {
                    setSpellId(s.id);
                    setLevel(s.level);
                  }}
                >
                  {s.name}
                </Choice>
              ))}
            </div>
          </div>
          {spell && (
            <div className="f-ask f-rule-fields">
              <label className="f-rule-field">
                <span className="f-lbl">{t("common.level")}</span>
                <Stepper
                  value={level}
                  min={spell.level}
                  max={9}
                  label={t("common.level")}
                  less={t("common.decrease")}
                  more={t("common.increase")}
                  onChange={setLevel}
                />
              </label>
              <label className="f-rule-field">
                <span className="f-lbl">{t("fight.zone.dc")}</span>
                <Stepper
                  value={dc}
                  min={1}
                  max={30}
                  label={t("fight.zone.dc")}
                  less={t("common.decrease")}
                  more={t("common.increase")}
                  onChange={setDc}
                />
              </label>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

export function MonsterZoneHits({
  campaignId,
  casterIds,
  rows,
  locale,
  onToast,
}: {
  campaignId: string;
  casterIds: ReadonlyArray<string>;
  rows: ReadonlyArray<EncounterCombatantView>;
  locale: Locale;
  onToast: Toaster;
}) {
  const hits = useZoneHitStore((s) => s.hits);
  const mine = hits.filter((h) => casterIds.includes(h.zone.casterId));
  if (mine.length === 0) return null;
  return (
    <>
      {mine.map((hit) => (
        <ZoneHit
          key={hit.key}
          hit={hit}
          campaignId={campaignId}
          rows={rows}
          locale={locale}
          onToast={onToast}
        />
      ))}
    </>
  );
}

function ZoneHit({
  hit,
  campaignId,
  rows,
  locale,
  onToast,
}: {
  hit: PendingZoneHit;
  campaignId: string;
  rows: ReadonlyArray<EncounterCombatantView>;
  locale: Locale;
  onToast: Toaster;
}) {
  const { t } = useTranslation();
  const [inside, setInside] = useState(false);
  const [total, setTotal] = useState("");
  const [saved, setSaved] = useState(false);
  const damage = zoneHitDamage(hit.zone);
  const remove = () => useZoneHitStore.getState().remove(hit.key);
  const rolled = parseRolledTotal(total);
  const apply = () => {
    if (rolled === null) return;
    const amount = zoneHitAmount(rolled, saved, damage);
    remove();
    const target = rows.find((r) => r.id === hit.creatureId);
    if (!target || amount <= 0) return;
    if (target.kind === "monster") {
      const store = useCampaignStore.getState();
      const before = store.campaign?.encounter;
      if (!before) return;
      store.setEncounter(
        applyAdversaryDamageParts(before, campaignId, target.id, [
          { amount, ...(damage.damageType ? { type: damage.damageType } : {}) },
        ])
      );
      onToast(t("fight.zone.applied", { amount, name: hit.creatureName }), () =>
        useCampaignStore.getState().setEncounter(before)
      );
      return;
    }
    if (target.memberUid && target.characterId) {
      void writeCampaignCombatEffect(
        target.memberUid,
        target.characterId,
        null,
        target.maxHp,
        {
          kind: "hp",
          operation: { kind: "damage", amount },
        }
      )
        .then(({ before, after }) =>
          onToast(t("fight.zone.applied", { amount, name: hit.creatureName }), () => {
            if (target.memberUid && target.characterId)
              void writeCampaignCombatEffect(
                target.memberUid,
                target.characterId,
                null,
                target.maxHp,
                { kind: "revert", written: after, previous: before }
              ).catch(() => undefined);
          })
        )
        .catch(() => onToast(t("combat.declareApplyFailed")));
    }
  };
  return (
    <div
      className="f-note f-save-due"
      data-c="res"
      role="group"
      aria-label={hit.creatureName}
    >
      <p>
        {t(
          hit.kind === "end-turn"
            ? "combat.zoneEndTurnInside"
            : "combat.zoneStartTurnInside",
          {
            target: hit.creatureName,
            zone: localizeSrd("spell", hit.zone.spellId, "name", locale),
          }
        )}
      </p>
      {inside ? (
        <>
          <p className="f-help">{zoneHitLine(damage, locale)}</p>
          <div className="f-rule-fields">
            <Field
              label={t("combat.damageTray.total")}
              inputMode="tel"
              autoComplete="off"
              autoFocus
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
            {damage.saveAbility && (
              <div className="f-chips">
                <Chip pressed={saved} onClick={() => setSaved((s) => !s)}>
                  {t("combat.damageTray.saved")}
                </Chip>
              </div>
            )}
          </div>
          <div className="f-acts">
            <Button kind="primary" disabled={rolled === null} onClick={apply}>
              {t("combat.apply")}
            </Button>
            <Button kind="ghost" onClick={remove}>
              {t("combat.zoneOutside")}
            </Button>
          </div>
        </>
      ) : (
        <div className="f-acts">
          <Button kind="primary" onClick={() => setInside(true)}>
            {t("fight.zone.inside")}
          </Button>
          <Button kind="ghost" onClick={remove}>
            {t("combat.zoneOutside")}
          </Button>
        </div>
      )}
    </div>
  );
}
