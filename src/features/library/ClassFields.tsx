import { useState } from "react";
import { CheckboxField } from "@/components/ui/selection";
import { ABILITIES } from "@/lib/homebrew/model";
import { blankClassLevel } from "@/lib/homebrew/classes";
import { originRecord } from "@/lib/homebrew/origins";
import type { JsonValue } from "@/lib/library/model";
import { OriginFields, type OriginFieldsProps } from "./OriginFields";
import { useHomebrewLabel } from "./homebrew-labels";

type Row = Record<string, JsonValue>;
const record = (v: unknown) => originRecord(v) as Row | null;
const rows = (v: unknown): JsonValue[] => (Array.isArray(v) ? (v as JsonValue[]) : []);
const text = (v: unknown) =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

/** Authoring adapter only. Every change edits the existing ClassData declaration. */
export function ClassFields({
  definition,
  disabled,
  onChange,
  loadOriginSources,
}: OriginFieldsProps) {
  const label = useHomebrewLabel();
  const data = definition.payload.data;
  const subclass = definition.family === "subclass";
  const [nextLevel, setNextLevel] = useState(3);
  const edit = (key: string, value: JsonValue) =>
    onChange({ ...definition.payload, data: { ...data, [key]: value } });
  const preserved = (value: unknown) => (
    <details className="origin-preserved">
      <summary>{label("preservedFields")}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
  const number = (
    title: string,
    value: JsonValue | undefined,
    change: (v: JsonValue) => void,
    min = 0,
    max = 100
  ) => (
    <label>
      <span>{title}</span>
      <input
        type="number"
        min={min}
        max={max}
        step="1"
        value={typeof value === "number" || typeof value === "string" ? value : ""}
        onChange={(e) => change(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </label>
  );
  const select = (
    title: string,
    value: JsonValue | undefined,
    options: readonly string[],
    change: (v: string) => void,
    names: (v: string) => string = (v) => label("options." + v)
  ) => (
    <label>
      <span>{title}</span>
      <select value={text(value)} onChange={(e) => change(e.target.value)}>
        {!options.includes(text(value)) && (
          <option value={text(value)}>
            {label("preservedFields")} · {JSON.stringify(value)}
          </option>
        )}
        {options.map((v) => (
          <option key={v} value={v}>
            {names(v)}
          </option>
        ))}
      </select>
    </label>
  );
  const acquisition = (
    scope: "starting" | "multiclass" | { levelId: string } | undefined
  ) => (
    <OriginFields
      definition={definition}
      disabled={disabled}
      onChange={onChange}
      loadOriginSources={loadOriginSources}
      scope={scope}
    />
  );
  const spellPolicy = record(data.spellcasting);
  const levelRows = rows(data.progression);
  const replaceLevel = (index: number, delta: Row) =>
    edit(
      "progression",
      levelRows.map((v, i) => (i === index ? { ...record(v), ...delta } : v))
    );
  const named = (key: string, id: JsonValue) =>
    text(record(rows(data[key]).find((v) => record(v)?.id === id))?.name) ||
    label("classEditor.missingReference") + " · " + text(id);
  return (
    <div className="class-fields">
      {!subclass && (
        <fieldset disabled={disabled} className="homebrew-group">
          <legend>{label("classes.summary")}</legend>
          <p className="homebrew-hint">{label("classEditor.identityHelp")}</p>
          <div className="homebrew-grid">
            {select(
              label("classes.hitDie"),
              data.hitDie,
              ["6", "8", "10", "12"],
              (v) => edit("hitDie", Number(v)),
              (v) => "d" + v
            )}
            <fieldset className="class-ability-list">
              <legend>{label("classes.primaryAbilities")}</legend>
              {Array.isArray(data.primaryAbilities)
                ? ABILITIES.map((a) => (
                    <CheckboxField
                      key={a}
                      disabled={disabled}
                      label={label("options." + a)}
                      checked={rows(data.primaryAbilities).includes(a)}
                      onCheckedChange={(checked) =>
                        edit(
                          "primaryAbilities",
                          checked
                            ? [...rows(data.primaryAbilities), a]
                            : rows(data.primaryAbilities).filter((v) => v !== a)
                        )
                      }
                    />
                  ))
                : preserved(data.primaryAbilities)}
            </fieldset>
            {Array.isArray(data.savingThrows) && data.savingThrows.length === 2
              ? data.savingThrows.map((v, i) => (
                  <div key={i}>
                    {select(
                      label(i === 0 ? "classEditor.firstSave" : "classEditor.secondSave"),
                      v,
                      ABILITIES,
                      (a) =>
                        edit(
                          "savingThrows",
                          rows(data.savingThrows).map((x, j) => (i === j ? a : x))
                        )
                    )}
                  </div>
                ))
              : preserved(data.savingThrows)}
          </div>
          <details className="origin-advanced">
            <summary>{label("classes.subclassLevels")}</summary>
            <p className="homebrew-hint">{label("classEditor.subclassHelp")}</p>
            <div className="class-schedule">
              {Array.isArray(data.subclassLevels)
                ? Array.from({ length: 20 }, (_, i) => i + 1).map((level) => (
                    <CheckboxField
                      key={level}
                      label={String(level)}
                      disabled={disabled}
                      checked={rows(data.subclassLevels).includes(level)}
                      onCheckedChange={(checked) =>
                        edit(
                          "subclassLevels",
                          checked
                            ? [...rows(data.subclassLevels), level].sort(
                                (a, b) => Number(a) - Number(b)
                              )
                            : rows(data.subclassLevels).filter((v) => v !== level)
                        )
                      }
                    />
                  ))
                : preserved(data.subclassLevels)}
            </div>
          </details>
        </fieldset>
      )}
      <details className="origin-advanced">
        <summary>
          {label(
            subclass
              ? "subclassEditor.commonAcquisition"
              : "classEditor.commonAcquisition"
          )}
        </summary>
        <p className="homebrew-hint">
          {label(subclass ? "subclassEditor.commonHelp" : "classEditor.commonHelp")}
        </p>
        {acquisition(undefined)}
      </details>
      {!subclass && (
        <>
          <details className="origin-advanced">
            <summary>{label("classes.starting")}</summary>
            <p className="homebrew-hint">{label("classEditor.startingHelp")}</p>
            {record(data.starting) ? acquisition("starting") : preserved(data.starting)}
          </details>
          <details className="origin-advanced">
            <summary>{label("classes.multiclass")}</summary>
            <p className="homebrew-hint">{label("classEditor.multiclassHelp")}</p>
            {record(data.multiclass)
              ? acquisition("multiclass")
              : preserved(data.multiclass)}
          </details>
        </>
      )}
      <fieldset disabled={disabled} className="homebrew-group">
        <legend>{label("classes.casting")}</legend>
        <p className="homebrew-hint">
          {label(subclass ? "subclassEditor.castingHelp" : "classEditor.castingHelp")}
        </p>
        {spellPolicy ? (
          <>
            <div className="homebrew-grid">
              {select(
                label("classEditor.castingMode"),
                spellPolicy.mode,
                ["none", "full", "half", "third", "pact", "custom"],
                (mode) => edit("spellcasting", { ...spellPolicy, mode }),
                (v) => label("classes.modes." + v)
              )}
              {select(
                label("origin.ability"),
                spellPolicy.ability,
                ["none", ...ABILITIES],
                (ability) => edit("spellcasting", { ...spellPolicy, ability })
              )}
            </div>
            <details className="origin-advanced">
              <summary>{label("classes.contribution")}</summary>
              <p className="homebrew-hint">{label("classEditor.contributionHelp")}</p>
              {(() => {
                const c = record(spellPolicy.multiclass);
                if (!c) return preserved(spellPolicy.multiclass);
                const change = (delta: Row) =>
                  edit("spellcasting", {
                    ...spellPolicy,
                    multiclass: { ...c, ...delta },
                  });
                return (
                  <div className="homebrew-grid">
                    <CheckboxField
                      label={label("classEditor.contributes")}
                      disabled={disabled}
                      checked={c.contributes === true}
                      onCheckedChange={(v) => change({ contributes: v })}
                    />
                    {number(
                      label("classEditor.divisor"),
                      c.divisor,
                      (v) => change({ divisor: v }),
                      1,
                      20
                    )}
                    {select(
                      label("classEditor.rounding"),
                      c.rounding,
                      ["down", "up"],
                      (rounding) => change({ rounding }),
                      (v) => label("classes.rounding." + v)
                    )}
                  </div>
                );
              })()}
            </details>
          </>
        ) : (
          preserved(data.spellcasting)
        )}
      </fieldset>
      <fieldset disabled={disabled} className="homebrew-group">
        <legend>{label("classes.progression")}</legend>
        <p className="homebrew-hint">{label("classes.levelHelp")}</p>
        {!Array.isArray(data.progression) ? (
          preserved(data.progression)
        ) : (
          <>
            <ol className="class-level-index">
              {levelRows.map((v, i) => {
                const r = record(v);
                return (
                  <li key={text(r?.id) || i}>
                    <a href={"#class-level-" + text(r?.id)}>
                      {label("classEditor.level")} {text(r?.level)} · {text(r?.name)}
                    </a>
                  </li>
                );
              })}
            </ol>
            <div className="identity-actions class-level-actions">
              <label>
                {label("classEditor.newLevel")}
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={nextLevel}
                  onChange={(e) => setNextLevel(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                disabled={
                  levelRows.length >= 20 ||
                  !Number.isInteger(nextLevel) ||
                  nextLevel < 1 ||
                  nextLevel > 20 ||
                  levelRows.some((v) => record(v)?.level === nextLevel)
                }
                onClick={() => {
                  edit("progression", [
                    ...levelRows,
                    {
                      ...blankClassLevel(nextLevel),
                      id: crypto.randomUUID(),
                      name: label("classEditor.level") + " " + String(nextLevel),
                    } as unknown as JsonValue,
                  ]);
                  setNextLevel(Math.min(20, nextLevel + 2));
                }}
              >
                {label("classEditor.addLevel")}
              </button>
              <button
                type="button"
                disabled={levelRows.some(
                  (v) => !record(v) || typeof record(v)?.level !== "number"
                )}
                onClick={() =>
                  edit(
                    "progression",
                    [...levelRows].sort(
                      (a, b) => Number(record(a)?.level) - Number(record(b)?.level)
                    )
                  )
                }
              >
                {label("classEditor.orderLevels")}
              </button>
            </div>
            {levelRows.map((raw, index) => {
              const r = record(raw);
              if (!r) return <div key={index}>{preserved(raw)}</div>;
              const casting = record(r.spellcasting);
              return (
                <details
                  className="class-level"
                  key={text(r.id) || index}
                  id={"class-level-" + text(r.id)}
                  data-testid={"class-level-" + text(r.id)}
                  open
                >
                  <summary>
                    {label("classEditor.level")} {text(r.level)} · {text(r.name)}
                  </summary>
                  <div className="homebrew-grid">
                    {number(
                      label("classEditor.level"),
                      r.level,
                      (v) => replaceLevel(index, { level: v }),
                      1,
                      20
                    )}
                    <label>
                      {label("classEditor.levelName")}
                      <input
                        value={text(r.name)}
                        onChange={(e) => replaceLevel(index, { name: e.target.value })}
                      />
                    </label>
                  </div>
                  <details className="origin-advanced">
                    <summary>{label("classEditor.levelAcquisition")}</summary>
                    {typeof r.id === "string"
                      ? acquisition({ levelId: r.id })
                      : preserved(raw)}
                  </details>
                  <details className="origin-advanced">
                    <summary>{label("classEditor.levelPrograms")}</summary>
                    <p className="homebrew-hint">{label("classEditor.programHelp")}</p>
                    {Array.isArray(r.programIds) ? (
                      <>
                        {rows(data.programs).map((p) => {
                          const program = record(p);
                          if (!program || typeof program.id !== "string") return null;
                          const id = program.id;
                          return (
                            <CheckboxField
                              key={id}
                              disabled={disabled}
                              label={named("programs", id)}
                              checked={rows(r.programIds).includes(id)}
                              onCheckedChange={(checked) =>
                                replaceLevel(index, {
                                  programIds: checked
                                    ? [...rows(r.programIds), id]
                                    : rows(r.programIds).filter((v) => v !== id),
                                })
                              }
                            />
                          );
                        })}
                        {rows(r.programIds)
                          .filter(
                            (id) => !rows(data.programs).some((p) => record(p)?.id === id)
                          )
                          .map((id, i) => (
                            <p key={i} role="status">
                              {named("programs", id)}{" "}
                              <button
                                type="button"
                                onClick={() =>
                                  replaceLevel(index, {
                                    programIds: rows(r.programIds).filter(
                                      (v) => v !== id
                                    ),
                                  })
                                }
                              >
                                {label("removeRow")}
                              </button>
                            </p>
                          ))}
                        {rows(data.programs).length === 0 && (
                          <p>{label("classEditor.noPrograms")}</p>
                        )}
                      </>
                    ) : (
                      preserved(r.programIds)
                    )}
                  </details>
                  <details className="origin-advanced">
                    <summary>{label("classEditor.levelResources")}</summary>
                    <p className="homebrew-hint">{label("classEditor.capacityHelp")}</p>
                    {Array.isArray(r.resourceCapacities) ? (
                      <>
                        {r.resourceCapacities.map((b, i) => {
                          const binding = record(b);
                          if (!binding) return <div key={i}>{preserved(b)}</div>;
                          return (
                            <div className="homebrew-grid" key={i}>
                              {select(
                                label("classEditor.resource"),
                                binding.resourceId,
                                rows(data.resources).flatMap((v) =>
                                  typeof record(v)?.id === "string"
                                    ? [text(record(v)?.id)]
                                    : []
                                ),
                                (resourceId) =>
                                  replaceLevel(index, {
                                    resourceCapacities: rows(r.resourceCapacities).map(
                                      (v, j) => (j === i ? { ...binding, resourceId } : v)
                                    ),
                                  }),
                                (id) => named("resources", id)
                              )}
                              {number(
                                label("classEditor.capacity"),
                                binding.capacity,
                                (capacity) =>
                                  replaceLevel(index, {
                                    resourceCapacities: rows(r.resourceCapacities).map(
                                      (v, j) => (j === i ? { ...binding, capacity } : v)
                                    ),
                                  }),
                                0,
                                100000
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  replaceLevel(index, {
                                    resourceCapacities: rows(r.resourceCapacities).filter(
                                      (_, j) => i !== j
                                    ),
                                  })
                                }
                              >
                                {label("removeRow")}
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          disabled={
                            r.resourceCapacities.length >= 32 ||
                            !rows(data.resources).length
                          }
                          onClick={() =>
                            replaceLevel(index, {
                              resourceCapacities: [
                                ...rows(r.resourceCapacities),
                                {
                                  resourceId: record(rows(data.resources)[0])?.id ?? "",
                                  capacity: 0,
                                },
                              ],
                            })
                          }
                        >
                          {label("classEditor.addCapacity")}
                        </button>
                        {rows(data.resources).length === 0 && (
                          <p>{label("classEditor.noResources")}</p>
                        )}
                      </>
                    ) : (
                      preserved(r.resourceCapacities)
                    )}
                  </details>
                  <details className="origin-advanced">
                    <summary>{label("classEditor.levelCasting")}</summary>
                    <p className="homebrew-hint">{label("classEditor.countsHelp")}</p>
                    {casting ? (
                      <>
                        <div className="homebrew-grid">
                          {[
                            "cantrips",
                            "prepared",
                            "known",
                            "pactSlots",
                            "pactLevel",
                          ].map((k) => (
                            <div key={k}>
                              {number(
                                label("classes." + k),
                                casting[k],
                                (v) =>
                                  replaceLevel(index, {
                                    spellcasting: { ...casting, [k]: v },
                                  }),
                                0,
                                k === "pactLevel" ? 9 : 100
                              )}
                            </div>
                          ))}
                        </div>
                        {Array.isArray(casting.slots) ? (
                          <div className="homebrew-grid">
                            {Array.from({ length: 9 }, (_, i) => (
                              <div key={i}>
                                {number(
                                  label("classEditor.slotLevel") + " " + String(i + 1),
                                  casting.slots instanceof Array
                                    ? (casting.slots[i] ?? 0)
                                    : 0,
                                  (v) => {
                                    const slots = [...rows(casting.slots)];
                                    while (slots.length <= i) slots.push(0);
                                    slots[i] = v;
                                    replaceLevel(index, {
                                      spellcasting: { ...casting, slots },
                                    });
                                  },
                                  0,
                                  100
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          preserved(casting.slots)
                        )}
                      </>
                    ) : (
                      preserved(r.spellcasting)
                    )}
                  </details>
                  <details className="origin-advanced">
                    <summary>{label("classEditor.stableIdentity")}</summary>
                    <p>{label("classEditor.identityNote")}</p>
                    <code>{text(r.id)}</code>
                  </details>
                  <button
                    type="button"
                    disabled={levelRows.length === 1}
                    onClick={() =>
                      edit(
                        "progression",
                        levelRows.filter((_, i) => i !== index)
                      )
                    }
                  >
                    {label("classEditor.removeLevel")}
                  </button>
                </details>
              );
            })}
          </>
        )}
      </fieldset>
    </div>
  );
}
