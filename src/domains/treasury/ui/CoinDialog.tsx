/**
 * Put coins in or take them out of the shared chest: which coin, how many, an optional
 * note. A take is capped at what the chest holds. The write is the atomic
 * `applyTreasuryDelta`; the screen updates at once and the toast offers the undo.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { CurrencyUnit } from "@/data/types";
import { coinMove } from "@/domains/treasury/coin-move";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { applyTreasuryDelta, undoTreasuryEntry } from "@/features/campaigns/campaign-io";
import { diagnosticsLog } from "@/lib/diagnostics";
import type { CampaignDoc, TreasuryLogEntry } from "@/types/campaign";
import { Button, Chip, Dialog, Field } from "@/ui";

const COINS: CurrencyUnit[] = ["pp", "gp", "ep", "sp", "cp"];

export function CoinDialog({
  campaign,
  uid,
  mode,
  onClose,
  onDone,
}: {
  campaign: CampaignDoc;
  uid: string;
  mode: "in" | "out";
  onClose: () => void;
  onDone: (message: string, undo: () => void) => void;
}) {
  const { t } = useTranslation();
  const [currency, setCurrency] = useState<CurrencyUnit>("gp");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const held = campaign.treasury[currency];
  const entry = coinMove(campaign.treasury, {
    mode,
    amount: Number(amount),
    currency,
    note,
    by: uid,
    at: new Date(),
  });

  const confirm = () => {
    if (!entry) return;
    const store = useCampaignStore.getState();
    store.setTreasury({
      ...campaign.treasury,
      [currency]: held + (entry.type === "add" ? entry.amount : -entry.amount),
    });
    store.addTreasuryLogEntry(entry);
    void applyTreasuryDelta(campaign.id, entry).catch((error: unknown) =>
      diagnosticsLog("warn", "treasury.write-failed", { message: String(error) })
    );
    const coins =
      String(entry.amount) + "\u00a0" + t(`equipment.currencyAbbr.${entry.currency}`);
    onDone(
      t(mode === "in" ? "treasury.putDone" : "treasury.takeDone", { amount: coins }),
      () => undo(campaign.id, entry)
    );
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      color="tes"
      title={t(mode === "in" ? "treasury.putTitle" : "treasury.takeTitle")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="quiet" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" onClick={confirm} disabled={!entry}>
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      <div className="f-stack">
        <div className="f-field">
          <span className="f-lbl">{t("treasury.coin")}</span>
          <div className="f-chips">
            {COINS.map((c) => (
              <Chip key={c} pressed={c === currency} onClick={() => setCurrency(c)}>
                {t(`equipment.currencyAbbr.${c}`)}
              </Chip>
            ))}
          </div>
        </div>
        <Field
          label={t("treasury.amount")}
          help={mode === "out" ? t("treasury.held", { count: held }) : undefined}
          type="number"
          inputMode="numeric"
          min={1}
          max={mode === "out" ? Math.max(1, held) : undefined}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Field
          label={t("treasury.note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

/** Take the move back: on screen at once, then the atomic reversal. */
function undo(campaignId: string, entry: TreasuryLogEntry): void {
  const store = useCampaignStore.getState();
  const index =
    store.campaign?.treasuryLog.findIndex(
      (e) => e.by === entry.by && e.at.getTime() === entry.at.getTime()
    ) ?? -1;
  if (index >= 0) store.cancelTreasuryLogEntry(index);
  void undoTreasuryEntry(campaignId, entry).catch((error: unknown) =>
    diagnosticsLog("warn", "treasury.undo-failed", { message: String(error) })
  );
}
