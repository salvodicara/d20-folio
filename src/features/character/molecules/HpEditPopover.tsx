/**
 * HpEditPopover — the ONE editable HP control, shared by the cockpit header and
 * the in-hub encounter card (golden rule 10 — no parallel HP editor).
 *
 * It is a CONTROLLED, store-agnostic presentational widget: the caller supplies
 * the surface-appropriate trigger (`children`) and the four mutation callbacks
 * (`onDamage` / `onHeal` / `onTemp` / `onClearTemp`); this component owns ONLY the
 * local amount-input + popover open-state. The body — the current/max(+temp)
 * readout, the tall `.hp-bar`, the amount field, and the three AA-tuned
 * `.hp-act-*` Damage / Heal / Temp buttons + a conditional clear-temp — is
 * shared, so both surfaces edit HP identically.
 *
 *   • COCKPIT  — `HeaderHpControl` binds the callbacks to `useHpControls`' engine
 *     mutators (undo toasts + the 0-HP rules) and slots its max-HP breakdown
 *     editor (`maxSlot`) + hit-dice line (`footer`), plus the RA-05 damage-intake
 *     section below.
 *   • ENCOUNTER — `PcCombatEditor` binds the callbacks to `combat-state-io`
 *     against an explicit `(uid, charId)`, with no max/footer slots and no
 *     intake section (a DM books final numbers).
 *
 * **RA-05 — the damage-intake section** (rendered ONLY when the caller passes
 * `defenses` and the character actually defends something — minimum
 * interaction: everyone else keeps the exact plain editor): under the amount
 * field, one toggle chip per DEFENDED damage type (+ a chip per resisted damage
 * SOURCE — Abjurer's "Spells"). Selecting a chip shows the live math
 * ("12 → 6 · Resistance") computed by the SAME `lib/damage-intake` pure
 * functions the commit applies — preview and result can never disagree. A
 * ghost "+ add" stages the current part so a multi-type hit (Flame Tongue:
 * 8 slashing + 7 fire) enters as parts with a running total; Damage commits
 * every part. Chips are OPTIONAL — an untyped amount applies verbatim
 * (override-first: homebrew tables never fight the UI).
 *
 * **RA-03 — at 0 HP** (`atZero`): a "Critical hit" toggle joins the row (a crit
 * while dying marks two failures) and a quiet hint explains that damage at 0
 * marks death-save failures. Once `dead`, the Damage verb disables.
 *
 * Anchored on `--bg-surface-1`: the `.hp-act-*` tinted-translucent buttons are
 * AA-verified on surface-1, so routing every HP edit through this popover keeps
 * the action buttons legible regardless of the trigger's own surface.
 *
 * Enter does NOT auto-apply: with three equal verbs a reflex Enter silently
 * committing DAMAGE is a destructive surprise, so the commit is always an explicit
 * verb tap (the DyingBanner's single-purpose quick heal keeps Enter — there it is
 * unambiguous + non-destructive).
 */

import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Droplet, Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReportEditorOpen } from "@/components/shared/card-editor-scope";
import { HpBar } from "@/components/shared/StatBadge";
import {
  resolveDamagePart,
  resolveDamageIntake,
  type DamageDefenses,
  type DamageInstance,
  type ResolvedDamagePart,
} from "@/lib/damage-intake";
import type { DamageSource, DamageType } from "@/data/types";
import { cn } from "@/lib/utils";
import { hpState } from "./hp-tier";

/**
 * S5 — the Bloodied marker: a compact vermilion droplet that sits inside an HP
 * readout when the character is at or below half their EFFECTIVE max HP (but still
 * up). A pure derived band (NOT a condition); the `title` carries the plain-language
 * gloss. Lives here so BOTH HP surfaces (cockpit vital + encounter well) render the
 * SAME chip next to the readout — one source, never disagreeing with the bar.
 */
export function BloodiedMark({ label, hint }: { label: string; hint: string }) {
  return (
    <span
      className="ml-1 inline-flex items-center gap-0.5 rounded-sm border border-error/40 bg-error/10 px-1 text-[length:var(--text-micro)] font-semibold uppercase tracking-[0.08em] text-error"
      title={hint}
      aria-label={label}
    >
      <Icon as={Droplet} size="xs" decorative />
      {label}
    </span>
  );
}

/** The shared lit-toggle chip (the `ActivatableFeaturesBar` grammar, sized down). */
function ToggleChip({
  label,
  pressed,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "rounded-md border px-2 py-0.5 text-[length:var(--text-micro)] font-semibold transition-colors",
        pressed
          ? "border-accent bg-accent/15 text-accent-text shadow-[var(--elev-resting)]"
          : "border-border-medium bg-bg-tertiary text-text-secondary hover:border-border-accent hover:text-text-primary"
      )}
    >
      {label}
    </button>
  );
}

interface HpEditPopoverProps {
  /** Current HP. */
  current: number;
  /** The EFFECTIVE max (cockpit passes `effectiveMaxHp`; encounter passes `stats.maxHp`). */
  max: number;
  /** Current temp HP. */
  temp: number;
  /**
   * Commit one entered hit — one or more damage instances (an untyped single
   * part is the plain fast path). `crit` marks a Critical Hit (RA-03: two
   * death-save failures when taken at 0 HP).
   */
  onDamage: (parts: ReadonlyArray<DamageInstance>, opts: { crit: boolean }) => void;
  onHeal: (amount: number) => void;
  onTemp: (amount: number) => void;
  onClearTemp: () => void;
  /** The surface-appropriate trigger (rendered `asChild` — must be a single focusable element). */
  children: ReactNode;
  /** The popover's accessible name (e.g. `t("character.hitPoints")`). */
  ariaLabel: string;
  /** Optional rubric header for the popover (cockpit: a GlossaryTip). */
  rubric?: ReactNode;
  /** The max readout slot (cockpit: a BreakdownTip / InlineEditable). Defaults to `String(max)`. */
  maxSlot?: ReactNode;
  /** Optional footer below the action row (cockpit: the hit-dice line). */
  footer?: ReactNode;
  /** Popover alignment against the trigger. */
  align?: "start" | "center" | "end";
  /**
   * Hide every temp-HP affordance (the `+temp` readout, the TEMP verb, the
   * clear-temp button) for callers with no temp pool — e.g. monster tokens.
   * Default `false`, so the cockpit + PC-card popover is unchanged (TEMP shown).
   */
  hideTemp?: boolean;
  /**
   * RA-05 — the character's effective damage defenses. Presence (together with
   * a non-empty `defendedTypes`/`resistedSources`) enables the typed-damage
   * section; omit for the plain integer editor (the encounter card).
   */
  defenses?: DamageDefenses;
  /** The damage types the character defends (the chips offered). */
  defendedTypes?: ReadonlyArray<DamageType>;
  /** The damage sources the character resists (`"spell"`). */
  resistedSources?: ReadonlyArray<DamageSource>;
  /** RA-03 — at 0 HP: show the Critical-hit toggle + the at-0 hint. */
  atZero?: boolean;
  /** Dead in play — the Damage verb disables (a corpse takes no marks). */
  dead?: boolean;
}

/** "12 → 6" plus the verdict words for one resolved part. */
function partMath(
  p: ResolvedDamagePart,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const verdicts: string[] = [];
  if (p.immune) verdicts.push(t("combat.damageMathImmune"));
  if (p.flatReduction > 0)
    verdicts.push(t("combat.damageMathReduced", { n: p.flatReduction }));
  if (p.resisted) verdicts.push(t("combat.damageMathResisted"));
  if (p.doubled) verdicts.push(t("combat.damageMathVulnerable"));
  const arrow = `${p.amount} → ${p.net}`;
  return verdicts.length > 0 ? `${arrow} · ${verdicts.join(" · ")}` : arrow;
}

export function HpEditPopover({
  current,
  max,
  temp,
  onDamage,
  onHeal,
  onTemp,
  onClearTemp,
  children,
  ariaLabel,
  rubric,
  maxSlot,
  footer,
  align = "end",
  hideTemp = false,
  defenses,
  defendedTypes = [],
  resistedSources = [],
  atZero = false,
  dead = false,
}: HpEditPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  // RA-05 — the typed-damage entry state: the current part's selected type /
  // source chips, the staged parts of a multi-type hit, and the crit toggle.
  const [selType, setSelType] = useState<DamageType | null>(null);
  const [selSource, setSelSource] = useState<DamageSource | null>(null);
  const [staged, setStaged] = useState<DamageInstance[]>([]);
  const [crit, setCrit] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  // When hosted in a combatant card, report open-state so a click that dismisses this
  // PORTALED popover only closes it — never ALSO toggles the card (no-op elsewhere).
  useReportEditorOpen(open);

  const state = hpState(current, max);
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((current / max) * 100))) : 0;

  // The intake section exists only when the character actually defends
  // something (minimum interaction — everyone else keeps the plain editor).
  // Null when inactive, so every consumer below narrows in one expression.
  const activeDefenses =
    defenses !== undefined && (defendedTypes.length > 0 || resistedSources.length > 0)
      ? defenses
      : null;

  /** Parse a positive integer from the amount field (0 = nothing to apply). */
  const parsed = (): number => {
    const n = parseInt(amount, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  /** The part currently in the field (amount + selected chips), if any. */
  const currentPart = (): DamageInstance | null => {
    const n = parsed();
    if (n === 0) return null;
    return {
      amount: n,
      ...(selType ? { type: selType } : {}),
      ...(selSource ? { source: selSource } : {}),
    };
  };
  /** Everything a Damage tap would commit: the staged parts + the live field. */
  const allParts = (): DamageInstance[] => {
    const cur = currentPart();
    return cur ? [...staged, cur] : [...staged];
  };

  /** Commit Heal/Temp with the typed amount, then clear + close. */
  const commit = (fn: (n: number) => void) => () => {
    const n = parsed();
    if (n === 0) return;
    setAmount("");
    fn(n);
    setOpen(false);
  };
  /** Commit the damage — every staged part plus the live field, with the crit flag. */
  const commitDamage = () => {
    const parts = allParts();
    if (parts.length === 0) return;
    setAmount("");
    setStaged([]);
    onDamage(parts, { crit });
    setOpen(false);
  };
  /** Stage the current part and clear the field for the next one (multi-type hit). */
  const stagePart = () => {
    const cur = currentPart();
    if (!cur) return;
    setStaged((s) => [...s, cur]);
    setAmount("");
    setSelType(null);
    setSelSource(null);
    amountRef.current?.focus();
  };
  const clear = () => {
    onClearTemp();
    setOpen(false);
  };

  // B12: a non-commit dismiss (Escape / outside-click) must not leave a stale typed
  // amount — or staged parts / chip selections / a lit crit toggle — lingering on
  // this persistent popover instance: reset EVERYTHING on every open-state
  // transition, so the next open always starts clean regardless of how the last
  // one ended.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setAmount("");
    setSelType(null);
    setSelSource(null);
    setStaged([]);
    setCrit(false);
  };

  // RA-05 — the live math preview (the same pure functions the commit applies).
  const cur = currentPart();
  const curResolved =
    activeDefenses && cur ? resolveDamagePart(cur, activeDefenses) : null;
  const showCurMath = curResolved !== null && curResolved.net !== curResolved.amount;
  const stagedRows = activeDefenses
    ? staged.map((part) => ({ part, resolved: resolveDamagePart(part, activeDefenses) }))
    : [];
  const total =
    activeDefenses && staged.length > 0
      ? resolveDamageIntake(allParts(), activeDefenses)
      : null;

  /** Localized label for a part's chip/type ("Slashing", "Spells", or untyped —). */
  const partLabel = (p: DamageInstance): string =>
    p.type
      ? t(`srd.damage_${p.type}`)
      : p.source
        ? t(`character.damageSource_${p.source}`)
        : t("combat.damageUntyped");

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        rubric={rubric}
        align={align}
        collisionPadding={12}
        aria-label={ariaLabel}
        // Overlay tier: sit above the Play-tab meter so the controls stay clickable
        // where the popover overlaps it; the width caps to the viewport (minus a 12px
        // gutter, matching collisionPadding) so it never overflows a narrow phone.
        className="z-[1000] w-72 max-w-[calc(100vw-1.5rem)]"
        // Anchor on the darker surface-1 — the exact context the tinted `.hp-act-*`
        // buttons are AA-verified on (carved border + floating shadow keep it elevated).
        style={{ background: "var(--bg-surface-1)" }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          amountRef.current?.focus();
          amountRef.current?.select();
        }}
        // Escape inside an inline editor (cockpit Max HP / hit-dice) CANCELS that edit,
        // not the whole popover — two intents on one key. When an inline-edit input is
        // focused, preventDefault Radix's dismissal so the field's own Escape collapses
        // the editor; an Escape anywhere else still closes the popover as normal.
        onEscapeKeyDown={(e) => {
          const el = document.activeElement as HTMLElement | null;
          if (el?.tagName === "INPUT" && el.closest(".inline-edit")) {
            e.preventDefault();
          }
        }}
      >
        <div className="flex flex-col gap-3">
          {/* Status — current / max(+ optional editable slot) + temp + the bar. */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-baseline gap-1 font-display text-2xl font-bold tabular-nums text-text-primary">
              <span>{current}</span>
              <span className="text-base text-text-secondary">/</span>
              {maxSlot ?? <span className="text-base text-text-secondary">{max}</span>}
            </span>
            {!hideTemp && temp > 0 && (
              <span className="font-mono text-xs text-info">
                +{temp} {t("character.tempHpShort")}
              </span>
            )}
          </div>
          {/* The shared Liquid-Mercury bar — temp HP reads as the lapis overlay
              segment here too (one bar component, golden rule 6). */}
          <HpBar
            pct={pct}
            temp={hideTemp ? 0 : temp}
            max={max}
            state={state}
            className="block h-2.5 w-full"
          />

          {/* Amount + the three apply verbs. The colour-coded verbs are
              self-explanatory, so the amount field carries NO hover tooltip (the SR
              hint stays on `aria-label`). Enter does NOT auto-apply (see header note). */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={amountRef}
              type="number"
              min="1"
              inputMode="numeric"
              className="sm w-16"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              aria-label={t("character.hpAmountAria")}
            />
            <Button
              variant="neutral"
              size="sm"
              className="hp-act-dmg"
              disabled={dead}
              onClick={commitDamage}
            >
              {t("combat.damage")}
            </Button>
            <Button
              variant="neutral"
              size="sm"
              className="hp-act-heal"
              onClick={commit(onHeal)}
            >
              {t("combat.heal")}
            </Button>
            {!hideTemp && (
              <Button
                variant="neutral"
                size="sm"
                className="hp-act-temp"
                onClick={commit(onTemp)}
              >
                {t("combat.temp")}
              </Button>
            )}
            {!hideTemp && temp > 0 && (
              <Button variant="ghost" size="sm" onClick={clear}>
                {t("combat.clearTemp", { amount: temp })}
              </Button>
            )}
          </div>

          {/* RA-03 — a crit while at 0 HP marks TWO death-save failures; the
              toggle surfaces only where the rule can apply. The quiet hint says
              what a hit does down here (damage marks failures, it can't lower 0). */}
          {atZero && !dead && (
            <div className="flex flex-wrap items-center gap-2">
              <ToggleChip
                label={t("combat.critHit")}
                pressed={crit}
                onToggle={() => setCrit((c) => !c)}
              />
              <span className="text-xs text-text-secondary">
                {t("combat.zeroHpDamageHint")}
              </span>
            </div>
          )}

          {/* RA-05 — the damage-intake section: one chip per DEFENDED type (+
              resisted sources), the live math line, staged multi-type parts.
              Untyped stays the default — chips are an offer, never a demand. */}
          {activeDefenses && !dead && (
            <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
              <div
                role="group"
                aria-label={t("combat.damageTypeGroupAria")}
                className="flex flex-wrap items-center gap-1.5"
              >
                {defendedTypes.map((dt) => (
                  <ToggleChip
                    key={dt}
                    label={t(`srd.damage_${dt}`)}
                    pressed={selType === dt}
                    onToggle={() => setSelType((s) => (s === dt ? null : dt))}
                  />
                ))}
                {resistedSources.map((src) => (
                  <ToggleChip
                    key={src}
                    label={t(`character.damageSource_${src}`)}
                    pressed={selSource === src}
                    onToggle={() => setSelSource((s) => (s === src ? null : src))}
                  />
                ))}
                {/* Stage the current part for a multi-type hit. */}
                {parsed() > 0 && (
                  <Button variant="ghost" size="sm" onClick={stagePart}>
                    <Icon as={Plus} size="sm" decorative />
                    {t("combat.addDamagePart")}
                  </Button>
                )}
              </div>

              {/* The live math for the part being typed — shown only when a
                  defense actually changes the number (12 → 6 · Resistance). */}
              {curResolved !== null && showCurMath && (
                <p
                  className="font-mono text-xs tabular-nums text-text-secondary"
                  aria-live="polite"
                >
                  {partMath(curResolved, t)}
                </p>
              )}

              {/* Staged parts (multi-type hit) — each with its own math + remove. */}
              {stagedRows.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {stagedRows.map(({ part, resolved }, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums text-text-secondary"
                    >
                      <span>
                        {partLabel(part)} · {partMath(resolved, t)}
                      </span>
                      <button
                        type="button"
                        aria-label={t("combat.removeDamagePart", {
                          label: partLabel(part),
                        })}
                        onClick={() => setStaged((s) => s.filter((_, idx) => idx !== i))}
                        className="text-text-secondary transition-colors hover:text-error"
                      >
                        <Icon as={X} size="xs" decorative />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {total && (
                <p className="font-mono text-xs font-semibold tabular-nums text-text-primary">
                  {t("combat.damageTotalPreview", {
                    raw: total.rawTotal,
                    net: total.netTotal,
                  })}
                </p>
              )}
            </div>
          )}

          {footer}
        </div>
      </PopoverContent>
    </Popover>
  );
}
