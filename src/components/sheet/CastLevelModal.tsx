/**
 * Cast Level Modal — folio chrome (§5.7).
 *
 * Opens when the player taps Cast on a leveled spell that has at least one
 * upcast option available (an open slot at a strictly higher level than the
 * spell's base level). Lists every available slot level (base + higher) as
 * chromatic slot buttons (per-level `--sl` colour seal + remaining count), plus
 * distinct free-cast (gold) and at-will mastery rows, and an optional "At
 * Higher Levels" hint. Choosing a level resolves with that level; cancelling
 * resolves with null. Built on the accessible folio `Dialog` (Radix) primitive.
 *
 * If only the base level is available, callers should skip the modal and cast
 * directly — this component does not auto-confirm.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
// The discriminated union (slot / free-cast / mastery) is owned by the engine —
// the resolver produces it, this modal only renders it. Importing it from the
// engine keeps the dependency direction one-way (UI → engine, never reverse).
import { toggleMetamagicSelection, type CastLevelOption } from "@/lib/cast-options";
import { scaleUpcastDice, spellInstanceCount } from "@/lib/utils";

export type { CastLevelOption };

/**
 * One per-cast Metamagic chip the modal renders BELOW the slot rows. The engine
 * resolves the id + cost + applicability/affordability (`resolveMetamagicForCast`);
 * the modal owns only the localized label + selection state, and emits the
 * selected ids on confirm so the parent debits Sorcery Points (undoably).
 */
export interface MetamagicCastRow {
  /** Stable option id (golden rule 7) — emitted on confirm. */
  id: string;
  /** Localized option name (resolved by the parent from the id). */
  name: string;
  /** Sorcery-point cost per use. */
  cost: number;
  /** False when the remaining Sorcery Points can't cover the cost. */
  affordable: boolean;
  /** False when the option doesn't apply to this spell (shown, disabled). */
  appliesToSpell: boolean;
  /**
   * RAW "one Metamagic option per cast" exception (BUG-6) — true for the two
   * options (Empowered/Seeking) that explicitly stack on top of a primary. A
   * falsy value marks a PRIMARY option: at most one primary may be selected.
   */
  stacksWithPrimary: boolean;
}

export interface CastLevelModalProps {
  /** When non-null, the modal is open. */
  request: {
    /** Localised spell name for the header. */
    spellName: string;
    /** Spell base level (the slot row equal to it is the "normal" cast). */
    baseLevel: number;
    /** Available slot levels with remaining counts, all ≥ baseLevel. */
    options: CastLevelOption[];
    /** Optional "At Higher Levels" text (already localised). */
    higherLevels?: string;
    /**
     * Optional per-cast Metamagic options (Sorcerer). When present + non-empty,
     * a multi-select amethyst chip row renders below the slot rows; the selected
     * ids flow to `onConfirm` so the parent debits Sorcery Points.
     */
    metamagic?: MetamagicCastRow[];
    /**
     * Remaining Sorcery Points — the headroom the chip row spends against, so a
     * selection that would over-spend the pool is disabled live (golden rule 20).
     * Only meaningful with `metamagic`.
     */
    sorceryRemaining?: number;
    /**
     * S12c — the spell's structured damage FACTS so each slot row can preview the
     * dice (or instance count) it deals AT THAT slot — Fireball's L5 row shows
     * "10d6", its L3 row "8d6". The modal resolves the scaled value per option
     * from the shared `scaleUpcastDice` / `spellInstanceCount` helpers (the SAME
     * seam the spell card reads, so they can't drift — golden rule 6). Omit for a
     * spell that deals no scaling dice (the rows show the bare level only).
     */
    upcast?: {
      /** Spell base level — the floor the per-slot increment counts above. */
      level: number;
      /** Base dice at the spell's own level ("8d6"); omit for ray-count spells. */
      damageDice?: string;
      /** Per-slot-level dice increment ("1d6"); omit when the dice don't scale. */
      damageDicePerUpcast?: string;
      /** RA-07 — base HEAL dice at the spell's own level ("2d8"); omit for non-heal. */
      healDice?: string;
      /** RA-07 — per-slot-level heal-dice increment ("2d8"); omit when it doesn't scale. */
      healDicePerUpcast?: string;
      /** Base separate-instance count (Scorching Ray 3); omit for single-roll. */
      instances?: number;
      /** Extra instances per slot above base (Scorching Ray +1); omit if fixed. */
      instancesPerUpcast?: number;
      /** A second simultaneous damage instance (Ice Storm/Ice Knife) previewed as
       *  "{primary} + {secondary}"; its Cold/Bludgeoning scales independently. */
      secondaryDamage?: { dice: string; damageType: string; dicePerUpcast?: string };
    };
  } | null;
  /**
   * Called with the chosen slot level, the selected option, AND the selected
   * per-cast Metamagic ids (empty when none / not applicable). The parent
   * inspects `opt.kind` to decide between a slot consumption ("slot" or
   * undefined) and a free-cast tracker increment ("free-cast"), then debits one
   * Sorcery-Point cost per selected Metamagic id.
   */
  onConfirm: (level: number, opt: CastLevelOption, metamagicIds: string[]) => void;
  onCancel: () => void;
}

/** Cantrip uses --sl-c; levelled slots use --sl-N. */
function slotVar(level: number): string {
  return level <= 0 ? "var(--sl-c)" : `var(--sl-${level})`;
}

export function CastLevelModal({ request, onConfirm, onCancel }: CastLevelModalProps) {
  const { t } = useTranslation();
  // Per-cast Metamagic multi-select. Reset whenever a fresh request opens so a
  // previous cast's selection never bleeds into the next one — using React's
  // "adjust state during render on a prop change" pattern (NOT a setState effect,
  // which cascades a render): compare the live request key to the one the current
  // selection was scoped to, and clear in-render when they diverge.
  const [selectedMetamagic, setSelectedMetamagic] = useState<string[]>([]);
  const [scopedKey, setScopedKey] = useState<string | null>(null);
  const requestKey = request ? `${request.spellName}-${request.baseLevel}` : null;
  if (requestKey !== scopedKey) {
    setScopedKey(requestKey);
    setSelectedMetamagic([]);
  }

  // SP already committed to the current selection — used to gate FURTHER picks
  // against the remaining pool (golden rule 20: can't over-spend). The base
  // `affordable` flag the engine stamped assumed a zero-selection start; once
  // some SP is earmarked, an option is affordable only if its cost fits what's
  // left after the current selection.
  const metamagicRows = request?.metamagic ?? [];
  const spentSp = metamagicRows
    .filter((m) => selectedMetamagic.includes(m.id))
    .reduce((sum, m) => sum + m.cost, 0);

  // BUG-6 — the one-primary-per-cast + additive-stackers rule lives in the pure
  // engine reducer `toggleMetamagicSelection` (so the Spells + Combat modals and
  // its unit test all share ONE implementation).
  const stackerIds = new Set(
    metamagicRows.filter((m) => m.stacksWithPrimary).map((m) => m.id)
  );
  const toggleMetamagic = (id: string) =>
    setSelectedMetamagic((prev) => toggleMetamagicSelection(prev, id, stackerIds));

  // S12c — the damage a given slot level deals, resolved from the spell's
  // structured facts via the SAME shared helpers the spell card reads (golden
  // rule 6): dice scale by `scaleUpcastDice`, ray-count spells by
  // `spellInstanceCount` ("N × dice"). Null when the spell carries no scaling
  // damage facts (the row shows the bare level). Numeric only — no leak (rule 7).
  const upcast = request?.upcast;
  const damageAtLevel = (level: number): string | null => {
    if (!upcast) return null;
    const dice = scaleUpcastDice(upcast, level);
    if (dice == null) return null;
    const count = spellInstanceCount(upcast, level);
    const primary = count != null && count > 1 ? `${count} × ${dice}` : dice;
    // A dual-damage-instance spell (Ice Storm/Ice Knife) scales its SECOND
    // instance independently via the SAME shared helper — Ice Knife's Cold
    // scales +1d6/slot while its Piercing is fixed. Preview "{primary} + {sec}".
    const sec = upcast.secondaryDamage;
    if (sec) {
      const secDice = scaleUpcastDice(
        {
          level: upcast.level,
          damageDice: sec.dice,
          damageDicePerUpcast: sec.dicePerUpcast,
        },
        level
      );
      if (secDice) return `${primary} + ${secDice}`;
    }
    return primary;
  };

  // RA-07 — the HEAL a given slot level restores, scaled via the SAME shared
  // `scaleUpcastDice` helper the damage preview uses (golden rule 6): base
  // `healDice` + `healDicePerUpcast` per slot above the spell's own (Cure Wounds
  // L1 "2d8" → L3 "6d8"). Null when the spell carries no scaling heal facts (the
  // row shows no heal chip). Dice only — no mod (the combat card folds the mod),
  // no rolls (golden rule 21).
  const healAtLevel = (level: number): string | null => {
    if (!upcast?.healDice) return null;
    return (
      scaleUpcastDice(
        {
          level: upcast.level,
          damageDice: upcast.healDice,
          damageDicePerUpcast: upcast.healDicePerUpcast,
        },
        level
      ) ?? null
    );
  };

  return (
    <Dialog
      open={request != null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      {request && (
        <DialogContent
          size="sm"
          rubric={t("combat.castLevelHint")}
          title={t("combat.castLevelTitle", { name: request.spellName })}
          description={t("combat.castLevelHint")}
          closeLabel={t("common.cancel")}
        >
          <DialogBody>
            <div className="cl-opts">
              {request.options.map((opt, idx) => {
                // At-will Mastery row — distinct amethyst tint, no counter.
                if (opt.kind === "mastery") {
                  return (
                    <button
                      key={`mast-${idx}`}
                      type="button"
                      className="cl-opt cl-mastery"
                      onClick={() => onConfirm(opt.level, opt, selectedMetamagic)}
                    >
                      <span className="cl-tag">{t("combat.masteryCastBadge")}</span>
                      <span className="cl-name">{opt.sourceName}</span>
                      <span className="cl-count">{t("combat.atWill")}</span>
                    </button>
                  );
                }
                // Free-cast (feat-granted) row — gold tint; the parent pattern-
                // matches `kind === "free-cast"` for the tracker pathway.
                if (opt.kind === "free-cast") {
                  return (
                    <button
                      key={`fc-${opt.sourceId}-${idx}`}
                      type="button"
                      className="cl-opt cl-free"
                      onClick={() => onConfirm(opt.level, opt, selectedMetamagic)}
                    >
                      <span className="cl-tag">{t("combat.freeCastBadge")}</span>
                      <span className="cl-name">{opt.sourceName}</span>
                      <span className="cl-rest">
                        {opt.rest === "long"
                          ? t("combat.perLongRest")
                          : t("combat.perShortRest")}
                      </span>
                      <span className="cl-count">
                        {opt.remaining}/{opt.total}
                      </span>
                    </button>
                  );
                }
                // A cantrip carries no slot row — it commits via the footer Cast
                // button (G6/W3); never rendered as a tappable option row here.
                if (opt.kind === "cantrip") return null;
                // Chromatic slot button — per-level --sl seal + remaining count.
                const isBase = opt.level === request.baseLevel;
                const dmg = damageAtLevel(opt.level);
                const heal = healAtLevel(opt.level);
                return (
                  <button
                    key={`${opt.level}-${opt.pactMagic === true ? "p" : "r"}`}
                    type="button"
                    className="cl-opt cl-slot"
                    style={{ ["--sl" as string]: slotVar(opt.level) }}
                    onClick={() => onConfirm(opt.level, opt, selectedMetamagic)}
                  >
                    <span className="cl-seal" aria-hidden>
                      {opt.level}
                    </span>
                    <span className="cl-name">
                      {isBase
                        ? t("combat.castLevelBase", { level: opt.level })
                        : t("combat.castLevelUp", { level: opt.level })}
                    </span>
                    {/* S12c — the dice this slot deals, scaled for upcast. */}
                    {dmg && <span className="cl-dmg">{dmg}</span>}
                    {/* RA-07 — the heal this slot restores, scaled for upcast. */}
                    {heal && <span className="cl-heal">{heal}</span>}
                    {opt.pactMagic === true && (
                      <span className="cl-tag">{t("combat.pactSlotBadge")}</span>
                    )}
                    <span className="cl-count">
                      {opt.remaining}/{opt.total}
                    </span>
                  </button>
                );
              })}
            </div>

            {metamagicRows.length > 0 && (
              <div className="cl-mm">
                <div className="cl-mm-head">
                  <span className="cl-mm-title">{t("metamagic.section")}</span>
                  <span className="cl-mm-budget">
                    {t("metamagic.sorceryRemaining", {
                      count: Math.max(0, (request.sorceryRemaining ?? 0) - spentSp),
                    })}
                  </span>
                </div>
                {/* BUG-6 — one primary per cast; Empowered/Seeking stack on top. */}
                <p className="cl-mm-rule">{t("metamagic.onePrimaryRule")}</p>
                <div className="cl-mm-chips">
                  {metamagicRows.map((m) => {
                    const selected = selectedMetamagic.includes(m.id);
                    // BUG-6 — a PRIMARY (non-stacker) tap that isn't already
                    // selected SWAPS the current primary out, so the SP it would
                    // free is available to it; a STACKER simply adds on top.
                    const currentPrimary = selectedMetamagic.find((x) => {
                      const row = metamagicRows.find((r) => r.id === x);
                      return row != null && !row.stacksWithPrimary;
                    });
                    const freedBySwap =
                      !m.stacksWithPrimary && currentPrimary != null
                        ? (metamagicRows.find((r) => r.id === currentPrimary)?.cost ?? 0)
                        : 0;
                    const remainingAfter =
                      (request.sorceryRemaining ?? 0) - spentSp + freedBySwap;
                    // An unselected chip is pickable only if it both applies to
                    // this spell AND (after any primary swap) its cost fits what's
                    // left; a selected chip is always togglable OFF.
                    const wouldSwap =
                      !selected && !m.stacksWithPrimary && currentPrimary != null;
                    const enabled =
                      selected ||
                      (m.appliesToSpell && m.affordable && m.cost <= remainingAfter);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="cl-mm-chip"
                        aria-pressed={selected}
                        data-selected={selected ? "true" : undefined}
                        disabled={!enabled}
                        title={
                          !m.appliesToSpell
                            ? t("metamagic.notApplicable")
                            : !m.affordable || m.cost > remainingAfter
                              ? t("metamagic.notEnoughSp")
                              : wouldSwap
                                ? t("metamagic.swapsPrimary")
                                : undefined
                        }
                        onClick={() => toggleMetamagic(m.id)}
                      >
                        <span className="cl-mm-name">{m.name}</span>
                        <span className="cl-mm-cost">
                          {t("levelUp.metamagicCost", { cost: m.cost })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {request.higherLevels && (
              <p className="cl-higher">
                <strong>{t("spells.higherLevels")}: </strong>
                {request.higherLevels}
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            {/* G6/W3 — a cantrip has no slot rows to tap; the footer carries the
                explicit slotless Cast (commits the selected Metamagic SP only). */}
            {request.baseLevel === 0 && (
              <Button
                block
                onClick={() =>
                  onConfirm(0, { kind: "cantrip", level: 0 }, selectedMetamagic)
                }
              >
                {t("spells.cast")}
              </Button>
            )}
            <Button variant="secondary" block onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
