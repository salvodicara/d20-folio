/**
 * Companion presenter (R2) — the ONE enumerate + resolve + localize seam for every
 * feature-declared companion (Artificer Steel Defender / Eldritch Cannon, Beast
 * Master Primal Companion, and the creature a spell summons — Find Steed's
 * Otherworldly Steed, Summon Dragon's Draconic Spirit, pack Homunculus Servant). Both mounts read it, so the Features-tab card and the
 * Companions rail section agree BY CONSTRUCTION (golden rule 6), and the Beast
 * Master's Land/Sea/Sky variant pick (`session.companionVariant`) is finally a live
 * consumer of `selectCompanionVariant` (closing the documented dead-code gap).
 *
 * Pure presenter: `(engine output + locale) → view-model`. It localizes SRD content
 * through the catalogue seams (`localizeSrd`/`hasSrd`) + the `srd.damage_*` chrome —
 * the only engine-side layer allowed to localize (docs/ARCHITECTURE.md). No React,
 * store, or Firebase. The FAMILIAR is a separate contract (its own stat block lives
 * on the monster corpus, rendered by `MonsterStatBlockCard` in the lazy leaf) — it
 * never passes through this presenter; the rail reads `session.familiar` directly
 * and mounts that lazy leaf.
 */

import type { CharacterDoc, SessionState } from "@/types/character";
import type { AbilityCode, BestiaryPickRule, CompanionStatBlock } from "@/data/types";
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import { classEntryLevel, totalLevel } from "@/lib/classes";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  effectiveSpellAttackBonus,
  resolveCastingModifier,
  resolveCompanion,
  selectCompanionVariant,
  aggregateAbilityScores,
} from "@/lib/compute";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { srdKey } from "@/i18n/srd-key";
import type { Locale } from "@/lib/locale";
import { formatSpeed, localeDistance } from "@/lib/utils";
import { abilityModifier } from "@/lib/ability";
import { summonCount, summonInstanceKey } from "@/lib/summon-count";

/** The translator (chrome keys only — `srd.damage_*`). */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** One resolved + localized companion attack row. */
export interface CompanionAttackView {
  id: string;
  name: string;
  /** Signed to-hit (owner spell-attack mod, or PB + companion ability). */
  attackBonus: number;
  /** Word-free dice + the LOCALIZED damage type ("1d8 + 3 Slashing"). */
  damage: string;
  /** Distance in feet — melee reach or (when `ranged`) range. */
  reachFt: number;
  ranged: boolean;
  rider?: string;
}

/** One variant option for the Land/Sea/Sky Segmented. */
export interface CompanionVariantOption {
  variantId: string;
  label: string;
}

/** The fully localized companion stat-block view both mounts render. */
export interface CompanionCardView {
  /** The granting source id (class-feature srdId or spell id) — the HP key; for one
   *  creature of a multi-creature summon, its instance key ("animate-objects#2"). */
  featureId: string;
  /** The granting source id — the variant/count key. Equals `featureId` except for
   *  one creature of a multi-creature summon; absent = `featureId`. */
  groupId?: string;
  /** How many creatures the group fields — present only on a multi-creature
   *  summon (Animate Objects); each creature is its own view, numbered. */
  count?: number;
  label: string;
  kind?: string;
  ac: number;
  speed?: string;
  hpMax: number;
  /** Current HP (session); `undefined` = full. */
  current?: number;
  attacks: CompanionAttackView[];
  /** Present when the companion offers a variant choice (Beast Master). */
  variants?: CompanionVariantOption[];
  /** The currently-active variant id (drives the Segmented + the resolved facts). */
  selectedVariantId?: string;
}

type Ns = "class-feature" | "spell";

/** The catalogue key prefix for a companion (or one of its variants). */
function variantPrefix(
  featureId: string,
  block: CompanionStatBlock,
  variantId: string | undefined
): string {
  const base = srdKey(featureId, "companion");
  // A non-default variant nests under `.variants.<variantId>`; the default block
  // (its `variantId` === the base block's) keys directly off `.companion`.
  if (variantId && variantId !== block.variantId) {
    return srdKey(base, "variants", variantId);
  }
  return base;
}

/** The localized Speed line: walking speed, then each other mode ("18 m, Volo 18 m"). */
function speedLabel(
  resolved: ReturnType<typeof resolveCompanion>,
  locale: Locale,
  t: Translate
): string | undefined {
  const parts: string[] = [];
  if (resolved.speeds.walk != null) {
    parts.push(localeDistance(resolved.speeds.walk, locale));
  } else if (resolved.speed) {
    parts.push(formatSpeed(resolved.speed, locale));
  }
  for (const mode of ["climb", "fly", "swim", "burrow"] as const) {
    const ft = resolved.speeds[mode];
    if (ft == null) continue;
    const label =
      mode === "burrow" ? t("polymorph.speedBurrow") : t(`character.speed_${mode}`);
    parts.push(`${label} ${localeDistance(ft, locale)}`);
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/** Resolve + localize ONE companion into its card view (the active variant applied). */
function buildOne(
  featureId: string,
  block: CompanionStatBlock,
  ns: Ns,
  session: SessionState,
  level: number,
  scores: Record<AbilityCode, number>,
  pbOverride: number | null | undefined,
  spellAttackMod: number | undefined,
  locale: Locale,
  t: Translate,
  spell?: { castLevel?: number; ownerMaxHp?: number; spellMod?: number }
): CompanionCardView[] {
  const selectedVariantId = session.companionVariant?.[featureId];
  const active = selectCompanionVariant(block, selectedVariantId);
  const resolved = resolveCompanion(
    active,
    level,
    scores,
    pbOverride,
    spellAttackMod,
    spell
  );
  const prefix = variantPrefix(featureId, block, active.variantId);

  const label = hasSrd(ns, prefix, "name", locale)
    ? localizeSrd(ns, prefix, "name", locale)
    : hasSrd(ns, featureId, "name", locale)
      ? localizeSrd(ns, featureId, "name", locale)
      : featureId;
  const kind = hasSrd(ns, prefix, "kind", locale)
    ? localizeSrd(ns, prefix, "kind", locale)
    : undefined;

  const attacks: CompanionAttackView[] = resolved.attacks.map((atk) => {
    const atkKey = srdKey(prefix, "attacks", atk.id);
    return {
      id: atk.id,
      name: hasSrd(ns, atkKey, "name", locale)
        ? localizeSrd(ns, atkKey, "name", locale)
        : atk.id,
      attackBonus: atk.attackBonus,
      damage: `${atk.damageDice} ${t(`srd.damage_${atk.damageType}`)}`,
      reachFt: atk.reachFt,
      ranged: atk.ranged,
      rider: hasSrd(ns, atkKey, "rider", locale)
        ? localizeSrd(ns, atkKey, "rider", locale)
        : undefined,
    };
  });

  const variants: CompanionVariantOption[] | undefined = block.variants?.map((v) => {
    const vp = variantPrefix(featureId, block, v.variantId);
    const vLabel = hasSrd(ns, vp, "variantLabel", locale)
      ? localizeSrd(ns, vp, "variantLabel", locale)
      : hasSrd(ns, vp, "name", locale)
        ? localizeSrd(ns, vp, "name", locale)
        : (v.variantId ?? "");
    return { variantId: v.variantId ?? "", label: vLabel };
  });

  const one: CompanionCardView = {
    featureId,
    groupId: featureId,
    label,
    kind,
    ac: resolved.ac,
    speed: speedLabel(resolved, locale, t),
    hpMax: resolved.hpMax,
    current: session.companionHp?.[featureId]?.current,
    attacks,
    variants,
    selectedVariantId: active.variantId,
  };
  if (!active.count) return [one];

  // Several creatures from one cast: one numbered view each, its own HP entry.
  const count =
    session.companionCount?.[featureId] ??
    summonCount(
      active.count,
      active.spellLevel?.base ?? 0,
      spell?.castLevel ?? active.spellLevel?.base ?? 0,
      spell?.spellMod ?? 0
    );
  return Array.from({ length: count }, (_, i) => {
    const key = summonInstanceKey(featureId, i + 1);
    return {
      ...one,
      featureId: key,
      label: `${label} ${i + 1}`,
      count,
      current: session.companionHp?.[key]?.current,
    };
  });
}

/**
 * Shared owner context for resolving companion AC / spell-attack / PB. The
 * aggregate rides along so the ONE `aggregateCharacterGrants` pass also serves the
 * spell-companion leg's always-prepared list (never a second aggregation).
 */
function ownerContext(doc: CharacterDoc): {
  level: number;
  scores: Record<AbilityCode, number>;
  pbOverride: number | null | undefined;
  spellAttackMod: number | undefined;
  spellMod: number;
  agg: ReturnType<typeof aggregateCharacterGrants>;
} {
  const charData = doc.character;
  const agg = aggregateCharacterGrants(charData, doc.session);
  const scores = aggregateAbilityScores(charData.abilityScores, agg);
  const sc = charData.spellcasting;
  const spellAttackMod = sc
    ? effectiveSpellAttackBonus(
        totalLevel(charData),
        scores[sc.ability],
        resolveCastingModifier(agg.spellAttackBonus, charData.classes[0]?.classId),
        sc.attackBonusOverride,
        doc.session.exhaustion,
        charData.proficiencyBonusOverride
      )
    : undefined;
  return {
    level: totalLevel(charData),
    scores,
    pbOverride: charData.proficiencyBonusOverride,
    spellAttackMod,
    spellMod: sc ? abilityModifier(scores[sc.ability]) : 0,
    agg,
  };
}

/**
 * Every feature-declared companion the character currently fields, localized. A
 * class feature's companion surfaces when the character has that feature (its owning
 * class ≥ its level, subclass matched); a spell's companion (pack Homunculus Servant)
 * surfaces when the spell is on the character (prepared or always-prepared).
 */
export function buildCompanionCardViews(
  doc: CharacterDoc,
  locale: Locale,
  t: Translate
): CompanionCardView[] {
  const { level, scores, pbOverride, spellAttackMod, spellMod, agg } = ownerContext(doc);
  const charData = doc.character;
  const views: CompanionCardView[] = [];

  // (a) Class features with a companion (Steel Defender / Eldritch Cannon / Primal
  //     Companion). Derived from the composed feature index — never a hand list.
  for (const feat of classFeatureIndex.values()) {
    if (!feat.companion) continue;
    if (classEntryLevel(charData, feat.class) < feat.level) continue;
    if (feat.subclass) {
      const entry = charData.classes.find((e) => e.classId === feat.class);
      if (entry?.subclassId !== feat.subclass) continue;
    }
    views.push(
      ...buildOne(
        feat.id,
        feat.companion,
        "class-feature",
        doc.session,
        level,
        scores,
        pbOverride,
        spellAttackMod,
        locale,
        t
      )
    );
  }

  // (b) Spells with a companion (Find Steed, Summon Dragon, Giant Insect, Phantom
  //     Steed, Arcane Hand; pack Homunculus Servant). A spell counts as "on the
  //     character" when it is prepared/known (a stored ref) OR always-prepared (a
  //     grant). A Concentration spell's creature exists only while the caster
  //     concentrates on it, so it shows only then, at the slot level it was cast
  //     with; any other spell's creature resolves at the spell's own level.
  const spellIds = new Set<string>(agg.alwaysPrepared);
  for (const ref of charData.spells) {
    if ("srdId" in ref) spellIds.add(ref.srdId);
  }
  const ownerMaxHp = charData.hp.max + agg.hpFlat;
  for (const spellId of spellIds) {
    const spell = getSpellById(spellId);
    if (!spell?.companion) continue;
    const concentrating = doc.session.concentration === spellId;
    if (spell.concentration && !concentrating) continue;
    views.push(
      ...buildOne(
        spellId,
        spell.companion,
        "spell",
        doc.session,
        level,
        scores,
        pbOverride,
        spellAttackMod,
        locale,
        t,
        {
          castLevel: concentrating ? doc.session.concentrationCastLevel : undefined,
          ownerMaxHp,
          spellMod,
        }
      )
    );
  }

  return views;
}

/** One spell's group of bestiary creatures (Animate Dead's Skeletons, Planar
 *  Ally's chosen ally). */
export interface SummonedMonsterGroup {
  /** The spell id — the variant/count key; creature `n` keys its HP `"<spellId>#<n>"`. */
  spellId: string;
  /** The monster ids the spell can raise (the first is the default); empty for a
   *  bestiary-pick spell, whose choice is the whole bestiary filtered by `pick`. */
  options: string[];
  /** The chosen monster id (`session.companionVariant`, else the first option);
   *  undefined while a bestiary-pick spell has no creature chosen yet. */
  monsterId?: string;
  /** Present on a bestiary-pick spell (Planar Ally, Gate): the creatures it allows. */
  pick?: BestiaryPickRule;
  /** How many the player fields (`session.companionCount`, else the spell's count
   *  at the spell's own level). */
  count: number;
  /** Creature `n` (index n - 1) → its stored current HP; undefined = full. */
  current: ReadonlyArray<number | undefined>;
}

/**
 * Every spell on the character that raises bestiary creatures (Animate Dead,
 * Create Undead) or brings one the caster picks (Planar Ally, Planar Binding,
 * Gate, Awaken), resolved to the monster ids, the count and each creature's HP. A
 * Concentration pick (Gate) shows only while the caster concentrates on it.
 * Corpus-free (the eager rail reads it); the lazy leaf looks the monsters up. `agg`
 * is the caller's grant aggregate when it already holds one (never a second pass).
 */
export function buildSummonedMonsterGroups(
  doc: CharacterDoc,
  agg: { alwaysPrepared: Iterable<string> } = aggregateCharacterGrants(
    doc.character,
    doc.session
  )
): SummonedMonsterGroup[] {
  const spellIds = new Set<string>(agg.alwaysPrepared);
  for (const ref of doc.character.spells) {
    if ("srdId" in ref) spellIds.add(ref.srdId);
  }
  const groups: SummonedMonsterGroup[] = [];
  for (const spellId of spellIds) {
    const spell = getSpellById(spellId);
    if (!spell) continue;
    const pick = spell.bestiaryPick;
    if (pick) {
      if (spell.concentration && doc.session.concentration !== spellId) continue;
      const monsterId = doc.session.companionVariant?.[spellId];
      groups.push({
        spellId,
        options: [],
        ...(monsterId ? { monsterId } : {}),
        pick,
        count: 1,
        current: [doc.session.companionHp?.[summonInstanceKey(spellId, 1)]?.current],
      });
      continue;
    }
    const options = spell.summonedMonsters?.options;
    if (!options?.length) continue;
    const picked = doc.session.companionVariant?.[spellId];
    const option = options.find((o) => o.monsterId === picked) ?? options[0];
    if (!option) continue;
    const count =
      doc.session.companionCount?.[spellId] ??
      summonCount(option.count, spell.level, spell.level, 0);
    groups.push({
      spellId,
      options: options.map((o) => o.monsterId),
      monsterId: option.monsterId,
      count,
      current: Array.from(
        { length: count },
        (_, i) => doc.session.companionHp?.[summonInstanceKey(spellId, i + 1)]?.current
      ),
    });
  }
  return groups;
}
