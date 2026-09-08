import type { LibraryVersion } from "@/lib/library/model";
import { creationSources } from "@/lib/character-creation/catalogue-source";
import { catalogueSnapshot } from "@/lib/character-creation/catalogue";
import { selectCreationSource, type CreationRole } from "@/lib/character-creation/model";
import { sourceIdentity } from "@/lib/homebrew/sources";
import { activeSelection, useWizardLabels } from "./wizard-presenters";
import type { WizardEditProps } from "./WizardChoices";

export function WizardSources({
  role,
  librarySources,
  ...p
}: WizardEditProps & { role: CreationRole; librarySources: LibraryVersion[] }) {
  const l = useWizardLabels();
  const sources = creationSources(role);
  const library = librarySources.filter((source) => source.definition.family === role);
  const selection = activeSelection(p.draft, role);
  // Existing selections remain selectable even when the Library inventory changes.
  if (
    selection &&
    !("kind" in selection.snapshot) &&
    !library.some(
      (source) => sourceIdentity(source) === sourceIdentity(selection.snapshot)
    )
  )
    library.push(selection.snapshot);
  const selected = selection
    ? "kind" in selection.snapshot
      ? selection.snapshot.entryId
      : sourceIdentity(selection.snapshot)
    : "";
  return (
    <section className="wizard-source">
      <label className="wizard-field">
        {l.w(role)}
        <select
          value={selected}
          onChange={(e) => {
            const source = library.find((s) => sourceIdentity(s) === e.target.value);
            p.onChange(
              selectCreationSource(
                p.draft,
                role,
                source ?? catalogueSnapshot(e.target.value)
              )
            );
          }}
        >
          <option value="" disabled>
            {l.w("choose")}
          </option>
          <optgroup label={l.w("official")}>
            {sources.map((source) => (
              <option key={source.key} value={source.key}>
                {l.srd(role === "species" ? "race" : role, source.id, source.name)}
              </option>
            ))}
          </optgroup>
          {library.length > 0 && (
            <optgroup label={l.w("custom")}>
              {library.map((source) => (
                <option key={sourceIdentity(source)} value={sourceIdentity(source)}>
                  {source.definition.name} · {l.provenance(source)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {selection && (
        <>
          <p className="wizard-source-version">{l.provenance(selection.snapshot)}</p>
          <details>
            <summary>{l.snapshot(selection.snapshot)}</summary>
            <p className="wizard-prose">
              {l.snapshot(selection.snapshot, "description")}
            </p>
          </details>
        </>
      )}
    </section>
  );
}
