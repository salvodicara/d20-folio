/**
 * RightHud — the always-on resources cockpit region (Left │ Center │ Right). It
 * composes the re-homed `ResourceRail` molecule: spell slots · class trackers ·
 * concentration · conditions/exhaustion · defenses · proficiencies+languages.
 * On mobile this panel drops below the center behind the "Resources" disclosure
 * (owned by CharacterCockpit).
 */

import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { ResourceRail } from "../molecules/ResourceRail";

export function RightHud() {
  const readonly = useSheetReadonly();
  // T4 — a DM viewing a member's sheet sees the resources as a pure read-out: the
  // rail's play-loop controls (slot/tracker spends, condition picker, inspiration,
  // concentration-clear) are made non-interactive + removed from the tab order via
  // `inert`, while every value stays fully legible. The store's `readonly` guard is
  // the backstop (those mutations are no-ops regardless).
  return (
    <div {...(readonly ? { inert: true } : {})}>
      <ResourceRail />
    </div>
  );
}
