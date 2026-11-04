/**
 * The campaign's «Regole» tab (approved mock, 2026-11-04): the table rules. The DM
 * sees every rule with what RAW does and its choices; a chip writes at once, with
 * an undo; «Personalizza…» opens the numbers in place. Players read only what differs
 * from RAW.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  tableRulesView,
  withRule,
  type RulePath,
  type TableRuleRow,
} from "@/domains/campaign/table-rules-view";
import { setCampaignTableRules } from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { TableRulesOverrides } from "@/lib/table-rules";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc } from "@/types/campaign";
import { Button, Chip, Panel, Stepper } from "@/ui";

type Toaster = (message: string, undo?: () => void) => void;
const K = "campaignScreen.tableRules";

export function RulesTab({
  campaign,
  onToast,
}: {
  campaign: CampaignDoc;
  onToast: Toaster;
}) {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const isDm = uid === campaign.dmUid;
  const overrides = campaign.tableRules ?? {};
  const view = tableRulesView(overrides);
  const save = (next: TableRulesOverrides, message: string) => {
    const before = overrides;
    const store = useCampaignStore.getState();
    store.setTableRules(next);
    setCampaignTableRules(campaign.id, next).catch(() => {
      store.setTableRules(before);
      onToast(t(`${K}.failed`));
    });
    onToast(message, () => {
      useCampaignStore.getState().setTableRules(before);
      void setCampaignTableRules(campaign.id, before).catch(() =>
        onToast(t(`${K}.failed`))
      );
    });
  };
  const set = (path: RulePath, value: unknown) =>
    save(withRule(overrides, path, value), t(`${K}.changed`));
  const rows = (
    isDm
      ? view.groups
      : view.groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !r.raw) }))
  ).filter((g) => g.rows.length > 0);
  return (
    <Panel
      color="res"
      title={t(`${K}.title`)}
      foot={
        isDm ? (
          <>
            <Button
              kind="ghost"
              disabled={view.changed === 0}
              onClick={() => save({}, t(`${K}.resetDone`))}
            >
              {t(`${K}.reset`)}
            </Button>
            <span className="f-help">{t(`${K}.active`, { count: view.changed })}</span>
          </>
        ) : undefined
      }
      className="f-rules"
    >
      <p className="f-help">
        {isDm
          ? t(`${K}.introDm`)
          : view.changed > 0
            ? t(`${K}.introPlayer`)
            : t(`${K}.allRaw`)}
      </p>
      {rows.map((group) => (
        <section
          key={group.id}
          className="f-rules-group"
          aria-label={t(`${K}.groups.${group.id}`)}
        >
          <h3 className="f-lbl">{t(`${K}.groups.${group.id}`)}</h3>
          {group.rows.map((row) => (
            <RuleRow key={row.id} row={row} editable={isDm} onSet={set} />
          ))}
        </section>
      ))}
    </Panel>
  );
}

function RuleRow({
  row,
  editable,
  onSet,
}: {
  row: TableRuleRow;
  editable: boolean;
  onSet: (path: RulePath, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const R = `${K}.rows.${row.id}`;
  return (
    <div className="f-rule">
      <div className="f-rule-head">
        <span className="f-row-t">{t(`${R}.title`)}</span>
        {row.raw ? (
          <span className="f-quiet">{t(`${K}.raw`)}</span>
        ) : (
          <Chip kind="cond">{t(`${K}.table`)}</Chip>
        )}
      </div>
      <span className="f-row-s">{t(`${R}.why`)}</span>
      {row.kind === "choice" && (
        <div className="f-chips">
          {(editable ? row.choices : [row.current]).map((value) => (
            <Chip
              key={String(value)}
              {...(editable
                ? {
                    pressed: row.current === value,
                    onClick: () => onSet(row.path, value),
                  }
                : {})}
            >
              {t(`${R}.choices.${String(value)}`)}
            </Chip>
          ))}
        </div>
      )}
      {row.kind === "toggles" && (
        <div className="f-chips">
          {row.toggles
            .filter((tg) => editable || tg.on)
            .map((tg) => (
              <Chip
                key={tg.path.join(".")}
                {...(editable
                  ? { pressed: tg.on, onClick: () => onSet(tg.path, !tg.on) }
                  : {})}
              >
                {t(`${R}.toggles.${tg.path[tg.path.length - 1] ?? ""}`)}
              </Chip>
            ))}
        </div>
      )}
      {row.kind === "numbers" &&
        (editable && !open && row.raw ? (
          <div className="f-chips">
            <Chip pressed>{t(`${K}.raw`)}</Chip>
            <Chip onClick={() => setOpen(true)}>{t(`${K}.customize`)}</Chip>
          </div>
        ) : (
          <div className="f-rule-fields">
            {row.fields.map((f) => {
              const label = t(`${R}.fields.${f.path[f.path.length - 1] ?? ""}`);
              return editable ? (
                <label key={f.path.join(".")} className="f-rule-field">
                  <span className="f-lbl">{label}</span>
                  <Stepper
                    value={f.value}
                    min={f.min}
                    max={f.max}
                    label={label}
                    less={t("common.decrease")}
                    more={t("common.increase")}
                    onChange={(value) => onSet(f.path, value)}
                  />
                </label>
              ) : (
                <span
                  key={f.path.join(".")}
                  className="f-row-s"
                >{`${label}: ${String(f.value)}`}</span>
              );
            })}
          </div>
        ))}
    </div>
  );
}
