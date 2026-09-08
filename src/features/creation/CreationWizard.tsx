import { useEffect, useRef } from "react";
import type { LibraryVersion } from "@/lib/library/model";
import { SRD_ORIGIN_LANGUAGES } from "@/data/languages";
import {
  CREATION_STEPS,
  answerCreationChoice,
  type CreationDraft,
  type CreationStep,
} from "@/lib/character-creation/model";
import type { CreationPreview } from "@/lib/character-creation/compose";
import {
  activeSelection,
  isGearChoice,
  useWizardLabels,
  wizardRoles,
} from "./wizard-presenters";
import { WizardSources } from "./WizardSources";
import { WizardChoice, WizardIssues, WizardRetained } from "./WizardChoices";
import { WizardAbilities } from "./WizardAbilities";
import { WizardExceptions, WizardReview } from "./WizardReview";
import "./creation-wizard.css";

export interface CreationWizardProps {
  draft: CreationDraft;
  preview: CreationPreview;
  step: CreationStep;
  librarySources: LibraryVersion[];
  disabled: boolean;
  retained: boolean;
  onChange: (next: CreationDraft) => void;
  onStep: (step: CreationStep) => void;
  onConfirm: () => void;
  onLibrary: () => void;
  onExit: () => void;
}
const ALIGNMENTS = [
  "lawful-good",
  "neutral-good",
  "chaotic-good",
  "lawful-neutral",
  "neutral",
  "chaotic-neutral",
  "lawful-evil",
  "neutral-evil",
  "chaotic-evil",
  "unaligned",
];
/** One controlled draft and route; persistence, authorization and commit belong to the controller. */
export function CreationWizard(p: CreationWizardProps) {
  const l = useWizardLabels();
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(p.step);
  useEffect(() => {
    if (previousStep.current !== p.step) heading.current?.focus();
    previousStep.current = p.step;
  }, [p.step]);
  const edit = {
    draft: p.draft,
    preview: p.preview,
    disabled: p.disabled,
    onChange: (next: CreationDraft) => {
      if (!p.disabled) p.onChange({ ...next, step: p.step });
    },
  };
  const position = CREATION_STEPS.indexOf(p.step);
  const choices = p.preview.composition.activeChoices.filter((c) => {
    const gear = isGearChoice(c, p.preview.composition.activeChoices);
    return p.step === "equipment"
      ? gear
      : !gear &&
          (p.step === "class"
            ? c.selectionId === "class"
            : p.step === "origins" && c.selectionId !== "class");
  });
  const sourceRoles =
    p.step === "origins"
      ? (["species", "background"] as const)
      : p.step === "class"
        ? (["class"] as const)
        : [];
  const background = activeSelection(p.draft, "background");
  const bgData = background?.snapshot.definition.payload.data;
  const legacyGear = background && bgData?.equipmentChoice === undefined;
  const selectedSources = wizardRoles
    .map((role) => activeSelection(p.draft, role)?.snapshot)
    .filter((source) => !!source);
  return (
    <section className="creation-wizard" aria-label={l.w("title")} aria-busy={p.disabled}>
      <header className="wizard-heading">
        <h1>{l.w("title")}</h1>
        <p>{l.w("intro")}</p>
      </header>
      <nav className="wizard-steps" aria-label={l.w("title")}>
        {CREATION_STEPS.map((step) => (
          <button
            type="button"
            key={step}
            disabled={p.disabled}
            aria-current={step === p.step ? "step" : undefined}
            onClick={() => p.onStep(step)}
          >
            {l.w(step)}
          </button>
        ))}
      </nav>
      <div className="wizard-layout">
        <div className="wizard-panel">
          <h2 ref={heading} tabIndex={-1}>
            {l.w(p.step)}
          </h2>
          <fieldset className="wizard-form" disabled={p.disabled}>
            {p.step === "identity" && (
              <>
                <label className="wizard-field">
                  {l.w("name")}
                  <input
                    autoComplete="off"
                    maxLength={200}
                    value={p.draft.name}
                    onChange={(e) => edit.onChange({ ...p.draft, name: e.target.value })}
                  />
                </label>
                <label className="wizard-field">
                  {l.w("alignment")}
                  <select
                    value={p.draft.alignment}
                    onChange={(e) =>
                      edit.onChange({ ...p.draft, alignment: e.target.value })
                    }
                  >
                    {ALIGNMENTS.map((id) => (
                      <option key={id} value={id}>
                        {l.t("srd.alignment_" + id)}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="wizard-choice">
                  <legend>{l.w("languages")}</legend>
                  <p>{l.w("languageHint")}</p>
                  <div className="wizard-option-list">
                    {SRD_ORIGIN_LANGUAGES.choice.options.map((id) => (
                      <label key={id} className="wizard-check">
                        <input
                          type="checkbox"
                          checked={p.draft.languages.includes(id)}
                          disabled={
                            !p.draft.languages.includes(id) &&
                            p.draft.languages.length >= 2
                          }
                          onChange={(e) =>
                            edit.onChange({
                              ...p.draft,
                              languages: e.target.checked
                                ? [...p.draft.languages, id]
                                : p.draft.languages.filter((v) => v !== id),
                            })
                          }
                        />
                        <span>{l.srd("language", id)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <WizardIssues
                  {...edit}
                  issues={p.preview.issues.filter((d) =>
                    ["name", "languages"].includes(d.path)
                  )}
                />
              </>
            )}
            {sourceRoles.map((role) => (
              <WizardSources
                {...edit}
                key={role}
                role={role}
                librarySources={p.librarySources}
              />
            ))}
            {choices.map((c) => (
              <WizardChoice
                {...edit}
                key={
                  (p.draft.sources[c.selectionId as keyof CreationDraft["sources"]] ??
                    "") + c.path
                }
                c={c}
              />
            ))}
            {p.step === "abilities" && (
              <>
                <WizardAbilities {...edit} />
                <WizardExceptions {...edit} />
              </>
            )}
            {p.step === "equipment" && legacyGear && (
              <fieldset className="wizard-choice">
                <legend>{l.w("equipment")}</legend>
                {["bundle", "gold"].map((value) => (
                  <label key={value} className="wizard-check">
                    <input
                      type="radio"
                      name="wizard-background-gear"
                      checked={
                        background.answers["root/background-equipment"]?.[0] === value
                      }
                      onChange={() =>
                        edit.onChange(
                          answerCreationChoice(
                            p.draft,
                            "background",
                            "root/background-equipment",
                            [value]
                          )
                        )
                      }
                    />
                    <span>
                      {value === "gold"
                        ? l.w("goldAlternative", {
                            amount: l.w("gp", {
                              amount: Number(bgData?.equipmentGold ?? 0),
                            }),
                          })
                        : l.w("bundle")}
                    </span>
                  </label>
                ))}
                <ul>
                  {(Array.isArray(bgData?.equipment) ? bgData.equipment : [])
                    .filter((key): key is string => typeof key === "string")
                    .map((key) => (
                      <li key={key}>{l.dependency(background.snapshot, key)}</li>
                    ))}
                </ul>
              </fieldset>
            )}
            {["class", "origins", "equipment"].includes(p.step) && (
              <>
                <WizardIssues
                  {...edit}
                  issues={p.preview.issues.filter(
                    (d) =>
                      d.code !== "background-distribution" &&
                      (choices.some(
                        (c) => c.path === d.path && c.selectionId === d.selectionId
                      ) ||
                        sourceRoles.some(
                          (role) =>
                            d.selectionId === role &&
                            !p.preview.composition.activeChoices.some(
                              (c) => c.path === d.path && c.selectionId === role
                            )
                        ) ||
                        sourceRoles.includes(d.path as never))
                  )}
                />
                <WizardRetained {...edit} />
              </>
            )}
            {p.step === "review" && <WizardReview {...edit} />}
          </fieldset>
          {p.step === "review" && !p.preview.valid && (
            <p className="wizard-warning" role="status">
              {l.w("blocked")}
            </p>
          )}
          <footer className="wizard-actions">
            {position > 0 && (
              <button
                type="button"
                disabled={p.disabled}
                onClick={() => p.onStep(CREATION_STEPS[position - 1] ?? "identity")}
              >
                {l.w("back")}
              </button>
            )}
            {p.step === "review" ? (
              <button
                type="button"
                className="identity-primary"
                disabled={p.disabled || !p.preview.valid}
                onClick={p.onConfirm}
              >
                {l.w("confirm")}
              </button>
            ) : (
              <button
                type="button"
                className="identity-primary"
                disabled={p.disabled}
                onClick={() => p.onStep(CREATION_STEPS[position + 1] ?? "review")}
              >
                {l.w("continue")}
              </button>
            )}
          </footer>
        </div>
        <aside className="wizard-panel wizard-aside">
          <h2>{l.w("story")}</h2>
          <p className="wizard-character-name">{p.draft.name || l.w("unnamed")}</p>
          <p>
            {selectedSources.map((source) => l.snapshot(source)).join(" · ") ||
              l.w("choose")}
          </p>
          <p role="status">{l.w(p.retained ? "saved" : "unsaved")}</p>
          {p.preview.maxHp > 0 && (
            <dl className="wizard-summary">
              <div>
                <dt>{l.w("hp")}</dt>
                <dd>{p.preview.maxHp}</dd>
              </div>
              <div>
                <dt>{l.w("gold")}</dt>
                <dd>{l.w("gp", { amount: p.preview.gold })}</dd>
              </div>
            </dl>
          )}
          <div className="wizard-aside-actions">
            <button type="button" disabled={p.disabled} onClick={p.onLibrary}>
              {l.w("library")}
            </button>
            <button type="button" disabled={p.disabled} onClick={p.onExit}>
              {l.w("exit")}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
