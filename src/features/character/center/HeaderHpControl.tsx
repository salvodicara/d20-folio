/**
 * HeaderHpControl — Hit Points, relocated into the CombatHeader vitals band
 * (Phase-6 cockpit IA revision). HP is the stat a player touches most in play, so
 * it lives in the always-visible header (on every tab) instead of the center.
 *
 * Two states, ONE engine (`useHpControls` — temp-absorbs-first, concentration DC
 * from the full hit, every change a 5s undo toast; the same engine the legacy
 * pill/rail/drawer surfaces use — relocated UI, NOT a forked engine):
 *
 *  - **Alive** — a slim Liquid-Mercury `.hp-bar` + the current/max(+temp) readout,
 *    as a Radix `Popover` trigger. The popover (portals out of any header clip)
 *    holds the full controls: the amount field + Damage / Heal / Temp + clear-temp,
 *    the hit-dice line, and the edit-mode max-HP / hit-dice InlineEditables
 *    (override-first, gated on `sheetMode`).
 *  - **Dying (0 HP)** — the element keeps its compact footprint and becomes a
 *    same-sized danger pill ("0 HP · Dying", zero layout shift in the vitals
 *    strip) that STAYS the one HP editor: tapping it opens the same popover,
 *    where damage taken while down marks death-save failures (RA-03; crit
 *    toggle = two). The dying CEREMONY (death-save roll entry + pips + quick
 *    heal) lives in the global `DyingBanner` strip (mounted in the cockpit) so
 *    it shows prominently on every tab without distorting this header band.
 *
 * RA-05: the popover receives the character's effective damage defenses from
 * the hook, so a typed entry applies resistances/immunities/vulnerabilities/
 * flat reductions with the math shown (chips render only when the character
 * actually defends something).
 */

import { useTranslation } from "react-i18next";
import { HeartCrack } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { totalLevel } from "@/lib/classes";
import { useUIStore } from "@/stores/uiStore";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import {
  computeCharacterMaxHp,
  effectiveMaxHpBreakdown,
} from "@/lib/aggregate-character";
import { localizeBreakdown } from "@/lib/views/combat-action-view";
import { useLocale } from "@/hooks/useLocale";
import { hpState, useHpControls } from "../molecules/use-hp-controls";
import { HpEditPopover, BloodiedMark } from "../molecules/HpEditPopover";
import { HpBadge } from "@/components/shared/StatBadge";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { BreakdownTip } from "@/components/shared/BreakdownTip";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { Icon } from "@/components/ui/icon";

/** Write the max HP, preserving the rest of the hp block (definition value). */
function setHpMax(max: number): void {
  const doc = useCharacterStore.getState().character;
  if (!doc) return;
  useCharacterStore.getState().setCharacter({
    ...doc,
    character: { ...doc.character, hp: { ...doc.character.hp, max } },
  });
}

/** Write (or clear) the hit-dice total override (definition value). */
function setHitDiceTotalOverride(value: number | null): void {
  const doc = useCharacterStore.getState().character;
  if (!doc) return;
  useCharacterStore.getState().setCharacter({
    ...doc,
    character: { ...doc.character, hitDiceTotalOverride: value ?? undefined },
  });
}

export function HeaderHpControl() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const readonly = useSheetReadonly();
  // T4 — a DM viewing a member's sheet never edits max HP, so force play mode for
  // the inline editors below (they only show their ✎ in edit mode anyway).
  const sheetMode = useUIStore((s) => (readonly ? "play" : s.sheetMode));
  const hasCharacter = useCharacterStore((s) => s.character != null);
  // The sheet half (classes/CON/feats) the by-the-book Max-HP composition reads.
  // Narrow selector so a session HP change can't re-run the decomposition (#95).
  const charData = useCharacterStore((s) => s.character?.character);
  // D1 — the session slices the EFFECTIVE-max breakdown reads (while-active +
  // lineage grants gate hp-flat; a standing Aid is a `while-active` hp-flat grant,
  // so it rides `activeFeatures`). Selected narrowly so unrelated session churn
  // doesn't re-run the tip composition.
  const activeFeatures = useCharacterStore((s) => s.character?.session.activeFeatures);
  const grantBundleChoices = useCharacterStore(
    (s) => s.character?.session.grantBundleChoices
  );
  const hitDiceUsed = useCharacterStore((s) => s.character?.session.hitDice.used ?? 0);
  const level = useCharacterStore((s) =>
    s.character ? totalLevel(s.character.character) : 0
  );
  const hitDiceTotalOverride = useCharacterStore(
    (s) => s.character?.character.hitDiceTotalOverride ?? null
  );

  // ONE HP engine — the derived readout + the amount-arg mutators (undo toasts,
  // the damage-intake defense math, and the 0-HP rules live inside). The popover
  // plumbing (open-state, amount input, chips, focus) lives in the shared
  // HpEditPopover this control renders below.
  const {
    current,
    max,
    temp,
    pct,
    bloodied,
    defenses,
    defendedTypes,
    resistedSources,
    atZero,
    dead,
    handleApplyDamage,
    applyHeal,
    applyTemp,
    clearTemp,
  } = useHpControls();

  if (!hasCharacter) return null;

  const state = hpState(current, max);
  const hitDiceTotal = hitDiceTotalOverride ?? level;
  const hitDiceRemaining = Math.max(0, hitDiceTotal - hitDiceUsed);

  // #95 / D1 — the Max-HP breakdown tip, OVERRIDE-GATED exactly like AC's. `max`
  // above is now the EFFECTIVE max (stored base + hp-flat boons, incl. a standing
  // Aid `while-active` grant). A tip can only honestly decompose it when the STORED
  // `hp.max` STILL equals the by-the-book base composition (per-class hit-die averages
  // + CON + Tough / Dwarven Toughness + per-level grants); a hand-pinned or rolled
  // base has no composition to explain — suppress the tip then (override-first; mirrors
  // `acOverride`). When it matches, the tip shows the base rows PLUS the hp-flat
  // boon/item/Aid rows that lift the effective total, so `breakdownTotal === max` by
  // construction (rule 6). The SAME `BreakdownTip` register every value rides (golden
  // rule 3), localized here.
  const storedMax = charData?.hp.max ?? max;
  const computedBase = charData ? computeCharacterMaxHp(charData) : storedMax;
  const maxBreakdown =
    charData && sheetMode !== "edit" && storedMax === computedBase
      ? localizeBreakdown(
          effectiveMaxHpBreakdown(charData, { activeFeatures, grantBundleChoices }),
          locale
        )
      : [];

  // ── Dying (0 HP) ──────────────────────────────────────────────────────────
  // The header HP element keeps a CONSTANT, COMPACT footprint — at 0 HP it
  // becomes a same-sized danger pill (zero layout shift in the vitals strip).
  // The dying CEREMONY (death-save roll entry + pips + quick heal) lives in the
  // global `DyingBanner` strip; the pill stays THE one HP editor (golden rule
  // 6): tapping it opens the SAME popover, where damage taken WHILE down marks
  // death-save failures (crit toggle = two — RA-03) and a mate's heal applies.
  if (current <= 0) {
    const dyingPill = (
      // The `title` lives on the WRAPPER (static span / trigger button), never
      // here — one hover gloss per pill.
      <span className="vhp-val">
        {/* A motion-safe danger beacon (decorative; the DyingBanner carries the
            assertive announcement + the reachable controls). */}
        <span
          aria-hidden
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-error motion-safe:animate-pulse"
        />
        <Icon as={HeartCrack} size="sm" decorative />
        <span>0</span>
      </span>
    );
    if (readonly) {
      return (
        <span
          className="vital vital-hp"
          data-density="tile"
          data-state="dying"
          title={t("character.dyingLabel")}
        >
          {dyingPill}
          <span className="v-lbl">{t("character.dyingShort")}</span>
        </span>
      );
    }
    return (
      <HpEditPopover
        current={current}
        max={max}
        temp={temp}
        onDamage={handleApplyDamage}
        onHeal={applyHeal}
        onTemp={applyTemp}
        onClearTemp={clearTemp}
        ariaLabel={t("character.hitPoints")}
        align="end"
        rubric={
          <GlossaryTip term="hitPoints" rubric={t("character.hitPoints")} side="bottom" />
        }
        defenses={defenses}
        defendedTypes={defendedTypes}
        resistedSources={resistedSources}
        atZero={atZero}
        dead={dead}
      >
        <button
          type="button"
          data-state="dying"
          aria-label={t("character.hpControlAria", { cur: 0, max })}
          title={t("character.dyingLabel")}
          className="vital vital-hp"
          data-density="tile"
        >
          {dyingPill}
          <span className="v-lbl">{t("character.dyingShort")}</span>
        </button>
      </HpEditPopover>
    );
  }

  // ── Alive (read-only) — the same vital chrome as a STATIC readout, no popover/
  // controls, so a DM sees current/max(+temp) HP without any way to change it. ──
  if (readonly) {
    return (
      <span
        className="vital vital-hp"
        data-density="tile"
        data-state={state}
        title={t("character.hpControlAria", { cur: current, max })}
      >
        <HpBadge
          density="tile"
          current={current}
          max={max}
          temp={temp}
          state={state}
          pct={pct}
          hpLabel={t("character.health.hpAbbr")}
          bloodiedMark={
            bloodied ? (
              <BloodiedMark
                label={t("character.health.bloodied")}
                hint={t("character.health.bloodiedHint")}
              />
            ) : null
          }
        />
      </span>
    );
  }

  // ── Alive — slim bar trigger + the shared HP-edit popover ─────────────────
  // The cockpit binds the SAME `HpEditPopover` the encounter card uses to its
  // store-bound engine mutators, and slots in its override-first max-HP breakdown
  // editor (`maxSlot`) + the hit-dice line (`footer`). The trigger keeps the
  // `.vital-hp` tile chrome verbatim (zero visual change).
  return (
    <HpEditPopover
      current={current}
      max={max}
      temp={temp}
      onDamage={handleApplyDamage}
      onHeal={applyHeal}
      onTemp={applyTemp}
      onClearTemp={clearTemp}
      ariaLabel={t("character.hitPoints")}
      align="end"
      // P2 — the rubric doubles as the glossary trigger: "Hit Points" expands into
      // the plain-language gloss (what HP are, what 0 means).
      rubric={
        <GlossaryTip term="hitPoints" rubric={t("character.hitPoints")} side="bottom" />
      }
      // RA-05 — the damage-intake props: the popover offers the character's
      // DEFENDED types as chips + previews the applied math (nothing renders
      // for a character with no typed defenses — minimum interaction).
      defenses={defenses}
      defendedTypes={defendedTypes}
      resistedSources={resistedSources}
      // #95 — in play mode the max is a tap-for-breakdown tip when it matches the
      // by-the-book composition; edit mode (or an override) falls back to the
      // inline editor.
      maxSlot={
        sheetMode !== "edit" && maxBreakdown.length > 1 ? (
          <BreakdownTip
            label={String(max)}
            lines={maxBreakdown}
            className="text-base text-text-secondary"
          />
        ) : (
          <InlineEditable
            type="number"
            editable={sheetMode === "edit"}
            // B08 — EDIT targets the STORED BASE (`hp.max`), never the EFFECTIVE `max`
            // (base + `agg.hpFlat`): binding `value={max}` baked a live hp-flat grant
            // (Draconic +3, a standing Aid, an hp-flat item) permanently into the base on
            // any edit, double-counting on the next recompute (GR6 one-source, GR8
            // override-first). The play-mode fallback (breakdown tip suppressed for a
            // hand-pinned base / husk class) still shows the EFFECTIVE total; `agg.hpFlat`
            // stays a read-time overlay either way.
            value={sheetMode === "edit" ? storedMax : max}
            computedValue={computedBase}
            min={1}
            max={999}
            onChange={setHpMax}
            onReset={() => setHpMax(computedBase)}
            ariaLabel={t("character.health.maxHp")}
            valueClassName="text-base text-text-secondary"
          />
        )
      }
      // Hit dice — remaining / total (editable in edit mode).
      footer={
        <div className="flex items-baseline justify-between border-t border-border-subtle pt-2 font-mono text-xs text-text-secondary">
          <span>
            <GlossaryTip
              term="hitDice"
              rubric={t("character.health.hitDice")}
              side="bottom"
            />
          </span>
          <span className="flex items-baseline gap-1">
            {hitDiceRemaining} /{" "}
            <InlineEditable
              type="number"
              editable={sheetMode === "edit"}
              value={hitDiceTotal}
              computedValue={level}
              min={1}
              max={20}
              onChange={setHitDiceTotalOverride}
              onReset={() => setHitDiceTotalOverride(null)}
              ariaLabel={t("character.health.hitDiceTotal")}
            />
          </span>
        </div>
      }
    >
      <button
        type="button"
        data-state={state}
        aria-label={t("character.hpControlAria", { cur: current, max })}
        // D12 — HP wears the `.vital` chrome (`.vital-hp`): readout, then the slim
        // Liquid-Mercury bar, then the HP label — column-stacked exactly like the
        // AC / Init / Speed / PB tiles, so it sits in the vitals row as a peer
        // instead of a stray boxed pill. Focus-visible falls through to the global
        // gold-halo ring (§07, AA-safe both themes); the `--radius-md` hugs it.
        className="vital vital-hp"
        data-density="tile"
      >
        <HpBadge
          density="tile"
          current={current}
          max={max}
          temp={temp}
          state={state}
          pct={pct}
          hpLabel={t("character.health.hpAbbr")}
          bloodiedMark={
            bloodied ? (
              <BloodiedMark
                label={t("character.health.bloodied")}
                hint={t("character.health.bloodiedHint")}
              />
            ) : null
          }
        />
      </button>
    </HpEditPopover>
  );
}
