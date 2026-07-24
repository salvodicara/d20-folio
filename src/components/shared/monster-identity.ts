/**
 * Monster identity-line helpers — pure, JSX-free string composers shared by the
 * {@link MonsterStatBlockCard} title band and the compendium monster spec (row
 * gloss + detail eyebrow), so the leaf and the card compose the 2024 identity line
 * ("Huge Dragon (Chromatic), Chaotic Evil") from ONE source (golden rule 6). Kept
 * in a `.ts` (no component) so the card stays a components-only module for Fast
 * Refresh. Localizes ONLY through the closed-set chrome seams (`srd.size_*` /
 * `srd.creatureType_*` / `srd.creatureTag_*` / `srd.alignment_*` / `create.sizeOr`
 * / `monster.swarmOf`) — never the lazy `monster` catalogue.
 */
import { useTranslation } from "react-i18next";
import type { CreatureSize, MonsterStatBlock } from "@/data/types";

/** The translator, derived from the hook (no direct i18next type import). */
type TFn = ReturnType<typeof useTranslation>["t"];

/** Localized creature-type + parenthesized tags, e.g. "Fiend (Demon)". */
function typeWithTags(m: MonsterStatBlock, t: TFn): string {
  const type = t(`srd.creatureType_${m.type}`);
  const tags = m.typeTags?.length
    ? ` (${m.typeTags.map((tag) => t(`srd.creatureTag_${tag}`)).join(", ")})`
    : "";
  return `${type}${tags}`;
}

/** Sizes joined by the localized "or" ("Medium or Small"). */
function sizeLine(m: MonsterStatBlock, t: TFn): string {
  return m.sizes
    .map((s) => t(`srd.size_${s.toLowerCase()}`))
    .join(` ${t("create.sizeOr")} `);
}

/** The primary (first-printed) size label — the swarm line's own size. */
function primarySizeLabel(m: MonsterStatBlock, t: TFn): string {
  const s = m.sizes[0];
  return s ? t(`srd.size_${s.toLowerCase()}`) : "";
}

/** The swarm identity fragment ("Medium Swarm of Tiny Beasts"). */
function swarmLine(m: MonsterStatBlock, t: TFn, swarmSize: CreatureSize): string {
  return t("monster.swarmOf", {
    size: primarySizeLabel(m, t),
    swarmSize: t(`srd.size_${swarmSize.toLowerCase()}`),
    type: t(`srd.creatureType_${m.type}`),
  });
}

/**
 * The full 2024 identity line — "Huge Dragon (Chromatic), Chaotic Evil" (swarm
 * variant via `monster.swarmOf`). Used by the compendium masthead eyebrow + the
 * card title band.
 */
export function monsterIdentity(m: MonsterStatBlock, t: TFn): string {
  const alignment = t(`srd.alignment_${m.alignment}`);
  const head = m.swarmOf
    ? swarmLine(m, t, m.swarmOf)
    : `${sizeLine(m, t)} ${typeWithTags(m, t)}`;
  return `${head}, ${alignment}`;
}

/** The compact row gloss — size + type(+tags), no alignment ("Large Fiend (Demon)"). */
export function monsterRowMeta(m: MonsterStatBlock, t: TFn): string {
  if (m.swarmOf) return swarmLine(m, t, m.swarmOf);
  return `${sizeLine(m, t)} ${typeWithTags(m, t)}`;
}
