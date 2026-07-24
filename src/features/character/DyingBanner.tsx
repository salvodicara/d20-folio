/**
 * DyingBanner — the global, prominent dying strip (the most dramatic surface in
 * the game, given its ceremony without clutter).
 *
 * The complement to the header's compact "0 HP · Dying" pill: HP is a slim
 * header element with a CONSTANT footprint, so the dying controls live here —
 * a full-width danger strip mounted in the cockpit above the region grid,
 * showing on EVERY tab while a character is down.
 *
 * The strip is STATE-DRIVEN (RA-11): the verdict label reads **Dying** (pulsing
 * beacon) → **Stable** (three successes) → **Dead** (three failures), and while
 * dying the PRIMARY interaction is the death-save ROLL ENTRY — the player rolls
 * their d20 in real life and enters the face; the engine applies the SRD
 * outcome (nat 1 = two failures, 2–9 = failure, 10+ = success, the crit
 * threshold — nat 20, Champion Survivor 18+ — = regain 1 HP and wake), all
 * undoable. The pips remain directly tappable as the OVERRIDE path
 * (golden rule 8) and now display the same engine-written state.
 *
 * Shown while the hero is DOWN — at 0 HP, or dead by ANY cause the one shared
 * `isCharacterDead` predicate recognises (three failed death saves, the roster
 * lifecycle, or Exhaustion 6, which kills outright at full HP). The 0-HP TOOLS
 * (roll entry, death-save pips, quick heal, at-0 interrupts) render only at 0 HP;
 * an Exhaustion death shows the verdict and names its cause. Everything stays
 * derived, so clearing the cause (heal off 0, lower Exhaustion) clears the strip.
 * It reuses the shipped accent-alert
 * idiom (no banner primitive ships), and is announced to assistive tech —
 * `role="status"` + `aria-live="assertive"` (a knockout is urgent). The strip
 * itself is static; the only motion is the beacon pulse, gated on `motion-safe`.
 *
 * ONE engine: the roll entry and the quick Heal drive the SAME `useHpControls`
 * as every other HP surface (relocated UI, not a forked engine). Healing off 0
 * clears the death saves + Unconscious (the store's heal-from-0 seam).
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Heart, HeartCrack, ShieldPlus, Skull } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { resolveAtZeroHpInterrupts } from "@/lib/smart-tracker";
import { isCharacterDead, diedOfExhaustion } from "@/lib/character-status";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { useHpControls } from "./molecules/use-hp-controls";
import { DeathSaves } from "./molecules/DeathSaves";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input, NumberStepper } from "@/components/ui/input";

export function DyingBanner() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const hasCharacter = useCharacterStore((s) => s.character != null);
  const current = useCharacterStore((s) => s.character?.session.hp.current ?? 1);
  const character = useCharacterStore((s) => s.character);
  const applyAtZeroHpInterrupt = useCharacterStore((s) => s.applyAtZeroHpInterrupt);

  // The same shared HP engine the header pill uses — the quick heal, the dying
  // verdict (stable/dead), and the RA-11 death-save roll consumer.
  const { applyHeal, applyDeathSave, dead, stable } = useHpControls();
  const [healAmount, setHealAmount] = useState("");
  // The entered d20 face for the death-save roll entry (clamped 1–20; golden
  // rule 21 — rolled in real life, interpreted here).
  const [face, setFace] = useState(10);

  /** Parse + apply the typed heal, then clear (a no-op on an empty/zero field). */
  function quickHeal(): void {
    const n = parseInt(healAmount, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setHealAmount("");
    applyHeal(n);
  }

  // S4 — at-0-HP interrupts ("drop to 1 instead": Relentless Endurance / Undying
  // Sentinel / Misty Escape). Surfaced ONLY at 0 HP and only when the interrupt's
  // 1/rest tracker still has an unspent use; one tap sets HP 1 + debits it (undoable).
  const interrupts = useMemo(
    () => (character && current <= 0 ? resolveAtZeroHpInterrupts(character) : []),
    [character, current]
  );

  function applyInterrupt(trackerId: string, sourceId: string) {
    const message = t("combat.atZeroHpAppliedToast", {
      source: grantSourceLabel(sourceId, locale),
    });
    registerUndoableToast({ message }, () => applyAtZeroHpInterrupt(trackerId), {
      turnScoped: false,
    });
  }

  // Fallen by ANY cause — the SAME predicate the roster tile reads (golden rule 6),
  // so an Exhaustion-6 death (which happens at full HP) raises the banner too. It
  // was previously reachable only through 0 HP, leaving the loudest death in the
  // game with no banner at all.
  const fallen =
    character != null && isCharacterDead(character.status, character.session);
  const atZero = current <= 0;
  if (!hasCharacter || (!atZero && !fallen)) return null;

  const isDead = dead || fallen;
  // The verdict register — one label owns the state (the pips beneath show HOW).
  const verdict = isDead
    ? { icon: Skull, label: t("character.deadLabel"), tone: "text-error" }
    : stable
      ? { icon: Heart, label: t("character.stableLabel"), tone: "text-success" }
      : { icon: HeartCrack, label: t("character.dyingLabel"), tone: "text-error" };
  // Name the cause when the death did NOT come through the death-save track —
  // composed from the labels that already exist (no new string).
  const cause =
    character != null && diedOfExhaustion(character.session)
      ? `${t("character.exhaustion")} ${character.session.exhaustion}`
      : null;

  return (
    <div
      role="status"
      aria-live="assertive"
      aria-label={t("character.dyingAria")}
      // A carved, embossed danger plate (NOT a flat tinted rectangle): the `.dying-banner`
      // recipe owns the danger surface + border + `--elev-resting` depth so it reads with
      // real material weight on-brand AND stays AA-safe in BOTH themes — in light it sits on
      // a BRIGHT rose-ivory surface (the D47 rule: text lives on bright cards, not on a tint
      // over the deep parchment field, which crushed the red label/pips below AA). It scrolls
      // naturally with the cockpit (non-sticky); mounted once in the cockpit shell.
      className="dying-banner mb-6 flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
    >
      <span
        className={`flex flex-shrink-0 items-center gap-2 font-display text-base font-bold ${verdict.tone}`}
      >
        {/* The danger beacon pulses only while the outcome is still OPEN. */}
        {!isDead && !stable && (
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-error motion-safe:animate-pulse"
          />
        )}
        <Icon as={verdict.icon} size="sm" decorative />
        {verdict.label}
        {cause && (
          <span className="font-sans text-xs font-normal text-text-secondary">
            · {cause}
          </span>
        )}
      </span>

      {/* RA-11 — the death-save roll entry, the PRIMARY act while dying: enter
          the d20 your physical die showed; the engine applies the SRD outcome
          (undoable). Hidden once the track resolves (stable/dead) and dropped
          for read-only viewers (the `.ds-roll` readonly rule in folio.css). */}
      {atZero && !isDead && !stable && (
        <div className="ds-roll flex flex-shrink-0 items-center gap-2">
          <span className="font-mono text-[length:var(--text-micro)] font-bold uppercase tracking-[0.12em] text-text-secondary">
            {t("combat.deathSaveRollLabel")}
          </span>
          <NumberStepper
            value={face}
            onChange={setFace}
            min={1}
            max={20}
            digits={2}
            compact
            ariaLabel={t("combat.deathSaveRollAria")}
            decrementLabel={t("combat.healRollDec")}
            incrementLabel={t("combat.healRollInc")}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              applyDeathSave(face);
              setFace(10);
            }}
          >
            {t("combat.apply")}
          </Button>
        </div>
      )}

      {/* The death-save pips — the engine-written state, still directly tappable
          as the override path (a table ruling always wins — golden rule 8). They
          belong to the 0-HP track, so an Exhaustion death (at full HP) shows none. */}
      {atZero && (
        <div className="min-w-0 flex-1">
          <DeathSaves />
        </div>
      )}

      {/* S4 — at-0-HP interrupt prompt ("Stay at 1 HP — use Relentless Endurance?").
          One tap sets HP 1 + debits the 1/rest use; undoable via the toast.
          Surfaced only while a use is unspent (the engine consumer gates it) and
          the character is not DEAD — RAW the interrupt fires when you are reduced
          to 0 "but not killed outright", so instant death forecloses it. */}
      {atZero &&
        !isDead &&
        interrupts.map((it) => (
          <Button
            key={it.sourceId}
            variant="neutral"
            size="sm"
            className="dying-interrupt flex-shrink-0"
            onClick={() => applyInterrupt(it.trackerId, it.sourceId)}
          >
            <Icon as={ShieldPlus} size="sm" decorative />
            {t("combat.atZeroHpApply", {
              source: grantSourceLabel(it.sourceId, locale),
            })}
          </Button>
        ))}

      {/* Quick Heal — a mate's heal is one field + one tap (Enter applies).
          Healing off 0 clears the dying state (and revives a fallen hero's
          track — the Revivify bookkeeping path). A death that is not an HP death
          is not undone by healing, so the field only rides the 0-HP strip. */}
      {atZero && (
        <div className="flex flex-shrink-0 items-center gap-2">
          <Input
            type="number"
            min="1"
            inputMode="numeric"
            className="sm w-16"
            value={healAmount}
            onChange={(e) => setHealAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") quickHeal();
            }}
            placeholder="0"
            aria-label={t("character.healAmountAria")}
          />
          <Button variant="neutral" size="sm" className="hp-act-heal" onClick={quickHeal}>
            {t("combat.heal")}
          </Button>
        </div>
      )}
    </div>
  );
}
