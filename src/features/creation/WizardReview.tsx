import { includedCopyCatalogue } from "@/features/library/included-copy-source";
import { ABILITIES } from "@/lib/homebrew/model";
import {
  activeSelection,
  choiceSource,
  useWizardLabels,
  wizardRoles,
} from "./wizard-presenters";
import { WizardIssues, WizardRetained, type WizardEditProps } from "./WizardChoices";

export function WizardExceptions(p: WizardEditProps) {
  const l = useWizardLabels();
  const groups = [
    { role: null, exceptions: p.draft.exceptions },
    ...wizardRoles.map((role) => ({
      role,
      exceptions: activeSelection(p.draft, role)?.exceptions ?? [],
    })),
  ];
  if (!groups.some((g) => g.exceptions.length)) return null;
  return (
    <section className="wizard-exceptions">
      <h3>{l.w("exceptions")}</h3>
      {groups.flatMap(({ role, exceptions }) =>
        exceptions.map((exception, index) => (
          <div key={String(role) + String(index)}>
            <p>
              <strong>{role ? l.w(role) : l.w("abilities")}</strong> ·{" "}
              {l.diagnostic(exception)}
            </p>
            <p>{exception.reason}</p>
            <details>
              <summary>
                {l.w("scope", { name: role ? l.w(role) : l.w("abilities") })}
              </summary>
              <code>
                {exception.path} · {exception.code} · {exception.authorUid}
              </code>
            </details>
            <button
              type="button"
              disabled={p.disabled}
              onClick={() => {
                const next = structuredClone(p.draft);
                const values = role
                  ? activeSelection(next, role)?.exceptions
                  : next.exceptions;
                if (!values) return;
                values.splice(index, 1);
                p.onChange(next);
              }}
            >
              {l.w("removeException")}
            </button>
          </div>
        ))
      )}
    </section>
  );
}
export function WizardReview(p: WizardEditProps) {
  const l = useWizardLabels();
  return (
    <>
      <p>
        <strong>{p.draft.name || l.w("unnamed")}</strong> ·{" "}
        {l.t(`srd.alignment_${p.draft.alignment}`)}
      </p>
      <p>
        {["common", ...p.draft.languages].map((id) => l.srd("language", id)).join(" · ")}
      </p>
      <h3>{l.w("sources")}</h3>
      <dl className="wizard-summary">
        {wizardRoles.map((role) => {
          const source = activeSelection(p.draft, role)?.snapshot;
          return (
            <div key={role}>
              <dt>{l.w(role)}</dt>
              <dd>
                {source ? l.snapshot(source) : "—"}
                {source && <small>{l.provenance(source)}</small>}
              </dd>
            </div>
          );
        })}
      </dl>
      <h3>{l.w("abilities")}</h3>
      <div className="wizard-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{l.w("abilities")}</th>
              <th>{l.w("base")}</th>
              <th>{l.w("increase")}</th>
              <th>{l.w("total")}</th>
            </tr>
          </thead>
          <tbody>
            {ABILITIES.map((ability) => (
              <tr key={ability}>
                <th scope="row">{l.ability(ability)}</th>
                <td>{p.draft.scores[ability] ?? "—"}</td>
                <td>
                  {p.preview.abilities[ability] !== null &&
                  p.draft.scores[ability] !== null
                    ? p.preview.abilities[ability] - p.draft.scores[ability]
                    : "—"}
                </td>
                <td>{p.preview.abilities[ability] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      <h3>{l.w("selectedOptions")}</h3>
      <ul className="wizard-facts">
        {wizardRoles.flatMap((role) => {
          const source = activeSelection(p.draft, role)?.snapshot;
          const feat = source?.definition.payload.data.originFeat;
          return source && typeof feat === "string" && feat
            ? [<li key={role + feat}>{l.dependency(source, feat)}</li>]
            : [];
        })}
        {p.preview.composition.activeChoices
          .filter((c) => c.active && c.selected.length)
          .map((c) => {
            const source = choiceSource(p.draft, p.preview, c);
            const options = p.preview.options(c);
            return (
              <li key={c.selectionId + c.path}>
                <strong>{l.choice(c, source)}</strong>:{" "}
                {c.selected
                  .map((id) => {
                    const resolved = options.find((o) => o.option.id === id);
                    const option =
                      resolved?.option ?? c.choice.options.find((o) => o.id === id);
                    return option
                      ? l.option(option, source, resolved?.snapshot, c.choice.id)
                      : id;
                  })
                  .join("; ")}
              </li>
            );
          })}
      </ul>
      <h3>{l.w("acquired")}</h3>
      {wizardRoles.map((role) => {
        const facts = p.preview.composition.facts.filter((f) => f.selectionId === role);
        if (!facts.length) return null;
        const selection = activeSelection(p.draft, role);
        return (
          <section key={role}>
            <h4>{selection ? l.snapshot(selection.snapshot) : l.w(role)}</h4>
            <ul className="wizard-facts">
              {facts.map((fact, i) => {
                const c = p.preview.composition.activeChoices
                  .filter((c) => c.selectionId === role && fact.path.startsWith(c.path))
                  .sort((a, b) => b.path.length - a.path.length)[0];
                return (
                  <li key={fact.path + String(i)}>
                    {l.benefit(
                      fact.benefit,
                      c ? choiceSource(p.draft, p.preview, c) : selection?.snapshot
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!p.preview.composition.facts.length && <p>{l.w("noFacts")}</p>}
      <h3>{l.w("copies")}</h3>
      <ul className="wizard-copies">
        {Object.values(p.preview.loadout.instances).map((instance) => {
          const catalogue = includedCopyCatalogue(
            instance.snapshot,
            p.preview.loadout.sources
          );
          const source =
            catalogue ??
            ("kind" in instance.snapshot && instance.snapshot.kind === "bundled"
              ? p.preview.loadout.sources[instance.snapshot.sourceKey]
              : instance.snapshot);
          return (
            <li key={instance.id}>
              {l.w("quantity", {
                quantity: instance.state.quantity,
                name: l.snapshot(catalogue ?? instance.snapshot),
              })}
              <small>{source && l.provenance(source)}</small>
            </li>
          );
        })}
      </ul>
      <WizardExceptions {...p} />
      <WizardRetained {...p} />
      <WizardIssues {...p} issues={p.preview.issues} />
      <details className="wizard-declarations">
        <summary>{l.w("declared")}</summary>
        <p>{l.w("declaredHint")}</p>
        {wizardRoles.map((role) => {
          const selection = activeSelection(p.draft, role);
          return (
            selection && (
              <details key={role}>
                <summary>{l.snapshot(selection.snapshot)}</summary>
                <p className="wizard-prose">
                  {l.snapshot(selection.snapshot, "description")}
                </p>
                <pre>{JSON.stringify(selection, null, 2)}</pre>
              </details>
            )
          );
        })}
      </details>
    </>
  );
}
