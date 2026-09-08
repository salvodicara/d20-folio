import { ABILITIES } from "@/lib/homebrew/model";
import {
  checkCreationAbilities,
  STANDARD_SCORES,
  type CreationMethod,
} from "@/lib/character-creation/abilities";
import { answerCreationChoice } from "@/lib/character-creation/model";
import { activeSelection, useWizardLabels } from "./wizard-presenters";
import { WizardIssues, type WizardEditProps } from "./WizardChoices";

export function WizardAbilities(p: WizardEditProps) {
  const l = useWizardLabels();
  const checked = checkCreationAbilities(
    p.draft.method,
    p.draft.scores,
    p.draft.exceptions,
    p.draft.ownerUid
  );
  const background = activeSelection(p.draft, "background");
  const data = background?.snapshot.definition.payload.data;
  const backgroundAbilities = [data?.ability1, data?.ability2, data?.ability3].filter(
    (v): v is (typeof ABILITIES)[number] =>
      typeof v === "string" && ABILITIES.includes(v as (typeof ABILITIES)[number])
  );
  const answer = background?.answers["root/background-abilities"] ?? [];
  const setIncrease = (ability: string, amount: string) =>
    p.onChange(
      answerCreationChoice(p.draft, "background", "root/background-abilities", [
        ...answer.filter((v) => !v.startsWith(ability + ":")),
        ...(amount === "0" ? [] : [ability + ":" + amount]),
      ])
    );
  return (
    <>
      <label className="wizard-field">
        {l.w("method")}
        <select
          value={p.draft.method}
          onChange={(e) =>
            p.onChange({ ...p.draft, method: e.target.value as CreationMethod })
          }
        >
          {(["standard", "points", "manual"] as const).map((method) => (
            <option key={method} value={method}>
              {l.w(method)}
            </option>
          ))}
        </select>
      </label>
      <p>
        {l.w(
          p.draft.method === "standard"
            ? "arrayHint"
            : p.draft.method === "points"
              ? "pointsHint"
              : "manualHint"
        )}
      </p>
      {checked.spent !== null && (
        <p role="status">
          {l.w("spent", { spent: checked.spent, remaining: checked.remaining ?? 0 })}
        </p>
      )}
      <div className="wizard-score-grid">
        {ABILITIES.map((ability) => (
          <div key={ability}>
            <label className="wizard-field">
              {l.w("score", { ability: l.ability(ability) })}
              {p.draft.method === "standard" ? (
                <select
                  value={p.draft.scores[ability] ?? ""}
                  onChange={(e) =>
                    p.onChange({
                      ...p.draft,
                      scores: {
                        ...p.draft.scores,
                        [ability]: e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                >
                  <option value="">{l.w("choose")}</option>
                  {STANDARD_SCORES.map((score) => (
                    <option key={score} value={score}>
                      {score}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={p.draft.method === "points" ? 8 : 1}
                  max={p.draft.method === "points" ? 15 : 30}
                  step={1}
                  value={p.draft.scores[ability] ?? ""}
                  onChange={(e) =>
                    p.onChange({
                      ...p.draft,
                      scores: {
                        ...p.draft.scores,
                        [ability]: e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              )}
            </label>
            <p className="wizard-score-total">
              {l.w("increase")} +
              {p.preview.composition.facts.reduce(
                (sum, f) =>
                  sum +
                  (f.benefit.kind === "ability" && f.benefit.ability === ability
                    ? f.benefit.amount
                    : 0),
                0
              )}{" "}
              · {l.w("total")} <strong>{p.preview.abilities[ability] ?? "—"}</strong>
            </p>
          </div>
        ))}
      </div>
      {background && (
        <fieldset className="wizard-choice">
          <legend>{l.w("backgroundAbilities")}</legend>
          <p>{l.w("distribution")}</p>
          <button
            type="button"
            onClick={() =>
              p.onChange(
                answerCreationChoice(
                  p.draft,
                  "background",
                  "root/background-abilities",
                  backgroundAbilities.map((a) => a + ":1")
                )
              )
            }
          >
            {l.w("three")}
          </button>
          <div className="wizard-score-grid">
            {backgroundAbilities.map((ability) => (
              <label className="wizard-field" key={ability}>
                {l.w("increaseAbility", { ability: l.ability(ability) })}
                <select
                  value={
                    answer.find((v) => v.startsWith(ability + ":"))?.split(":")[1] ?? "0"
                  }
                  onChange={(e) => setIncrease(ability, e.target.value)}
                >
                  {[0, 1, 2].map((amount) => (
                    <option key={amount} value={amount}>
                      +{amount}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <WizardIssues
        {...p}
        issues={p.preview.issues.filter(
          (d) =>
            d.path.startsWith("abilities") ||
            d.code === "background-distribution" ||
            d.code === "ability-maximum"
        )}
      />
    </>
  );
}
