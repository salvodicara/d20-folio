/**
 * Companion presenter (R2) — the ONE enumerate + resolve + localize seam for every
 * feature-declared companion (Artificer Steel Defender / Eldritch Cannon, Beast
 * Master Primal Companion, and — pack — a spell-declared companion like the
 * Homunculus Servant). Both mounts read it, so the Features-tab card and the
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
import type { AbilityCode, CompanionStatBlock } from "@/data/types";
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import { classEntryLevel, totalLevel } from "@/lib/classes";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  effectiveAbilityScores,
  effectiveSpellAttackBonus,
  resolveCastingModifier,
  resolveCompanion,
  selectCompanionVariant,
} from "@/lib/compute";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { srdKey } from "@/i18n/srd-key";
import type { Locale } from "@/lib/locale";

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
  /** The granting source id (class-feature srdId or spell id) — the HP/variant key. */
  featureId: string;
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
  t: Translate
): CompanionCardView {
  const selectedVariantId = session.companionVariant?.[featureId];
  const active = selectCompanionVariant(block, selectedVariantId);
  const resolved = resolveCompanion(active, level, scores, pbOverride, spellAttackMod);
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

  return {
    featureId,
    label,
    kind,
    ac: resolved.ac,
    speed: resolved.speed,
    hpMax: resolved.hpMax,
    current: session.companionHp?.[featureId]?.current,
    attacks,
    variants,
    selectedVariantId: active.variantId,
  };
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
  agg: ReturnType<typeof aggregateCharacterGrants>;
} {
  const charData = doc.character;
  const agg = aggregateCharacterGrants(charData, doc.session);
  const scores = effectiveAbilityScores(
    charData.abilityScores,
    agg.abilityScoreFloors,
    agg.itemAbilityScoreBonus,
    agg.itemAbilityScoreCap
  );
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
  const { level, scores, pbOverride, spellAttackMod, agg } = ownerContext(doc);
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
      buildOne(
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

  // (b) Spells with a companion (the spell-companion seam — pack Homunculus Servant).
  //     Public SRD carries none, so this leg is inert public-side (D11: shape public,
  //     content pack). A spell counts as "on the character" when it is prepared/known
  //     (a stored ref) OR always-prepared (a grant).
  const spellIds = new Set<string>(agg.alwaysPrepared);
  for (const ref of charData.spells) {
    if ("srdId" in ref) spellIds.add(ref.srdId);
  }
  for (const spellId of spellIds) {
    const spell = getSpellById(spellId);
    if (!spell?.companion) continue;
    views.push(
      buildOne(
        spellId,
        spell.companion,
        "spell",
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

  return views;
}
