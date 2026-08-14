/** Test-only composition adapter for the exact automation corpus. */

import { STARTING_EQUIPMENT_BY_BG } from "@/data/background-equipment";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { BEASTS } from "@/data/beasts";
import { classFeatures, classTables } from "@/data/classes";
import {
  MOUNTED_COMBAT_REFERENCE,
  UNDERWATER_COMBAT_REFERENCE,
} from "@/data/combat-variants";
import { SRD_CONDITIONS } from "@/data/conditions";
import { COVER_REFERENCE } from "@/data/cover";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_FEATS } from "@/data/feats";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { SRD_MANEUVERS } from "@/data/maneuvers";
import { SRD_METAMAGIC } from "@/data/metamagic";
import { SRD_RACES } from "@/data/races";
import { spells } from "@/data/spells";
import { TRAVEL_PACE_REFERENCE } from "@/data/travel-pace";
import type { MonsterEntry, MonsterStatBlock } from "@/data/types";
import { loadLazySrdKind, loadSrdCatalogues } from "@/i18n/loaders";
import {
  compileAutomationCorpus,
  type AutomationCorpusAudit,
  type AutomationCorpusEntity,
  type AutomationCorpusManualPresenter,
  type AutomationCorpusPresenter,
  type AutomationCorpusSchema,
} from "@/lib/automation-corpus";
import {
  srdCatalogues,
  type EagerSrdKind,
  type SrdCatalogue,
  type SrdCatalogueSet,
  type SrdLeaf,
} from "@/i18n/srd-en";

type CatalogueKind = EagerSrdKind | "monster";
type CatalogueRecord = Record<string, SrdLeaf>;

interface CatalogueClaims {
  en: SrdCatalogueSet & { monster: SrdCatalogue };
  it: SrdCatalogueSet & { monster: SrdCatalogue };
  claimed: Record<CatalogueKind, Set<string>>;
}

const AUDITED_CATALOGUES: readonly CatalogueKind[] = [
  "spell",
  "feat",
  "race",
  "background",
  "condition",
  "equipment",
  "magic-item",
  "maneuver",
  "metamagic",
  "invocation",
  "class",
  "subclass",
  "class-feature",
  "weapon-mastery",
  "language",
  "proficiency",
  "weapon-property",
  "beasts",
  "monster",
];

function asRecord(value: object): Readonly<Record<string, unknown>> {
  return value as unknown as Readonly<Record<string, unknown>>;
}

function entity(
  entityKey: string,
  schema: AutomationCorpusSchema,
  data: object,
  presenters: ReadonlyArray<AutomationCorpusPresenter> = [],
  manualPresenters?: Readonly<Record<string, AutomationCorpusManualPresenter>>
): AutomationCorpusEntity {
  return {
    entityKey,
    schema,
    data: asRecord(data),
    presenters,
    ...(manualPresenters === undefined ? {} : { manualPresenters }),
  };
}

function catalogue(claims: CatalogueClaims, locale: "en" | "it", kind: CatalogueKind) {
  return claims[locale][kind];
}

function catalogueKeys(claims: CatalogueClaims, kind: CatalogueKind): string[] {
  return [
    ...new Set([
      ...Object.keys(catalogue(claims, "en", kind)),
      ...Object.keys(catalogue(claims, "it", kind)),
    ]),
  ].sort();
}

function presenterForKey(
  claims: CatalogueClaims,
  kind: CatalogueKind,
  key: string
): AutomationCorpusPresenter {
  claims.claimed[kind].add(key);
  return {
    keyPrefix: `${kind}.${key}`,
    localized: [catalogue(claims, "en", kind)[key], catalogue(claims, "it", kind)[key]],
  };
}

function presentersForPrefix(
  claims: CatalogueClaims,
  kind: CatalogueKind,
  prefix: string
): AutomationCorpusPresenter[] {
  const matches = catalogueKeys(claims, kind).filter(
    (key) => key === prefix || key.startsWith(`${prefix}.`)
  );
  if (matches.length === 0) return [presenterForKey(claims, kind, prefix)];
  return matches.map((key) => presenterForKey(claims, kind, key));
}

function presenterText(record: CatalogueRecord | undefined, field: string): boolean {
  const value = record?.[field];
  return typeof value === "string" && value.trim().length > 0;
}

function beastTraitPresenters(
  claims: CatalogueClaims,
  traits: ReadonlyArray<string>
): Record<string, AutomationCorpusManualPresenter> {
  const presenters: Record<string, AutomationCorpusManualPresenter> = {};
  traits.forEach((trait, index) => {
    claims.claimed.beasts.add(trait);
    const en = catalogue(claims, "en", "beasts")[trait];
    const it = catalogue(claims, "it", "beasts")[trait];
    presenters[`traits[${index}]`] = {
      key: `beasts.${trait}.name`,
      resolvedLocales: (["en", "it"] as const).filter((locale) =>
        presenterText(locale === "en" ? en : it, "name")
      ),
    };
  });
  return presenters;
}

const MONSTER_SECTIONS = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
] as const;

function monsterEntries(
  claims: CatalogueClaims,
  monster: MonsterStatBlock
): AutomationCorpusEntity[] {
  const entries: AutomationCorpusEntity[] = [];
  for (const section of MONSTER_SECTIONS) {
    const rows: ReadonlyArray<MonsterEntry> = monster[section] ?? [];
    for (const row of rows) {
      const presenterKey = `${monster.id}.${section}.${row.id}`;
      entries.push(
        entity(`monster-entry:${monster.id}:${section}:${row.id}`, "monster-entry", row, [
          presenterForKey(claims, "monster", presenterKey),
        ])
      );
    }
  }
  return entries;
}

function catalogueRuleEntities(
  claims: CatalogueClaims,
  kind: CatalogueKind
): AutomationCorpusEntity[] {
  return catalogueKeys(claims, kind).map((key) =>
    entity(`catalogue-rule:${kind}:${key}`, "catalogue-rule", { id: key }, [
      presenterForKey(claims, kind, key),
    ])
  );
}

function unclaimedCatalogueRuleEntities(
  claims: CatalogueClaims,
  kind: CatalogueKind
): AutomationCorpusEntity[] {
  return catalogueKeys(claims, kind)
    .filter((key) => !claims.claimed[kind].has(key))
    .map((key) =>
      entity(`catalogue-rule:${kind}:${key}`, "catalogue-rule", { id: key }, [
        presenterForKey(claims, kind, key),
      ])
    );
}

function assertEveryCatalogueEntryClaimed(claims: CatalogueClaims): void {
  const unclaimed: string[] = [];
  for (const kind of AUDITED_CATALOGUES) {
    for (const key of catalogueKeys(claims, kind)) {
      if (!claims.claimed[kind].has(key)) unclaimed.push(`${kind}.${key}`);
    }
  }
  if (unclaimed.length > 0) {
    throw new Error(
      `unclaimed automation catalogue entries:\n${unclaimed.sort().join("\n")}`
    );
  }
}

function makeClaims(
  en: SrdCatalogueSet,
  it: SrdCatalogueSet,
  enMonsters: SrdCatalogue,
  itMonsters: SrdCatalogue
): CatalogueClaims {
  return {
    en: { ...en, monster: enMonsters },
    it: { ...it, monster: itMonsters },
    claimed: Object.fromEntries(
      AUDITED_CATALOGUES.map((kind) => [kind, new Set<string>()])
    ) as Record<CatalogueKind, Set<string>>,
  };
}

/**
 * Build roots from the exact current composition. In SRD-only mode `@pack`
 * resolves to the typed-empty module; in composed mode these same imports hold
 * the pack too. No ids are subtracted in either mode.
 */
export async function buildCurrentAutomationCorpus(): Promise<AutomationCorpusEntity[]> {
  const en = srdCatalogues("en");
  if (en === undefined) throw new Error("English SRD catalogue is not registered");
  const [it, enMonsters, itMonsters, monsterModule] = await Promise.all([
    loadSrdCatalogues("it"),
    loadLazySrdKind("en", "monster"),
    loadLazySrdKind("it", "monster"),
    import("@/data/monsters"),
  ]);
  const claims = makeClaims(en, it, enMonsters, itMonsters);
  const entities: AutomationCorpusEntity[] = [];

  for (const spell of spells) {
    entities.push(
      entity(
        `spell:${spell.id}`,
        "spell",
        spell,
        presentersForPrefix(claims, "spell", spell.id)
      )
    );
  }
  for (const table of classTables) {
    entities.push(
      entity(`class:${table.id}`, "class", table, [
        presenterForKey(claims, "class", table.id),
      ])
    );
    for (const subclass of table.subclasses) {
      entities.push(
        entity(`subclass:${table.id}:${subclass.id}`, "subclass", subclass, [
          presenterForKey(claims, "subclass", subclass.id),
        ])
      );
    }
  }
  for (const feature of classFeatures) {
    entities.push(
      entity(
        `class-feature:${feature.id}`,
        "class-feature",
        feature,
        presentersForPrefix(claims, "class-feature", feature.id)
      )
    );
  }
  for (const feat of SRD_FEATS) {
    entities.push(
      entity(
        `feat:${feat.id}`,
        "feat",
        feat,
        presentersForPrefix(claims, "feat", feat.id)
      )
    );
  }
  for (const race of SRD_RACES) {
    entities.push(
      entity(`race:${race.id}`, "race", race, [presenterForKey(claims, "race", race.id)])
    );
    for (const trait of race.traits) {
      const prefix = `${race.id}.traits.${trait.id}`;
      entities.push(
        entity(
          `race-trait:${race.id}:${trait.id}`,
          "race-trait",
          trait,
          presentersForPrefix(claims, "race", prefix)
        )
      );
    }
  }
  for (const background of SRD_BACKGROUNDS) {
    const startingEquipment = STARTING_EQUIPMENT_BY_BG[background.id];
    if (startingEquipment === undefined) {
      throw new Error(`background equipment missing: ${background.id}`);
    }
    if (background.startingEquipment !== startingEquipment) {
      throw new Error(`background equipment composition drift: ${background.id}`);
    }
    entities.push(
      entity(
        `background:${background.id}`,
        "background",
        background,
        presentersForPrefix(claims, "background", background.id)
      )
    );
  }
  const backgroundIds = new Set(SRD_BACKGROUNDS.map(({ id }) => id));
  for (const id of Object.keys(STARTING_EQUIPMENT_BY_BG)) {
    if (!backgroundIds.has(id)) throw new Error(`orphan background equipment: ${id}`);
  }
  for (const item of SRD_EQUIPMENT) {
    entities.push(
      entity(
        `equipment:${item.id}`,
        "equipment",
        item,
        presentersForPrefix(claims, "equipment", item.id)
      )
    );
  }
  for (const item of SRD_MAGIC_ITEMS) {
    entities.push(
      entity(
        `magic-item:${item.id}`,
        "magic-item",
        item,
        presentersForPrefix(claims, "magic-item", item.id)
      )
    );
  }
  for (const invocation of SRD_INVOCATIONS) {
    entities.push(
      entity(
        `invocation:${invocation.id}`,
        "invocation",
        invocation,
        presentersForPrefix(claims, "invocation", invocation.id)
      )
    );
  }
  for (const option of SRD_METAMAGIC) {
    entities.push(
      entity(
        `metamagic:${option.id}`,
        "metamagic",
        option,
        presentersForPrefix(claims, "metamagic", option.id)
      )
    );
  }
  for (const maneuver of SRD_MANEUVERS) {
    entities.push(
      entity(
        `maneuver:${maneuver.id}`,
        "maneuver",
        maneuver,
        presentersForPrefix(claims, "maneuver", maneuver.id)
      )
    );
  }
  for (const condition of SRD_CONDITIONS) {
    entities.push(
      entity(`condition:${condition.id}`, "condition", condition, [
        presenterForKey(claims, "condition", condition.id),
      ])
    );
  }
  for (const beast of BEASTS) {
    entities.push(
      entity(
        `beast:${beast.id}`,
        "beast",
        beast,
        [presenterForKey(claims, "beasts", beast.id)],
        beastTraitPresenters(claims, beast.traits ?? [])
      )
    );
  }
  for (const monster of monsterModule.MONSTERS) {
    entities.push(
      entity(`monster:${monster.id}`, "monster", monster, [
        presenterForKey(claims, "monster", monster.id),
      ]),
      ...monsterEntries(claims, monster)
    );
  }

  entities.push(
    ...COVER_REFERENCE.map((rule) => entity(`cover-rule:${rule.id}`, "cover-rule", rule)),
    ...MOUNTED_COMBAT_REFERENCE.map((rule) =>
      entity(`mounted-rule:${rule.id}`, "narrative-rule", rule)
    ),
    ...UNDERWATER_COMBAT_REFERENCE.map((rule) =>
      entity(`underwater-rule:${rule.id}`, "narrative-rule", rule)
    ),
    ...TRAVEL_PACE_REFERENCE.map((rule) =>
      entity(`travel-rule:${rule.id}`, "travel-rule", rule)
    ),
    ...unclaimedCatalogueRuleEntities(claims, "equipment"),
    ...catalogueRuleEntities(claims, "weapon-mastery"),
    ...catalogueRuleEntities(claims, "language"),
    ...catalogueRuleEntities(claims, "proficiency"),
    ...catalogueRuleEntities(claims, "weapon-property")
  );

  // Shared attack-name rows are identity only. Trait-name rows were claimed as
  // manual evidence by the exact beast path that uses them.
  for (const key of catalogueKeys(claims, "beasts")) {
    if (!claims.claimed.beasts.has(key)) {
      entities.push(
        entity(`catalogue-rule:beasts:${key}`, "catalogue-rule", { id: key }, [
          presenterForKey(claims, "beasts", key),
        ])
      );
    }
  }

  assertEveryCatalogueEntryClaimed(claims);
  return entities;
}

let currentAudit: Promise<AutomationCorpusAudit> | undefined;

export function auditCurrentAutomationCorpus(): Promise<AutomationCorpusAudit> {
  if (currentAudit === undefined) {
    currentAudit = buildCurrentAutomationCorpus().then(compileAutomationCorpus);
  }
  return currentAudit;
}
