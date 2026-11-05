/**
 * What an option to pick does, for the inspect card beside the pickers (owner,
 * 2026-11-05: «like BG3's tooltips, so the choice is informed»): its name, a
 * subtitle, the effect in a few words, the catalogue's gist, chips of facts, and
 * the full text. One shape for every kind: spells, feats and fighting styles,
 * invocations, Metamagic, maneuvers, weapon masteries, skills.
 *
 * Pure: everything resolves here in the reader's language, from the catalogues.
 */
import { FEATS_BY_ID } from "@/data/feats";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { METAMAGIC_BY_ID } from "@/data/metamagic";
import { WEAPONS_BY_ID } from "@/data/weapons";
import { spellPickRows } from "@/domains/spells/spell-pick-rows";
import i18n from "@/i18n";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { SrdKind } from "@/i18n/srd-en";
import { skillAbility } from "@/lib/compute";
import type { Locale } from "@/lib/locale";

export type InfoKind =
  | "spell"
  | "feat"
  | "invocation"
  | "metamagic"
  | "maneuver"
  | "weapon"
  | "skill";

export interface OptionInfo {
  name: string;
  /** «Livello 3 · Invocazione», «Talento Generale», the mastery's name, the skill's ability. */
  sub: string;
  /** What it does in a few words («8d6 Fuoco»), or null. */
  effect: string | null;
  /** One line from the catalogue, or null when the entry has none. */
  gist: string | null;
  /** Facts as chips: casting time and range, prerequisite, cost. */
  chips: string[];
  /** The full text (markdown), or null. */
  text: string | null;
}

const field = (kind: SrdKind, id: string, name: string, locale: Locale) =>
  hasSrd(kind, id, name, locale) ? localizeSrd(kind, id, name, locale) || null : null;

const INVOCATIONS = new Set(SRD_INVOCATIONS.map((i) => i.id));

export function optionInfo(
  kind: InfoKind,
  id: string,
  locale: Locale
): OptionInfo | null {
  const t = i18n.getFixedT(locale);
  switch (kind) {
    case "spell": {
      const s = spellPickRows([id], locale)[0];
      if (!s) return null;
      return {
        name: s.name,
        sub: `${s.level === 0 ? t("spells.cantrip") : t("spells.level", { level: s.level })} · ${s.school}`,
        effect: s.effect,
        gist: s.gist,
        chips: [
          s.castingTime,
          s.range,
          ...(s.concentration ? [t("play.concentration")] : []),
          ...(s.ritual ? [t("spells.pick.ritual")] : []),
        ],
        text: s.description,
      };
    }
    case "feat": {
      const f = FEATS_BY_ID.get(id);
      if (!f) return null;
      const prereq = field("feat", id, "prerequisite", locale);
      return {
        name: localizeSrd("feat", id, "name", locale),
        sub: t(`feats.category_${f.category}`),
        effect: null,
        gist: field("feat", id, "gist", locale),
        chips: prereq ? [`${t("feats.prerequisite")}: ${prereq}`] : [],
        text: field("feat", id, "description", locale),
      };
    }
    case "invocation": {
      if (!INVOCATIONS.has(id) && !hasSrd("invocation", id, "name", locale)) return null;
      const prereq = field("invocation", id, "prerequisite", locale);
      return {
        name: localizeSrd("invocation", id, "name", locale),
        sub: t("levelUp.screen.invocation"),
        effect: null,
        gist: field("invocation", id, "gist", locale),
        chips: prereq ? [`${t("feats.prerequisite")}: ${prereq}`] : [],
        text: field("invocation", id, "description", locale),
      };
    }
    case "metamagic": {
      const m = METAMAGIC_BY_ID.get(id);
      if (!m) return null;
      return {
        name: localizeSrd("metamagic", id, "name", locale),
        sub: t("metamagic.section"),
        effect: null,
        gist: field("metamagic", id, "gist", locale),
        chips: [t("levelUp.metamagicCost", { cost: m.cost })],
        text: field("metamagic", id, "description", locale),
      };
    }
    case "maneuver": {
      if (!hasSrd("maneuver", id, "name", locale)) return null;
      return {
        name: localizeSrd("maneuver", id, "name", locale),
        sub: t("levelUp.screen.maneuver"),
        effect: null,
        gist: field("maneuver", id, "gist", locale),
        chips: [],
        text: field("maneuver", id, "description", locale),
      };
    }
    case "weapon": {
      const w = WEAPONS_BY_ID.get(id);
      if (!w?.mastery) return null;
      const mastery = w.mastery.toLowerCase();
      return {
        name: localizeSrd("equipment", id, "name", locale),
        sub: localizeSrd("weapon-mastery", mastery, "name", locale),
        effect: w.damage
          ? `${w.damage.die}\u00a0${t(`srd.damage_${w.damage.type.toLowerCase()}`)}`
          : null,
        gist: field("weapon-mastery", mastery, "summary", locale),
        chips: [],
        text: field("weapon-mastery", mastery, "description", locale),
      };
    }
    case "skill":
      return {
        name: t(`skills.${id}`),
        sub: t(`abilities.${skillAbility(id)}`),
        effect: null,
        gist: null,
        chips: [],
        text: null,
      };
  }
}
