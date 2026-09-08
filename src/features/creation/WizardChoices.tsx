import { useId, useState } from "react";
import {
  answerCreationChoice,
  type CreationDraft,
  type CreationRole,
} from "@/lib/character-creation/model";
import type { CreationPreview } from "@/lib/character-creation/compose";
import type {
  ActiveOriginChoice,
  OriginDiagnostic,
  OriginException,
} from "@/lib/homebrew/origin-build";
import type { DefinitionSnapshot } from "@/lib/homebrew/sources";
import {
  activeSelection,
  choiceSource,
  useWizardLabels,
  wizardRoles,
} from "./wizard-presenters";

export interface WizardEditProps {
  draft: CreationDraft;
  preview: CreationPreview;
  disabled: boolean;
  onChange: (next: CreationDraft) => void;
}
export function WizardChoice({ c, ...p }: WizardEditProps & { c: ActiveOriginChoice }) {
  const l = useWizardLabels();
  const [search, setSearch] = useState("");
  const id = useId();
  const source = choiceSource(p.draft, p.preview, c);
  const options = c.choice.pool
    ? p.preview.options(c)
    : c.choice.options.map((option) => ({ option, snapshot: undefined }));
  const name = l.choice(c, source);
  const selection = activeSelection(p.draft, c.selectionId as CreationRole);
  const label = (value: (typeof options)[number]) =>
    l.option(value.option, source, value.snapshot, c.choice.id);
  const visible = options.filter(
    (o) =>
      c.selected.includes(o.option.id) ||
      label(o).toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
  const change = (values: string[]) => {
    const snapshots = values
      .map(
        (value) =>
          options.find((o) => o.option.id === value)?.snapshot ??
          selection?.resolvedChoices?.[c.path]?.[c.selected.indexOf(value)]
      )
      .filter((v): v is DefinitionSnapshot => !!v);
    p.onChange(
      answerCreationChoice(
        p.draft,
        c.selectionId as CreationRole,
        c.path,
        values,
        snapshots
      )
    );
  };
  const parent = p.preview.composition.activeChoices.find(
    (other) =>
      other.selectionId === c.selectionId &&
      other.choice.id === c.choice.parent?.choiceId &&
      other.path.slice(0, other.path.lastIndexOf("/")) ===
        c.path.slice(0, c.path.lastIndexOf("/"))
  );
  const parentOption = parent?.choice.options.find(
    (o) => o.id === c.choice.parent?.optionId
  );
  return (
    <fieldset className="wizard-choice" disabled={p.disabled || !c.active}>
      <legend>
        {name}
        {source && ["feat", "feature"].includes(source.definition.family) && (
          <small className="wizard-choice-source">{l.snapshot(source)}</small>
        )}
      </legend>
      <p id={id + "-count"}>
        {l.w("selected", { selected: c.selected.length, count: c.choice.count })}
      </p>
      {c.choice.selectedGrant?.kind === "spell" && (
        <p>
          {c.choice.selectedGrant.entitlements
            .map(
              (entitlement) =>
                l.w(entitlement.policy) +
                (entitlement.policy === "free-cast"
                  ? " · " +
                    l.w("uses", { uses: entitlement.uses, rest: l.w(entitlement.rest) })
                  : "")
            )
            .join(" · ")}
        </p>
      )}
      {parent && parentOption && (
        <p>
          {l.w("depends", {
            parent: l.choice(parent, source),
            option: l.option(parentOption, source, undefined, parent.choice.id),
          })}
        </p>
      )}
      {!c.active && <p>{l.w("inactiveHint")}</p>}
      {options.length > 8 && (
        <label className="wizard-field">
          {l.w("search", { name })}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      <div className="wizard-option-list" aria-describedby={id + "-count"}>
        {visible.map((o) => (
          <div className="wizard-option" key={o.option.id}>
            <label className="wizard-check">
              <input
                type="checkbox"
                checked={c.selected.includes(o.option.id)}
                disabled={
                  !c.selected.includes(o.option.id) &&
                  c.choice.count !== 1 &&
                  c.selected.length >= c.choice.count
                }
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? c.choice.count === 1
                        ? [o.option.id]
                        : [...c.selected, o.option.id]
                      : c.selected.filter((v) => v !== o.option.id)
                  )
                }
              />
              <span>
                {label(o)}
                {o.snapshot && <small>{l.provenance(o.snapshot)}</small>}
              </span>
            </label>
            {o.snapshot && (
              <details className="wizard-option-reading">
                <summary>{l.w("readOption", { name: l.snapshot(o.snapshot) })}</summary>
                <p className="wizard-prose">{l.snapshot(o.snapshot, "description")}</p>
                <details>
                  <summary>{l.w("technical")}</summary>
                  <pre>{JSON.stringify(o.snapshot.definition, null, 2)}</pre>
                </details>
              </details>
            )}
          </div>
        ))}
      </div>
      {!visible.length && <p>{l.w(options.length ? "noResults" : "unavailable")}</p>}
      {c.selected
        .filter((value) => !options.some((o) => o.option.id === value))
        .map((value) => {
          const index = c.selected.indexOf(value);
          const snapshot = selection?.resolvedChoices?.[c.path]?.[index];
          const name = snapshot
            ? l.snapshot(snapshot)
            : l.w("savedAnswer", { index: index + 1 });
          return (
            <div className="wizard-warning" key={value}>
              <p>
                {l.w("retainedAnswers")}: {name}
              </p>
              <details>
                <summary>{l.w("technical")}</summary>
                <code>{value}</code>
              </details>
              <button
                type="button"
                onClick={() => change(c.selected.filter((id) => id !== value))}
              >
                {l.w("removeOption", { name })}
              </button>
            </div>
          );
        })}
      {c.active && c.selected.length > 0 && (
        <button type="button" onClick={() => change([])}>
          {l.w("clear")}
        </button>
      )}
    </fieldset>
  );
}

const RULE_EXCEPTIONS = new Set([
  "prerequisite-level",
  "prerequisite-ability",
  "prerequisite-proficiency",
  "prerequisite-training",
  "prerequisite-feat",
  "prerequisite-spellcasting",
  "prerequisite-any",
  "nonrepeatable-feat",
  "ability-maximum",
]);
export function WizardException({
  issue,
  ...p
}: WizardEditProps & { issue: OriginDiagnostic }) {
  const l = useWizardLabels();
  const [reason, setReason] = useState("");
  const recordException = () => {
    if (!reason.trim()) return;
    const next = structuredClone(p.draft);
    const exceptions = issue.selectionId
      ? activeSelection(next, issue.selectionId as CreationRole)?.exceptions
      : next.exceptions;
    if (!exceptions) return;
    const value: OriginException = {
      path: issue.path,
      code: issue.code,
      reason: reason.trim(),
      authorUid: next.ownerUid,
    };
    const index = exceptions.findIndex(
      (e) => e.path === value.path && e.code === value.code
    );
    if (index === -1) exceptions.push(value);
    else exceptions[index] = value;
    p.onChange(next);
  };
  return (
    <div className="wizard-exception">
      <label className="wizard-field">
        {l.w("reason")}
        <textarea
          value={reason}
          maxLength={2000}
          disabled={p.disabled}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={p.disabled || !reason.trim()}
        onClick={recordException}
      >
        {l.w("recordException")}
      </button>
    </div>
  );
}
export function WizardIssues({
  issues,
  ...p
}: WizardEditProps & { issues: OriginDiagnostic[] }) {
  const l = useWizardLabels();
  if (!issues.length) return null;
  return (
    <section className="wizard-issues" aria-label={l.w("issues")}>
      <h3>{l.w("issues")}</h3>
      {issues.map((issue, index) => {
        const c = p.preview.composition.activeChoices
          .filter(
            (c) => c.selectionId === issue.selectionId && issue.path.startsWith(c.path)
          )
          .sort((a, b) => b.path.length - a.path.length)[0];
        const name = c
          ? l.choice(c, choiceSource(p.draft, p.preview, c))
          : issue.path.startsWith("abilities/")
            ? l.ability(issue.path.split("/")[1] ?? "")
            : issue.selectionId
              ? l.w(issue.selectionId)
              : l.w(
                  ["name", "languages", "abilities", ...wizardRoles].includes(issue.path)
                    ? issue.path
                    : "review"
                );
        const exceptionAllowed =
          (!issue.selectionId && issue.code === "manual-range") ||
          (issue.severity !== "unsupported" && RULE_EXCEPTIONS.has(issue.code));
        return (
          <div className="wizard-issue" key={issue.path + issue.code + String(index)}>
            <strong>{name}</strong>
            <p>{l.diagnostic(issue)}</p>
            <details>
              <summary>{l.w("technical")}</summary>
              <p>{l.w(issue.severity)}</p>
              <code>
                {issue.path} · {issue.code}
              </code>
            </details>
            {exceptionAllowed && (
              <details>
                <summary>{l.w("exception")}</summary>
                <WizardException {...p} issue={issue} />
              </details>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function WizardRetained({ ...p }: WizardEditProps) {
  const l = useWizardLabels();
  const inactive = Object.entries(p.draft.selections).filter(
    ([key]) => !Object.values(p.draft.sources).includes(key)
  );
  const answers = wizardRoles.flatMap((role) => {
    const selection = activeSelection(p.draft, role);
    if (!selection) return [];
    return Object.entries(selection.answers)
      .filter(
        ([path, values]) =>
          values.length &&
          !p.preview.composition.activeChoices.some(
            (c) => c.selectionId === role && c.path === path && c.active
          ) &&
          !["root/background-abilities", "root/background-equipment"].includes(path)
      )
      .map(([path, values]) => ({ role, selection, path, values }));
  });
  if (!inactive.length && !answers.length) return null;
  return (
    <details className="wizard-retained">
      <summary>{l.w("retainedAnswers")}</summary>
      <p>{l.w("inactiveHint")}</p>
      {answers.map(({ role, selection, path, values }) => {
        const c = p.preview.composition.activeChoices.find(
          (c) => c.path === path && c.selectionId === role
        );
        return (
          <div key={role + path}>
            <h3>
              {l.snapshot(selection.snapshot)} ·{" "}
              {c ? l.choice(c, choiceSource(p.draft, p.preview, c)) : l.w("inactive")}
            </h3>
            <ul>
              {values.map((value, i) => {
                const source = selection.resolvedChoices?.[path]?.[i];
                const option = c?.choice.options.find((o) => o.id === value);
                return (
                  <li key={value}>
                    {source
                      ? l.snapshot(source)
                      : option
                        ? l.option(option, selection.snapshot, undefined, c?.choice.id)
                        : l.w("savedAnswer", { index: i + 1 })}
                    <details>
                      <summary>{l.w("technical")}</summary>
                      <code>
                        {path} · {value}
                      </code>
                    </details>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              disabled={p.disabled}
              onClick={() => {
                const next = structuredClone(p.draft),
                  s = activeSelection(next, role);
                if (!s) return;
                Reflect.deleteProperty(s.answers, path);
                if (s.resolvedChoices) Reflect.deleteProperty(s.resolvedChoices, path);
                p.onChange(next);
              }}
            >
              {l.w("clear")}
            </button>
          </div>
        );
      })}
      {inactive.length > 0 && <h3>{l.w("retainedSources")}</h3>}
      {inactive.map(([key, selection]) => (
        <div key={key}>
          <p>
            {l.snapshot(selection.snapshot)} · {l.provenance(selection.snapshot)}
          </p>
          <button
            type="button"
            disabled={p.disabled}
            onClick={() =>
              p.onChange({
                ...p.draft,
                sources: { ...p.draft.sources, [selection.id]: key },
              })
            }
          >
            {l.w("restoreSource")}
          </button>
          <details>
            <summary>{l.w("retainedAnswers")}</summary>
            <pre>{JSON.stringify(selection.answers, null, 2)}</pre>
          </details>
        </div>
      ))}
    </details>
  );
}
