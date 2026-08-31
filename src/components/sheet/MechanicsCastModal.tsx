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
import { CastSlotOptionRow } from "@/components/sheet/CastSlotOptionRow";
import { useLocale } from "@/hooks/useLocale";
import { conditionLabel } from "@/lib/views/tracker-view";
import type { MechanicsCastState } from "@/features/character/useMechanicsCast";
import type {
  MechanicsDiceRequirement,
  MechanicsRequirement,
} from "@/types/mechanics-program";
import type { CharacterMaterialRef } from "@/types/mechanics-reference";
import type { CastSlotScalingFacts } from "@/lib/views/cast-slot-preview";

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
  /** Which title the dialog carries; the protocol below is identical. */
  readonly flavor?: "action" | "attack" | "cast";
  readonly material: CharacterMaterialRef;
  readonly onClose: () => void;
  /**
   * Attack programs review against the target's armor class; when the caller
   * does not know it yet, the modal asks the table for it first.
   */
  readonly onArmorClass?: (value: number) => void;
  /**
   * The LIVE remaining of the pool the chosen amount debits (Lay on Hands).
   * The transcribed integer requirement carries only the domain cap (1000);
   * the kernel enforces affordability at review, but the PROMPT must show the
   * payable bound — a level-1 Paladin with 5 pool points reads "(0 to 5)".
   */
  readonly poolRemaining?: number;
  /**
   * How the entity step reads: "self" offers the caster ("Yourself");
   * "table" labels the same physical answer as the creature chosen at the
   * table — an enemy-affinity mark (Hex's curse) binds a creature the solo
   * world does not model, so the caster's own entity is the abstract
   * stand-in and the label must say so.
   */
  readonly targetFlavor?: "self" | "table";
  readonly requiresArmorClass?: boolean;
  /** Complete live slot pools; totals are required to render honest sockets. */
  readonly slots: ReadonlyArray<{
    readonly level: number;
    readonly pactMagic: boolean;
    readonly remaining: number;
    readonly total: number;
  }>;
  /**
   * The inventory instance an item-sourced program pays from (a conjured
   * consumable's own quantity) — the answer for a `source-item` payment. The
   * requirement's selector names no instance, so the flow that closed the
   * capability supplies it.
   */
  readonly sourceItem?: Readonly<{ instanceId: string; instanceOrdinal: number }>;
  readonly spellName: string;
  /** Structured spell facts used only for the per-level outcome preview. */
  readonly upcast?: CastSlotScalingFacts;
}

export function MechanicsCastModal({
  cast,
  flavor = "cast",
  material,
  onClose,
  onArmorClass,
  poolRemaining,
  requiresArmorClass = false,
  slots,
  sourceItem,
  spellName,
  targetFlavor = "self",
  upcast,
}: MechanicsCastModalProps) {
  const { t, i18n } = useTranslation();
  const { language: locale } = useLocale();
  const [faces, setFaces] = useState<Readonly<Record<string, number>>>({});
  const [amountDraft, setAmountDraft] = useState("");
  /** Per-request drafts of an entity-expanded integer input (one per target). */
  const [portionDrafts, setPortionDrafts] = useState<Readonly<Record<number, string>>>(
    {}
  );
  const [armorClassDraft, setArmorClassDraft] = useState("");
  const phase = cast.phase;
  const title =
    flavor === "attack"
      ? t("mechanics.cast.attackTitle")
      : flavor === "action"
        ? t("combat.resolveRubric")
        : t("mechanics.cast.title");
  /** Localized label for a choice option id (mode, grip, or a damage type). */
  const optionLabel = (id: string): string => {
    const known: Readonly<Record<string, string>> = {
      damage: t("mechanics.cast.optionDamage"),
      heal: t("combat.heal"),
      "one-handed": t("mechanics.cast.optionOneHanded"),
      "two-handed": t("mechanics.cast.optionTwoHanded"),
    };
    if (known[id] !== undefined) return known[id];
    return i18n.exists(`srd.damage_${id}`) ? t(`srd.damage_${id}`) : id;
  };
  /** The question an opt-in boolean input asks (a pool-priced cure, Topple). */
  const booleanPrompt = (inputId: string): string => {
    const cure = /^cure-(.+)-opt$/.exec(inputId);
    if (cure?.[1] !== undefined) {
      return t("mechanics.cast.booleanCure", {
        condition: conditionLabel(cure[1], locale),
      });
    }
    if (inputId === "use-topple") return t("mechanics.cast.booleanTopple");
    return t("mechanics.cast.booleanPrompt");
  };

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
      <DialogContent title={`${title} · ${spellName}`}>
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
          {phase.kind === "collecting" &&
            phase.requirement.kind === "resource" &&
            phase.requirement.term.selector.kind === "spell-slot" &&
            (() => {
              // The selector is the kernel's own truth for which pools and
              // levels may pay: standard levels at or above the floor, and
              // the pact pool when its (single) level clears the same floor.
              const selector = phase.requirement.term.selector;
              const inputId = phase.requirement.inputId;
              const admitsLevel = (level: number) =>
                selector.level.kind === "minimum"
                  ? level >= selector.level.value
                  : level === selector.level.value;
              const payableSlots = slots
                .filter(
                  (slot) =>
                    slot.remaining > 0 &&
                    admitsLevel(slot.level) &&
                    (slot.pactMagic
                      ? selector.pool !== "standard"
                      : selector.pool !== "pact")
                )
                .sort(
                  (a, b) => a.level - b.level || Number(a.pactMagic) - Number(b.pactMagic)
                );
              return (
                <div>
                  <p>{t("mechanics.cast.slotPrompt")}</p>
                  <div
                    className="cl-opts"
                    role="group"
                    aria-label={t("mechanics.cast.slotPrompt")}
                  >
                    {payableSlots.map((slot) => (
                      <CastSlotOptionRow
                        key={`${slot.level}-${slot.pactMagic ? "pact" : "standard"}`}
                        baseLevel={selector.level.value}
                        level={slot.level}
                        onSelect={() =>
                          cast.answer({
                            inputId,
                            kind: "resource",
                            resource: slot.pactMagic
                              ? { character: material, kind: "pact-spell-slot" }
                              : {
                                  character: material,
                                  kind: "standard-spell-slot",
                                  level: slot.level,
                                },
                          })
                        }
                        pactMagic={slot.pactMagic}
                        remaining={slot.remaining}
                        total={slot.total}
                        {...(upcast ? { upcast } : {})}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
          {phase.kind === "collecting" &&
            phase.requirement.kind === "resource" &&
            phase.requirement.term.selector.kind === "pool" && (
              <div>
                <p>
                  {t("mechanics.cast.poolPayPrompt", {
                    amount: phase.requirement.amount,
                  })}
                </p>
                <Button
                  onClick={() => {
                    if (
                      phase.requirement.kind !== "resource" ||
                      phase.requirement.term.selector.kind !== "pool"
                    ) {
                      return;
                    }
                    cast.answer({
                      inputId: phase.requirement.inputId,
                      kind: "resource",
                      resource: {
                        kind: "pool",
                        owner: { entityId: "self", material },
                        resourceId: phase.requirement.term.selector.resourceId,
                      },
                    });
                  }}
                >
                  {t("mechanics.cast.poolPayConfirm", {
                    amount: phase.requirement.amount,
                  })}
                </Button>
              </div>
            )}
          {phase.kind === "collecting" &&
            phase.requirement.kind === "resource" &&
            phase.requirement.term.selector.kind === "item-quantity" &&
            sourceItem !== undefined && (
              <div>
                <p>
                  {t("mechanics.cast.itemPayPrompt", {
                    amount: phase.requirement.amount,
                  })}
                </p>
                <Button
                  onClick={() =>
                    cast.answer({
                      inputId: phase.requirement.inputId,
                      kind: "resource",
                      resource: {
                        character: material,
                        instanceId: sourceItem.instanceId,
                        instanceOrdinal: sourceItem.instanceOrdinal,
                        kind: "item-quantity",
                      },
                    })
                  }
                >
                  {t("mechanics.cast.itemPayConfirm", {
                    amount: phase.requirement.amount,
                  })}
                </Button>
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
                {t(
                  targetFlavor === "table"
                    ? "mechanics.cast.targetAbstract"
                    : "mechanics.cast.targetSelf"
                )}
              </Button>
              {phase.requirement.minimum === 0 && (
                <Button
                  onClick={() =>
                    cast.answer({
                      inputId: phase.requirement.inputId,
                      kind: "entities",
                      targets: [],
                    })
                  }
                  variant="ghost"
                >
                  {t("mechanics.cast.targetNone")}
                </Button>
              )}
            </div>
          )}
          {phase.kind === "collecting" &&
            phase.requirement.kind === "integer" &&
            phase.requirement.requests === undefined &&
            (() => {
              // The requirement's maximum is the transcription's DOMAIN cap
              // (1000 — above every legal pool); the real upper bound is the
              // live payable pool, so the prompt never invites an amount the
              // resource review would reject.
              const maximum = Math.min(
                phase.requirement.maximum,
                poolRemaining ?? phase.requirement.maximum
              );
              const requirement = phase.requirement;
              return (
                <div>
                  <p>
                    {t("mechanics.cast.amountPrompt", {
                      maximum,
                      minimum: requirement.minimum,
                    })}
                  </p>
                  <label>
                    {t("mechanics.cast.amountLabel")}
                    <input
                      inputMode="numeric"
                      max={maximum}
                      min={requirement.minimum}
                      onChange={(event) => setAmountDraft(event.target.value)}
                      type="number"
                      value={amountDraft}
                    />
                  </label>
                  <Button
                    disabled={
                      !Number.isSafeInteger(Number(amountDraft)) ||
                      Number(amountDraft) < requirement.minimum ||
                      Number(amountDraft) > maximum
                    }
                    onClick={() => {
                      cast.answer({
                        inputId: requirement.inputId,
                        kind: "integer",
                        value: Number(amountDraft),
                      });
                      setAmountDraft("");
                    }}
                  >
                    {t("combat.apply")}
                  </Button>
                </div>
              );
            })()}
          {phase.kind === "collecting" &&
            phase.requirement.kind === "integer" &&
            phase.requirement.requests !== undefined &&
            (() => {
              // The entity-expanded form (Mass Heal's pool split): one amount
              // per selected target slot, each within [minimum, maximum], the
              // SUM capped by the review-enforced total. The remaining count
              // updates live so the player can divide the pool at a glance.
              const requirement = phase.requirement;
              const requests = requirement.requests ?? [];
              const totalMaximum = requirement.totalMaximum ?? null;
              const values = requests.map((_, index) =>
                Number(portionDrafts[index] ?? "")
              );
              const eachValid = values.every(
                (value) =>
                  Number.isSafeInteger(value) &&
                  value >= requirement.minimum &&
                  value <= requirement.maximum
              );
              const sum = values.reduce(
                (acc, value) => acc + (Number.isSafeInteger(value) ? value : 0),
                0
              );
              const overTotal = totalMaximum !== null && sum > totalMaximum;
              return (
                <div>
                  <p>
                    {t("mechanics.cast.portionPrompt", {
                      maximum: requirement.maximum,
                      minimum: requirement.minimum,
                    })}
                  </p>
                  {requests.map((request, index) => (
                    <label key={request.identity.ordinal}>
                      {t("mechanics.cast.portionLabel", { index: index + 1 })}
                      <input
                        inputMode="numeric"
                        max={requirement.maximum}
                        min={requirement.minimum}
                        onChange={(event) => {
                          const next = event.target.value;
                          setPortionDrafts((current) => ({
                            ...current,
                            [index]: next,
                          }));
                        }}
                        type="number"
                        value={portionDrafts[index] ?? ""}
                      />
                    </label>
                  ))}
                  {totalMaximum !== null && (
                    <p role="status">
                      {t("mechanics.cast.portionRemaining", {
                        remaining: Math.max(0, totalMaximum - sum),
                        total: totalMaximum,
                      })}
                    </p>
                  )}
                  <Button
                    disabled={!eachValid || overTotal}
                    onClick={() => {
                      if (phase.requirement.kind !== "integer") return;
                      cast.answer({
                        inputId: requirement.inputId,
                        kind: "integer",
                        requests: requests.map(({ identity }, index) => ({
                          identity,
                          value: values[index] ?? 0,
                        })),
                      });
                      setPortionDrafts({});
                    }}
                  >
                    {t("combat.apply")}
                  </Button>
                </div>
              );
            })()}
          {phase.kind === "collecting" && phase.requirement.kind === "choice" && (
            <div>
              <p>{t("mechanics.cast.choicePrompt")}</p>
              <div role="group">
                {phase.requirement.options.map((optionId) => (
                  <Button
                    key={optionId}
                    onClick={() =>
                      cast.answer({
                        choiceId: optionId,
                        inputId: phase.requirement.inputId,
                        kind: "choice",
                      })
                    }
                  >
                    {optionLabel(optionId)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {phase.kind === "collecting" && phase.requirement.kind === "boolean" && (
            <div>
              <p>{booleanPrompt(phase.requirement.inputId)}</p>
              <div role="group">
                <Button
                  onClick={() =>
                    cast.answer({
                      inputId: phase.requirement.inputId,
                      kind: "boolean",
                      value: true,
                    })
                  }
                >
                  {t("common.yes")}
                </Button>
                <Button
                  onClick={() =>
                    cast.answer({
                      inputId: phase.requirement.inputId,
                      kind: "boolean",
                      value: false,
                    })
                  }
                  variant="ghost"
                >
                  {t("common.no")}
                </Button>
              </div>
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
