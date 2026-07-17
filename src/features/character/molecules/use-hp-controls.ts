/**
 * useHpControls — the shared Hit-Points edit ENGINE (folio §24 "HP Control").
 *
 * ONE store-bound implementation behind every cockpit HP-mutating surface (the
 * header pill's `HeaderHpControl` popover, the `DyingBanner`): it owns the
 * damage-intake resolution (the character's OWN
 * resistances/immunities/vulnerabilities/flat-reductions applied to the ENTERED
 * roll — RA-05), the 0-HP rules messaging (knockout / massive-damage death /
 * at-0 failures — RA-03), the death-save roll-entry consumer (RA-11), and the
 * 5 s undo toast on every change — so that logic is never duplicated.
 *
 * The PRESENTATION (popover open-state, the amount input, the type chips)
 * lives in the shared `HpEditPopover` widget, NOT here — this hook is a pure
 * engine that exposes the derived readout + amount-arg mutators. Damage is
 * entered as PARTS (`handleApplyDamage([{ amount, type? }])`): an untyped
 * single part is the exact fast path of old, a typed part gets the character's
 * defenses applied through `lib/damage-intake` (the same pure math the popover
 * previews, so the preview and the applied number can never disagree).
 *
 * Lives in its own (non-component) module so component files export only
 * components — `react-refresh/only-export-components` flags a hook export in a
 * component file.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableResult, registerUndoableToast } from "@/stores/undoStore";
import {
  aggregateCharacterGrants,
  effectiveMaxHp,
  bloodiedFromHp,
} from "@/lib/aggregate-character";
import {
  NO_DEFENSES,
  resolveDamageIntake,
  defendedDamageTypes,
  isInstantDeathAtZero,
  isMassiveDamageDeath,
  type DamageDefenses,
  type DamageInstance,
} from "@/lib/damage-intake";
import { deriveDamageDefenses } from "@/lib/views/sheet-view";
import {
  deathSaveOutcome,
  effectiveProficiencyBonus,
  isHeavyArmorEquipped,
} from "@/lib/compute";
import { totalLevel } from "@/lib/classes";
import { getEquipment } from "@/data/equipment";
import {
  diedInPlay,
  stabilisedInPlay,
  DEATH_FAIL_LIMIT,
  DEATH_SUCCESS_LIMIT,
} from "@/lib/character-status";
import type { DamageSource, DamageType } from "@/data/types";

// hpState + HpStateValue moved to the dependency-free `./hp-tier` module so the
// roster card can import the tier without pulling this store-coupled hook (which
// drags the SRD engine onto the eager bundle). Imported for this hook's own use
// and re-exported for back-compat.
import { hpState, type HpStateValue } from "./hp-tier";
export { hpState, type HpStateValue };

/** The derived readout + the amount-arg mutators every cockpit HP surface needs. */
export interface HpControls {
  current: number;
  max: number;
  temp: number;
  state: HpStateValue;
  pct: number;
  /**
   * S5 — whether the character is Bloodied (current HP in the (0, ⌊max/2⌋] band,
   * 2024 RAW). Derived from the SAME effective `max` + `current` this bag exposes,
   * so every HP surface reads ONE Bloodied truth (rule 6). `false` at 0 HP — a
   * downed character is dying, not Bloodied (the dying surface owns ≤ 0).
   */
  bloodied: boolean;
  /**
   * RA-05 — the character's EFFECTIVE damage defenses (grants + build override
   * maps + the session overlay), for the entry surface's live math preview.
   */
  defenses: DamageDefenses;
  /** The damage types worth asking about (the character defends them); empty = plain fast path. */
  defendedTypes: DamageType[];
  /** Damage SOURCES the character resists (`"spell"` — Abjurer). */
  resistedSources: DamageSource[];
  /** At 0 HP (dying/stable/dead — the 0-HP rules apply to entered damage). */
  atZero: boolean;
  /** Dead in play (three failures) — damage entry is inert. */
  dead: boolean;
  /** Stable at 0 (three successes). */
  stable: boolean;
  /**
   * Apply one entered hit — one or more damage instances; the character's own
   * defenses resolve each typed part (RA-05), then the 0-HP rules apply
   * (RA-03/RA-10). `opts.crit` marks a Critical Hit (two failures at 0 HP).
   * Empty / all-zero parts are a no-op.
   */
  handleApplyDamage: (
    parts: ReadonlyArray<DamageInstance>,
    opts?: { crit?: boolean }
  ) => void;
  /** Heal by `amount` (clamped to max); ≤ 0 is a no-op. */
  applyHeal: (amount: number) => void;
  /** Gain `amount` temp HP (doesn't stack — take the higher); ≤ 0 is a no-op. */
  applyTemp: (amount: number) => void;
  /** Clear all temp HP. */
  clearTemp: () => void;
  /**
   * RA-11 — apply an ENTERED death-save d20 (the player rolled it in real
   * life; golden rule 21). SRD "Death Saving Throws": nat 1 = two failures,
   * 2–9 = one failure, 10+ = one success (three = Stable), and a roll at or
   * above the character's crit threshold (nat 20, Champion Survivor 18+) =
   * regain 1 HP and wake. No-op above 0 HP or once stable/dead.
   */
  applyDeathSave: (face: number) => void;
}

/**
 * All hooks run unconditionally and the hook tolerates `character === null`
 * (values default to 0/empty; handlers no-op), so any surface can call it
 * without a guard.
 */
export function useHpControls(): HpControls {
  const { t } = useTranslation();
  const character = useCharacterStore((s) => s.character);
  const applyDamage = useCharacterStore((s) => s.applyDamage);
  const applyHealing = useCharacterStore((s) => s.applyHealing);
  const gainTempHp = useCharacterStore((s) => s.gainTempHp);
  const setTempHP = useCharacterStore((s) => s.setTempHP);
  const setDeathSaves = useCharacterStore((s) => s.setDeathSaves);
  const restoreHpSnapshot = useCharacterStore((s) => s.restoreHpSnapshot);

  const current = character?.session.hp.current ?? 0;
  // D1 — display + clamp against the EFFECTIVE max (stored base + hp-flat boons +
  // Aid), matching the store's heal/clamp, so the readout, bar %, and local
  // damage/heal math never understate a Draconic / Boon-of-Fortitude / Aided char.
  const max = character ? effectiveMaxHp(character.character, character.session) : 0;
  const temp = character?.session.hp.temp ?? 0;
  const state = hpState(current, max);
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((current / max) * 100))) : 0;
  // S5 — Bloodied is its OWN raw HP-band (≤ half EFFECTIVE max, but > 0), distinct
  // from the `hpState` tiers (healthy/wounded/critical at 0.6/0.25) and from the
  // 0-HP dying state the danger pill owns. Computes via the SAME `bloodiedFromHp`
  // pure helper the engine `isBloodied` predicate (smart-tracker.ts) uses, over the
  // effective `max` ALREADY in scope here — so the two derivations can NEVER drift
  // and the chip can never disagree with the bar (rule 6 — one Bloodied arithmetic).
  const bloodied = bloodiedFromHp(current, max);

  // RA-05/RA-11 — the sheet-wide aggregate this hook's rules read: the defense
  // sets (resistances/immunities/vulnerabilities/flat reductions, incl. the
  // while-active ones — a RAGING Barbarian's B/P/S resistance rides
  // `activeFeatures`) and the death-save crit threshold (Champion Survivor).
  // Memoized on the same narrow slices every aggregate consumer keys on.
  const charData = character?.character;
  const session = character?.session;
  const { defenses, critAt } = useMemo(() => {
    if (!charData || !session) {
      return { defenses: NO_DEFENSES, critAt: 20 };
    }
    const aggregate = aggregateCharacterGrants(charData, session);
    return {
      defenses: deriveDamageDefenses(
        aggregate,
        {
          resistance: charData.damageResistanceOverrides,
          immunity: charData.damageImmunityOverrides,
          vulnerability: charData.damageVulnerabilityOverrides,
        },
        session.sessionDefenses,
        effectiveProficiencyBonus(
          totalLevel(charData),
          charData.proficiencyBonusOverride
        ),
        isHeavyArmorEquipped(charData.equipment, getEquipment)
      ),
      critAt: aggregate.deathSaveCritThreshold,
    };
  }, [charData, session]);

  const defended = useMemo(() => defendedDamageTypes(defenses), [defenses]);
  const resistedSources = useMemo(
    () => [...defenses.sourceResistances].sort(),
    [defenses]
  );

  const deathSucc = character?.session.deathSucc ?? 0;
  const deathFail = character?.session.deathFail ?? 0;
  const atZero = character !== null && current === 0;
  const dead = character !== null && diedInPlay(character.session);
  const stable = character !== null && stabilisedInPlay(character.session);

  /** Snapshot the slice every damage/death-save undo restores exactly. */
  function snapshotHp() {
    return {
      current,
      temp,
      deathSucc,
      deathFail,
      conditions: character ? [...character.session.conditions] : [],
    };
  }

  function handleApplyDamage(
    parts: ReadonlyArray<DamageInstance>,
    opts?: { crit?: boolean }
  ) {
    if (!character || dead) return;
    // RA-05 — resolve the ENTERED roll against the character's own defenses
    // (the same pure math the popover previews). Untyped parts pass verbatim.
    const intake = resolveDamageIntake(parts, defenses);
    if (intake.rawTotal <= 0) return;
    if (intake.netTotal <= 0) {
      // Fully immune / reduced to 0 — nothing changed, so nothing to undo: a
      // plain notice in its own lane (reversal contract §5), showing the math.
      useToastStore.getState().showToast({
        message: t("combat.noDamageTakenToast", { raw: intake.rawTotal }),
        duration: 4000,
      });
      return;
    }
    const prev = snapshotHp();
    const wasAtZero = atZero;
    const crit = opts?.crit === true;
    // Death Ward — snapshot whether the ward toggle was lit BEFORE the hit, so we
    // can detect the store's 0-HP interrupt (it clamps to 1 + ends the ward) and
    // re-light it on undo.
    const hadDeathWard =
      character.session.activeFeatures?.includes("spell-death-ward") ?? false;
    // Delegate to the store (temp absorption + the concentration DC from the FULL
    // damage taken + the Death Ward interrupt + the 0-HP rules — RA-03/RA-10).
    applyDamage(intake.netTotal, { crit });
    // Read the ACTUAL resulting state from the store (Death Ward may have clamped
    // to 1; the 0-HP rules may have marked failures) — the toast reflects truth.
    const after = useCharacterStore.getState().character;
    const newHP = after?.session.hp.current ?? Math.max(0, prev.current - prev.temp);
    const failNow = after?.session.deathFail ?? deathFail;
    const wardTriggered =
      hadDeathWard &&
      !(after?.session.activeFeatures?.includes("spell-death-ward") ?? false);

    // Pattern B — the message depends on the mutation's RESULT. Priority: the
    // death/dying beats outrank the arithmetic line (the popover already showed
    // the math live); a typed hit that changed the number keeps rolled → taken.
    const message = wardTriggered
      ? t("combat.deathWardToast", { prev: prev.current })
      : wasAtZero
        ? isInstantDeathAtZero(intake.netTotal, max)
          ? t("combat.instantDeathToast")
          : failNow >= DEATH_FAIL_LIMIT
            ? t("deathSaves.dead")
            : t(crit ? "combat.zeroHpCritFailToast" : "combat.zeroHpFailToast", {
                n: failNow,
              })
        : newHP === 0
          ? isMassiveDamageDeath(intake.netTotal, prev.current, prev.temp, max)
            ? t("combat.massiveDeathToast", { val: intake.netTotal })
            : t("combat.knockoutToast", { val: intake.netTotal })
          : intake.netTotal !== intake.rawTotal
            ? t("combat.hpDamageResolvedToast", {
                raw: intake.rawTotal,
                net: intake.netTotal,
                prev: prev.current,
                next: newHP,
              })
            : t("combat.hpDamageToast", {
                val: intake.netTotal,
                prev: prev.current,
                next: newHP,
              });
    registerUndoableResult(
      { message },
      () => {
        // A faithful inverse: HP + temp + the dying track + conditions restore in
        // ONE persisting store write (incl. the knockout's Unconscious / a
        // massive-death's 3 failures / an at-0 mark).
        restoreHpSnapshot(prev);
        // Re-light the Death Ward toggle the store ended (a faithful inverse — the
        // ward is un-spent along with the HP).
        if (wardTriggered) {
          useCharacterStore.getState().setActiveFeature("spell-death-ward", true);
        }
      },
      () => handleApplyDamage(parts, opts)
    );
  }

  function applyHeal(amount: number) {
    if (!character) return;
    if (!amount || amount <= 0) return;
    const prevHP = current;
    const newHP = Math.min(max, current + amount);
    const message = t("combat.hpHealToast", { val: amount, prev: prevHP, next: newHP });
    // Delegate to the store's healing seam, which clamps + logs the structured
    // `hp-heal` event (events-as-data) and — off 0 — resets the dying track +
    // sheds Unconscious. Undo restores the exact prior slice.
    const prev = snapshotHp();
    registerUndoableToast(
      { message },
      () => {
        applyHealing(amount);
        return () => restoreHpSnapshot(prev);
      },
      { turnScoped: false }
    );
  }

  function applyTemp(amount: number) {
    if (!character) return;
    if (!amount || amount <= 0) return;
    const prevTemp = temp;
    const newTemp = Math.max(temp, amount); // temp HP doesn't stack — take the higher
    const message = t("combat.tempHpToast", { val: newTemp });
    // Delegate to the store's temp-gain seam, which logs the structured
    // `temp-hp-gain` event (events-as-data). Undo restores via the log-free setter.
    registerUndoableToast(
      { message },
      () => {
        gainTempHp(amount);
        return () => setTempHP(prevTemp);
      },
      { turnScoped: false }
    );
  }

  function clearTemp() {
    if (!character) return;
    const prevTemp = temp;
    if (prevTemp === 0) return;
    const message = t("combat.clearTempToast", { val: prevTemp });
    registerUndoableToast(
      { message },
      () => {
        setTempHP(0);
        return () => setTempHP(prevTemp);
      },
      { turnScoped: false }
    );
  }

  function applyDeathSave(face: number) {
    if (!character || current > 0 || dead || stable) return;
    const entered = Math.floor(face);
    if (entered < 1 || entered > 20) return;
    const prev = snapshotHp();
    // RA-11 — the pure interpreter (`compute.deathSaveOutcome`) reads the entered
    // face against the character's crit threshold (Champion Survivor lowers it).
    const outcome = deathSaveOutcome(entered, critAt);
    let message: string;
    switch (outcome) {
      case "natural-twenty": {
        // Regain 1 HP and wake — the heal seam resets the track + sheds
        // Unconscious + logs, exactly like any heal off 0 (one seam, rule 6).
        applyHealing(1);
        message = t("combat.deathSaveNat20Toast", { n: entered });
        break;
      }
      case "two-failures": {
        const f = Math.min(DEATH_FAIL_LIMIT, deathFail + 2);
        setDeathSaves(deathSucc, f);
        message =
          f >= DEATH_FAIL_LIMIT
            ? t("deathSaves.dead")
            : t("combat.deathSaveNat1Toast", { n: entered, f });
        break;
      }
      case "failure": {
        const f = Math.min(DEATH_FAIL_LIMIT, deathFail + 1);
        setDeathSaves(deathSucc, f);
        message =
          f >= DEATH_FAIL_LIMIT
            ? t("deathSaves.dead")
            : t("combat.deathSaveFailToast", { n: entered, f });
        break;
      }
      case "success": {
        const s = Math.min(DEATH_SUCCESS_LIMIT, deathSucc + 1);
        setDeathSaves(s, deathFail);
        message =
          s >= DEATH_SUCCESS_LIMIT
            ? t("combat.deathSaveStableToast", { n: entered })
            : t("combat.deathSaveSuccessToast", { n: entered, s });
        break;
      }
    }
    registerUndoableResult(
      { message },
      () => restoreHpSnapshot(prev),
      () => applyDeathSave(face)
    );
  }

  return {
    current,
    max,
    temp,
    state,
    pct,
    bloodied,
    defenses,
    defendedTypes: defended,
    resistedSources,
    atZero,
    dead,
    stable,
    handleApplyDamage,
    applyHeal,
    applyTemp,
    clearTemp,
    applyDeathSave,
  };
}
