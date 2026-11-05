/**
 * Taking a rest, the one way every screen does it (the cockpit's Rest modal, the Play
 * screen's «Riposo breve» / «Riposo lungo»). It prepares and commits the rest's typed
 * item-resource boundary against the character the player reviewed (a change in
 * between stops it, with a toast), then routes the rest through `restThroughWorld`
 * (rest-world-boundary.ts), applies a Short Rest's heal and its spent Hit Point Dice,
 * and ends the current fight. A rest is the undo stack's fence: it is not undone.
 */
import { clockFor } from "@/lib/play/clock";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { canCharacterRest } from "@/lib/character-status";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { stepCampaignClock } from "@/features/campaigns/clock-io";
import { diagnosticsLog } from "@/lib/diagnostics";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import type { CharacterDoc } from "@/types/character";
import { LONG_REST_MINUTES, SHORT_REST_MINUTES } from "@/lib/play/rests";
import { crossedBoundaries } from "@/lib/play/time";
import { useItemResourceCommands } from "./center/useItemResourceCommands";
import { declareClockBoundary } from "./clock-boundaries";
import { restThroughWorld } from "./rest-world-boundary";

type Prepared = NonNullable<
  Awaited<ReturnType<ReturnType<typeof useItemResourceCommands>["prepareBoundary"]>>
>;

export function useRestCommit() {
  const { t } = useTranslation();
  const setHP = useCharacterStore((s) => s.setHP);
  const updateSession = useCharacterStore((s) => s.updateSession);
  const itemResourceCommands = useItemResourceCommands();
  const [committing, setCommitting] = useState(false);
  const committingRef = useRef(false);

  /** Preflight and atomically commit one typed item-resource rest boundary.
   *  The reviewed character snapshot stays frozen across any physical-roll input. */
  async function commitBoundary(
    kind: "short-rest" | "long-rest",
    reviewed: CharacterDoc
  ): Promise<Prepared | null> {
    if (committingRef.current) return null;
    if (!canCharacterRest(reviewed.status, reviewed.session)) return null;
    committingRef.current = true;
    setCommitting(true);
    try {
      const prepared = await itemResourceCommands.prepareBoundary({ kind });
      if (!prepared) return null;
      const live = useCharacterStore.getState().character;
      if (live !== reviewed || !canCharacterRest(live.status, live.session)) {
        useToastStore.getState().showToast({
          message: t("rest.stateChanged"),
          duration: 5000,
        });
        return null;
      }
      return itemResourceCommands.commitBoundary(prepared) ? prepared : null;
    } finally {
      committingRef.current = false;
      setCommitting(false);
    }
  }

  /** With a time of day set, the dawn or dusk the rest crosses (M18): what recovers
   *  then, recovers now, each with its undo toast. */
  function fireClock(reviewed: CharacterDoc, minutes: number): void {
    for (const kind of crossedBoundaries(clockFor(reviewed).timeOfDay, minutes)) {
      void declareClockBoundary(
        itemResourceCommands,
        kind,
        t(`magicItems.clockApplied_${kind}`)
      );
    }
  }

  /** A campaign character's rest moves the campaign's clock (`clockFor`): the step is
   *  written on the campaign and the sheet marks the minute it caught up to. */
  function stepCampaign(reviewed: CharacterDoc, minutes: number): void {
    const clock = clockFor(reviewed);
    const uid = useAuthStore.getState().user?.uid;
    if (clock.scope !== "campaign" || !uid) return;
    updateSession({ clockSeen: clock.minute + minutes });
    void stepCampaignClock(clock.campaignId, minutes, uid).catch((error: unknown) =>
      diagnosticsLog("warn", "play.campaign-clock-write-failed", {
        message: String(error),
      })
    );
  }

  /** A Short Rest healing `healedHp` (the entered roll + CON per die, 0 without
   *  dice) and spending `hitDice` dice. Null when it did not happen. */
  async function shortRest(
    reviewed: CharacterDoc,
    hitDice: number,
    healedHp: number
  ): Promise<Prepared | null> {
    const prepared = await commitBoundary("short-rest", reviewed);
    if (!prepared) return null;
    const { session } = reviewed;
    const newHp = Math.min(
      session.hp.current + healedHp,
      effectiveMaxHp(reviewed.character, session)
    );
    restThroughWorld("short", { healedHp });
    fireClock(reviewed, SHORT_REST_MINUTES);
    stepCampaign(reviewed, SHORT_REST_MINUTES);
    if (healedHp > 0) setHP(newHp);
    if (hitDice > 0) updateSession({ hitDice: { used: session.hitDice.used + hitDice } });
    // A short rest ends the current fight — return combat to baseline.
    useCombatStore.getState().endCombat();
    return prepared;
  }

  /** A Long Rest. Null when it did not happen. */
  async function longRest(reviewed: CharacterDoc): Promise<Prepared | null> {
    const prepared = await commitBoundary("long-rest", reviewed);
    if (!prepared) return null;
    restThroughWorld("long");
    fireClock(reviewed, LONG_REST_MINUTES);
    stepCampaign(reviewed, LONG_REST_MINUTES);
    // A long rest ends the current fight — return combat to baseline.
    useCombatStore.getState().endCombat();
    return prepared;
  }

  return { committing, shortRest, longRest };
}
