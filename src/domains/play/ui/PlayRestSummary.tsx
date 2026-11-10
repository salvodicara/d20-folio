/**
 * After a rest, what came back (the classic RestModal's summary, on the rules lane's
 * `restSummary`): Hit Points before → after, the Hit Point Dice spent or regained, the
 * slots and uses restored, Exhaustion, Heroic Inspiration, the fading penalties and the
 * maximum Hit Points a Long Rest restores (D&D Beyond's «Recover» list, BG3's restored
 * resources named in one line). Below it, the variants chosen at a rest (Circle of the
 * Land's terrain, Starry Form, Fire Shield), one chip row each, re-pickable with undo.
 * «Fatto» closes, or moves on to changing prepared spells after a Long Rest.
 */
import { useTranslation } from "react-i18next";

import { FADING_PENALTIES } from "@/lib/play/fading-penalties";
import {
  grantBundleChoices,
  pickGrantBundle,
  type RestSummary,
} from "@/domains/play/rest-model";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { localizeText } from "@/lib/views/srd-i18n";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Dialog } from "@/ui";

const penaltyText = (amount: number) => (amount > 0 ? `−${String(amount)}` : "0");

export function PlayRestSummary({
  doc,
  summary,
  locale,
  onDone,
}: {
  doc: CharacterDoc;
  summary: RestSummary;
  locale: Locale;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [
    [
      t("character.hitPoints"),
      `${String(summary.hp.before)} → ${String(summary.hp.after)} / ${String(summary.hp.max)}`,
    ],
  ];
  if (summary.kind === "short" && summary.hitDice.count > 0)
    rows.push([
      t("rest.hitDiceSpent"),
      t("play.rest.diceSpent", {
        count: summary.hitDice.count,
        hp: summary.hp.after - summary.hp.before,
      }),
    ]);
  if (summary.kind === "long") {
    rows.push([
      t("rest.hitDiceRecovered"),
      t("rest.hitDiceRecoveredValue", {
        count: summary.hitDice.count,
        total: summary.hitDice.total,
      }),
    ]);
    if (summary.slotsRestored > 0)
      rows.push([
        t("rest.slotsRestored"),
        t("rest.slotsRestoredValue", { count: summary.slotsRestored }),
      ]);
  }
  if (summary.trackersRestored > 0)
    rows.push([
      t("rest.trackersReset"),
      t("rest.trackersRestoredValue", { count: summary.trackersRestored }),
    ]);
  if (summary.itemResourceUnitsRecovered > 0)
    rows.push([
      t("rest.itemResourcesRecovered"),
      t("rest.itemResourcesRecoveredValue", {
        count: summary.itemResourceUnitsRecovered,
      }),
    ]);
  if (summary.exhaustionReduced)
    rows.push([t("character.exhaustion"), t("rest.exhaustionReduced")]);
  if (summary.inspirationGained)
    rows.push([t("character.heroicInspiration"), t("rest.inspirationGained")]);
  for (const { id, before, after } of summary.fades?.penalties ?? []) {
    const ref = FADING_PENALTIES[id]?.ref;
    rows.push([
      t("rest.fadingPenalty", {
        name: ref ? localizeSrd(ref.kind, ref.key, "name", locale) : id,
      }),
      `${penaltyText(before)} → ${penaltyText(after)}`,
    ]);
  }
  if (summary.fades?.maxHp)
    rows.push([
      t("rest.maxHpRestored"),
      `${String(summary.fades.maxHp.before)} → ${String(summary.fades.maxHp.after)}`,
    ]);
  const bundles = grantBundleChoices(doc);
  return (
    <Dialog
      open
      onClose={onDone}
      color="res"
      title={t(
        summary.kind === "long"
          ? "rest.longRestSummaryTitle"
          : "rest.shortRestSummaryTitle"
      )}
      closeLabel={t("common.close")}
      actions={
        <Button kind="primary" onClick={onDone}>
          {t("common.done")}
        </Button>
      }
    >
      <dl className="f-rest-sum">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {bundles.map((bundle) => (
        <div key={bundle.bundleKey} className="f-ask">
          <span className="f-lbl">{localizeText(bundle.label, locale)}</span>
          <div
            className="f-chips"
            role="group"
            aria-label={localizeText(bundle.label, locale)}
          >
            {bundle.options.map((o) => (
              <Chip
                key={o.id}
                pressed={bundle.selected === o.id}
                onClick={() => pickGrantBundle(bundle.bundleKey, o.id, t, locale)}
              >
                {localizeText(o.label, locale)}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </Dialog>
  );
}
