/**
 * Companions on the Play screen («Azioni»): each creature on the field as a group, its
 * Hit Points and AC in the header, its attacks as rows like the character's own.
 * «Attacca» asks on whom (in a fight) and opens the same damage tray; a hit applies
 * what the attack does beyond damage (Web Bolt's Speed 0), undoable with the rest.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  companionAttackPlan,
  companionHitEffects,
  playCompanions,
  type PlayCompanion,
  type PlayCompanionAttack,
} from "@/domains/play/play-companions-view";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { isDead } from "@/features/character/center/target-step";
import { useDamageTrayStore } from "@/features/character/center/damage-tray-store";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import type { Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { CharacterDoc } from "@/types/character";
import type { CombatantRef } from "@/types/combat-effect";
import { Button, Chip, Dialog, Icon } from "@/ui";

const signed = (n: number) => (n >= 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

export function PlayCompanions({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const companions = useMemo(() => playCompanions(doc, locale, t), [doc, locale, t]);
  const [aiming, setAiming] = useState<{
    companion: PlayCompanion;
    attack: PlayCompanionAttack;
  } | null>(null);
  if (companions.length === 0) return null;
  const strike = (
    companion: PlayCompanion,
    attack: PlayCompanionAttack,
    targets: string[]
  ) => {
    const status = useCombatStatusStore.getState().status;
    const uid = useAuthStore.getState().user?.uid ?? "";
    const name = `${companion.name}: ${attack.name}`;
    useDamageTrayStore.getState().show({
      characterId: doc.id,
      actionName: name,
      source: { custom: name },
      castLogId: null,
      actionId: `companion-${companion.key}-${attack.id}`,
      plan: companionAttackPlan(attack, targets),
      ...(status
        ? {
            onHit: (targetId: string) => {
              const row = status.view.rows.find((r) => r.id === targetId);
              const target: CombatantRef =
                row?.kind === "pc" && row.memberUid && row.characterId
                  ? {
                      kind: "pc",
                      combatantId: row.id,
                      memberUid: row.memberUid,
                      characterId: row.characterId,
                    }
                  : { kind: "monster", combatantId: targetId };
              return companionHitEffects(companion, attack, {
                actor: {
                  kind: "pc",
                  combatantId: status.myId,
                  memberUid: uid,
                  characterId: doc.id,
                },
                target,
                round: status.round,
                effectId: () => crypto.randomUUID(),
              });
            },
          }
        : {}),
    });
  };
  const attackWith = (companion: PlayCompanion, attack: PlayCompanionAttack) => {
    // In a fight, on whom first (the enemies first); outside one, the tray alone.
    if (useCombatStatusStore.getState().status) setAiming({ companion, attack });
    else strike(companion, attack, []);
  };
  return (
    <>
      {companions.map((c) => (
        <section key={c.key} className="f-act-group" data-group="companions">
          <h3 className="f-act-gh">
            {c.name}
            <span className="f-gh-slots">
              {t("play.companions.vitals", {
                current: c.hp.current,
                max: c.hp.max,
                ac: c.ac,
              })}
            </span>
          </h3>
          {c.fallen && <p className="f-help">{t("play.companions.fallen")}</p>}
          {c.attacks.map((a) => (
            <div key={a.id} className="f-act">
              <span className="f-act-slot" aria-hidden="true">
                <Icon name="g-combat" />
              </span>
              <div className="f-row-main">
                <div className="f-row-t">{a.name}</div>
                {a.rider && <div className="f-row-s">{a.rider}</div>}
              </div>
              <span className="f-act-c">{localeDistance(a.reachFt, locale)}</span>
              <span className="f-act-c">{signed(a.hit)}</span>
              <span className="f-act-c f-act-e">{a.damage}</span>
              <Button
                disabled={readonly || c.fallen}
                aria-label={`${t("combat.attack")}: ${c.name}, ${a.name}`}
                onClick={() => attackWith(c, a)}
              >
                {t("combat.attack")}
              </Button>
            </div>
          ))}
        </section>
      ))}
      {aiming && (
        <CompanionTarget
          name={`${aiming.companion.name}: ${aiming.attack.name}`}
          onCancel={() => setAiming(null)}
          onConfirm={(targets) => {
            const { companion, attack } = aiming;
            setAiming(null);
            strike(companion, attack, targets);
          }}
        />
      )}
    </>
  );
}

/** «Su chi?» for a companion's attack: the living creatures on the field, the enemies
 *  first; one target. */
function CompanionTarget({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: (targets: string[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const status = useCombatStatusStore((st) => st.status);
  const [picked, setPicked] = useState<string | null>(null);
  const rows = (status?.view.rows ?? []).filter(
    (r) => r.id !== status?.myId && !isDead(r)
  );
  const sideOf = (r: (typeof rows)[number]) =>
    r.side ?? (r.kind === "pc" ? "ally" : "enemy");
  const groups = (["enemy", "ally"] as const)
    .map((side) => ({ side, rows: rows.filter((r) => sideOf(r) === side) }))
    .filter((g) => g.rows.length > 0);
  return (
    <Dialog
      open
      onClose={onCancel}
      color="act"
      title={name}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button kind="quiet" onClick={() => onConfirm([])}>
            {t("play.ask.confirmNoTarget")}
          </Button>
          <Button
            kind="primary"
            disabled={!picked}
            onClick={() => picked && onConfirm([picked])}
          >
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      <span className="f-lbl">{t("campaignHub.encounterActionOnWhom")}</span>
      {groups.map((g) => (
        <div key={g.side} className="f-ask">
          {groups.length > 1 && (
            <span className="f-help">
              {t(g.side === "ally" ? "combat.targetAllies" : "combat.targetEnemies")}
            </span>
          )}
          <div className="f-chips">
            {g.rows.map((r) => (
              <Chip key={r.id} pressed={picked === r.id} onClick={() => setPicked(r.id)}>
                {r.name}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </Dialog>
  );
}
