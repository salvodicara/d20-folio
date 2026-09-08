import { homebrewKey } from "@/features/library/homebrew-labels";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { srdCatalogues, type SrdKind } from "@/i18n/srd-en";
import type { FolioCharacter, Json, JsonObject } from "@/lib/identity/model";
import type { OriginProjection } from "@/lib/homebrew/origin-build";

const sheetKeys: Readonly<Record<string, string>> = {
  classes: "identity.sheet.classes",
  background: "identity.sheet.background",
  hpCurrent: "identity.sheet.hpCurrent",
  hpTemp: "identity.sheet.hpTemp",
  exhaustion: "identity.sheet.exhaustion",
  conditions: "identity.sheet.conditions",
  proficiencies: "identity.sheet.proficiencies",
  languageIds: "identity.sheet.languageIds",
  toolProficiencyIds: "identity.sheet.toolProficiencyIds",
  savingThrows: "identity.sheet.savingThrows",
  weapons: "identity.sheet.weapons",
  equipment: "identity.sheet.equipment",
  spells: "identity.sheet.spells",
  features: "identity.sheet.features",
  noneRecorded: "identity.sheet.noneRecorded",
  unnamed: "identity.sheet.unnamed",
  equipped: "identity.sheet.equipped",
  prepared: "identity.sheet.prepared",
  level: "identity.sheet.level",
  castingTime: "identity.sheet.castingTime",
  range: "identity.sheet.range",
  duration: "identity.sheet.duration",
  damageDie: "identity.sheet.damageDie",
  damageType: "identity.sheet.damageType",
  acBonus: "identity.sheet.acBonus",
  attackBonusOverride: "identity.sheet.attackBonusOverride",
  recovery: "identity.sheet.recovery",
  resources: "identity.sheet.resources",
  speed: "identity.sheet.speed",
  proficiencyBonusOverride: "identity.sheet.proficiencyBonusOverride",
  ac: "identity.sheet.ac",
  hpMax: "identity.sheet.hpMax",
  initiativeBonus: "identity.sheet.initiativeBonus",
  pp: "identity.sheet.pp",
  gp: "identity.sheet.gp",
  ep: "identity.sheet.ep",
  sp: "identity.sheet.sp",
  cp: "identity.sheet.cp",
  usedHitDice: "identity.sheet.usedHitDice",
  spellSlots: "identity.sheet.spellSlots",
  used: "identity.sheet.used",
  total: "identity.sheet.total",
  skills: "identity.sheet.skills",
  proficient: "identity.sheet.proficient",
  notProficient: "identity.sheet.notProficient",
  expertise: "identity.sheet.expertise",
  halfProficiency: "identity.sheet.halfProficiency",
  pactMagic: "identity.sheet.pactMagic",
};

const detailKeys: Readonly<Record<string, string>> = {
  buildDetails: "identity.sheetFacts.buildDetails",
  stateDetails: "identity.sheetFacts.stateDetails",
  yes: "identity.sheetFacts.yes",
  no: "identity.sheetFacts.no",
  automatic: "identity.sheetFacts.automatic",
  classes: "identity.sheetFacts.classes",
  classId: "identity.sheetFacts.classId",
  subclassId: "identity.sheetFacts.subclassId",
  fightingStyles: "identity.sheetFacts.fightingStyles",
  weaponMasteries: "identity.sheetFacts.weaponMasteries",
  metamagicChoices: "identity.sheetFacts.metamagicChoices",
  invocationChoices: "identity.sheetFacts.invocationChoices",
  maneuverChoices: "identity.sheetFacts.maneuverChoices",
  spellcasting: "identity.sheetFacts.spellcasting",
  ability: "identity.sheetFacts.ability",
  preparedCaster: "identity.sheetFacts.preparedCaster",
  preparedMax: "identity.sheetFacts.preparedMax",
  preparedMaxOverride: "identity.sheetFacts.preparedMaxOverride",
  saveDCOverride: "identity.sheetFacts.saveDCOverride",
  slotMaxOverrides: "identity.sheetFacts.slotMaxOverrides",
  tags: "identity.sheetFacts.tags",
  label: "identity.sheetFacts.label",
  color: "identity.sheetFacts.color",
  srdId: "identity.sheetFacts.srdId",
  instanceId: "identity.sheetFacts.instanceId",
  custom: "identity.sheetFacts.custom",
  name: "identity.sheetFacts.name",
  title: "identity.sheetFacts.title",
  emoji: "identity.sheetFacts.emoji",
  subtitle: "identity.sheetFacts.subtitle",
  source: "identity.sheetFacts.source",
  school: "identity.sheetFacts.school",
  concentration: "identity.sheetFacts.concentration",
  higherLevels: "identity.sheetFacts.higherLevels",
  alwaysPrepared: "identity.sheetFacts.alwaysPrepared",
  spellAbilityOverride: "identity.sheetFacts.spellAbilityOverride",
  wizardSpellMastery: "identity.sheetFacts.wizardSpellMastery",
  wizardSignatureSpell: "identity.sheetFacts.wizardSignatureSpell",
  speciesSpellAbility: "identity.sheetFacts.speciesSpellAbility",
  quantity: "identity.sheetFacts.quantity",
  tracked: "identity.sheetFacts.tracked",
  isConsumable: "identity.sheetFacts.isConsumable",
  isPotion: "identity.sheetFacts.isPotion",
  potionFormula: "identity.sheetFacts.potionFormula",
  isPool: "identity.sheetFacts.isPool",
  unit: "identity.sheetFacts.unit",
  attuned: "identity.sheetFacts.attuned",
  attackStat: "identity.sheetFacts.attackStat",
  damageOverride: "identity.sheetFacts.damageOverride",
  enchantItemId: "identity.sheetFacts.enchantItemId",
  properties: "identity.sheetFacts.properties",
  armorCategory: "identity.sheetFacts.armorCategory",
  components: "identity.sheetFacts.components",
  v: "identity.sheetFacts.v",
  s: "identity.sheetFacts.s",
  m: "identity.sheetFacts.m",
  material: "identity.sheetFacts.material",
  ac: "identity.sheetFacts.ac",
  base: "identity.sheetFacts.base",
  dexBonus: "identity.sheetFacts.dexBonus",
  maxDex: "identity.sheetFacts.maxDex",
  charges: "identity.sheetFacts.charges",
  current: "identity.sheetFacts.current",
  max: "identity.sheetFacts.max",
  recoveryFormula: "identity.sheetFacts.recoveryFormula",
  freeCastSource: "identity.sheetFacts.freeCastSource",
  sourceId: "identity.sheetFacts.sourceId",
  rest: "identity.sheetFacts.rest",
  usesPerRest: "identity.sheetFacts.usesPerRest",
  trackers: "identity.sheetFacts.trackers",
  id: "identity.sheetFacts.id",
  die: "identity.sheetFacts.die",
  shortRestRecovery: "identity.sheetFacts.shortRestRecovery",
  refreshOnActivationOf: "identity.sheetFacts.refreshOnActivationOf",
  recordedRolls: "identity.sheetFacts.recordedRolls",
  min: "identity.sheetFacts.min",
  altRecoveryCost: "identity.sheetFacts.altRecoveryCost",
  amount: "identity.sheetFacts.amount",
  fromTracker: "identity.sheetFacts.fromTracker",
  actions: "identity.sheetFacts.actions",
  type: "identity.sheetFacts.type",
  description: "identity.sheetFacts.description",
  trackerCost: "identity.sheetFacts.trackerCost",
  costTracker: "identity.sheetFacts.costTracker",
  requiresActionThisTurn: "identity.sheetFacts.requiresActionThisTurn",
  requiresOutcomeThisTurn: "identity.sheetFacts.requiresOutcomeThisTurn",
  requiresActionCategoryThisTurn: "identity.sheetFacts.requiresActionCategoryThisTurn",
  maxUsesPerTurn: "identity.sheetFacts.maxUsesPerTurn",
  race: "identity.sheetFacts.race",
  alignment: "identity.sheetFacts.alignment",
  abilityBudget: "identity.sheetFacts.abilityBudget",
  humanOriginFeat: "identity.sheetFacts.humanOriginFeat",
  bgFeat: "identity.sheetFacts.bgFeat",
  hitDieType: "identity.sheetFacts.hitDieType",
  customLanguages: "identity.sheetFacts.customLanguages",
  customToolProficiencies: "identity.sheetFacts.customToolProficiencies",
  toolChoices: "identity.sheetFacts.toolChoices",
  customs: "identity.sheetFacts.customs",
  conditions: "identity.sheetFacts.conditions",
  asi: "identity.sheetFacts.asi",
  originFeats: "identity.sheetFacts.originFeats",
  species: "identity.sheetFacts.species",
  overrides: "identity.sheetFacts.overrides",
  initiativeAdvantage: "identity.sheetFacts.initiativeAdvantage",
  proficiencyBonus: "identity.sheetFacts.proficiencyBonus",
  hitDiceTotal: "identity.sheetFacts.hitDiceTotal",
  passivePerception: "identity.sheetFacts.passivePerception",
  passiveInsight: "identity.sheetFacts.passiveInsight",
  passiveInvestigation: "identity.sheetFacts.passiveInvestigation",
  saves: "identity.sheetFacts.saves",
  skillBonuses: "identity.sheetFacts.skillBonuses",
  senseRanges: "identity.sheetFacts.senseRanges",
  speeds: "identity.sheetFacts.speeds",
  damageResistances: "identity.sheetFacts.damageResistances",
  damageImmunities: "identity.sheetFacts.damageImmunities",
  damageVulnerabilities: "identity.sheetFacts.damageVulnerabilities",
  conditionImmunities: "identity.sheetFacts.conditionImmunities",
  armorProficiencies: "identity.sheetFacts.armorProficiencies",
  weaponProficiencies: "identity.sheetFacts.weaponProficiencies",
  combatAlgorithm: "identity.sheetFacts.combatAlgorithm",
  steps: "identity.sheetFacts.steps",
  question: "identity.sheetFacts.question",
  indent: "identity.sheetFacts.indent",
  bullets: "identity.sheetFacts.bullets",
  concentrationCastLevel: "identity.sheetFacts.concentrationCastLevel",
  inspiration: "identity.sheetFacts.inspiration",
  deathSucc: "identity.sheetFacts.deathSucc",
  deathFail: "identity.sheetFacts.deathFail",
  initiative: "identity.sheetFacts.initiative",
  hiddenDc: "identity.sheetFacts.hiddenDc",
  bardicInspirationDie: "identity.sheetFacts.bardicInspirationDie",
  concentrationConditions: "identity.sheetFacts.concentrationConditions",
  activeFeatures: "identity.sheetFacts.activeFeatures",
  activeSpellCastLevels: "identity.sheetFacts.activeSpellCastLevels",
  grantBundleChoices: "identity.sheetFacts.grantBundleChoices",
  companionHp: "identity.sheetFacts.companionHp",
  companionVariant: "identity.sheetFacts.companionVariant",
  familiar: "identity.sheetFacts.familiar",
  monsterId: "identity.sheetFacts.monsterId",
  creatureType: "identity.sheetFacts.creatureType",
  dismissed: "identity.sheetFacts.dismissed",
  sessionDefenses: "identity.sheetFacts.sessionDefenses",
  effectTimers: "identity.sheetFacts.effectTimers",
  roundsLeft: "identity.sheetFacts.roundsLeft",
  effectBoundaries: "identity.sheetFacts.effectBoundaries",
  round: "identity.sheetFacts.round",
  phase: "identity.sheetFacts.phase",
  manifestedWeaponOverrides: "identity.sheetFacts.manifestedWeaponOverrides",
  pactWeaponRiderTypes: "identity.sheetFacts.pactWeaponRiderTypes",
  rolls: "identity.sheetFacts.rolls",
  usedSlots: "identity.sheetFacts.usedSlots",
};

const damageTypesKeys: Readonly<Record<string, string>> = {
  acid: "identity.damageTypes.acid",
  bludgeoning: "identity.damageTypes.bludgeoning",
  cold: "identity.damageTypes.cold",
  fire: "identity.damageTypes.fire",
  force: "identity.damageTypes.force",
  lightning: "identity.damageTypes.lightning",
  necrotic: "identity.damageTypes.necrotic",
  piercing: "identity.damageTypes.piercing",
  poison: "identity.damageTypes.poison",
  psychic: "identity.damageTypes.psychic",
  radiant: "identity.damageTypes.radiant",
  slashing: "identity.damageTypes.slashing",
  thunder: "identity.damageTypes.thunder",
};

const abilitiesKeys: Readonly<Record<string, string>> = {
  str: "identity.abilities.str",
  dex: "identity.abilities.dex",
  con: "identity.abilities.con",
  int: "identity.abilities.int",
  wis: "identity.abilities.wis",
  cha: "identity.abilities.cha",
};

const skillsKeys: Readonly<Record<string, string>> = {
  acrobatics: "identity.skills.acrobatics",
  "animal-handling": "identity.skills.animal-handling",
  arcana: "identity.skills.arcana",
  athletics: "identity.skills.athletics",
  deception: "identity.skills.deception",
  history: "identity.skills.history",
  insight: "identity.skills.insight",
  intimidation: "identity.skills.intimidation",
  investigation: "identity.skills.investigation",
  medicine: "identity.skills.medicine",
  nature: "identity.skills.nature",
  perception: "identity.skills.perception",
  performance: "identity.skills.performance",
  persuasion: "identity.skills.persuasion",
  religion: "identity.skills.religion",
  "sleight-of-hand": "identity.skills.sleight-of-hand",
  stealth: "identity.skills.stealth",
  survival: "identity.skills.survival",
};

const scalar = (value: Json | undefined): string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";

const record = (value: Json | undefined): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : []);

/** Read-only presentation of the authorized imported facts; no legacy engine or editable store. */
export function IdentitySheet({
  character,
  originProjection,
}: {
  character: Readonly<FolioCharacter>;
  originProjection?: OriginProjection;
}) {
  const { t, i18n } = useTranslation("common");
  const text = (key: string) => t(sheetKeys[key] ?? "identity.sheet.unnamed");
  const catalogues = srdCatalogues(i18n.language.startsWith("it") ? "it" : "en");
  const name = (kind: SrdKind, id: Json | undefined) => {
    if (typeof id !== "string") return "";
    const translated = catalogues?.[kind]?.[id]?.name;
    return typeof translated === "string" ? translated : id;
  };
  const knownName = (value: string) => {
    const abilityKey = abilitiesKeys[value.toLowerCase()];
    if (abilityKey) return t(abilityKey);
    if (damageTypesKeys[value]) return t(damageTypesKeys[value]);
    if (skillsKeys[value]) return t(skillsKeys[value]);
    for (const catalogue of Object.values(catalogues ?? {})) {
      const found = catalogue[value]?.name;
      if (typeof found === "string") return found;
    }
    return value;
  };
  const detailLabel = (key: string) => {
    const translation = sheetKeys[key] ?? detailKeys[key];
    return translation ? t(translation) : knownName(key);
  };
  const present = (value: Json, field = ""): ReactNode => {
    if (value === null) return t(detailKeys.automatic ?? "identity.sheet.unnamed");
    if (typeof value === "boolean")
      return t(value ? "identity.sheetFacts.yes" : "identity.sheetFacts.no");
    if (typeof value === "string") return knownName(value);
    if (typeof value === "number") return value;
    if (Array.isArray(value))
      return value.length ? (
        <ul>
          {value.map((entry, index) => (
            <li key={index}>{present(entry, field)}</li>
          ))}
        </ul>
      ) : (
        text("noneRecorded")
      );
    return (
      <dl className="identity-facts">
        {Object.entries(value).map(([key, entry]) => (
          <div key={key}>
            <dt>{detailLabel(key)}</dt>
            <dd>{present(entry, key)}</dd>
          </div>
        ))}
      </dl>
    );
  };
  const remaining = (value: JsonObject, shown: readonly string[]) =>
    Object.fromEntries(Object.entries(value).filter(([key]) => !shown.includes(key)));
  const details = (value: JsonObject) =>
    Object.keys(value).length > 0 ? present(value) : null;
  const { build, state } = character.sheet;
  const abilities = originProjection
    ? Object.fromEntries(
        Object.entries(originProjection.abilities).map(([ability, score]) => [
          ability.slice(0, 3).toUpperCase(),
          score,
        ])
      )
    : record(build.abilities);
  const hp = record(state.hp);
  const customs = record(build.customs);
  const trackers = record(state.trackers);
  const usedSlots = record(state.usedSlots);
  const overrides = record(build.overrides);
  const entries = (key: string) => [...list(build[key]), ...list(customs[key])];
  const collection = (key: string, kind: SrdKind) => {
    const values = entries(key);
    return (
      <details className="identity-sheet-section" open>
        <summary>
          {text(key)} <span>{values.length}</span>
        </summary>
        {values.length ? (
          <ul className="identity-sheet-entries">
            {values.map((value, index) => {
              const source = record(value);
              const reference =
                typeof source.srdId === "string" && !source.custom
                  ? catalogues?.[kind]?.[source.srdId]
                  : undefined;
              const item = { ...reference, ...source };
              const itemName =
                typeof source.name === "string"
                  ? source.name
                  : typeof source.title === "string"
                    ? source.title
                    : typeof item.srdId === "string"
                      ? name(kind, item.srdId)
                      : typeof item.name === "string"
                        ? item.name
                        : typeof item.title === "string"
                          ? item.title
                          : text("unnamed");
              return (
                <li key={scalar(item.instanceId ?? item.srdId ?? index)}>
                  <details>
                    <summary>
                      <strong>{itemName}</strong>
                      {typeof item.quantity === "number" && (
                        <span>× {item.quantity}</span>
                      )}
                      {item.equipped === true && <small>{text("equipped")}</small>}
                      {item.prepared === true && <small>{text("prepared")}</small>}
                    </summary>
                    <dl className="identity-facts">
                      {[
                        "level",
                        "castingTime",
                        "range",
                        "duration",
                        "damageDie",
                        "damageType",
                        "acBonus",
                        "attackBonusOverride",
                        "recovery",
                      ].map((field) => {
                        const v = item[field];
                        return typeof v === "number" || typeof v === "string" ? (
                          <div key={field}>
                            <dt>{text(field)}</dt>
                            <dd>
                              {field === "damageType" && typeof v === "string"
                                ? damageTypesKeys[v]
                                  ? t(damageTypesKeys[v])
                                  : v
                                : scalar(v)}
                            </dd>
                          </div>
                        ) : null;
                      })}
                    </dl>
                    {details(
                      remaining(source, [
                        "instanceId",
                        "srdId",
                        "custom",
                        "name",
                        "title",
                        "quantity",
                        "level",
                        "castingTime",
                        "range",
                        "duration",
                        "damageDie",
                        "damageType",
                        "acBonus",
                        "attackBonusOverride",
                        "recovery",
                        "description",
                        "contentBlocks",
                      ])
                    )}
                    {typeof item.description === "string" && (
                      <p className="identity-preserve-lines">{item.description}</p>
                    )}
                    {list(item.contentBlocks).map((block, n) => {
                      const b = record(block);
                      return (
                        <div key={n}>
                          {typeof b.title === "string" && <h4>{b.title}</h4>}
                          {typeof b.text === "string" && (
                            <p className="identity-preserve-lines">{b.text}</p>
                          )}
                          {Object.keys(record(b.table)).length > 0 && (
                            <table>
                              {typeof b.title === "string" && (
                                <caption>{b.title}</caption>
                              )}
                              <thead>
                                <tr>
                                  {list(record(b.table).headers).map((header, i) => (
                                    <th key={i}>{scalar(header)}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {list(record(b.table).rows).map((row, i) => (
                                  <tr key={i}>
                                    {list(row).map((cell, j) => (
                                      <td key={j}>{scalar(cell)}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {list(b.items).length > 0 && (
                            <ul>
                              {list(b.items).map((v, j) => (
                                <li key={j}>{typeof v === "string" ? v : ""}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{text("noneRecorded")}</p>
        )}
      </details>
    );
  };
  return (
    <section className="identity-sheet">
      <h3>{t("identity.characterDetails")}</h3>
      {originProjection && !originProjection.available && (
        <p role="status">{t("homebrewV2.origin.missingAbilityHelp")}</p>
      )}
      <dl className="identity-abilities">
        {Object.entries(abilities).map(([key, value]) => (
          <div key={key}>
            <dt>{t(abilitiesKeys[key.toLowerCase()] ?? "identity.sheet.unnamed")}</dt>
            <dd>{value === null ? "—" : scalar(value)}</dd>
          </div>
        ))}
      </dl>
      <dl className="identity-facts">
        <div>
          <dt>{text("classes")}</dt>
          <dd>
            {list(build.classes).map((entry, index) => {
              const c = record(entry);
              return (
                <span key={index}>
                  {name("class", c.classId)} {scalar(c.level ?? "")}
                  {c.subclassId ? " · " + name("subclass", c.subclassId) : ""}
                  {index < list(build.classes).length - 1 ? ", " : ""}
                </span>
              );
            })}
          </dd>
        </div>
        {typeof build.background === "string" && (
          <div>
            <dt>{text("background")}</dt>
            <dd>
              {originProjection?.background.selectionId
                ? originProjection.background.name
                : name("background", build.background)}
            </dd>
          </div>
        )}
        {typeof hp.current === "number" && (
          <div>
            <dt>{text("hpCurrent")}</dt>
            <dd>{hp.current}</dd>
          </div>
        )}
        {typeof hp.temp === "number" && (
          <div>
            <dt>{text("hpTemp")}</dt>
            <dd>{hp.temp}</dd>
          </div>
        )}
        {typeof state.exhaustion === "number" && (
          <div>
            <dt>{text("exhaustion")}</dt>
            <dd>{state.exhaustion}</dd>
          </div>
        )}
      </dl>
      {list(state.conditions).length > 0 && (
        <p>
          {text("conditions")}:{" "}
          {list(state.conditions)
            .map((value) => name("condition", value))
            .join(", ")}
        </p>
      )}
      <details className="identity-sheet-section" open>
        <summary>{text("resources")}</summary>
        <dl className="identity-facts">
          {["speed", "proficiencyBonusOverride"].map(
            (key) =>
              typeof build[key] === "number" && (
                <div key={key}>
                  <dt>{text(key)}</dt>
                  <dd>{scalar(build[key])}</dd>
                </div>
              )
          )}
          {["ac", "hpMax", "speed", "initiativeBonus"].map(
            (key) =>
              typeof overrides[key] === "number" && (
                <div key={key}>
                  <dt>{text(key)}</dt>
                  <dd>{scalar(overrides[key])}</dd>
                </div>
              )
          )}
          {Object.entries(record(state.currency)).map(([key, value]) => (
            <div key={key}>
              <dt>{text(key)}</dt>
              <dd>{scalar(value)}</dd>
            </div>
          ))}
          {typeof state.usedHitDice === "number" && (
            <div>
              <dt>{text("usedHitDice")}</dt>
              <dd>{state.usedHitDice}</dd>
            </div>
          )}
        </dl>
        {list(build.spellSlots).length > 0 && (
          <table>
            <caption>{text("spellSlots")}</caption>
            <thead>
              <tr>
                <th>{text("level")}</th>
                <th>{text("used")}</th>
                <th>{text("total")}</th>
              </tr>
            </thead>
            <tbody>
              {list(build.spellSlots).map((value, index) => {
                const slot = record(value);
                return (
                  <tr key={index}>
                    <td>
                      {scalar(slot.level)}
                      {slot.pactMagic ? " · " + text("pactMagic") : ""}
                    </td>
                    <td>
                      {scalar(
                        usedSlots[(slot.pactMagic ? "pact-" : "") + scalar(slot.level)] ??
                          0
                      )}
                    </td>
                    <td>{scalar(slot.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </details>
      {Object.keys(record(build.skills)).length > 0 && (
        <details className="identity-sheet-section" open>
          <summary>{text("skills")}</summary>
          <dl className="identity-facts">
            {Object.entries(record(build.skills)).map(([key, value]) => (
              <div key={key}>
                <dt>{skillsKeys[key] ? t(skillsKeys[key]) : key}</dt>
                <dd>
                  {typeof value === "boolean"
                    ? text(value ? "proficient" : "notProficient")
                    : typeof value === "string" &&
                        ["proficient", "expertise", "halfProficiency"].includes(value)
                      ? text(value)
                      : scalar(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <details className="identity-sheet-section" open>
        <summary>{text("proficiencies")}</summary>
        <dl className="identity-facts">
          {[
            ["languageIds", "language"],
            ["toolProficiencyIds", "proficiency"],
            ["savingThrows", null],
          ].map(
            ([key, kind]) =>
              key && (
                <div key={key}>
                  <dt>{text(key)}</dt>
                  <dd>
                    {list(build[key])
                      .map((v) =>
                        kind
                          ? name(kind as SrdKind, v)
                          : t(
                              abilitiesKeys[scalar(v).toLowerCase()] ??
                                "identity.sheet.unnamed"
                            )
                      )
                      .join(", ") || text("noneRecorded")}
                  </dd>
                </div>
              )
          )}
        </dl>
      </details>
      {collection("weapons", "equipment")}
      {collection("equipment", "equipment")}
      {collection("spells", "spell")}
      {collection("features", "class-feature")}
      <details className="identity-sheet-section" open>
        <summary>{t("identity.sheetFacts.buildDetails")}</summary>
        {list(build.classes).map((entry, index) => {
          const c = record(entry);
          const choices = remaining(c, ["classId", "subclassId", "level"]);
          return Object.keys(choices).length ? (
            <section key={index}>
              <h4>{name("class", c.classId)}</h4>
              {details(choices)}
            </section>
          ) : null;
        })}
        {details(
          remaining(build, [
            "abilities",
            "classes",
            "background",
            "speed",
            "proficiencyBonusOverride",
            "skills",
            "spellSlots",
            "languageIds",
            "toolProficiencyIds",
            "savingThrows",
            "weapons",
            "equipment",
            "spells",
            "features",
            "customs",
          ])
        )}
        {details(remaining(customs, ["weapons", "equipment", "spells", "features"]))}
      </details>
      <details className="identity-sheet-section" open>
        <summary>{t("identity.sheetFacts.stateDetails")}</summary>
        {details(
          remaining(state, [
            "hp",
            "currency",
            "conditions",
            "exhaustion",
            "usedHitDice",
            "trackers",
          ])
        )}
        {Object.keys(trackers).length > 0 && details({ trackers })}
      </details>
      <p>{t("identity.inspectionScope")}</p>
      {originProjection &&
        (originProjection.baseline.superseded.length > 0 ||
          originProjection.baseline.unresolved.length > 0) && (
          <details className="identity-sheet-section">
            <summary>{t("homebrewV2.origin.importedBaseline")}</summary>
            <p>{t("homebrewV2.origin.baselineHelp")}</p>
            {(["superseded", "unresolved"] as const).map((status) =>
              originProjection.baseline[status].length > 0 ? (
                <section key={status}>
                  <h4>{t(`homebrewV2.origin.baselineStatus.${status}`)}</h4>
                  <ul>
                    {originProjection.baseline[status].map((path) => (
                      <li key={path}>
                        {t(
                          homebrewKey(`origin.baselineFacts.${path.replaceAll(".", "_")}`)
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null
            )}
            {details(originProjection.baseline.build)}
          </details>
        )}
    </section>
  );
}
