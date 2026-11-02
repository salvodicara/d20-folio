/**
 * «Bottino» (approved prototype loot): what was found (coins, objects by name) and where
 * it goes: to me, to the party chest, or split in equal shares. Before Confirm it says
 * exactly what will happen, read off the engine's own plan (`planLoot`), so the preview
 * and the move never disagree.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CurrencyUnit } from "@/data/types";
import { lootSummary } from "@/domains/treasury/chest-view";
import { planLoot, type LootDestination } from "@/features/campaigns/chest";
import type { CampaignDoc, ChestItemRef, CoinPurse } from "@/types/campaign";
import { Button, Chip, Dialog, Field } from "@/ui";

const COINS: CurrencyUnit[] = ["pp", "gp", "ep", "sp", "cp"];
const WHERE: LootDestination[] = ["me", "chest", "split"];

export interface LootDraft {
  coins: CoinPurse;
  items: { item: ChestItemRef; quantity: number }[];
  to: LootDestination;
}

export function LootDialog({
  campaign,
  uid,
  onClose,
  onConfirm,
}: {
  campaign: CampaignDoc;
  uid: string;
  onClose: () => void;
  onConfirm: (draft: LootDraft) => void;
}) {
  const { t } = useTranslation();
  const [coins, setCoins] = useState<Record<CurrencyUnit, string>>({
    pp: "",
    gp: "",
    ep: "",
    sp: "",
    cp: "",
  });
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [to, setTo] = useState<LootDestination>("split");
  const sharers = useMemo(
    () =>
      Object.entries(campaign.memberDetails).flatMap(([id, m]) =>
        m.characterId && m.character ? [{ id, name: m.character.name }] : []
      ),
    [campaign.memberDetails]
  );
  const purse: CoinPurse = Object.fromEntries(
    COINS.flatMap((c) => {
      const n = Math.floor(Number(coins[c]));
      return n > 0 ? [[c, n]] : [];
    })
  );
  const qty = Math.floor(Number(itemQty));
  const items =
    itemName.trim() && qty >= 1
      ? [{ item: { custom: true as const, name: itemName.trim() }, quantity: qty }]
      : [];
  const draft: LootDraft = { coins: purse, items, to };
  // The engine's own plan, with throwaway ids: only its shape is read here.
  let n = 0;
  const summary = lootSummary(
    planLoot(
      { uid, now: 0, newId: () => `preview-${++n}` },
      { ...draft, sharers: sharers.map((s) => s.id) }
    )
  );
  const money = (p: CoinPurse) =>
    COINS.flatMap((c) =>
      p[c] ? [String(p[c]) + " " + t(`equipment.currencyAbbr.${c}`)] : []
    ).join(", ");
  const preview = !summary
    ? t("treasury.lootNothing")
    : summary.toMe
      ? t("treasury.lootToMe")
      : summary.share
        ? [
            t("treasury.lootSplit", {
              names: sharers.map((s) => s.name).join(", "),
              share: money(summary.share),
            }),
            Object.keys(summary.toChest).length
              ? t("treasury.lootRemainder", { coins: money(summary.toChest) })
              : null,
            summary.itemsToChest ? t("treasury.lootItemsToChest") : null,
          ]
            .filter(Boolean)
            .join(" ")
        : t("treasury.lootToChest");
  return (
    <Dialog
      open
      onClose={onClose}
      color="tes"
      title={t("treasury.loot")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="quiet" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" disabled={!summary} onClick={() => onConfirm(draft)}>
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      <div className="f-stack">
        <div className="f-field">
          <span className="f-lbl">{t("treasury.lootFound")}</span>
          <div className="f-coin-inputs">
            {COINS.map((c) => (
              <Field
                key={c}
                label={t(`equipment.currencyAbbr.${c}`)}
                type="number"
                inputMode="numeric"
                min={0}
                value={coins[c]}
                onChange={(e) => setCoins({ ...coins, [c]: e.target.value })}
              />
            ))}
          </div>
        </div>
        <div className="f-coin-inputs">
          <Field
            label={t("treasury.itemName")}
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
          <Field
            label={t("treasury.amount")}
            type="number"
            inputMode="numeric"
            min={1}
            value={itemQty}
            onChange={(e) => setItemQty(e.target.value)}
          />
        </div>
        <div className="f-field">
          <span className="f-lbl">{t("treasury.lootWhere")}</span>
          <div className="f-chips">
            {WHERE.map((w) => (
              <Chip key={w} pressed={to === w} onClick={() => setTo(w)}>
                {t(`treasury.lootTo.${w}`)}
              </Chip>
            ))}
          </div>
        </div>
        <p className="f-help" role="status">
          {preview} {summary && t("treasury.lootLogged")}
        </p>
      </div>
    </Dialog>
  );
}
