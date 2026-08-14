/**
 * Mechanics cast modal — the first engine-driven surface.
 *
 * Walks the replay protocol of `useMechanicsCast` one requirement at a time:
 * the spell-slot payment, the target choice, then each physical roll the
 * player makes at the table (the app never rolls — golden rule 21). When the
 * engine reports `ready`, the modal shows the confirm row and commits the
 * canonical journal action on Apply.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { MechanicsCastState } from "@/features/character/useMechanicsCast";
import type {
  MechanicsDiceRequirement,
  MechanicsRequirement,
} from "@/types/mechanics-program";
import type { CharacterMaterialRef } from "@/types/mechanics-reference";

interface DieEntry {
  readonly sides: number;
  readonly trailId: string;
}

function requirementDice(
  requirement: Extract<MechanicsRequirement, { readonly kind: "dice" }>
): readonly DieEntry[] {
  const first: MechanicsDiceRequirement | undefined = requirement.requests[0];
  if (!first) return [];
  return first.roll.trails.map((trail) => ({
    sides: trail.sides,
    trailId: trail.trailId,
  }));
}

export interface MechanicsCastModalProps {
  readonly cast: MechanicsCastState;
  readonly material: CharacterMaterialRef;
  readonly onClose: () => void;
  /**
   * Attack programs review against the target's armor class; when the caller
   * does not know it yet, the modal asks the table for it first.
   */
  readonly onArmorClass?: (value: number) => void;
  readonly requiresArmorClass?: boolean;
  /** Remaining count per standard slot level, for the payment prompt. */
  readonly slotRemaining: Readonly<Record<number, number>>;
  readonly spellName: string;
}

export function MechanicsCastModal({
  cast,
  material,
  onClose,
  onArmorClass,
  requiresArmorClass = false,
  slotRemaining,
  spellName,
}: MechanicsCastModalProps) {
  const { t } = useTranslation();
  const [faces, setFaces] = useState<Readonly<Record<string, number>>>({});
  const [armorClassDraft, setArmorClassDraft] = useState("");
  const phase = cast.phase;

  const dice = useMemo(
    () =>
      phase.kind === "collecting" && phase.requirement.kind === "dice"
        ? requirementDice(phase.requirement)
        : [],
    [phase]
  );

  const close = () => {
    cast.reset();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent title={`${t("mechanics.cast.title")} — ${spellName}`}>
        <DialogBody>
          {requiresArmorClass && (
            <div>
              <p>{t("mechanics.cast.armorClassPrompt")}</p>
              <label>
                {t("stats.ac")}
                <input
                  inputMode="numeric"
                  min={1}
                  onChange={(event) => setArmorClassDraft(event.target.value)}
                  type="number"
                  value={armorClassDraft}
                />
              </label>
              <Button
                disabled={
                  !Number.isSafeInteger(Number(armorClassDraft)) ||
                  Number(armorClassDraft) < 1
                }
                onClick={() => onArmorClass?.(Number(armorClassDraft))}
              >
                {t("combat.apply")}
              </Button>
            </div>
          )}
          {phase.kind === "unavailable" && !requiresArmorClass && (
            <p>{t("mechanics.cast.unavailable")}</p>
          )}
          {phase.kind === "rejected" && !requiresArmorClass && (
            <p role="alert">{t("mechanics.cast.rejected", { reason: phase.reason })}</p>
          )}
          {phase.kind === "collecting" && phase.requirement.kind === "resource" && (
            <div>
              <p>{t("mechanics.cast.slotPrompt")}</p>
              <div role="group">
                {Object.entries(slotRemaining)
                  .map(([level, remaining]) => [Number(level), remaining] as const)
                  .filter(([, remaining]) => remaining > 0)
                  .sort(([a], [b]) => a - b)
                  .map(([level, remaining]) => (
                    <Button
                      key={level}
                      onClick={() =>
                        cast.answer({
                          inputId: phase.requirement.inputId,
                          kind: "resource",
                          resource: {
                            character: material,
                            kind: "standard-spell-slot",
                            level,
                          },
                        })
                      }
                    >
                      {t("mechanics.cast.slotOption", { level, remaining })}
                    </Button>
                  ))}
              </div>
            </div>
          )}
          {phase.kind === "collecting" && phase.requirement.kind === "entities" && (
            <div>
              <p>{t("mechanics.cast.targetsPrompt")}</p>
              <Button
                onClick={() =>
                  cast.answer({
                    inputId: phase.requirement.inputId,
                    kind: "entities",
                    targets: [{ entityId: "self", material }],
                  })
                }
              >
                {t("mechanics.cast.targetSelf")}
              </Button>
            </div>
          )}
          {phase.kind === "collecting" && phase.requirement.kind === "dice" && (
            <div>
              <p>
                {t("mechanics.cast.dicePrompt", {
                  dice: dice.map(({ sides }) => `d${sides}`).join(" + "),
                })}
              </p>
              {dice.map((die, index) => (
                <label key={die.trailId}>
                  {t("mechanics.cast.dieFace", { index: index + 1 })}
                  <input
                    inputMode="numeric"
                    max={die.sides}
                    min={1}
                    onChange={(event) => {
                      const face = Number(event.target.value);
                      setFaces((current) => ({ ...current, [die.trailId]: face }));
                    }}
                    type="number"
                    value={faces[die.trailId] ?? ""}
                  />
                </label>
              ))}
              <Button
                disabled={dice.some(
                  (die) =>
                    !Number.isSafeInteger(faces[die.trailId]) ||
                    (faces[die.trailId] ?? 0) < 1 ||
                    (faces[die.trailId] ?? 0) > die.sides
                )}
                onClick={() => {
                  if (phase.requirement.kind !== "dice") return;
                  cast.answer({
                    inputId: phase.requirement.inputId,
                    kind: "dice",
                    requests: phase.requirement.requests.map(({ identity }) => ({
                      identity,
                      observation: {
                        aggregates: [],
                        trails: dice.map((die) => ({
                          initialFace: faces[die.trailId] ?? 1,
                          steps: [],
                          trailId: die.trailId,
                        })),
                      },
                      payments: [],
                    })),
                  });
                  setFaces({});
                }}
              >
                {t("combat.apply")}
              </Button>
            </div>
          )}
          {phase.kind === "collecting" && phase.requirement.kind === "d20" && (
            <div>
              <p>{t("mechanics.cast.d20Prompt")}</p>
              {phase.requirement.requests.map((request, index) => {
                const trailId =
                  request.review.d20Requirement?.trails[0]?.trailId ?? `d20-${index}`;
                const target = request.review.targetNumber;
                return (
                  <label key={trailId}>
                    {t(
                      target?.kind === "armor-class"
                        ? "mechanics.cast.attackVs"
                        : "mechanics.cast.saveVs",
                      {
                        index: index + 1,
                        modifier: request.review.deterministicModifier,
                        value: target?.value ?? 0,
                      }
                    )}
                    <input
                      inputMode="numeric"
                      max={20}
                      min={1}
                      onChange={(event) => {
                        const face = Number(event.target.value);
                        setFaces((current) => ({ ...current, [trailId]: face }));
                      }}
                      type="number"
                      value={faces[trailId] ?? ""}
                    />
                  </label>
                );
              })}
              <Button
                disabled={phase.requirement.requests.some((request, index) => {
                  const trailId =
                    request.review.d20Requirement?.trails[0]?.trailId ?? `d20-${index}`;
                  const face = faces[trailId];
                  return (
                    !Number.isSafeInteger(face) || (face ?? 0) < 1 || (face ?? 0) > 20
                  );
                })}
                onClick={() => {
                  if (phase.requirement.kind !== "d20") return;
                  cast.answer({
                    inputId: phase.requirement.inputId,
                    kind: "d20",
                    requests: phase.requirement.requests.map((request, index) => {
                      const trailId =
                        request.review.d20Requirement?.trails[0]?.trailId ??
                        `d20-${index}`;
                      return {
                        identity: request.identity,
                        observation: {
                          d20: {
                            aggregates: [],
                            trails: (request.review.d20Requirement?.trails ?? []).map(
                              (trail) => ({
                                initialFace: faces[trailId] ?? 1,
                                steps: [],
                                trailId: trail.trailId,
                              })
                            ),
                          },
                          enteredModifiers: [],
                          tableOverride: null,
                        },
                        payments: [],
                      };
                    }),
                  });
                  setFaces({});
                }}
              >
                {t("combat.apply")}
              </Button>
            </div>
          )}
          {phase.kind === "ready" && <p>{t("mechanics.cast.ready")}</p>}
        </DialogBody>
        <DialogFooter>
          <Button onClick={close} variant="ghost">
            {t("common.cancel")}
          </Button>
          {phase.kind === "ready" && (
            <Button
              onClick={() => {
                if (cast.commit()) onClose();
              }}
            >
              {t("combat.apply")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
