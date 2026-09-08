import { CheckboxField } from "@/components/ui/selection";
import { useState } from "react";
import {
  composeOriginBuild,
  type OriginBuild,
  type OriginSelection,
  type OriginDiagnostic,
} from "@/lib/homebrew/origin-build";
import { originNodePath } from "@/lib/homebrew/origins";
import type { FolioCharacter } from "@/lib/identity/model";
import { originBenefitText, originRequirementText } from "./origin-text";
import { useHomebrewLabel } from "./homebrew-labels";

const EXCEPTIONS = [
  "prerequisite-level",
  "prerequisite-ability",
  "prerequisite-proficiency",
  "prerequisite-feat",
  "prerequisite-spellcasting",
  "prerequisite-any",
  "nonrepeatable-feat",
  "ability-maximum",
];
const number = (value: unknown) => (typeof value === "number" ? value : 0);
/** All controls target stable answer paths; inactive values remain in the draft. */
export function OriginChoices({
  character,
  build,
  selection,
  disabled,
  onChange,
}: {
  character: FolioCharacter;
  build: OriginBuild;
  selection: OriginSelection;
  disabled: boolean;
  onChange: (value: OriginSelection) => void;
}) {
  const label = useHomebrewLabel();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const composition = composeOriginBuild(character, build);
  const diagnostics = composition.diagnostics.filter(
    (d) => d.selectionId === selection.id
  );
  const answer = (path: string, values: string[]) =>
    onChange({ ...selection, answers: { ...selection.answers, [path]: values } });
  const data = selection.snapshot.definition.payload.data;
  const choiceName = (path: string) =>
    composition.activeChoices.find(
      (c) => c.selectionId === selection.id && c.path === path
    )?.choice.name;
  function issue(d: OriginDiagnostic) {
    const key = d.path + ":" + d.code;
    const retained = ["inactive-answer", "obsolete-answer"].includes(d.code);
    return (
      <div className="origin-issue" key={key}>
        <p>
          <strong>{label("origin.diagnostics." + d.code)}</strong>
          {choiceName(d.path) ? " · " + (choiceName(d.path) ?? "") : ""}
        </p>
        {retained && (
          <>
            <p>
              <code>{choiceName(d.path) ?? d.path}</code>
              {": "}
              <code>{JSON.stringify(selection.answers[d.path] ?? [])}</code>
            </p>
            <p>{label("origin.retainedHelp")}</p>
            <button
              type="button"
              aria-label={
                label("origin.discardAnswer") + ": " + (choiceName(d.path) ?? d.path)
              }
              disabled={disabled}
              onClick={() => {
                const answers = Object.fromEntries(
                  Object.entries(selection.answers).filter(([path]) => path !== d.path)
                );
                onChange({ ...selection, answers });
              }}
            >
              {label("origin.discardAnswer")}
            </button>
          </>
        )}
        {EXCEPTIONS.includes(d.code) && (
          <details>
            <summary>{label("origin.useException")}</summary>
            <p>{label("origin.exceptionHelp")}</p>
            <label>
              {label("origin.exceptionReason")}
              <textarea
                disabled={disabled}
                maxLength={2000}
                value={reasons[key] ?? ""}
                onChange={(e) => setReasons({ ...reasons, [key]: e.target.value })}
              />
            </label>
            <button
              type="button"
              disabled={disabled || !reasons[key]?.trim()}
              onClick={() =>
                onChange({
                  ...selection,
                  exceptions: [
                    ...selection.exceptions.filter(
                      (e) => e.path !== d.path || e.code !== d.code
                    ),
                    {
                      path: d.path,
                      code: d.code,
                      reason: (reasons[key] ?? "").trim(),
                      authorUid: character.ownerUid,
                    },
                  ],
                })
              }
            >
              {label("origin.recordException")}
            </button>
          </details>
        )}
      </div>
    );
  }
  const bgPath = "root/background-abilities",
    bgAnswers = selection.answers[bgPath] ?? [];
  const offered = [data.ability1, data.ability2, data.ability3].filter(
    (v): v is string => typeof v === "string"
  );
  const distribution = bgAnswers.length === 3 ? "three" : "two";
  const primary =
    bgAnswers.find((a) => a.endsWith(":2"))?.split(":")[0] ?? offered[0] ?? "";
  const secondary =
    bgAnswers.find((a) => a.endsWith(":1"))?.split(":")[0] ??
    offered.find((a) => a !== primary) ??
    "";
  return (
    <div className="origin-build-choices">
      <section>
        <h4>{label("origin.requirementsTitle")}</h4>
        {Array.isArray(data.prerequisites) && data.prerequisites.length ? (
          <ul>
            {data.prerequisites.map((p, i) => (
              <li key={i}>
                {originRequirementText(p, label, selection.snapshot.definition)}
              </li>
            ))}
          </ul>
        ) : (
          <p>{label("origin.noRequirements")}</p>
        )}
      </section>
      {selection.snapshot.definition.family === "background" && (
        <fieldset disabled={disabled} className="homebrew-group">
          <legend>{label("origin.backgroundAbilities")}</legend>
          <p>{label("origin.backgroundChoiceHelp")}</p>
          <div className="homebrew-grid">
            <label>
              {label("origin.distribution")}
              <select
                value={distribution}
                onChange={(e) =>
                  answer(
                    bgPath,
                    e.target.value === "three"
                      ? offered.map((a) => a + ":1")
                      : [primary + ":2", secondary + ":1"]
                  )
                }
              >
                <option value="two">{label("origin.twoIncreases")}</option>
                <option value="three">{label("origin.threeIncreases")}</option>
              </select>
            </label>
            {distribution === "two" && (
              <>
                <label>
                  {label("origin.plusTwo")}
                  <select
                    value={primary}
                    onChange={(e) =>
                      answer(bgPath, [
                        e.target.value + ":2",
                        (secondary === e.target.value
                          ? (offered.find((a) => a !== e.target.value) ?? "")
                          : secondary) + ":1",
                      ])
                    }
                  >
                    {offered.map((a) => (
                      <option value={a} key={a}>
                        {label("options." + a)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {label("origin.plusOne")}
                  <select
                    value={secondary}
                    onChange={(e) =>
                      answer(bgPath, [primary + ":2", e.target.value + ":1"])
                    }
                  >
                    {offered
                      .filter((a) => a !== primary)
                      .map((a) => (
                        <option value={a} key={a}>
                          {label("options." + a)}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
          </div>
          {!bgAnswers.length && (
            <button
              type="button"
              onClick={() => answer(bgPath, [primary + ":2", secondary + ":1"])}
            >
              {label("origin.confirmDistribution")}
            </button>
          )}
          <label>
            {label("origin.startingEntitlement")}
            <select
              value={selection.answers["root/background-equipment"]?.[0] ?? ""}
              onChange={(e) =>
                answer(
                  "root/background-equipment",
                  e.target.value ? [e.target.value] : []
                )
              }
            >
              <option value="">{label("origin.choose")}</option>
              <option value="bundle">{label("origin.equipmentBundle")}</option>
              <option value="gold">
                {label("fields.equipmentGold")}: {number(data.equipmentGold)}
              </option>
            </select>
          </label>
          <p className="homebrew-hint">{label("origin.equipmentChoiceHelp")}</p>
        </fieldset>
      )}
      {composition.activeChoices
        .filter((c) => c.selectionId === selection.id)
        .map((c) => {
          const parent = c.choice.parent;
          const parentPath = parent
            ? originNodePath(c.path.slice(0, c.path.lastIndexOf("/")), parent.choiceId)
            : null;
          const parentChoice = composition.activeChoices.find(
            (candidate) =>
              candidate.selectionId === c.selectionId && candidate.path === parentPath
          )?.choice;
          const parentOption = parentChoice?.options.find(
            (option) => option.id === parent?.optionId
          );
          return (
            <fieldset
              disabled={disabled || !c.active}
              className="homebrew-group origin-answer"
              key={c.path}
            >
              <legend>{c.choice.name}</legend>
              <p>
                {label("origin.chooseCount")}: {c.choice.count}
                {!c.active ? " · " + label("origin.choiceInactive") : ""}
              </p>
              {parent && (
                <p className="homebrew-hint">
                  {label("origin.availableAfter")}:{" "}
                  {parentChoice?.name ?? label("origin.unnamedChoice")} →{" "}
                  {parentOption?.name ?? label("origin.unnamedOption")}
                </p>
              )}
              {c.choice.options.map((option) => (
                <CheckboxField
                  key={option.id}
                  className="origin-answer-option"
                  disabled={disabled}
                  checked={c.selected.includes(option.id)}
                  onCheckedChange={(checked) =>
                    answer(
                      c.path,
                      checked
                        ? c.choice.count === 1
                          ? [option.id]
                          : [...c.selected, option.id]
                        : c.selected.filter((id) => id !== option.id)
                    )
                  }
                  label={<strong>{option.name}</strong>}
                  hint={option.benefits
                    .map((b) =>
                      originBenefitText(b, label, selection.snapshot.definition)
                    )
                    .join(" · ")}
                />
              ))}
            </fieldset>
          );
        })}
      {diagnostics.length > 0 && (
        <section
          className="homebrew-validation"
          aria-label={label("origin.decisionsToReview")}
        >
          {diagnostics.map(issue)}
        </section>
      )}
      {selection.exceptions.length > 0 && (
        <section>
          <h4>{label("origin.recordedExceptions")}</h4>
          {selection.exceptions.map((e, i) => (
            <div className="origin-exception" key={i}>
              {e.path.startsWith("inactive-history/") && (
                <p>{label("origin.historicalException")}</p>
              )}
              <p>
                <strong>{label("origin.diagnostics." + e.code)}</strong> · {e.reason}
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...selection,
                    exceptions: selection.exceptions.filter((_, n) => n !== i),
                  })
                }
              >
                {label("origin.removeException")}
              </button>
            </div>
          ))}
        </section>
      )}
      <section>
        <h4>{label("origin.resultingBenefits")}</h4>
        <ul>
          {composition.facts
            .filter((f) => f.selectionId === selection.id)
            .map((f, i) => (
              <li key={i}>
                {originBenefitText(f.benefit, label, selection.snapshot.definition)}
              </li>
            ))}
        </ul>
        {composition.entitlements
          .filter((e) => e.selectionId === selection.id)
          .map((e) => (
            <p key={e.path}>
              {label("origin.startingEntitlement")}:{" "}
              {e.choice === "gold"
                ? String(e.gold) + " " + label("origin.goldUnit")
                : label("origin.equipmentBundle")}
            </p>
          ))}
      </section>
    </div>
  );
}
/** Candidate preview changes a single root while retaining the acquired order of existing roots. */
