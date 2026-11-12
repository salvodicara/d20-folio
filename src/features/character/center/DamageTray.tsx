/**
 * The damage tray (owner 2026-10-12): the intermediate screen right after a use with
 * targets. Copied from Foundry VTT dnd5e's damage-application tray — one rolled total,
 * one row per target with ×0 · ×½ · ×1 · ×2 and the target's resistances, one Apply —
 * plus Roll20 GroupCheck/ApplyDamage's per-target "Saved" toggle. The panel itself is
 * shared with the DM's monster card ({@link DamageTrayPanel}); this file is the
 * old sheet's side. Which targets the player picked is `useTrayTargets`, and where an
 * applied row lands is `applyTray`; the new Play screen's tray uses both. The app
 * never rolls: the player types what the table rolled.
 *
 * An attack's row also says Colpito · Mancato · Critico (Foundry dnd5e's chat card):
 * Apply writes the shared result onto the use's own log line, the per-target result
 * onto each damage line, and one outcome receipt per target into the turn.
 *
 * Where an applied row lands:
 *  - me → the sheet's own store seams (heal / temp HP / damage / condition), tagged
 *    with the action as source; undoable as ONE step with the monsters' lines;
 *  - another PC in the live encounter → the same peer combat write the campaign PC card
 *    uses, then an `effect-given` log line (a remote write, not undone by Undo);
 *  - a monster → only the `effect-given` log line (players cannot write monster HP).
 * Skip (or closing) applies nothing: the use stays logged exactly as it was.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { DamageTrayPanel } from "@/components/shared/DamageTrayPanel";
import { Dialog } from "@/components/ui/dialog";
import { rowAmount, rowDamageParts } from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";

import { applyTray } from "./apply-tray";
import { useDamageTrayStore, type DamageTrayOffer } from "./damage-tray-store";
import { useTrayTargets } from "./use-tray-targets";

export function DamageTray() {
  const offer = useDamageTrayStore((s) => s.offer);
  const characterId = useCharacterStore((s) => s.character?.id);
  const open = offer !== null && offer.characterId === characterId;
  // Leaving the sheet (the provider unmounts) drops a tray nobody answered: it must
  // never reappear over another screen. Skipping is the default anyway.
  useEffect(() => () => useDamageTrayStore.getState().close(), []);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useDamageTrayStore.getState().close();
      }}
    >
      {open && <DamageTrayContent key={offer.castLogId ?? "tray"} offer={offer} />}
    </Dialog>
  );
}

function DamageTrayContent({ offer }: { offer: DamageTrayOffer }) {
  const { t } = useTranslation();
  const { plan } = offer;
  const targets = useTrayTargets(plan);

  return (
    <DamageTrayPanel
      title={offer.actionName}
      plan={plan}
      targets={targets}
      // What to roll at the table (a potion's 2d4+2), so no bonus is forgotten.
      {...(plan.dice
        ? { totalHint: t("combat.damageTray.totalHintDice", { dice: plan.dice }) }
        : {})}
      onApply={(rows, totals) => {
        applyTray(
          offer,
          targets,
          rows,
          rows.map((row, i) => (plan.effect ? rowAmount(totals[i] ?? 0, row, plan) : 0)),
          t,
          rows.map((row, i) => rowDamageParts(row, plan, { total: totals[i] ?? null }))
        );
        useDamageTrayStore.getState().close();
      }}
      onSkip={() => useDamageTrayStore.getState().close()}
    />
  );
}
