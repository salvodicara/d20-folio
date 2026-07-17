/**
 * Wizard F spell LIST — the read-then-LEARN morphing accordion for spell
 * pools (creation cantrips/spells, level-up new spells/cantrips).
 *
 * Rows lead with the cockpit's chromatic level seal (`SpellLevelSeal` — the
 * SpellPicker / action-card recipe, localized cantrip glyph). The header
 * stands through every state; a tap unfolds the reading prose beneath it and
 * an explicit Learn commits — an exploratory tap must NEVER burn one of a
 * multi-pick's slots (owner round-6). Picked rows seal gold and grow the
 * open-book affordance (detail on SELECTED only → the shared compendium read
 * view). Multi-slot steps (cantrips + level-1 spells) fork via the chrome's
 * tab recipe with live n/total counters.
 *
 * Collapsed rows are CHEAP (header only) — a full class list stays snappy.
 */
import { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpenText,
  Check,
  ChevronDown,
  Hand,
  Hourglass,
  Ruler,
  Shield,
  Zap,
} from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/shared/SearchField";
import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { UniversalCardFacts } from "@/components/shared/UniversalCard";
import { PickerDetailModal } from "@/components/shared/PickerDetailModal";
import { spellSpec } from "@/features/compendium/picker/specs/spell";
import { rankedSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { SpellPickVM } from "@/lib/views/spell-pick-view";
import { SpellLevelSeal } from "./seals";
import { WizardForkTab } from "./chrome";
import { useEnthroneAnchor } from "./use-enthrone-anchor";
import { WizardFold } from "./fold";

/** One learnable slot (a pool + how many it requires). */
export interface SpellListSlot {
  id: string;
  /** Localized tab label ("Cantrips" / "Level 1 Spells"). */
  label: string;
  /** How many the slot requires. */
  amount: number;
  /** Localized micro-copy rubric under the tabs. */
  rubric: string;
  pool: ReadonlyArray<SpellPickVM>;
}

export function WizardSpellList({
  slots,
  picks,
  onToggle,
}: {
  slots: ReadonlyArray<SpellListSlot>;
  /** Picked spell ids per slot id. */
  picks: Readonly<Record<string, ReadonlyArray<string>>>;
  onToggle: (slotId: string, spellId: string, limit: number) => void;
}) {
  const { t } = useTranslation();
  const scopeRef = useRef<HTMLDivElement>(null);
  const remember = useEnthroneAnchor(scopeRef);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [readSpell, setReadSpell] = useState<SpellPickVM | null>(null);

  const slot = slots.find((sl) => sl.id === activeId) ?? slots[0];
  const slotPicks = (slot && picks[slot.id]) ?? [];
  // Two-tier ranked search (fb4): name hits first, description hits appended.
  const visible = slot
    ? rankedSearch(
        query,
        slot.pool,
        (sp) => sp.searchText,
        (sp) => sp.searchDesc
      )
    : [];

  const onHeader = useCallback(
    (id: string) => {
      remember(id);
      setFocusId((prev) => (prev === id ? null : id));
    },
    [remember]
  );
  const slotId = slot?.id ?? "";
  const slotAmount = slot?.amount ?? 0;
  const onCommit = useCallback(
    (id: string) => onToggle(slotId, id, slotAmount),
    [onToggle, slotId, slotAmount]
  );
  const onRead = useCallback(
    (id: string) => {
      const found = slot?.pool.find((sp) => sp.id === id) ?? null;
      setReadSpell(found);
    },
    [slot]
  );

  if (!slot) return null;

  return (
    <>
      <div className="wiz-controls">
        {slots.length > 1 && (
          <div
            className="wiz-fork wiz-slot-tabs"
            role="group"
            aria-label={t("wizard.spellKind")}
          >
            {slots.map((sl) => {
              const n = (picks[sl.id] ?? []).length;
              return (
                <WizardForkTab
                  key={sl.id}
                  active={slot.id === sl.id}
                  onClick={() => {
                    setActiveId(sl.id);
                    setFocusId(null);
                  }}
                >
                  {sl.label}
                  <span className={cn("wiz-tab-count tnum", n >= sl.amount && "full")}>
                    {n}/{sl.amount}
                  </span>
                </WizardForkTab>
              );
            })}
          </div>
        )}
        <p className="wiz-rubric">{slot.rubric}</p>
        <SearchField
          className="wiz-search"
          value={query}
          onChange={setQuery}
          placeholder={t("wizard.searchSpells")}
        />
      </div>

      {/* Disclosure entries, not options — see WizardFeatList. */}
      <div className="wiz-list" ref={scopeRef} aria-label={slot.label}>
        {visible.map((sp) => (
          <SpellEntry
            key={sp.id}
            sp={sp}
            picked={slotPicks.includes(sp.id)}
            open={sp.id === focusId}
            onHeader={onHeader}
            onCommit={onCommit}
            onRead={onRead}
          />
        ))}
        {visible.length === 0 && <p className="wiz-empty">{t("common.noResults")}</p>}
      </div>

      {/* The shared compendium read view — ONE source of truth for a spell's
          details, opened from a picked row's open-book affordance. */}
      <PickerDetailModal
        entry={readSpell?.entry}
        spec={spellSpec}
        onClose={() => setReadSpell(null)}
      />
    </>
  );
}

/**
 * ONE spell row — `memo`ized so expanding/learning one row never re-renders
 * the full class list (D: the ~320ms long task on the 277-row re-render).
 * Collapsed rows stay CHEAP (header only).
 */
const SpellEntry = memo(function SpellEntry({
  sp,
  picked,
  open,
  onHeader,
  onCommit,
  onRead,
}: {
  sp: SpellPickVM;
  picked: boolean;
  open: boolean;
  onHeader: (id: string) => void;
  onCommit: (id: string) => void;
  onRead: (id: string) => void;
}) {
  const { t } = useTranslation();
  const meta = [
    sp.level === 0 ? t("spells.cantrip") : t("spells.level", { level: sp.level }),
    t(`srd.school_${sp.school}`),
    t(`srd.castingTime_${sp.castingTimeKey}`),
    ...(sp.ritual ? [t("spells.ritual")] : []),
    ...(sp.concentration ? [t("spells.concentration")] : []),
  ].join(" · ");
  return (
    <div
      className="wiz-entry"
      data-fid={sp.id}
      data-open={open ? "" : undefined}
      data-picked={picked ? "" : undefined}
    >
      <button
        type="button"
        className="wiz-row"
        aria-expanded={open}
        onClick={() => onHeader(sp.id)}
      >
        <SpellLevelSeal level={sp.level} />
        <span className="wiz-row-main">
          <span className="wiz-row-eyebrow">{meta}</span>
          <span className="wiz-row-name">{sp.name}</span>
        </span>
        {picked && (
          <span className="wiz-row-check" aria-hidden>
            <Icon as={Check} size="xs" decorative />
          </span>
        )}
        <Icon
          as={ChevronDown}
          size="xs"
          decorative
          className={cn("wiz-chev", open && "open")}
        />
      </button>
      {/* Detail on SELECTED only: the picked row grows the open-book
          affordance (the shared compendium read view). */}
      {picked && !open && (
        <button
          type="button"
          className="wiz-book"
          aria-label={t("wizard.readSpell", { name: sp.name })}
          title={t("wizard.readSpell", { name: sp.name })}
          onClick={() => onRead(sp.id)}
        >
          <Icon as={BookOpenText} size="xs" decorative />
        </button>
      )}
      <WizardFold open={open}>
        <div className="wiz-read">
          {/* The typed-document fact rows (P2 anatomy — same glyph vocabulary
              as the cockpit spell card): what a player weighs BEFORE choosing.
              Casting time / concentration already ride the header eyebrow. */}
          <UniversalCardFacts
            facts={[
              { label: t("spells.range"), value: sp.range, icon: Ruler },
              {
                label: t("spells.damage"),
                value: [
                  sp.entry.damageDice,
                  sp.entry.damageType &&
                    t(`srd.damage_${sp.entry.damageType.toLowerCase()}`),
                ]
                  .filter(Boolean)
                  .join(" "),
                icon: Zap,
              },
              {
                label: t("spells.save"),
                value: sp.entry.saveAbility
                  ? t(`abilities.${sp.entry.saveAbility}_short`)
                  : "",
                icon: Shield,
              },
              { label: t("spells.duration"), value: sp.duration, icon: Hourglass },
              {
                label: t("spells.components"),
                value: [
                  sp.entry.components.v && "V",
                  sp.entry.components.s && "S",
                  sp.entry.components.m && "M",
                ]
                  .filter(Boolean)
                  .join(", "),
                icon: Hand,
              },
            ]}
          />
          <BlockMarkdown className="wiz-read-prose" text={sp.description} />
          <div className="wiz-read-act">
            {picked ? (
              <Button variant="ghost" onClick={() => onCommit(sp.id)}>
                {t("common.remove")}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => onCommit(sp.id)}>
                {t("wizard.learn", { name: sp.name })}
              </Button>
            )}
          </div>
        </div>
      </WizardFold>
    </div>
  );
});
