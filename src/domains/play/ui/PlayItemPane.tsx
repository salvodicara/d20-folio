/**
 * The Play inventory's two panes (#1230), on D&D Beyond's model (Pattern source: its
 * sheet opens an item's pane from the row, with the item's details and Quantity, and
 * the coins' «Manage Coin» pane from the coin total).
 *
 * - The item pane: what it is (its line, the weight, the cost, a homebrew item's
 *   notes), how many (a stepper that never
 *   goes below 1), on or off for armor and wearable items, attunement, and «Rimuovi»
 *   with its undo. A read-only sheet (a shared link, the DM's view) shows the details
 *   alone.
 * - The coin pane: the total in gold, each coin with what it is worth, and one adjust
 *   row (a field per coin) that adds or takes in one move, undoable. A coin never
 *   goes below 0.
 *
 * Both write through the shared inventory moves, the same ones the classic sheet uses.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { PlayInventoryView, PlayItem } from "@/domains/play/play-inventory-view";
import {
  adjustCoins,
  deleteItem,
  setItemQuantity,
  toggleEquipped,
} from "@/features/character/inventory-commands";
import type { Locale } from "@/lib/locale";
import { formatWeight } from "@/lib/utils";
import { Button, Chip, Dialog, Field, Stepper } from "@/ui";

import { PlayAttuneRow } from "./PlayAttune";

const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;
type Coin = (typeof COINS)[number];
/** What one coin is worth in gold (SRD: 1 pp = 10 gp, 1 gp = 2 ep = 10 sp = 100 cp). */
const IN_GP: Record<Coin, number> = { pp: 10, gp: 1, ep: 0.5, sp: 0.1, cp: 0.01 };

export function PlayItemPane({
  item,
  line,
  locale,
  readonly,
  onClose,
}: {
  item: PlayItem;
  /** The item's one line at the table (damage, Armor Class, healing, charges). */
  line: string | null;
  locale: Locale;
  readonly: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { list, idx } = item.source;
  const facts = [
    line,
    item.weight > 0
      ? t("play.inv.weightEach", { weight: formatWeight(item.weight, locale) })
      : null,
    item.cost
      ? t("play.inv.costEach", {
          cost: t(`equipment.coinAmount.${item.cost.unit}`, {
            amount: item.cost.amount,
          }),
        })
      : null,
    item.stealthDisadvantage ? t("play.inv.stealth") : null,
  ].filter(Boolean);
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={item.name}
      closeLabel={t("common.close")}
      actions={
        readonly ? undefined : (
          <Button
            kind="ghost"
            onClick={() => {
              deleteItem(list, idx, item.name, t);
              onClose();
            }}
          >
            {t("play.inv.removeItem")}
          </Button>
        )
      }
    >
      <div className="f-stack">
        {facts.length > 0 && <p className="f-help">{facts.join(" · ")}</p>}
        {item.notes && <p className="f-item-notes">{item.notes}</p>}
        <div className="f-field">
          <span className="f-lbl">{t("common.quantity")}</span>
          {readonly ? (
            <b>{item.quantity}</b>
          ) : (
            <Stepper
              value={item.quantity}
              min={1}
              max={999}
              label={t("common.quantity")}
              less={t("play.inv.oneLess")}
              more={t("play.inv.oneMore")}
              onChange={(n) => setItemQuantity(list, idx, n)}
            />
          )}
        </div>
        {item.equip && !readonly && (
          <div className="f-chips">
            <Chip
              pressed={item.equip.equipped}
              onClick={() => toggleEquipped(idx, t, { name: item.name })}
            >
              {t(item.equip.equipped ? "equipment.equipped" : "equipment.equip")}
            </Chip>
          </div>
        )}
        {item.attune && !readonly && (
          <PlayAttuneRow attune={item.attune} name={item.name} locale={locale} />
        )}
      </div>
    </Dialog>
  );
}

export function PlayCoinPane({
  coins,
  locale,
  readonly,
  onClose,
}: {
  coins: PlayInventoryView["coins"];
  locale: Locale;
  readonly: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Record<Coin, string>>({
    pp: "",
    gp: "",
    ep: "",
    sp: "",
    cp: "",
  });
  const amounts = COINS.map(
    (c) => [c, Math.max(0, Math.floor(Number(draft[c]) || 0))] as const
  );
  const any = amounts.some(([, n]) => n > 0);
  const total = COINS.reduce((sum, c) => sum + coins[c] * IN_GP[c], 0);
  const listed = amounts
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${String(n)} ${t(`equipment.currencyAbbr.${c}`)}`)
    .join(", ");
  const move = (sign: 1 | -1) => {
    const delta = Object.fromEntries(
      amounts.filter(([, n]) => n > 0).map(([c, n]) => [c, sign * n])
    );
    if (
      adjustCoins(
        delta,
        t(sign > 0 ? "play.coins.addedToast" : "play.coins.takenToast", { coins: listed })
      )
    ) {
      setDraft({ pp: "", gp: "", ep: "", sp: "", cp: "" });
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={t("common.coins")}
      closeLabel={t("common.close")}
      actions={
        readonly ? undefined : (
          <>
            <Button kind="ghost" disabled={!any} onClick={() => move(-1)}>
              {t("play.coins.take")}
            </Button>
            <Button kind="primary" disabled={!any} onClick={() => move(1)}>
              {t("common.add")}
            </Button>
          </>
        )
      }
    >
      <div className="f-stack">
        <p className="f-help">
          {t("play.coins.total", {
            gp: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(total),
          })}
        </p>
        <ul className="f-coin-list">
          {COINS.map((c) => (
            <li key={c}>
              <span className="f-coin" data-coin={c}>
                <b>{coins[c]}</b> {t(`equipment.currencyAbbr.${c}`)}
              </span>
              {c !== "gp" && <span className="f-quiet">{t(`play.coins.rate.${c}`)}</span>}
            </li>
          ))}
        </ul>
        {!readonly && (
          <div className="f-field">
            <span className="f-lbl">{t("play.coins.adjust")}</span>
            <div className="f-coin-inputs">
              {COINS.map((c) => (
                <Field
                  key={c}
                  label={t(`equipment.currencyAbbr.${c}`)}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft[c]}
                  onChange={(e) => setDraft({ ...draft, [c]: e.target.value })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
