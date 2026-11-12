/**
 * The campaign's Tesoro tab (approved prototypes camp-treasure + loot):
 * - «Cassa comune»: the shared coins (in, out) and «Bottino», which hands out what was
 *   found to me, to the chest, or in equal shares;
 * - «Oggetti nella cassa»: the objects anyone may take, and the named shares waiting for
 *   each player («Kaela: 33 mo»), which their own sheet collects;
 * - «Chi ha preso cosa»: coins and objects together, newest first.
 * Any member does all of it, each move with its undo; nobody writes another player's sheet.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CurrencyUnit } from "@/data/types";
import {
  chestItemName,
  treasuryAndChestHistory,
  type HistoryLine,
} from "@/domains/treasury/chest-view";
import { usePartyNames } from "@/domains/campaign/ui/use-party";
import { useChest, useChestMove, type Toaster } from "@/domains/treasury/ui/chest-moves";
import { CoinDialog } from "@/domains/treasury/ui/CoinDialog";
import { Coins } from "@/domains/treasury/ui/Coins";
import { LootDialog } from "@/domains/treasury/ui/LootDialog";
import { PutItemDialog } from "@/domains/treasury/ui/PutItemDialog";
import { distributeLoot, putInChest, takeFromChest } from "@/features/campaigns/chest-io";
import { intlTag, type Locale } from "@/lib/locale";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc, CoinPurse } from "@/types/campaign";
import { Button, Panel } from "@/ui";

const COINS: CurrencyUnit[] = ["pp", "gp", "ep", "sp", "cp"];

export function TreasuryTab({
  campaign,
  locale,
  onToast,
}: {
  campaign: CampaignDoc;
  locale: Locale;
  onToast: Toaster;
}) {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const [open, setOpen] = useState<"in" | "out" | "loot" | "item" | null>(null);
  const chest = useChest(campaign.id);
  const move = useChestMove(onToast);
  const players = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(campaign.memberDetails).map(([id, m]) => [id, m.displayName])
      ),
    [campaign.memberDetails]
  );
  // Each share is named as Gruppo names the character.
  const heroes = usePartyNames(campaign);
  const money = (p: CoinPurse) =>
    COINS.flatMap((c) =>
      p[c] ? [String(p[c]) + " " + t(`equipment.currencyAbbr.${c}`)] : []
    ).join(", ");
  const shares = chest.pickups.filter((p) => p.reason === "share" && p.coins);
  const lines = treasuryAndChestHistory(campaign.treasuryLog, chest.log, players);
  const day = (at: number) =>
    new Date(at).toLocaleDateString(intlTag(locale), { day: "numeric", month: "long" });
  if (!uid) return null;
  return (
    <div className="f-split">
      <div className="f-stack">
        <Panel
          color="tes"
          title={t("campaignScreen.chest")}
          aside={
            <Button kind="primary" icon="g-gem" onClick={() => setOpen("loot")}>
              {t("treasury.loot")}
            </Button>
          }
          foot={
            <>
              <Button icon="u-add" onClick={() => setOpen("in")}>
                {t("treasury.put")}
              </Button>
              <Button icon="u-download" onClick={() => setOpen("out")}>
                {t("treasury.take")}
              </Button>
            </>
          }
        >
          <Coins treasury={campaign.treasury} />
        </Panel>
        <Panel
          color="tes"
          title={t("treasury.itemsTitle")}
          foot={
            <Button icon="u-add" onClick={() => setOpen("item")}>
              {t("treasury.putItem")}
            </Button>
          }
        >
          {chest.items.length === 0 && shares.length === 0 && (
            <p className="f-quiet">{t("treasury.itemsEmpty")}</p>
          )}
          {chest.items.map((stack) => {
            const name = chestItemName(stack.item, locale);
            return (
              <div key={stack.id} className="f-row">
                <div className="f-row-main">
                  <div className="f-row-t">
                    {name}
                    {stack.quantity > 1 && (
                      <span className="f-count">{" ×⁠" + String(stack.quantity)}</span>
                    )}
                  </div>
                  {stack.note && <div className="f-row-s">{stack.note}</div>}
                </div>
                <Button
                  onClick={() =>
                    move(
                      () =>
                        takeFromChest(campaign.id, {
                          uid,
                          chestItemId: stack.id,
                          quantity: 1,
                        }),
                      t("treasury.tookItem", { item: name })
                    )
                  }
                >
                  {t("treasury.take")}
                </Button>
              </div>
            );
          })}
          {shares.map((share) => (
            <div key={share.id} className="f-row">
              <div className="f-row-main">
                <div className="f-row-t">
                  {t("treasury.shareOf", {
                    name: heroes[share.ownerUid] ?? players[share.ownerUid] ?? "",
                    coins: money(share.coins ?? {}),
                  })}
                </div>
                <div className="f-row-s">
                  {t(
                    share.ownerUid === uid
                      ? "treasury.shareMine"
                      : "treasury.shareWaiting"
                  )}
                </div>
              </div>
            </div>
          ))}
        </Panel>
      </div>
      <Panel color="log" title={t("treasury.historyTitle")}>
        {lines.length === 0 && <p className="f-quiet">{t("treasury.historyEmpty")}</p>}
        {lines.map((line, i) => (
          <p key={`${line.at}-${i}`} className="f-tl">
            <span>
              {[day(line.at), line.kind === "coins" ? who(line) : describe(line)].join(
                " · "
              )}
              {line.kind === "coins" && line.entry.note && (
                <span className="f-tl-by">{": " + line.entry.note}</span>
              )}
            </span>
            {/* a ledger's amount on the right, signed and coloured (a bank statement,
                D&D Beyond's currency log): what came in reads green, what left red */}
            {line.kind === "coins" && (
              <b className="f-tl-amt" data-dir={line.direction}>
                {`${line.direction === "in" ? "+" : "\u2212"}${String(line.entry.amount)}\u00a0${t(`equipment.currencyAbbr.${line.entry.currency}`)}`}
              </b>
            )}
          </p>
        ))}
      </Panel>
      {(open === "in" || open === "out") && (
        <CoinDialog
          campaign={campaign}
          uid={uid}
          mode={open}
          onClose={() => setOpen(null)}
          onDone={onToast}
        />
      )}
      {open === "item" && (
        <PutItemDialog
          onClose={() => setOpen(null)}
          onPut={({ name, quantity, note }) => {
            setOpen(null);
            move(
              () =>
                putInChest(campaign.id, {
                  uid,
                  item: { custom: true, name },
                  quantity,
                  ...(note ? { note } : {}),
                }),
              t("treasury.putItemDone", { item: name })
            );
          }}
        />
      )}
      {open === "loot" && (
        <LootDialog
          campaign={campaign}
          uid={uid}
          onClose={() => setOpen(null)}
          onConfirm={(draft) => {
            setOpen(null);
            move(
              () => distributeLoot(campaign, { uid, ...draft }),
              t(`treasury.lootDone.${draft.to}`)
            );
          }}
        />
      )}
    </div>
  );

  /** A coin line's words; its amount shows apart, on the right, signed. */
  function who(line: Extract<HistoryLine, { kind: "coins" }>): string {
    return line.who
      ? t(line.direction === "in" ? "treasury.putInBy" : "treasury.tookOutBy", {
          who: line.who,
        })
      : t(line.direction === "in" ? "treasury.cameInPlain" : "treasury.wentOutPlain");
  }

  function describe(line: HistoryLine): string {
    const who = line.who;
    if (line.kind === "coins") {
      const amount =
        String(line.entry.amount) +
        " " +
        t(`equipment.currencyAbbr.${line.entry.currency}`);
      return who
        ? t(line.direction === "in" ? "treasury.putIn" : "treasury.tookOut", {
            who,
            amount,
          })
        : t(line.direction === "in" ? "treasury.cameIn" : "treasury.wentOut", { amount });
    }
    const e = line.entry;
    if (line.kind === "loot")
      return t(`treasury.lootLine.${e.to ?? "chest"}`, {
        who: who ?? "",
        what: [
          e.coins ? money(e.coins) : null,
          e.quantity ? t("treasury.objects", { count: e.quantity }) : null,
        ]
          .filter(Boolean)
          .join(", "),
      });
    const item = e.item ? chestItemName(e.item, locale) : "";
    return t(line.kind === "put" ? "treasury.putItemLine" : "treasury.takeItemLine", {
      who: who ?? "",
      count: e.quantity ?? 1,
      item,
    });
  }
}
