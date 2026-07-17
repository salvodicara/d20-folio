/**
 * DeathSaves — the markable death-saving-throw track, shown at 0 HP.
 *
 * A slim, frameless inline control (it lives INSIDE the global `DyingBanner`
 * carved danger strip, so it carries no card of its own — a card here would be a
 * double-frame). The two tracks read as carved gem sockets in the folio pip
 * vocabulary: an empty pip is a recessed socket (`--pip-empty-*` + `--elev-recessed`),
 * a marked pip lifts to an embossed semantic gem (verdigris success / vermilion
 * failure, `--elev-resting`). Tap a pip to set the count; tap the current top pip
 * to clear it. Three successes = stabilised; three failures = dead.
 *
 * Token-only colours (semantic `success` / `error` utilities + `--pip-empty-*`),
 * gold-halo focus via the global `:focus-visible`. The reset is a folio ghost
 * button, surfaced only once there is something to reset.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Skull, Sparkles } from "lucide-react";
// Heart/Skull stay: they anchor the success/failure pip rows below.
import { useCharacterStore } from "@/stores/characterStore";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { diedInPlay, stabilisedInPlay } from "@/lib/character-status";

const SLOTS = [0, 1, 2] as const;

/** The RAW default natural-20 death-save crit threshold (a nat-20 stabilises). */
const DEFAULT_DEATH_SAVE_CRIT = 20;

export function DeathSaves() {
  const { t } = useTranslation();
  const character = useCharacterStore((s) => s.character);
  const setDeathSaves = useCharacterStore((s) => s.setDeathSaves);

  // S5 — the LOWERED death-save crit threshold a Champion's "Survivor" / a Defy
  // Death feature grants (a d20 of N+ counts as a natural 20 → you regain 1 HP).
  // Read off the SAME canonical sheet-wide aggregate every play surface uses, so
  // the death-save control can't disagree with the rest of the sheet (rule 6).
  // A source-agnostic NUMERIC line (interpolated `{{n}}`) — never a class/subclass
  // display name (golden rule 7). Memoized like LeftHud's aggregate read.
  const charData = character?.character;
  const activeFeatures = character?.session.activeFeatures;
  const grantBundleChoices = character?.session.grantBundleChoices;
  const critAt = useMemo(
    () =>
      charData
        ? aggregateCharacterGrants(charData, { activeFeatures, grantBundleChoices })
            .deathSaveCritThreshold
        : DEFAULT_DEATH_SAVE_CRIT,
    [charData, activeFeatures, grantBundleChoices]
  );

  if (!character) return null;

  const { deathSucc, deathFail, hp } = character.session;

  // Only meaningful while down.
  if (hp.current > 0) return null;

  // Same thresholds the roster card derives "fallen" from (shared module) so the
  // cockpit and the tile never disagree on stabilised / dead.
  const isStable = stabilisedInPlay(character.session);
  const isDead = diedInPlay(character.session);
  const locked = isStable || isDead;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-mono text-[length:var(--text-micro)] font-bold uppercase tracking-[0.12em] text-text-secondary">
        {t("deathSaves.title")}
      </span>

      <PipRow
        kind="success"
        icon={Heart}
        label={t("deathSaves.successes")}
        count={deathSucc}
        locked={locked}
        onSet={(n) => setDeathSaves(n, deathFail)}
      />
      <PipRow
        kind="fail"
        icon={Skull}
        label={t("deathSaves.failures")}
        count={deathFail}
        locked={locked}
        onSet={(n) => setDeathSaves(deathSucc, n)}
      />

      {/* S5 — the lowered crit threshold (Champion Survivor "Defy Death" 18-20=20).
          Shown ONLY below the RAW default, so a non-Champion sheet is unchanged.
          A carved success-tinted chip in the same folio chip vocabulary as the pips,
          interpolating the NUMBER (never a source display name — rule 7). */}
      {critAt < DEFAULT_DEATH_SAVE_CRIT && (
        <span className="flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-[length:var(--text-micro)] font-semibold text-success">
          <Icon as={Sparkles} size="sm" decorative />
          {t("deathSaves.critThreshold", { n: critAt })}
        </span>
      )}

      {/* The resolved verdict (Stable / Dead) is announced by the DyingBanner's
          state label — repeating it here doubled the ceremony (RA-11). */}

      {(deathSucc > 0 || deathFail > 0) && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          // B16 — route the reset through the SAME persisting seam every other death-save
          // mutation uses (`setDeathSaves`, which calls `persistCombat`). The trio (HP /
          // conditions / initiative / death saves) lives in the `combat/state` subdoc, NOT
          // the parent character doc; `updateSession` alone (the prior code) only mutated
          // in-memory session state, so a reset never survived a reload / another client.
          onClick={() => setDeathSaves(0, 0)}
        >
          {t("common.reset")}
        </Button>
      )}
    </div>
  );
}

/**
 * One success/failure track of three tappable gem sockets. Clicking a pip fills
 * the track up to it; clicking the current top pip clears it (so the marks are
 * fully reversible without a separate stepper). Disabled once the track is
 * resolved (stable / dead). State is conveyed to assistive tech by `aria-pressed`
 * (the gem fill alone is graphic-only).
 */
function PipRow({
  kind,
  icon,
  label,
  count,
  locked,
  onSet,
}: {
  kind: "success" | "fail";
  icon: typeof Heart;
  label: string;
  count: number;
  locked: boolean;
  onSet: (count: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        as={icon}
        size="sm"
        decorative
        className={kind === "success" ? "text-success" : "text-error"}
      />
      <div className="flex items-center gap-1.5" role="group" aria-label={label}>
        {SLOTS.map((i) => {
          const on = i < count;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${label} ${i + 1}`}
              aria-pressed={on}
              disabled={locked && !on}
              onClick={() => onSet(on && i === count - 1 ? i : i + 1)}
              // `before:-inset-2` — the oversized invisible hit area every tappable
              // pip in the app carries (`button.trk-pip::before` / `button.sc-pip::before`,
              // folio.css): a 20px gem alone is a fiddly touch target at the table;
              // the pseudo grows it to ~36px without moving a pixel of layout.
              className={cn(
                "relative h-5 w-5 rounded-full border transition-colors before:absolute before:-inset-2 before:content-['']",
                on
                  ? kind === "success"
                    ? "border-success bg-success shadow-[var(--elev-resting)]"
                    : "border-error bg-error shadow-[var(--elev-resting)]"
                  : "border-[color:var(--pip-empty-border)] bg-[var(--pip-empty-fill)] shadow-[var(--elev-recessed)]",
                locked && !on && "opacity-40"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
