/**
 * ActionRiders — the ONE shared on-hit rider strip both weapon surfaces render
 * (the combat attack/action card in PlayTab and the inventory WeaponCard), plus
 * any non-weapon action card that carries riders (a weapon-attack cantrip).
 *
 * The engine computes three kinds of on-hit RIDER (`extraDamage` / `dieModifiers`
 * / `onHitHeal`); the `buildRiders` presenter turns them into render-ready
 * {@link RiderVM} tokens (provenance resolved, damage type kept as a stable id,
 * consumable vs display-only classified). This component renders each as a
 * compact, single-line token in the card detail (progressive disclosure — riders
 * are on-hit extras, never the at-a-glance verdict), reusing the §11 `.uc-verdict`
 * chromatic chip recipe so a fire rider reads the same orange a fire weapon does.
 *
 * - A DISPLAY-ONLY rider (Berserker Frenzy while raging, Great Weapon Fighting,
 *   Savage Attacker) renders a static chip — the player applies the formula when
 *   they roll externally (no dice, ever).
 * - A CONSUMABLE rider (Psi Warrior Psionic Strike → a Psionic Energy Die;
 *   Lifedrinker → a Hit Point Die) renders a tappable SPEND button on the combat
 *   surface only (`onSpend` passed): tap debits the backing resource with a 5s
 *   undo toast (the immediate-commit-with-undo economy model) — NEVER auto-spent.
 *   With no `onSpend` (the inventory card, a depleted resource) it falls back to
 *   the static chip, so the inventory surface stays read-only by construction.
 *
 * SRD content (the provenance + dice) arrives PRE-LOCALIZED on the VM; the only
 * `t(...)` here resolves APP strings + the damage-type word (`srd.damage_*`). The
 * chromatic chip colour reuses the ONE `damageVerdictOutcome` mapper every other
 * card surface uses (golden rule 3 — never re-roll the palette).
 */
import { useTranslation } from "react-i18next";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { damageVerdictOutcome } from "@/features/character/center/tabs/inventory/inventory-card-helpers";
import { summarizeRiders, type RiderVM } from "@/lib/views/rider-view";

/** Whether a rider can be spent right now on the combat surface. */
function isSpendable(
  rider: RiderVM,
  onSpend: ((rider: RiderVM) => void) | undefined,
  depletedTrackers: ReadonlySet<string> | undefined
): boolean {
  if (!onSpend || !rider.spend) return false;
  if (rider.spend.kind === "tracker") {
    return !(depletedTrackers?.has(rider.spend.trackerId) ?? false);
  }
  return true; // hit-die — the consumer guards the live Hit-Die pool.
}

export interface ActionRidersProps {
  riders: ReadonlyArray<RiderVM>;
  /**
   * Spend a consumable rider (debit its backing resource). Passed ONLY by the
   * combat surface — absent on the inventory card, so every token there is
   * static (read-only by construction). The handler owns the debit + undo toast.
   */
  onSpend?: (rider: RiderVM) => void;
  /**
   * Tracker ids whose backing resource is fully spent — a consumable rider on a
   * depleted tracker renders disabled (the player can't spend what's gone).
   */
  depletedTrackers?: ReadonlySet<string>;
}

export function ActionRiders({ riders, onSpend, depletedTrackers }: ActionRidersProps) {
  const { t } = useTranslation();
  if (riders.length === 0) return null;

  return (
    <div className="rider-strip">
      <span className="rider-strip-label">{t("combat.ridersOnHit")}</span>
      <div className="rider-tokens">
        {riders.map((rider) => (
          <RiderToken
            key={rider.id}
            rider={rider}
            spendable={isSpendable(rider, onSpend, depletedTrackers)}
            onSpend={onSpend}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * RiderSummary (#87 rider-render, always-visible) — the COLLAPSED-FACE on-hit
 * DAMAGE-CLUSTER both weapon surfaces show immediately AFTER the base-damage
 * verdict chip ([1d12+3 Slsh] [+3d6]). Grouped with the base damage — never
 * beside the to-hit gloss — so a bonus die reads unambiguously as EXTRA on-hit
 * damage, not a duplicate of the to-hit bonus. Each chip rides the SAME
 * `.uc-verdict[data-o]` chromatic recipe the verdict chip uses, keyed to its OWN
 * damage type, so "+3d6" shows in the slashing/fire/radiant hue (DRY — no new
 * colour system); the rider chips render quieter + smaller than the primary
 * verdict so the hierarchy reads base-then-bonus.
 *
 * Bounded by `summarizeRiders` (the owner's hard readability gate — densest ×
 * IT × mobile 390px): at most {@link import("@/lib/views/rider-view").RIDER_CHIP_CAP}
 * dice chips, each `+Nd_` (dice are NEVER summed into a flat number), with any
 * remainder folded into ONE trailing OVERFLOW chip ("+N" gold "more" register, a
 * stacked-extras glyph + an aria spelling "N more on a hit" so it can't read as
 * flat damage). The fuller treatment (provenance popover, spend buttons) stays in
 * the expanded {@link ActionRiders} strip. Passive (`pointer-events: none`): a tap
 * falls through to the row-expand overlay that opens the detail.
 */
export function RiderSummary({ riders }: { riders: ReadonlyArray<RiderVM> }) {
  const { t } = useTranslation();
  const vm = summarizeRiders(riders, damageVerdictOutcome);
  if (!vm) return null;

  // The accessible description (the whole cluster): spells each rider's full token
  // + provenance so AT conveys what the tiny "+3d6" chips mean.
  const aria = t("combat.riderSummaryAria", {
    detail: riders.map((r) => `${riderToken(r, t).text} · ${r.source}`).join("; "),
  });

  return (
    <span
      className="uc-rider-cluster"
      translate="no"
      role="img"
      aria-label={aria}
      title={aria}
    >
      {vm.chips.map((chip) =>
        chip.overflow ? (
          <span
            key={chip.id}
            className="uc-verdict uc-rider-pill"
            data-o={chip.outcome}
            data-more=""
            aria-hidden
          >
            <RiderStackGlyph />
            {t("common.plusMore", { count: chip.overflow })}
          </span>
        ) : (
          <span
            key={chip.id}
            className="uc-verdict uc-rider-pill"
            data-o={chip.outcome}
            data-cond={chip.vsMarkedTarget ? "" : undefined}
            aria-hidden
          >
            {chip.text}
            {/* A conditional "vs marked/cursed target" rider (Hunter's Mark / Hex)
                appends a compact crosshair MARKER so the bare +die reads as
                conditional-on-that-creature, never every attack — the full label
                stays in the cluster aria/title above + the expanded strip. */}
            {chip.vsMarkedTarget ? <RiderMarkGlyph /> : null}
          </span>
        )
      )}
    </span>
  );
}

/** Crosshair reticle for a "vs marked/cursed target" rider — the compact marker
 *  that keeps the collapsed +die from reading as an unconditional bonus. The full
 *  "vs marked target" label rides the cluster aria/title + the expanded strip. */
function RiderMarkGlyph() {
  return (
    <svg
      className="icon uc-rider-mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="7" />
      <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Stacked-extras glyph for the overflow chip — two offset cards reading "more
 *  on top," so "+N" never reads as a flat damage bonus. */
function RiderStackGlyph() {
  return (
    <svg
      className="icon uc-rider-stack"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="8" width="13" height="12" rx="2" />
      <path d="M8 8V5a2 2 0 012-2h9a2 2 0 012 2v10a2 2 0 01-2 2h-3" />
    </svg>
  );
}

/** ONE rider token — a static chip, or (combat + spendable) a SPEND button. */
function RiderToken({
  rider,
  spendable,
  onSpend,
}: {
  rider: RiderVM;
  spendable: boolean;
  onSpend?: (rider: RiderVM) => void;
}) {
  const { t } = useTranslation();

  // The compact, evaluated token text (#80 chip-compact) + its chromatic outcome.
  const { text, outcome } = riderToken(rider, t);
  // Provenance + qualifiers live in the tooltip (progressive disclosure): the
  // source feature, the once-per-turn note, and the spend cost when consumable.
  const detail = riderDetail(rider, t);

  const chip = (
    <span className="uc-verdict rider-chip" data-o={outcome} translate="no">
      {text}
    </span>
  );

  // A depleted/non-combat consumable token still SHOWS (the player sees the
  // rider exists) but isn't tappable — it falls through to the popover-only
  // affordance below.
  if (rider.spend && spendable && onSpend) {
    return (
      <button
        type="button"
        className="rider-token rider-token-spend"
        onClick={(e) => {
          e.stopPropagation();
          onSpend(rider);
        }}
        title={detail}
        aria-label={t("combat.riderSpendAria", { rider: riderName(rider, t), detail })}
      >
        {chip}
        <span className="rider-spend-cue" aria-hidden>
          {t("combat.spend")}
        </span>
      </button>
    );
  }

  // Display-only (or read-only inventory): the chip + a quiet info popover for
  // the provenance — tap/click opens it on every device (no hover-only).
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rider-token rider-token-info"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("combat.riderInfoAria", { rider: riderName(rider, t) })}
        >
          {chip}
        </button>
      </PopoverTrigger>
      <PopoverContent
        rubric={riderName(rider, t)}
        side="top"
        align="center"
        collisionPadding={12}
        className="glossary-pop"
        aria-label={riderName(rider, t)}
      >
        {detail}
      </PopoverContent>
    </Popover>
  );
}

type TranslateFn = ReturnType<typeof useTranslation>["t"];

/** The rider's display NAME (its provenance) — the tooltip rubric / aria anchor. */
function riderName(rider: RiderVM, t: TranslateFn): string {
  if (rider.kind === "heal") return `${rider.source} · ${t("combat.heal")}`;
  return rider.source;
}

/** Compose the compact token text + its chromatic outcome key. */
function riderToken(rider: RiderVM, t: TranslateFn): { text: string; outcome: string } {
  switch (rider.kind) {
    case "damage": {
      const typeWord = rider.damageTypeId ? t(`srd.damage_${rider.damageTypeId}`) : "";
      // A per-hit "vs marked/cursed target" rider (Hunter's Mark, Hex) labels the
      // chip so the +die reads as conditional on hitting THAT creature, never every
      // attack (the app models no enemy — the player applies it on the right hit).
      const markLabel = rider.vsMarkedTarget
        ? ` ${t(`combat.vsMarkedTarget_${rider.vsMarkedTarget}`)}`
        : "";
      return {
        text: `+${rider.dice}${typeWord ? ` ${typeWord}` : ""}${markLabel}`,
        outcome: damageVerdictOutcome(rider.damageTypeId),
      };
    }
    case "die-mod":
      return {
        text:
          rider.dieMode === "floor"
            ? t("combat.riderFloor", { below: rider.floorBelow, to: rider.floorTo })
            : t("combat.riderReroll"),
        outcome: "neutral",
      };
    case "heal":
      return {
        text: `${t("combat.heal")} ${rider.healFormula ?? ""}`.trim(),
        outcome: "heal",
      };
  }
}

/** Compose the rider's tooltip / aria detail line — provenance + qualifiers. */
function riderDetail(rider: RiderVM, t: TranslateFn): string {
  const parts: string[] = [rider.source];
  // A rider gated on a `while-active` toggle that is up reads "· active" — the
  // SAME `combat.whileActiveNote` key the weapon-damage breakdown shows, so the
  // user sees the extra damage is conditional on the toggle (Rage, Divine Favor).
  if (rider.whileActive) parts.push(t("combat.whileActiveNote"));
  // G14 — an attack-or-spell rider isn't weapon-bound; spell out the scope so the
  // self-side reminder reads "on an attack or a spell" (a species revelation form).
  if (rider.scope === "attack-or-spell") parts.push(t("combat.riderScopeAttackOrSpell"));
  if (rider.oncePerTurn) parts.push(t("combat.oncePerTurn"));
  if (rider.spend?.kind === "tracker") parts.push(t("combat.riderSpendsResource"));
  if (rider.spend?.kind === "hit-die") parts.push(t("combat.riderSpendsHitDie"));
  return parts.join(" · ");
}
