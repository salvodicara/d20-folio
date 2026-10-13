// The spells built around a table (Augury, Confusion, Control Weather, Creation,
// Divine Word, Prismatic Spray, Prismatic Wall, Reincarnate, Scrying, Teleport)
// read the SRD 5.2.1 text and its table, not the 2014 paraphrase. Cases come
// from SRD 5.2.1 (EN pp. 112-169; IT pp. 125-195).
import { describe, expect, it } from "vitest";
import enSpells from "@/i18n/en/srd/spells.json";
import itSpells from "@/i18n/it/srd/spells.json";

type SpellText = { description: string; higherLevels?: string };
const en = enSpells as unknown as Record<string, SpellText>;
const it_ = itSpells as unknown as Record<string, SpellText>;

function text(catalogue: Record<string, SpellText>, id: string): SpellText {
  const entry = catalogue[id];
  if (!entry) throw new Error(`no text for ${id}`);
  return entry;
}

const cases: Array<[id: string, enPhrases: string[], itPhrases: string[]]> = [
  [
    "augury",
    [
      "The GM chooses the omen from the Omens table.",
      "Indifference: Neither good nor bad",
      "there is a cumulative 25 percent chance for each casting after the first that you get no answer.",
    ],
    [
      "Il GM sceglie il presagio dalla tabella Presagi.",
      "Indifferenza: né positivi né negativi",
      "probabilità cumulativa del 25% di non ottenere risposta",
    ],
  ],
  [
    "confusion",
    [
      "that target can't take Bonus Actions or Reactions and must roll 1d10",
      "7-8: The target doesn't move, and it takes the Attack action to make one melee attack against a random creature within reach.",
      "repeats the save, ending the spell on itself on a success.",
    ],
    [
      "non può effettuare azioni bonus o reazioni e deve tirare 1d10",
      "9-10: Il bersaglio sceglie il comportamento.",
    ],
  ],
  [
    "control-weather",
    [
      "it ends early if you go indoors.",
      "change its stage by one, up or down.",
      "5: Torrential rain, driving hail, or blizzard",
    ],
    ["entro 7,5 chilometri", "la modifica di un grado, verso l'alto o verso il basso."],
  ],
  [
    "creation",
    [
      "The object must be no larger than a 5-foot Cube",
      "Vegetable matter: 24 hours",
      "causes the other spell to fail.",
    ],
    ["Materia vegetale: 24 ore", "Adamantio o mithral: 1 minuto"],
  ],
  [
    "divine-word",
    [
      "power from the Upper Planes",
      "0-20: The target dies.",
      "41-50: The target has the Deafened condition for 1 minute.",
    ],
    ["dei Piani Superiori", "41-50: Il bersaglio è assordato per 1 minuto."],
  ],
  [
    "prismatic-spray",
    [
      "Eight rays of light flash from you in a 60-foot Cone.",
      "6. Indigo. Failed Save: The target has the Restrained condition",
      "8. Special. The target is struck by two rays. Roll twice, rerolling any 8.",
    ],
    ["Otto raggi di luce si sprigionano", "a scelta del GM"],
  ],
  [
    "prismatic-wall",
    [
      "Alternatively, you shape the wall into a globe up to 30 feet in diameter",
      "1. Red. Failed Save: 12d6 Fire damage.",
      "Additional Effects: This layer is destroyed by Dispel Magic.",
    ],
    ["un globo del diametro massimo di 9 metri", "12d6 danni da fuoco"],
  ],
  [
    "reincarnate",
    [
      "If the creature has been dead no longer than 10 days",
      "10: Tiefling",
      "it loses the traits of its previous species and gains the traits of its new one.",
    ],
    ["non è morta da più di 10 giorni", "10: Umano"],
  ],
  [
    "scrying",
    [
      "The target doesn't know what it is making the save against, only that it feels uneasy.",
      "Body part, lock of hair, or bit of nail: -10",
      "Instead of targeting a creature, you can target a location you have seen.",
    ],
    ["Indiretta (ha sentito parlare del bersaglio): +5", "e non si muove."],
  ],
  [
    "teleport",
    [
      "or a single object that you can see within range",
      "The GM rolls 1d100 and consults the Teleportation Outcome table",
      "Very familiar: Mishap 01-05, Similar Area 06-13, Off Target 14-24, On Target 25-00",
      "takes 3d10 Force damage",
    ],
    ["Il GM tira 1d100", "subisce 3d10 danni da forza"],
  ],
];

describe("SRD 5.2.1 text of the table spells", () => {
  it.each(cases)("%s reads the SRD 5.2.1 text", (id, enPhrases, itPhrases) => {
    const e = text(en, id).description;
    for (const phrase of enPhrases) expect(e).toContain(phrase);
    expect(e).not.toMatch(/\bDM\b/);
    const i = text(it_, id).description;
    for (const phrase of itPhrases) expect(i).toContain(phrase);
    // The Italian SRD speaks of "l'incantatore", never the reader as "tu".
    expect(i).not.toMatch(/\b(tu|tua|tuo|scegli|lanci)\b/);
  });

  it("Bestow Curse keeps its higher-slot paragraph out of the description", () => {
    for (const catalogue of [en, it_]) {
      const entry = text(catalogue, "bestow-curse");
      expect(entry.description).not.toMatch(/Higher-Level|livello supe/);
      expect(entry.higherLevels).toMatch(/9/);
    }
  });

  it("no paragraph break falls inside a sentence or a word (PDF column artifacts)", () => {
    const offenders: string[] = [];
    for (const [lang, catalogue] of [
      ["en", en],
      ["it", it_],
    ] as const) {
      for (const [id, entry] of Object.entries(catalogue)) {
        for (const value of [entry.description, entry.higherLevels]) {
          if (typeof value !== "string") continue;
          if (/\w-\n|[a-zà-ù,;]\n+[a-zà-ù]/.test(value)) offenders.push(`${lang}:${id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
