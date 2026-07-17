/**
 * Treasury — the shared party pot (Phase 5 · Part 2b; D52; TREASURY-UX).
 *
 * The real home of the party treasury. Any member adjusts the pooled coins; the
 * edit mutates `campaignStore` (`setTreasury` + `addTreasuryLogEntry` /
 * `cancelTreasuryLogEntry`), which the hub's `useCampaignSubscription`
 * debounce-persists through the 2a `campaign-io` path — `treasury` + `treasuryLog`
 * are `CampaignWritable` and always ride the same write. Totals are derived
 * client-side (NFR §4).
 *
 * TREASURY-UX — the two common operations are the fastest possible path: the
 * FIXED panel (always visible — {@link SectionPanel}) is just the coin totals plus
 * "Add coins" / "Take coins" (intent declared up front, so the disclosed form needs
 * ONE commit button, not an add-vs-remove fork after typing). The amount is a
 * `NumberStepper` clamped to `[1, balance]` for a take — an overdraft or invalid
 * amount is UNREACHABLE by construction (golden rule 20), so the old error/hint
 * machinery is gone. A transaction is truly undoable per ledger row: the entry is
 * deleted AND its coin movement reversed in one store update (one debounced write).
 * The transaction ledger is the section's collapsible DETAIL (the at-a-glance coins
 * never fold — bug C), itself bounded to the latest 5 with "View all (N)" (the
 * CAMPAIGN-NOTES pattern).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NumberStepper } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { CurrencyTokens } from "@/components/shared/CurrencyTokens";
import { Badge } from "@/components/ui/badge";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { type CurrencyMetal } from "@/components/shared/currency";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { treasuryTotalGp, useCampaignStore } from "@/features/campaigns/campaignStore";
import { applyTreasuryDelta, undoTreasuryEntry } from "@/features/campaigns/campaign-io";
import type { TreasuryLogEntry } from "@/types/campaign";

/** Bounded ledger: the latest entries at a glance, the rest behind "View all". */
const VISIBLE_ENTRIES = 5;

export function Treasury() {
  const { t, i18n } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const campaign = useCampaignStore((s) => s.campaign);
  const setTreasury = useCampaignStore((s) => s.setTreasury);
  const addTreasuryLogEntry = useCampaignStore((s) => s.addTreasuryLogEntry);
  const cancelTreasuryLogEntry = useCampaignStore((s) => s.cancelTreasuryLogEntry);

  // The form is disclosed on demand with its INTENT (add vs take) chosen by the
  // opening tap, so the resting treasury is just the coin totals (CMP5).
  const [mode, setMode] = useState<"add" | "take" | null>(null);
  const [amount, setAmount] = useState(1);
  const [currency, setCurrency] = useState<CurrencyMetal>("gp");
  const [note, setNote] = useState("");
  const [showAllLog, setShowAllLog] = useState(false);

  // Undoing a transaction reverses shared money for the whole party — confirm
  // first, stating the EXACT coin movement (clamped to what is actually there).
  async function confirmUndoEntry(index: number, entry: TreasuryLogEntry): Promise<void> {
    if (!campaign) return;
    const moved =
      entry.type === "add"
        ? Math.min(entry.amount, campaign.treasury[entry.currency])
        : entry.amount;
    const coin = t(`equipment.currencyAbbr.${entry.currency}`);
    const ok = await useConfirmStore.getState().confirm({
      title: t("campaignHub.undoTransactionTitle"),
      message:
        entry.type === "add"
          ? t("campaignHub.undoAddMessage", { amount: moved, coin })
          : t("campaignHub.undoTakeMessage", { amount: entry.amount, coin }),
      confirmLabel: t("campaignHub.undoTransaction"),
      tone: "danger",
    });
    if (!ok) return;
    // Optimistic (instant UI) then the ATOMIC reversal (B06): reverse the coins +
    // drop the row so an undo composes with a concurrent add/take instead of the old
    // whole-object clobber.
    cancelTreasuryLogEntry(index);
    void undoTreasuryEntry(campaign.id, entry).catch((e: unknown) =>
      console.error("Treasury undo write failed", e)
    );
  }

  if (!campaign) return null;
  const { treasury } = campaign;

  const available = treasury[currency];
  // Golden rule 20 — the amount can never BE invalid: the stepper clamps typing
  // and stepping to [1, balance] for a take (no overdraft to warn about) and to
  // a positive whole number for an add.
  const maxAmount = mode === "take" ? Math.max(1, available) : undefined;
  const clampedAmount = maxAmount !== undefined ? Math.min(amount, maxAmount) : amount;
  const canCommit = mode === "add" || available > 0;

  function openForm(next: "add" | "take"): void {
    setMode(next);
    setAmount(1);
    setNote("");
  }

  function selectCurrency(metal: CurrencyMetal): void {
    if (!campaign) return;
    setCurrency(metal);
    // Re-clamp the typed amount to the newly selected coin's balance.
    if (mode === "take") {
      setAmount((a) => Math.min(a, Math.max(1, campaign.treasury[metal])));
    }
  }

  function commit(): void {
    if (!campaign || !mode || !canCommit) return;
    const current = campaign.treasury[currency];
    const moved = mode === "take" ? Math.min(clampedAmount, current) : clampedAmount;
    if (moved <= 0) return;
    const next = mode === "add" ? current + moved : current - moved;
    const entry: TreasuryLogEntry = {
      amount: moved,
      currency,
      type: mode === "add" ? "add" : "remove",
      note: note.trim(),
      by: uid ?? "",
      at: new Date(),
    };
    // Optimistic (instant UI); the ATOMIC write is the source of truth (B06 — a
    // per-currency increment + arrayUnion ledger append that COMPOSES with concurrent
    // edits, replacing the old whole-object last-write-wins that corrupted the total
    // and dropped rows).
    setTreasury({ ...campaign.treasury, [currency]: next });
    addTreasuryLogEntry(entry);
    void applyTreasuryDelta(campaign.id, entry).catch((e: unknown) =>
      console.error("Treasury write failed", e)
    );
    setMode(null);
  }

  // Newest first, bounded to the latest VISIBLE_ENTRIES (CAMPAIGN-NOTES pattern).
  // Each row carries its ORIGINAL index so an undo targets the right record.
  const log = campaign.treasuryLog;
  const newestFirst = log.map((e, index) => ({ e, index })).reverse();
  const ledger = showAllLog ? newestFirst : newestFirst.slice(0, VISIBLE_ENTRIES);
  const hiddenCount = log.length - ledger.length;

  function entryMeta(entry: TreasuryLogEntry): string {
    const name = campaign?.memberDetails[entry.by]?.displayName ?? "";
    const date =
      entry.at instanceof Date && !Number.isNaN(entry.at.getTime())
        ? entry.at.toLocaleDateString(i18n.language, { day: "numeric", month: "short" })
        : "";
    return [name, date].filter(Boolean).join(" · ");
  }

  // The ledger is the collapsible DETAIL — the bulky secondary history. The coin
  // totals + Add/Take controls stay in the FIXED panel (always visible — bug C:
  // a folded Treasury used to show nothing). An EMPTY ledger still rides the DETAIL
  // slot with an honest "no transactions yet" sentence (mirroring the hub's sessions/
  // notes empty line) so the section keeps its `.section-card` frame — SectionPanel
  // frames ONLY a truthy detail, so an `undefined` here floated the coins + buttons
  // with no card behind them (owner bug). It opens by default when empty so the state
  // explains itself at a glance.
  const ledgerDetail =
    log.length > 0 ? (
      <ul className="flex flex-col gap-1 text-sm text-text-secondary">
        {ledger.map(({ e, index }) => (
          <li
            key={`${e.at.toString()}-${index}`}
            className="group flex items-center gap-2"
          >
            <span className="min-w-0 flex-1 truncate">
              {e.type === "add" ? "+" : "−"}
              {e.amount} {t(`equipment.currencyAbbr.${e.currency}`)}
              {e.note ? ` · ${e.note}` : ""}
            </span>
            <span className="flex-shrink-0 text-xs text-text-muted">{entryMeta(e)}</span>
            <IconButton
              className="flex-shrink-0 text-text-muted hover:text-danger"
              aria-label={t("campaignHub.undoTransaction")}
              onClick={() => void confirmUndoEntry(index, e)}
            >
              <Icon as={X} size="xs" decorative />
            </IconButton>
          </li>
        ))}
        {hiddenCount > 0 || showAllLog ? (
          <li>
            <button
              type="button"
              className="rh-action text-text-muted hover:text-accent-text"
              onClick={() => setShowAllLog((v) => !v)}
            >
              {showAllLog
                ? t("common.showLess")
                : t("campaignHub.viewAll", {
                    count: log.length,
                  })}
            </button>
          </li>
        ) : null}
      </ul>
    ) : (
      <p className="text-sm text-text-secondary">{t("campaignHub.treasuryEmpty")}</p>
    );

  return (
    <SectionPanel
      sectionId="treasury"
      title={t("campaignHub.treasury")}
      meta={
        <Badge variant="muted" size="sm">
          {t("campaignHub.totalGp", { gp: treasuryTotalGp(treasury) })}
        </Badge>
      }
      detail={ledgerDetail}
      defaultOpen={log.length === 0}
      showLabel={t("campaignHub.showTransactions", { count: log.length })}
      hideLabel={t("campaignHub.hideTransactions")}
    >
      <div className="flex flex-col gap-4">
        {/* Coins are the at-a-glance signal (the total lives in the header badge —
            no inline duplicate); the whole ledger sits behind the footer button. */}
        <CurrencyTokens values={treasury} />

        {mode === null ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openForm("add")}>
              <Icon as={Plus} size="sm" decorative />
              {t("campaignHub.addCoins")}
            </Button>
            <Button variant="secondary" onClick={() => openForm("take")}>
              <Icon as={Minus} size="sm" decorative />
              {t("campaignHub.takeCoins")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <CurrencyTokens
              selectable
              values={treasury}
              selected={currency}
              onSelect={selectCurrency}
            />
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[10rem_1fr]">
              <NumberStepper
                value={clampedAmount}
                onChange={setAmount}
                min={1}
                max={maxAmount}
                disabled={!canCommit}
                ariaLabel={t("campaignHub.amount")}
                decrementLabel={t("common.decrease")}
                incrementLabel={t("common.increase")}
              />
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("campaignHub.notePlaceholder")}
                aria-label={t("campaignHub.noteOptional")}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMode(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="secondary" onClick={commit} disabled={!canCommit}>
                <Icon as={Check} size="sm" decorative />
                {mode === "add" ? t("campaignHub.addCoins") : t("campaignHub.takeCoins")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionPanel>
  );
}
