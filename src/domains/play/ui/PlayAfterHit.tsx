/**
 * Board 2b, D5a: «Al colpo», what a weapon hit can add, as BG3's «Choose how to react»
 * lists it: one row per option with its painted icon, its name, what it costs and does,
 * and «Aggiungi». The options are the rules lane's `afterHitOptions`: the Rogue's
 * Cunning Strike, the weapon's Mastery and the on-hit riders that spend something
 * (Divine Smite, Lifedrinker). A tap commits it through the classic economy (undoable);
 * the row then reads «Aggiunto». It sits in the damage tray under a hit, and in a fight
 * without a tray as a note under the turn strip.
 */
import { hitIfUnanswered } from "@/features/character/center/attack-outcome-store";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { riderName, riderToken } from "@/components/shared/rider-label";
import {
  afterHitOptions,
  cunningStrikeOptionsFor,
  maneuverOptionsFor,
} from "@/domains/play/after-hit-options";
import { maneuverDetail } from "@/domains/play/maneuver-row";
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
  /** The family heading (Cunning Strike, Mastery, riders), said once above its rows. */
  group: string;
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
  const o = afterHitOptions(
    action,
    cunningStrikeOptionsFor(doc, locale),
    maneuverOptionsFor(localizeActions(doc, locale))
  );
  return (
    o.cunningStrike.length > 0 ||
    o.maneuvers.length > 0 ||
    o.mastery.length > 0 ||
    o.riders.some((r) => r.spend !== null)
  );
}

/** Facts joined so a separator never starts a line («… Furtivo ·» / «TS COS»). */
const facts = (parts: ReadonlyArray<string | null | undefined>) =>
  parts
    .filter((p): p is string => Boolean(p))
    .map((p) => p.replace(/ · /g, "\u00a0· "))
    .join("\u00a0· ");

export function PlayAfterHit({
  action,
  locale,
  titled = true,
}: {
  action: CombatAction;
  locale: Locale;
  /** The «Al colpo» label; off where the question above already says it. */
  titled?: boolean;
}) {
  const { t } = useTranslation();
  const doc = useCharacterStore((s) => s.character);
  const readonly = useSheetReadonly();
  const { applyCunningStrike, spendRider, executeAction } = useTurnEconomy();
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
  if (!doc) return null;
  const options = afterHitOptions(
    action,
    cunningStrikeOptionsFor(doc, locale),
    maneuverOptionsFor(localizeActions(doc, locale))
  );
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
      group: t("combat.cunningStrike"),
      name: o.name,
      detail: facts([
        t("combat.cunningStrikeCost", { count: o.cost }),
        o.save ? t("combat.cunningStrikeSave", o.save) : null,
        o.condition,
      ]),
      art: <Art kind="feature" id={o.sourceId} fallback={featureGlyph} />,
      disabled: !o.legal,
      apply: () => applyCunningStrike(action, o),
    })),
    // Battle Master: each learned maneuver that rides a hit, its die and save
    ...options.maneuvers.map((m) => ({
      key: `mv:${m.id}`,
      group: t("maneuvers.section"),
      name: m.name,
      detail: maneuverDetail(m, t),
      art: <Art kind="feature" id={m.id} fallback={featureGlyph} />,
      disabled: m.disabled,
      apply: () => executeAction(m.action),
    })),
    ...options.mastery.map((m) => ({
      key: `m:${m.id}`,
      group: t("play.hit.mastery"),
      name: m.name,
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
        group: t("combat.ridersOnHit"),
        name: riderName(r, t),
        detail: riderToken(r, t).text,
        art: featureGlyph,
        disabled: false,
        apply: () => spendRider(action, r),
      })),
  ];
  if (rows.length === 0) return null;
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className="f-ask f-after-hit-list" role="group" aria-label={t("play.hit.title")}>
      {titled && <span className="f-lbl">{t("play.hit.title")}</span>}
      {groups.map((group) => (
        <div key={group} className="f-ask">
          <p className="f-help">{group}</p>
          {rows
            .filter((r) => r.group === group)
            .map((row) => {
              const done = added.has(row.key);
              const verb = done ? t("common.added") : t("common.add");
              return (
                <div key={row.key} className="f-act">
                  <ActionIcon icon={{ kind: "feature" }} art={row.art} />
                  <div className="f-row-main">
                    <div className="f-row-t">
                      {row.name.replace(/ (\S+)$/, "\u00a0$1")}
                    </div>
                    <div className="f-row-s">{row.detail}</div>
                  </div>
                  {!readonly && (
                    <Button
                      kind={done ? "quiet" : "ghost"}
                      {...(done ? { icon: "u-check" as const } : {})}
                      disabled={done || row.disabled}
                      aria-label={`${verb}: ${row.group}: ${row.name}`}
                      onClick={() => {
                        row.apply();
                        // adding to the hit says the attack hit (its row's result chips)
                        hitIfUnanswered(action.id);
                        setAdded((st) => new Set(st).add(row.key));
                      }}
                    >
                      {verb}
                    </Button>
                  )}
                </div>
              );
            })}
        </div>
      ))}
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
    <div className="f-note f-save-due f-after-hit" data-c="act" role="group">
      {/* the question in bold, then what to do (the approved mock) */}
      <p>
        <b>{t("play.hit.askSolo", { name: action.name })}</b> {t("play.hit.askSoloAdd")}
      </p>
      <PlayAfterHit
        titled={false}
        key={`${offer.actionId}-${String(offer.round)}`}
        action={action}
        locale={locale}
      />
      <div className="f-acts">
        <Button kind="quiet" onClick={() => useAfterHitStore.getState().clear()}>
          {t("common.done")}
        </Button>
      </div>
    </div>
  );
}
