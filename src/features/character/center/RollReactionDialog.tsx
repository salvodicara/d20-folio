/**
 * A use on another creature's roll (Cutting Words), read at a glance: the feature's
 * painted icon beside the die it applies («−1d10», in the die's colour) and the uses
 * left as pips; «Su chi?» as the fight's medallion rows (a monster's painted icon,
 * else its creature type's glyph, never initials); «Su quale tiro?» as three icon
 * tiles; then the result line in the die's colour. «Usa la Reazione» spends the
 * Reaction and the use, with the undo toast. Copied from the BG3 reaction prompt
 * (the reaction's icon and effect in one popup; refs-2026-11-05/reactions/bg3-gamerguides-reaction-ask.png) and D&D
 * Beyond's reaction card (the die by level, the uses as pips).
 */
import { useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  Bug,
  Cog,
  Dices,
  Droplet,
  Droplets,
  Eye,
  Flame,
  Gem,
  Ghost,
  Mountain,
  PawPrint,
  Skull,
  Sparkles,
  Sprout,
  Sun,
  Sword,
  User,
  Wind,
  type LucideProps,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Portrait } from "@/components/shared/Portrait";
import type { CreatureType, ReactableRoll } from "@/data/types";
import {
  operationLabelKey,
  rollLabelKey,
  rollPlanCopy,
  type RollReactionPlan,
} from "@/lib/play/roll-reactions";
import { Art } from "@/ui/Art";

import type { RollReactionView, RollTarget } from "./roll-reaction-view";

/** A creature type's glyph: the medallion of a monster with no painted icon yet. */
const CREATURE_GLYPH: Record<CreatureType, ComponentType<LucideProps>> = {
  aberration: Eye,
  beast: PawPrint,
  celestial: Sun,
  construct: Cog,
  dragon: Flame,
  elemental: Wind,
  fey: Sparkles,
  fiend: Skull,
  giant: Mountain,
  humanoid: User,
  monstrosity: Bug,
  ooze: Droplets,
  plant: Sprout,
  undead: Ghost,
};

/** Each roll's tile glyph: a sword for the attack, dice for a check or a save, a
 *  drop of blood for damage. */
const ROLL_GLYPH: Record<ReactableRoll, ComponentType<LucideProps>> = {
  attack: Sword,
  check: Dices,
  save: Dices,
  damage: Droplet,
  initiative: Dices,
};

function Medallion({ target }: { target: RollTarget }) {
  if (target.srdId || target.creatureType) {
    const Glyph = CREATURE_GLYPH[target.creatureType ?? "humanoid"];
    const glyph = <Glyph aria-hidden size={16} strokeWidth={1.75} />;
    return target.srdId ? (
      <Art kind="monster" id={target.srdId} fallback={glyph} className="rr-art-img" />
    ) : (
      glyph
    );
  }
  return (
    <Portrait
      src={target.portraitUrl ?? null}
      crop={target.portraitCrop ?? null}
      name={target.name}
      seed={target.id}
    />
  );
}

export function RollReactionDialog({
  name,
  featureId,
  view,
  onUse,
  onClose,
}: {
  name: string;
  /** The class feature behind the use, for its painted icon. */
  featureId?: string;
  view: RollReactionView;
  onUse: (plan: RollReactionPlan) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string | null>(
    view.targets.length === 1 ? (view.targets[0]?.id ?? null) : null
  );
  const [roll, setRoll] = useState<ReactableRoll | null>(
    view.rolls.length === 1 ? (view.rolls[0] ?? null) : null
  );
  const [operation, setOperation] = useState<"add" | "subtract">(
    view.operations[0] ?? "subtract"
  );
  const needsTarget = view.targets.length > 0;
  const picked = view.targets.find((c) => c.id === target);
  const plan: RollReactionPlan | null =
    roll && (!needsTarget || picked)
      ? {
          die: view.die,
          operation,
          roll,
          ...(picked ? { target: { id: picked.id, name: picked.name } } : {}),
        }
      : null;
  // The result line: the whole use once it is picked, else what the die does.
  const copy = rollPlanCopy(plan ?? undefined);
  const result = copy
    ? t(copy.key, {
        ...copy.values,
        name,
        roll: t(copy.rollKey).toLowerCase(),
      })
    : t(
        operation === "add" ? "play.rollReaction.doAdd" : "play.rollReaction.doSubtract",
        {
          die: view.die,
        }
      );
  const sign = operation === "add" ? "+" : "−";
  const uses = view.uses;
  const glyph = <Gem aria-hidden size={28} strokeWidth={1.5} />;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        size="sm"
        rubric={t("combat.reaction")}
        title={t("play.rollReaction.title", { name })}
        description={result}
        closeLabel={t("common.cancel")}
      >
        <DialogBody>
          <div className="rr-hero">
            <span className="rr-art" aria-hidden>
              {featureId ? (
                <Art
                  kind="feature"
                  id={featureId}
                  fallback={glyph}
                  className="rr-art-img"
                />
              ) : (
                glyph
              )}
            </span>
            <span className="rr-die">{`${sign}${view.die}`}</span>
            {uses && (
              <span
                className="rr-pips"
                role="img"
                aria-label={t("play.uses", {
                  current: uses.current,
                  total: uses.total,
                })}
              >
                {Array.from({ length: uses.total }, (_, i) => (
                  <span
                    key={i}
                    className="rr-pip"
                    data-on={i < uses.current ? "" : undefined}
                  />
                ))}
              </span>
            )}
          </div>
          {needsTarget && (
            <section className="cl-group">
              <h3 className="cl-group-label">{t("campaignHub.encounterActionOnWhom")}</h3>
              <div className="cl-opts">
                {view.targets.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`cl-opt cl-slot cl-target${target === c.id ? " is-active" : ""}`}
                    data-side={c.side}
                    aria-pressed={target === c.id}
                    onClick={() => setTarget(c.id)}
                  >
                    <span className="cl-avatar rr-medallion" aria-hidden>
                      <Medallion target={c} />
                    </span>
                    <span className="cl-name">{c.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="cl-group">
            <h3 className="cl-group-label">{t("play.rollReaction.which")}</h3>
            <div className="rr-tiles">
              {view.rolls.map((r) => {
                const Glyph = ROLL_GLYPH[r];
                return (
                  <button
                    key={r}
                    type="button"
                    className={`rr-tile${roll === r ? " is-active" : ""}`}
                    aria-pressed={roll === r}
                    onClick={() => setRoll(r)}
                  >
                    <Glyph aria-hidden size={24} strokeWidth={1.5} />
                    <span>{t(rollLabelKey(r))}</span>
                  </button>
                );
              })}
            </div>
          </section>
          {view.operations.length > 1 && (
            <div className="rr-tiles" data-n="2">
              {view.operations.map((op) => (
                <button
                  key={op}
                  type="button"
                  className={`rr-tile${operation === op ? " is-active" : ""}`}
                  aria-pressed={operation === op}
                  onClick={() => setOperation(op)}
                >
                  <span>{t(operationLabelKey(op))}</span>
                </button>
              ))}
            </div>
          )}
          <p className="rr-result" aria-live="polite">
            {result}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" block onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            block
            disabled={!plan}
            onClick={() => plan && onUse(plan)}
          >
            {t("play.rollReaction.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
