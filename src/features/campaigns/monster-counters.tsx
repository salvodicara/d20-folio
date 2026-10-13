/**
 * monster-counters — the DM's counters on a monster's stat-block disclosure, the D&D
 * Beyond / Foundry monster-sheet grammar: a Recharge entry is a one-tap toggle
 * ("Recharge 5–6: ready / used"), an N/Day entry, each spell of an "N/Day Each" tier
 * and the legendary action pool are pips (tap a lit pip to spend it, a spent pip to
 * give it back), and every listed spell opens its compendium entry.
 *
 * The counters come from `monsterLimitedUses` and write the combatant's `spent`
 * through the DM's `apply` seam (the same debounced encounter writer as every other
 * monster edit). A per-day spell spent with a tap also reports the cast
 * (`onCastSpell`) so it reaches the Combat Chronicle. DM only: without `apply`
 * nothing renders and the statblock stays the plain read view.
 */

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  MonsterStatBlockCard,
  type MonsterEntrySection,
  type MonsterStatBlockCardProps,
} from "@/components/shared/MonsterStatBlockCard";
import { PickerDetailModal } from "@/components/shared/PickerDetailModal";
import { spellSpec } from "@/features/compendium/picker/specs/spell";
import { getSpellById } from "@/data/spells";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { srdKey } from "@/i18n/srd-key";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/locale";
import type {
  MonsterEntry,
  MonsterSpellcastingEntry,
  MonsterStatBlock,
} from "@/data/types";
import {
  monsterLimitedUses,
  monsterUseKey,
  restoreMonsterUse,
  spendMonsterUse,
  type MonsterLimitedUse,
} from "./encounter";
import type { ApplyFn } from "./party-encounter";

/** Pips for one counter: lit = still available. */
function UsePips({
  use,
  used,
  name,
  onSpend,
  onRestore,
  spendLabel,
}: {
  use: MonsterLimitedUse;
  used: number;
  /** What the pips count (the entry, spell or pool name) — for the accessible labels. */
  name: string;
  onSpend: () => void;
  onRestore: () => void;
  /** The lit pip's label when it does more than spend (a spell: "Cast Fireball"). */
  spendLabel?: string;
}) {
  const { t } = useTranslation();
  const available = Math.max(0, use.max - used);
  return (
    <span
      // Beside what it counts, not pushed to the far edge like a rail row.
      className="trk-pips ml-0!"
      role="group"
      data-use={use.key}
      aria-label={t("campaignHub.monsterUsesLeft", {
        name,
        available,
        max: use.max,
      })}
    >
      {Array.from({ length: use.max }, (_, i) => {
        const on = i < available;
        return (
          <button
            key={i}
            type="button"
            className={cn("trk-pip", on && "on")}
            data-on={on ? "true" : "false"}
            aria-label={
              on
                ? (spendLabel ?? t("campaignHub.monsterUseSpend", { name }))
                : t("campaignHub.monsterUseRestore", { name })
            }
            onClick={on ? onSpend : onRestore}
          />
        );
      })}
    </span>
  );
}

/** A counter row: what it counts on the left, its pips on the right. */
function CounterRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 text-sm text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

export interface MonsterCountersArgs {
  monster: MonsterStatBlock;
  combatantId: string;
  /** The combatant's spent uses (live off the encounter). */
  spent?: Readonly<Record<string, number>>;
  /** The DM's write seam; absent ⇒ no counters (a player's read view). */
  apply?: ApplyFn;
  /** A per-day spell was cast with a tap — record it in the chronicle. */
  onCastSpell?: (spellId: string) => void;
  locale: Locale;
}

/**
 * The statblock slots that carry the counters, plus the spell detail modal a spell
 * name opens (render it beside the card).
 */
function useMonsterCounters({
  monster: m,
  combatantId,
  spent,
  apply,
  onCastSpell,
  locale,
}: MonsterCountersArgs): Pick<
  MonsterStatBlockCardProps,
  "entryExtra" | "legendaryExtra"
> & {
  spellDetail: ReactNode;
} {
  const { t } = useTranslation();
  const [openSpellId, setOpenSpellId] = useState<string | null>(null);
  const uses = useMemo(
    () => new Map(monsterLimitedUses(m).map((use) => [use.key, use])),
    [m]
  );
  const spellDetail = (
    <PickerDetailModal
      entry={openSpellId ? getSpellById(openSpellId) : null}
      spec={spellSpec}
      rubric={t("nav.compendium")}
      onClose={() => setOpenSpellId(null)}
    />
  );
  if (!apply) return { spellDetail };

  const usedOf = (key: string) => spent?.[key] ?? 0;
  const spend = (use: MonsterLimitedUse) => {
    apply((e) => spendMonsterUse(e, combatantId, use.key, use.max));
    if (use.spellId) onCastSpell?.(use.spellId);
  };
  const restore = (use: MonsterLimitedUse) =>
    apply((e) => restoreMonsterUse(e, combatantId, use.key));

  const spellName = (id: string) =>
    hasSrd("spell", id, "name", locale) ? localizeSrd("spell", id, "name", locale) : id;
  const spellLink = (id: string) =>
    getSpellById(id) ? (
      <button
        type="button"
        className="md-link text-left"
        data-spell={id}
        onClick={() => setOpenSpellId(id)}
      >
        {spellName(id)}
      </button>
    ) : (
      <span data-spell={id}>{spellName(id)}</span>
    );

  const spellList = (section: MonsterEntrySection, entry: MonsterSpellcastingEntry) => (
    <div className="flex flex-col gap-2">
      {entry.atWill && entry.atWill.length > 0 && (
        <div className="text-sm">
          <span className="beast-ref-label">{t("campaignHub.monsterAtWill")}</span>{" "}
          {entry.atWill.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && ", "}
              {spellLink(id)}
            </Fragment>
          ))}
        </div>
      )}
      {entry.perDay?.map((tier) => (
        <div key={tier.count} className="flex flex-col gap-1">
          <span className="beast-ref-label">
            {t(
              tier.spellIds.length > 1
                ? "campaignHub.monsterPerDayEach"
                : "campaignHub.monsterPerDay",
              { count: tier.count }
            )}
          </span>
          {tier.spellIds.map((id) => {
            const use = uses.get(monsterUseKey(section, entry.id, id));
            if (!use) return null;
            return (
              <div key={id} data-spell-row>
                <CounterRow label={spellLink(id)}>
                  <UsePips
                    use={use}
                    used={usedOf(use.key)}
                    name={spellName(id)}
                    spendLabel={t("campaignHub.monsterCastSpell", {
                      name: spellName(id),
                    })}
                    onSpend={() => spend(use)}
                    onRestore={() => restore(use)}
                  />
                </CounterRow>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const entryExtra = (section: MonsterEntrySection, entry: MonsterEntry): ReactNode => {
    const use = uses.get(monsterUseKey(section, entry.id));
    const name = localizeSrd("monster", srdKey(m.id, section, entry.id), "name", locale);
    let counter: ReactNode = null;
    if (use?.kind === "recharge" && entry.recharge) {
      const used = usedOf(use.key) > 0;
      counter = (
        <div>
          <Button
            variant="secondary"
            size="sm"
            // Spent reads dimmed, like a hollow pip; ready stays lit.
            className={used ? "opacity-60" : undefined}
            aria-pressed={used}
            data-use={use.key}
            onClick={() => (used ? restore(use) : spend(use))}
          >
            {t("campaignHub.monsterRechargeToggle", {
              recharge:
                entry.recharge === 6
                  ? t("monster.rechargeExact")
                  : t("monster.recharge", { min: entry.recharge }),
              state: used
                ? t("campaignHub.monsterRechargeUsed")
                : t("campaignHub.monsterRechargeReady"),
            })}
          </Button>
        </div>
      );
    } else if (use?.kind === "uses" && entry.uses) {
      counter = (
        <CounterRow
          label={
            entry.uses.per === "day"
              ? t("monster.usesPerDay", { count: entry.uses.count })
              : entry.uses.per === "long-rest"
                ? t("monster.usesRechargeLong")
                : t("monster.usesRechargeShortLong")
          }
        >
          <UsePips
            use={use}
            used={usedOf(use.key)}
            name={name}
            onSpend={() => spend(use)}
            onRestore={() => restore(use)}
          />
        </CounterRow>
      );
    }
    const spells = entry.kind === "spellcasting" ? spellList(section, entry) : null;
    if (!counter && !spells) return null;
    return (
      <>
        {counter}
        {spells}
      </>
    );
  };

  const pool = uses.get("legendary");
  // The pool's pips sit on the "Legendary Action Uses: 3" line itself.
  const legendaryExtra = pool ? (
    <UsePips
      use={pool}
      used={usedOf(pool.key)}
      name={t("monster.legendaryActions")}
      onSpend={() => spend(pool)}
      onRestore={() => restore(pool)}
    />
  ) : undefined;

  return { entryExtra, legendaryExtra, spellDetail };
}

/** The statblock with the DM's counters on it (the plain card without `apply`). */
export function MonsterCountedStatBlock({
  title,
  ...args
}: MonsterCountersArgs & { title: string }) {
  const { entryExtra, legendaryExtra, spellDetail } = useMonsterCounters(args);
  return (
    <>
      <MonsterStatBlockCard
        monster={args.monster}
        locale={args.locale}
        title={title}
        entryExtra={entryExtra}
        legendaryExtra={legendaryExtra}
      />
      {spellDetail}
    </>
  );
}
