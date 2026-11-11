/**
 * Board 2b, D5a: «Al colpo», what a weapon hit can add, as BG3's «Choose how to react»
 * lists it: one row per option with its painted icon, its name, what it costs and does,
 * and «Aggiungi». The options are the rules lane's `afterHitOptions`: the Rogue's
 * Cunning Strike, the weapon's Mastery and the on-hit riders that spend something
 * (Divine Smite, Lifedrinker). A tap commits it through the classic economy (undoable);
 * the row then reads «Aggiunto». It sits in the damage tray under a hit, and in a fight
 * without a tray as a note under the turn strip.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { riderName, riderToken } from "@/components/shared/rider-label";
import {
  afterHitOptions,
  cunningStrikeOptionsFor,
} from "@/domains/play/after-hit-options";
import { useAfterHitStore } from "@/domains/play/after-hit-store";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCombatStore } from "@/stores/combatStore";
import { ActionGlyph, ActionIcon } from "@/domains/play/ui/ActionIcon";
import { applyMasteryRider } from "@/features/character/center/mastery-rider-commit";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import type { Locale } from "@/lib/locale";
import type { CombatAction } from "@/lib/views/combat-action-view";
import { masteryRiderLine } from "@/lib/views/mastery-rider-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { Art, Button } from "@/ui";

interface Row {
  key: string;
  name: string;
  detail: string;
  art: ReactNode;
  disabled: boolean;
  apply: () => void;
}

/** Whether a weapon hit with `action` has anything to add (the note shows only then). */
function hasAfterHitOptions(
  doc: CharacterDoc,
  action: CombatAction,
  locale: Locale
): boolean {
  const o = afterHitOptions(action, cunningStrikeOptionsFor(doc, locale));
  return (
    o.cunningStrike.length > 0 ||
    o.mastery.length > 0 ||
    o.riders.some((r) => r.spend !== null)
  );
}

export function PlayAfterHit({
  action,
  locale,
}: {
  action: CombatAction;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const doc = useCharacterStore((s) => s.character);
  const readonly = useSheetReadonly();
  const { applyCunningStrike, spendRider } = useTurnEconomy();
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
  if (!doc) return null;
  const options = afterHitOptions(action, cunningStrikeOptionsFor(doc, locale));
  const weaponArt = (fallback: ReactNode) =>
    action.weaponId ? (
      <Art kind="equipment" id={action.weaponId} fallback={fallback} />
    ) : (
      fallback
    );
  const featureGlyph = <ActionGlyph icon={{ kind: "feature" }} />;
  const rows: Row[] = [
    ...options.cunningStrike.map((o) => ({
      key: `cs:${o.optionId}`,
      name: `${t("combat.cunningStrike")}: ${o.name}`,
      detail: [
        t("combat.cunningStrikeCost", { count: o.cost }),
        o.save ? t("combat.cunningStrikeSave", o.save) : null,
        o.condition,
      ]
        .filter(Boolean)
        .join(" · "),
      art: <Art kind="feature" id={o.sourceId} fallback={featureGlyph} />,
      disabled: !o.legal,
      apply: () => applyCunningStrike(action, o),
    })),
    ...options.mastery.map((m) => ({
      key: `m:${m.id}`,
      name: `${t("play.hit.mastery")}: ${m.name}`,
      detail: masteryRiderLine(m, t),
      art: weaponArt(
        <ActionGlyph icon={{ kind: "weapon", id: action.weaponId ?? "" }} />
      ),
      disabled: false,
      apply: () =>
        applyMasteryRider(action, m, {
          applied: t("combat.cunningStrikeAppliedToast", {
            option: masteryRiderLine(m, t),
            name: action.name,
          }),
          blocked: t("combat.blockedReasonDead"),
        }),
    })),
    ...options.riders
      .filter((r) => r.spend !== null)
      .map((r) => ({
        key: `r:${r.id}`,
        name: riderName(r, t),
        detail: riderToken(r, t).text,
        art: featureGlyph,
        disabled: false,
        apply: () => spendRider(action, r),
      })),
  ];
  if (rows.length === 0) return null;
  return (
    <div className="f-ask" role="group" aria-label={t("play.hit.title")}>
      <span className="f-lbl">{t("play.hit.title")}</span>
      {rows.map((row) => {
        const done = added.has(row.key);
        const verb = done ? t("play.hit.added") : t("play.hit.add");
        return (
          <div key={row.key} className="f-act">
            <ActionIcon icon={{ kind: "feature" }} art={row.art} />
            <div className="f-row-main">
              <div className="f-row-t">{row.name.replace(/ (\S+)$/, " $1")}</div>
              <div className="f-row-s">{row.detail}</div>
            </div>
            {!readonly && (
              <Button
                kind={done ? "quiet" : "ghost"}
                {...(done ? { icon: "u-check" as const } : {})}
                disabled={done || row.disabled}
                aria-label={`${verb}: ${row.name}`}
                onClick={() => {
                  row.apply();
                  setAdded((s) => new Set(s).add(row.key));
                }}
              >
                {verb}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Outside a shared fight: after a weapon attack, «Hai colpito con …?» under the turn
 *  strip with the same rows, until «Fatto», another attack or the next round. */
export function AfterHitNote({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const offer = useAfterHitStore((s) => s.offer);
  const round = useCombatStore((s) => s.round);
  const doc = useCharacterStore((s) => s.character);
  if (!offer || !doc || offer.characterId !== doc.id || offer.round !== round)
    return null;
  const action = localizeActions(doc, locale).find((a) => a.id === offer.actionId);
  if (!action || !hasAfterHitOptions(doc, action, locale)) return null;
  return (
    <div className="f-note f-save-due" data-c="act" role="group">
      <p>{t("play.hit.askSolo", { name: action.name })}</p>
      <PlayAfterHit
        key={`${offer.actionId}-${String(offer.round)}`}
        action={action}
        locale={locale}
      />
      <div className="f-acts">
        <Button kind="quiet" onClick={() => useAfterHitStore.getState().clear()}>
          {t("play.hit.done")}
        </Button>
      </div>
    </div>
  );
}
