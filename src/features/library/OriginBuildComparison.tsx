import { useTranslation } from "react-i18next";
import { projectOriginCharacter, type OriginBuild } from "@/lib/homebrew/origin-build";
import type { FolioCharacter } from "@/lib/identity/model";
import { srdCatalogues } from "@/i18n/srd-en";
import { useHomebrewLabel } from "./homebrew-labels";
import { originBenefitText } from "./origin-text";
export function OriginBuildComparison({
  character,
  before,
  after,
}: {
  character: FolioCharacter;
  before: OriginBuild | null;
  after: OriginBuild;
}) {
  const label = useHomebrewLabel(),
    { i18n } = useTranslation("common");
  const catalog = srdCatalogues(i18n.language.startsWith("it") ? "it" : "en");
  return (
    <section className="origin-build-comparison">
      <h4>{label("origin.consequences")}</h4>
      <div className="library-comparison">
        {[before, after].map((build, index) => {
          const projection = projectOriginCharacter(character, build);
          const species = projection.species.selectionId
            ? projection.species.name
            : String(
                catalog?.race[projection.species.id]?.name ?? projection.species.name
              );
          const background = projection.background.selectionId
            ? projection.background.name
            : String(
                catalog?.background[projection.background.id]?.name ??
                  projection.background.name
              );
          return (
            <section key={index}>
              <h5>
                {label(index === 0 ? "origin.savedChoices" : "origin.proposedChoices")}
              </h5>
              <dl className="homebrew-facts">
                <div>
                  <dt>{label("origin.species")}</dt>
                  <dd>{species || "—"}</dd>
                </div>
                <div>
                  <dt>{label("origin.background")}</dt>
                  <dd>{background || "—"}</dd>
                </div>
                {Object.entries(projection.abilities).map(([ability, value]) => (
                  <div key={ability}>
                    <dt>{label("options." + ability)}</dt>
                    <dd>{value ?? "—"}</dd>
                  </div>
                ))}
                <div>
                  <dt>{label("fields.walkSpeed")}</dt>
                  <dd>
                    {typeof projection.projectedCharacter.sheet.build.speed === "number"
                      ? projection.projectedCharacter.sheet.build.speed
                      : "—"}
                  </dd>
                </div>
              </dl>
              {Object.values(build?.selections ?? {})
                .sort((a, b) => a.ordinal - b.ordinal)
                .map((selection) => (
                  <section key={selection.id}>
                    <h5>
                      {selection.snapshot.definition.name} · {label("version")}{" "}
                      {selection.snapshot.version}
                    </h5>
                    <ul>
                      {projection.activeChoices
                        .filter((c) => c.selectionId === selection.id)
                        .map((c) => (
                          <li key={c.path}>
                            <strong>{c.choice.name}:</strong>{" "}
                            {c.selected
                              .map(
                                (id) =>
                                  c.choice.options.find((o) => o.id === id)?.name ??
                                  label("origin.obsoleteOption")
                              )
                              .join(", ") || "—"}
                            {!c.active ? " · " + label("origin.choiceInactive") : ""}
                          </li>
                        ))}
                    </ul>
                    <ul>
                      {projection.facts
                        .filter((f) => f.selectionId === selection.id)
                        .map((f, i) => (
                          <li key={i}>
                            {originBenefitText(
                              f.benefit,
                              label,
                              selection.snapshot.definition
                            )}
                          </li>
                        ))}
                    </ul>
                    {selection.exceptions.map((e, i) => (
                      <p key={i}>
                        {label("origin.diagnostics." + e.code)} · {e.reason}
                      </p>
                    ))}
                  </section>
                ))}
              {projection.diagnostics.map((d, i) => (
                <p key={i}>
                  {build?.selections[d.selectionId ?? ""]?.snapshot.definition.name}:{" "}
                  {label("origin.diagnostics." + d.code)}
                </p>
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}
