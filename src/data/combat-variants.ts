/**
 * RA-30 — Mounted & Underwater Combat quick-reference (D&D 2024 SRD 5.2.1).
 *
 * They render in the Play tab's "Rules Reference" panel (`SituationalRules`),
 * and the Underwater and Mounted tables, with the attack situations below, are
 * the one-tap situation chips on the Play board (`src/lib/situational-states.ts`).
 * The DC 10 save and the half-Speed cost stay prose.
 * Values are authoritative and shouldn't drift — see
 * tests/unit/combat-variants.test.ts.
 *
 * Source: SRD 5.2.1 (CC-BY-4.0), "Mounted Combat" / "Underwater Combat" —
 * concise functional restatements, not verbatim prose.
 */

import type { BiText } from "@/data/types";

/** One rule line in a variant-combat quick-reference. */
export interface CombatVariantNote {
  /** Stable id (kebab-case). */
  id: string;
  /** Bilingual heading. */
  name: BiText;
  /** Bilingual one-line functional summary. */
  summary: BiText;
}

export const MOUNTED_COMBAT_REFERENCE: ReadonlyArray<CombatVariantNote> = [
  {
    id: "eligible-mount",
    name: { en: "Eligible Mount", it: "Cavalcatura Idonea" },
    summary: {
      en: "A willing creature at least one size larger than you, with a suitable anatomy, can serve as a mount.",
      it: "Una creatura consenziente di almeno una taglia più grande di te e con un'anatomia adatta può fungere da cavalcatura.",
    },
  },
  {
    id: "mount-dismount",
    name: { en: "Mounting & Dismounting", it: "Salire e Scendere" },
    summary: {
      en: "During your move, mounting or dismounting a creature within 5 feet costs movement equal to half your Speed (round down).",
      it: "Durante il tuo movimento, salire su o scendere da una creatura entro 1,5 metri costa movimento pari a metà della tua Velocità (arrotondata per difetto).",
    },
  },
  {
    id: "controlled-mount",
    name: { en: "Controlled Mount", it: "Cavalcatura Controllata" },
    summary: {
      en: "A mount trained to accept a rider shares your Initiative and can take only the Dash, Disengage, or Dodge action.",
      it: "Una cavalcatura addestrata ad accettare un cavaliere condivide la tua Iniziativa e può effettuare solo l'azione Scatto, Disimpegno o Schivata.",
    },
  },
  {
    id: "independent-mount",
    name: { en: "Independent Mount", it: "Cavalcatura Indipendente" },
    summary: {
      en: "An untrained mount keeps its own place in Initiative and moves and acts on its own.",
      it: "Una cavalcatura non addestrata mantiene il proprio posto nell'Iniziativa e si muove e agisce autonomamente.",
    },
  },
  {
    id: "falling-off",
    name: { en: "Falling Off", it: "Cadere di Sella" },
    summary: {
      en: "If your mount is forced to move, or you or it is knocked Prone, succeed on a DC 10 Dexterity save or fall off Prone within 5 feet.",
      it: "Se la tua cavalcatura è costretta a muoversi, o se tu o essa venite resi Proni, supera un tiro salvezza su Destrezza CD 10 o cadi di sella Prono entro 1,5 metri.",
    },
  },
];

export const UNDERWATER_COMBAT_REFERENCE: ReadonlyArray<CombatVariantNote> = [
  {
    id: "melee-underwater",
    name: { en: "Melee Attacks", it: "Attacchi in Mischia" },
    summary: {
      en: "Without a Swim Speed, melee weapon attack rolls have Disadvantage unless the weapon deals Piercing damage.",
      it: "Senza una Velocità di Nuoto, i tiri per colpire in mischia con un'arma hanno Svantaggio a meno che l'arma non infligga danni Perforanti.",
    },
  },
  {
    id: "ranged-underwater",
    name: { en: "Ranged Attacks", it: "Attacchi a Distanza" },
    summary: {
      en: "A ranged weapon attack automatically misses a target beyond normal range, and has Disadvantage within normal range.",
      it: "Un tiro per colpire a distanza con un'arma manca automaticamente un bersaglio oltre la gittata normale e ha Svantaggio entro la gittata normale.",
    },
  },
  {
    id: "fire-resistance",
    name: { en: "Fire Resistance", it: "Resistenza al Fuoco" },
    summary: {
      en: "Anything underwater has Resistance to Fire damage.",
      it: "Tutto ciò che si trova sott'acqua ha Resistenza ai danni da Fuoco.",
    },
  },
];

/**
 * Situational attack-roll rules (SRD 5.2.1 "Unseen Attackers and Targets",
 * "Ranged Attacks in Close Combat", "Range"). Each line is a fact the table
 * declares with one tap; the one-tap states (`src/lib/situational-states.ts`)
 * take their names and sentences from here.
 */
export const ATTACK_SITUATION_REFERENCE: ReadonlyArray<CombatVariantNote> = [
  {
    id: "unseen-target",
    name: { en: "Unseen Target", it: "Bersaglio non visto" },
    summary: {
      en: "When you attack a target you can't see, you have Disadvantage on the attack roll.",
      it: "Quando attacchi un bersaglio che non puoi vedere, hai Svantaggio al tiro per colpire.",
    },
  },
  {
    id: "unseen-attacker",
    name: { en: "Unseen Attacker", it: "Attaccante non visto" },
    summary: {
      en: "When a creature can't see you, you have Advantage on attack rolls against it.",
      it: "Quando una creatura non può vederti, hai Vantaggio ai tiri per colpire contro di essa.",
    },
  },
  {
    id: "ranged-in-melee",
    name: { en: "Ranged in Melee", it: "A distanza in mischia" },
    summary: {
      en: "A ranged attack roll has Disadvantage while you are within 5 feet of an enemy who can see you and isn't Incapacitated.",
      it: "Un tiro per colpire a distanza ha Svantaggio se sei entro 1,5 metri da un nemico che può vederti e non è Incapacitato.",
    },
  },
  {
    id: "long-range",
    name: { en: "Long Range", it: "Gittata lunga" },
    summary: {
      en: "A weapon attack roll against a target beyond normal range has Disadvantage; beyond long range it can't be made.",
      it: "Un tiro per colpire con un'arma contro un bersaglio oltre la gittata normale ha Svantaggio; oltre la gittata lunga non si può fare.",
    },
  },
];
