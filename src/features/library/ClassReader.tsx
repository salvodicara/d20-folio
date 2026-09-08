import { isCatalogueSnapshot } from "@/lib/homebrew/sources";
import type { JsonValue, LibraryDefinition } from "@/lib/library/model";
import { originRecord } from "@/lib/homebrew/origins";
import { composeSubclassCasting } from "@/lib/homebrew/class-composition";
import { OriginReader } from "./OriginReader";
import { useHomebrewLabel } from "./homebrew-labels";

export { CLASS_DATA_KEYS as CLASS_READER_KEYS } from "@/lib/homebrew/classes";
import { CLASS_DATA_KEYS as CLASS_READER_KEYS } from "@/lib/homebrew/classes";
const rows = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "—";

/** Consultation only: declarations describe levels; this view never advances a character. */
export function ClassReader({
  definition,
  printable = false,
  bundle,
}: {
  definition: LibraryDefinition;
  printable?: boolean;
  bundle?: Record<string, JsonValue>;
}) {
  const label = useHomebrewLabel(),
    data = definition.payload.data;
  const dependencies = (originRecord(data.dependencies) ?? bundle ?? {}) as Record<
    string,
    JsonValue
  >;
  const parent = originRecord(data.parentClass);
  const parentNode = originRecord(dependencies[text(parent?.dependency)]);
  const parentDefinition = originRecord(parentNode?.definition);
  const value = (v: unknown) =>
    rows(v)
      .map((x) => (typeof x === "string" ? label("options." + x) : text(x)))
      .join(", ") || "—";
  const scope = (raw: unknown) => {
    const declarations = originRecord(raw);
    return declarations ? (
      <OriginReader
        definition={{
          ...definition,
          payload: {
            ...definition.payload,
            data: declarations as Record<string, JsonValue>,
          },
        }}
        printable={printable}
        bundle={dependencies}
        included
      />
    ) : (
      <pre>{JSON.stringify(raw)}</pre>
    );
  };
  const casting = (raw: unknown, effective = false) => {
    const c = originRecord(raw);
    if (!c) return null;
    const contribution = originRecord(c.multiclass);
    return (
      <dl className="homebrew-facts">
        <div>
          <dt>
            {label(
              definition.family === "subclass" && !effective
                ? "classes.localCasting"
                : "classes.casting"
            )}
          </dt>
          <dd>
            {["none", "full", "half", "third", "pact", "custom"].includes(text(c.mode))
              ? definition.family === "subclass" && !effective && c.mode === "none"
                ? label("classes.noSeparateCasting")
                : label("classes.modes." + text(c.mode))
              : text(c.mode)}
          </dd>
        </div>
        <div>
          <dt>{label("origin.ability")}</dt>
          <dd>{label("options." + text(c.ability))}</dd>
        </div>
        {contribution && (
          <div>
            <dt>{label("classes.contribution")}</dt>
            <dd>
              {contribution.contributes === true
                ? "1/" +
                  text(contribution.divisor) +
                  " · " +
                  label("classes.rounding." + text(contribution.rounding))
                : label("classes.noContribution")}
            </dd>
          </div>
        )}
      </dl>
    );
  };
  const composition =
    definition.family === "subclass" ? composeSubclassCasting(definition) : null;
  const named = (key: string, id: unknown) =>
    text(originRecord(rows(data[key]).find((v) => originRecord(v)?.id === id))?.name);
  return (
    <div className="class-reader">
      <section>
        <h4>{label("classes.summary")}</h4>
        <dl className="homebrew-facts">
          {definition.family === "class" ? (
            <>
              <div>
                <dt>{label("classes.hitDie")}</dt>
                <dd>d{text(data.hitDie)}</dd>
              </div>
              <div>
                <dt>{label("classes.primaryAbilities")}</dt>
                <dd>{value(data.primaryAbilities)}</dd>
              </div>
              <div>
                <dt>{label("classes.savingThrows")}</dt>
                <dd>{value(data.savingThrows)}</dd>
              </div>
              <div>
                <dt>{label("classes.subclassLevels")}</dt>
                <dd>{value(data.subclassLevels)}</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>{label("classes.parent")}</dt>
                <dd>
                  {parentDefinition
                    ? text(parentDefinition.name) +
                      " · " +
                      label("version") +
                      " " +
                      text(parentNode?.sourceVersion)
                    : label("origin.missingDependency")}
                </dd>
              </div>
              <div>
                <dt>{label("classes.castingRelationship")}</dt>
                <dd>
                  {["inherit", "augment", "replace"].includes(
                    text(data.castingRelationship)
                  )
                    ? label("classes.relationships." + text(data.castingRelationship))
                    : text(data.castingRelationship)}
                </dd>
              </div>
            </>
          )}
        </dl>
        {casting(data.spellcasting)}
      </section>
      {composition &&
        (composition.ok ? (
          <section data-testid="class-casting-composition">
            <h4>{label("classes.composedCasting")}</h4>
            <p className="homebrew-hint">{label("classes.composedCastingHelp")}</p>
            <p>
              {composition.parent.definition.name} · {label("version")}{" "}
              {isCatalogueSnapshot(composition.parent)
                ? composition.parent.release
                : composition.parent.sourceVersion}
            </p>
            {casting(composition.policy, true)}
            {composition.rows.map(({ level, counts }) => (
              <section className="origin-read-choice" key={level}>
                <h5>
                  {label("options.level")} {level}
                </h5>
                <dl className="homebrew-facts">
                  {(
                    ["cantrips", "prepared", "known", "pactSlots", "pactLevel"] as const
                  ).map((key) => (
                    <div key={key}>
                      <dt>{label("classes." + key)}</dt>
                      <dd>{counts[key]}</dd>
                    </div>
                  ))}
                  {counts.slots.map((amount, index) => (
                    <div key={index}>
                      <dt>
                        {label("classes.slots")} · {label("options.level")} {index + 1}
                      </dt>
                      <dd>{amount}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </section>
        ) : (
          <p role="status">{label("classes.compositionUnavailable")}</p>
        ))}
      {definition.family === "class" &&
        ["starting", "multiclass"].map((key) => (
          <section key={key}>
            <h4>{label("classes." + key)}</h4>
            {scope(data[key])}
          </section>
        ))}
      <section>
        <h4>{label("classes.progression")}</h4>
        <p className="homebrew-hint">{label("classes.levelHelp")}</p>
        {rows(data.progression).map((raw, i) => {
          const row = originRecord(raw);
          if (!row) return <pre key={i}>{JSON.stringify(raw)}</pre>;
          const spells = originRecord(row.spellcasting);
          return (
            <section className="origin-read-choice" key={i}>
              <h5>
                {label("options.level")} {text(row.level)} · {text(row.name)}
              </h5>
              {scope(
                Object.fromEntries(
                  ["prerequisites", "benefits", "choices"].map((key) => [
                    key,
                    row[key] ?? [],
                  ])
                )
              )}
              {rows(row.programIds).length > 0 && (
                <p>
                  {label("collections.programs")}:{" "}
                  {rows(row.programIds)
                    .map((id) => named("programs", id))
                    .join(", ")}
                </p>
              )}
              {rows(row.resourceCapacities).length > 0 && (
                <ul>
                  {rows(row.resourceCapacities).map((raw, n) => {
                    const r = originRecord(raw);
                    return (
                      <li key={n}>
                        {named("resources", r?.resourceId)}: {text(r?.capacity)}
                      </li>
                    );
                  })}
                </ul>
              )}
              {spells &&
                (rows(spells.slots).length > 0 ||
                  ["cantrips", "prepared", "known", "pactSlots"].some(
                    (key) => typeof spells[key] === "number" && spells[key] > 0
                  )) && (
                  <dl className="homebrew-facts">
                    {["cantrips", "prepared", "known", "pactSlots", "pactLevel"].map(
                      (key) => (
                        <div key={key}>
                          <dt>{label("classes." + key)}</dt>
                          <dd>{text(spells[key])}</dd>
                        </div>
                      )
                    )}
                    {rows(spells.slots).map((amount, n) => (
                      <div key={n}>
                        <dt>
                          {label("classes.slots")} · {label("options.level")} {n + 1}
                        </dt>
                        <dd>{text(amount)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
            </section>
          );
        })}
      </section>
      <details open={printable}>
        <summary>{label("classes.completeModel")}</summary>
        <pre>
          {JSON.stringify(
            Object.fromEntries(
              CLASS_READER_KEYS.filter((key) => Object.hasOwn(data, key)).map((key) => [
                key,
                data[key],
              ])
            ),
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
}
