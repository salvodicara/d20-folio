/**
 * The 0-HP family's commits and the damage entry, with no React: the classic HP
 * controls (`useHpControls`, the DyingBanner) and the new Play screen's down model
 * (`@/domains/play/down-model`) both commit through these, so the rules and their
 * messages live once. Each reads the LIVE sheet at commit and registers one undo.
 */
import type { TFunction } from "i18next";

import { getEquipment } from "@/data/equipment";
import {
  aggregateCharacterGrants,
  effectiveConditions,
  effectiveMaxHp,
} from "@/lib/aggregate-character";
import { deathSaveLimits, isCharacterAlive } from "@/lib/character-status";
import { vitalDeathSaves, vitalHp } from "@/lib/character-vitals";
import { effectiveProficiencyBonus, isHeavyArmorEquipped } from "@/lib/compute";
import { totalLevel } from "@/lib/classes";
import {
  isInstantDeathAtZero,
  isMassiveDamageDeath,
  resolveDamageIntake,
  type DamageDefenses,
  type DamageInstance,
} from "@/lib/damage-intake";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import type { Locale } from "@/lib/locale";
import type { LocText } from "@/lib/loc-text";
import { fallLandsProne } from "@/lib/play/fall";
import type { ZeroHpSaver, ZeroHpSaveResult } from "@/lib/play/zero-hp-savers";
import { deriveDamageDefenses } from "@/lib/views/sheet-view";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableResult, registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

/** How an entered hit lands: a Critical Hit, its log source, landing Prone. */
export interface DamageOpts {
  crit?: boolean;
  /** Stamped on the damage (and Prone) log lines. */
  source?: LocText;
  /** Gain Prone with the hit when it deals damage (a fall). */
  landProne?: boolean;
}

/** The ids of the log lines on the sheet now. */
function logIds(): Set<string> {
  return new Set(
    useCharacterStore.getState().character?.session.logEntries.map((e) => e.id) ?? []
  );
}

/** Stamp `source` on the newest `kind` line logged since `before`; returns its reverse. */
function stampSource(
  before: ReadonlySet<string>,
  kind: "hp-damage" | "condition-gain",
  source: LocText
): (() => void) | null {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.findLast(
    (e) => !before.has(e.id) && e.event.kind === kind
  );
  return entry
    ? store.amendLogEntry(entry.id, { ...entry.event, source } as CombatEvent)
    : null;
}

/**
 * RA-05 — the character's EFFECTIVE damage defenses (grants + build override maps +
 * the session overlay; a RAGING Barbarian's B/P/S resistance rides `activeFeatures`).
 */
export function damageDefensesFor(doc: CharacterDoc): DamageDefenses {
  const { character: charData, session } = doc;
  const aggregate = aggregateCharacterGrants(charData, session);
  return deriveDamageDefenses(
    aggregate,
    {
      resistance: charData.damageResistanceOverrides,
      immunity: charData.damageImmunityOverrides,
      vulnerability: charData.damageVulnerabilityOverrides,
    },
    session.sessionDefenses,
    effectiveProficiencyBonus(totalLevel(charData), charData.proficiencyBonusOverride),
    isHeavyArmorEquipped(charData.equipment, getEquipment),
    effectiveSessionConditions(session)
  );
}

/**
 * Apply one entered hit: the character's own defenses resolve each typed part, then
 * the 0-HP rules apply (RA-03/RA-10). `opts.crit` marks a Critical Hit: at 0 HP it
 * is two death-save failures. Empty / all-zero parts are a no-op.
 */
export function commitDamage(
  parts: ReadonlyArray<DamageInstance>,
  opts: DamageOpts | undefined,
  t: TFunction
): void {
  const character = useCharacterStore.getState().character;
  if (!character || !isCharacterAlive(character.status, character.session)) return;
  const defenses = damageDefensesFor(character);
  const max = effectiveMaxHp(character.character, character.session);
  const { current, temp } = vitalHp(character.session);
  const deathFail = vitalDeathSaves(character.session).failures;
  const atZero = current === 0;
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
  const prev = { current, temp };
  const wasAtZero = atZero;
  const crit = opts?.crit === true;
  // Death Ward — snapshot whether the ward toggle was lit BEFORE the hit, so we
  // can detect the store's 0-HP interrupt (it clamps to 1 + ends the ward) and
  // re-light it on undo.
  const hadDeathWard =
    character.session.activeFeatures?.includes("spell-death-ward") ?? false;
  // A fall lands you Prone when it deals damage: the chip goes on first, so the
  // damage receipt below is the last change and its causal undo stays valid.
  const source = opts?.source;
  const landsProne =
    opts?.landProne === true &&
    fallLandsProne(intake.netTotal) &&
    !effectiveConditions(character).includes("prone");
  const dropProne = () =>
    void useCharacterStore.getState().removeConditionSilent("prone");
  if (landsProne) {
    const before = logIds();
    useCharacterStore.getState().addCondition("prone");
    if (source) stampSource(before, "condition-gain", source);
  }
  // Delegate to the store (temp absorption + the concentration DC from the FULL
  // damage taken + the Death Ward interrupt + the 0-HP rules — RA-03/RA-10).
  const beforeDamage = logIds();
  // A fall is not an attack: a claimed Uncanny Dodge waits for the attack's hit.
  const undoHit = useCharacterStore.getState().applyDamage(intake.netTotal, {
    crit,
    ...(opts?.landProne !== undefined ? { notAnAttack: true as const } : {}),
  });
  if (!undoHit) {
    if (landsProne) dropProne();
    return;
  }
  const unstamp = source ? stampSource(beforeDamage, "hp-damage", source) : null;
  // Reverse newest first: the source stamp, the hit, then Prone.
  const undoDamage = (): boolean => {
    unstamp?.();
    if (!undoHit()) return false;
    if (landsProne) dropProne();
    return true;
  };
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
        : failNow >=
            deathSaveLimits(useCharacterStore.getState().character?.session).failures
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
  // Redo repeats the same manual damage entry.
  registerUndoableResult({ message }, undoDamage, () => commitDamage(parts, opts, t));
}

/**
 * RA-11 — apply an ENTERED death-save d20 (rolled at the table): nat 1 = two
 * failures, 2–9 = one failure, 10+ = one success (three = Stable), at or above the
 * crit threshold (nat 20, Champion Survivor 18+) = regain 1 HP and wake.
 */
export function commitDeathSaveEntry(
  faces: number | ReadonlyArray<number>,
  t: TFunction
): void {
  const enteredFaces = typeof faces === "number" ? [faces] : Array.from(faces);
  const before = useCharacterStore.getState().character;
  const { successes: deathSucc, failures: deathFail } = before
    ? vitalDeathSaves(before.session)
    : { successes: 0, failures: 0 };
  const commit = useCharacterStore.getState().commitDeathSave(enteredFaces);
  if (!commit) return;
  const outcome = commit.result.reviewedOutcome.deathSave;
  const entered = commit.result.selectedNaturalFace;
  if (!outcome || entered === null) return;
  const after = useCharacterStore.getState().character;
  let message: string;
  if (outcome.naturalTwentyBenefit) {
    message = t("combat.deathSaveNat20Toast", { n: entered });
  } else if (outcome.failures === 2) {
    const failures = after?.session.deathFail ?? deathFail;
    message =
      failures >=
      deathSaveLimits(useCharacterStore.getState().character?.session).failures
        ? t("deathSaves.dead")
        : t("combat.deathSaveNat1Toast", { n: entered, f: failures });
  } else if (commit.result.reviewedOutcome.status === "failure") {
    const failures = after?.session.deathFail ?? deathFail;
    message =
      failures >=
      deathSaveLimits(useCharacterStore.getState().character?.session).failures
        ? t("deathSaves.dead")
        : t("combat.deathSaveFailToast", { n: entered, f: failures });
  } else {
    const successes = after?.session.deathSucc ?? deathSucc;
    message =
      successes >= 3
        ? t("combat.deathSaveStableToast", { n: entered })
        : t("combat.deathSaveSuccessToast", { n: entered, s: successes });
  }
  registerUndoableResult({ message }, commit.undo, () =>
    commitDeathSaveEntry(enteredFaces, t)
  );
}

/**
 * A zero-HP saver (Relentless Endurance, Relentless Rage, Undying Sentinel), offered
 * once per fall: one without a save stands the character up; one with a save takes
 * the result the player rolled. Undoable from its toast.
 */
export function commitZeroHpSaver(
  saver: ZeroHpSaver,
  result: ZeroHpSaveResult | undefined,
  t: TFunction,
  locale: Locale
): void {
  const source = grantSourceLabel(saver.sourceId, locale);
  const message =
    result === "failure"
      ? t("combat.atZeroHpSaveFailedToast", { source })
      : t("combat.atZeroHpAppliedToast", { source, hp: saver.hitPoints });
  registerUndoableToast(
    { message },
    () => useCharacterStore.getState().applyZeroHpSaver(saver.sourceId, result),
    { turnScoped: false }
  );
}
