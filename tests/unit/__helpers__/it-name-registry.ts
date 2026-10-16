/// <reference types="node" />
/**
 * IT-name-consistency guard helper (2026-07-21).
 *
 * The canonical Italian name of every entity is its `name` field in `i18n/it/srd/*.json`. Across the
 * given i18n roots this helper enforces:
 *   (1) COLLISIONS — two DISTINCT entities (different English names) never share one Italian name
 *       (the Conjure/Summon "Evocare Celestiale" class). Same-English features across classes
 *       (Extra Attack, Epic Boon) legitimately share a name and are NOT flagged.
 *   (2) UNTRANSLATED — an Italian name never byte-equals its English name, except the proper nouns
 *       Italian D&D keeps (KEEP_ENGLISH_SRD: Tiefling, Goliath, Halfling, ...).
 *   (3) RETIRED-AS-NAME — no entity is (re)named to a superseded old form (RETIRED_NAMES_SRD).
 *   (4) RETIRED-IN-PROSE — no prose field revives a distinctive retired cross-reference lexeme
 *       (RETIRED_IN_PROSE_SRD), e.g. "Segno del Cacciatore" after Hunter's Mark became "Marchio del
 *       Cacciatore". Title-Case-sensitive → zero false positives on ordinary Italian phrasing.
 *
 * Licensing partition: the exported constants carry ONLY public SRD names. The pack companion
 * (content-pack/tests/unit/it-name-consistency.guard.pack.test.ts) supplies its own pack additions
 * and passes the merged sets in — so no pack (private) name lives in this public repo.
 *
 * Authority + rationale: docs/IT_NAME_REGISTRY.md and docs/GOLDEN_RULES.md (D2).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The public SRD i18n root, resolved from THIS helper's own location. The helper lives in the
 * (never-symlinked) public repo and is imported via the `@tests` alias, so its `import.meta.url` is
 * always the real public path — unlike a `../../../src/i18n` escape from a symlinked pack test, which
 * vitest realpaths against the wrong root (vitest.config.ts). The pack companion imports this so its
 * composed check reaches the real SRD corpus.
 */
export const PUBLIC_SRD_I18N = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "src",
  "i18n"
);

/** Public SRD proper nouns Italian D&D keeps in English — an IT name equal to EN here is CORRECT. */
export const KEEP_ENGLISH_SRD: readonly string[] = [
  "Aboleth",
  "Ankheg",
  "Archelon",
  "Balor",
  "Behir",
  "Berserker",
  "Bulette",
  "Chimera",
  "Chuul",
  "Clone",
  "Costume",
  "Couatl",
  "Deva",
  "Djinni",
  "Doppelganger",
  "Dretch",
  "Drider",
  "Dulcimer",
  "Efreeti",
  "Ettercap",
  "Ettin",
  "Gargoyle",
  "Ghast",
  "Ghoul",
  "Glabrezu",
  "Gnoll",
  "Goblin",
  "Goliath",
  "Grick",
  "Grimlock",
  "Halfling",
  "Hezrou",
  "Imp",
  "Kraken",
  "Lamia",
  "Lemure",
  "Lich",
  "Magmin",
  "Marilith",
  "Medusa",
  "Merrow",
  "Mimic",
  "Nalfeshnee",
  "Ogre",
  "Oni",
  "Otyugh",
  "Piranha",
  "Planetar",
  "Pony",
  "Quasit",
  "Rakshasa",
  "Ranger",
  "Remorhaz",
  "Roc",
  "Sahuagin",
  "Solar",
  "Tarrasque",
  "Tiefling",
  "Treant",
  "Troll",
  "Tsunami",
  "Versatile ({{die}})",
  "Vrock",
  "Warlock",
  "Wight",
  "Worg",
  "Wraith",
  "Xorn",
];
/**
 * Sanctioned distinct-entity name collisions — the NARROW allowlist consumed by `findCollisions`.
 * An entry exempts EXACTLY the named `kind:id` pair sharing `itName`; a group with any other member
 * set (an extra colliding entity) is still flagged. No wildcards — each pair is an explicit ruling
 * against the IT SRD 5.2.1 (docs/IT_NAME_REGISTRY.md → authority hierarchy).
 */
export interface AllowedCollision {
  itName: string;
  /** The exactly-two entities that legitimately share `itName`, as `kind:id`. */
  members: readonly [string, string];
  justification: string;
}
export const ALLOWED_COLLISIONS: readonly AllowedCollision[] = [
  {
    itName: "Mago",
    members: ["classes:wizard", "monsters:mage"],
    justification:
      "Both names are tier-1 official IT SRD 5.2.1 prints. Italian lacks the EN Wizard/Mage " +
      "lexical distinction: the Wizard class and the Mage NPC statblock are distinct entities that " +
      "legitimately share the single Italian lexeme 'Mago'. Exact-pair, sanctioned collision.",
  },
];

/** Superseded public SRD names — never valid as an entity `name` again. */
export const RETIRED_NAMES_SRD: readonly string[] = [
  "Abiti Raffinati",
  "Abiti da Viaggio",
  "Abiurare i Nemici",
  "Accetta",
  "Acciarino",
  "Affascinare",
  "Affinità con la Pietra",
  "Aiuto della Terra",
  "Alterare Sé Stesso",
  "Ammaliare Mostri",
  "Anello del Salto",
  "Anello dell'Elusione",
  "Anello dell'Evocazione del Djinni",
  "Anello dell'Influenza sugli Animali",
  "Anello dell'Invisibilità",
  "Anello della Protezione",
  "Anello della Rigenerazione",
  "Anello della Telecinesi",
  "Anello delle Stelle Cadenti",
  "Anello dello Scudo Mentale",
  "Anello di Accumulo Incantesimi",
  "Anello di Azione Libera",
  "Anello di Nuoto",
  "Anello di Riflettere Incantesimi",
  "Animare i Morti",
  "Arco di Energia",
  "Arma Crudele",
  "Arma Sacra",
  "Arma, +1",
  "Arma, +2",
  "Arma, +3",
  "Armatura Completa",
  "Armatura a Scaglie",
  "Armatura a Strisce",
  "Armatura ad Anelli",
  "Armatura di Ombre",
  "Armatura di Resistenza",
  "Armatura in Adamantio",
  "Armatura, +1",
  "Armatura, +2",
  "Armatura, +3",
  "Armi marziali",
  "Armi marziali (Accurata o Leggere)",
  "Armi marziali (Leggere)",
  "Armi marziali a distanza",
  "Assassino Fantasma",
  "Astuzia Magica",
  "Attaccante Selvaggio",
  "Attacco Extra (2)",
  "Attacco Extra (3)",
  "Auto-Ripristino",
  "Bacchetta dei Dardi Incantati",
  "Bacchetta del Mago da Guerra, +1, +2 o +3",
  "Bacchetta del Mago da Guerra, +2",
  "Bacchetta del Mago da Guerra, +3",
  "Bacchetta del Vincolo",
  "Bacchetta dell'Individuazione dei Nemici",
  "Bacchetta dell'Individuazione del Magico",
  "Bacchetta dello Stupore",
  "Bagliore Stellare",
  "Bandire",
  "Bastone degli Insetti Sciamanti",
  "Bastone del Colpire",
  "Bastone del Mago",
  "Bastone del Tuono e del Fulmine",
  "Bastone dell'Ammaliamento",
  "Bastone dell'Avvizzimento",
  "Bastone delle Foreste",
  "Becco d'ascia",
  "Bevitrice di Vita",
  "Biglie",
  "Bloccare Mostri",
  "Borsa di Beans",
  "Bottiglia Fumante Perpetua",
  "Bracciali di Archery",
  "Cacciatore Preciso",
  "Cambio Forma",
  "Campanello",
  "Campo Antimagia",
  "Camuffare Sé Stessi",
  "Cappello di Disguise",
  "Cappello di Many Spells",
  "Caprone gigante",
  "Caraffa dell'Acqua Infinita",
  "Cavallo da corsa",
  "Ceppi Dimensionali",
  "Cervo",
  "Cintura di Dwarvenkind",
  "Cintura di Forza del Gigante",
  "Ciotola del Comando degli Elementali dell'Acqua",
  "Cognizioni del Cacciatore",
  "Colla Sovrana",
  "Collana dei Grani di Preghiera",
  "Colonna di Fuoco",
  "Colpi Ingannevoli",
  "Colpi Radianti",
  "Colpo Mistico",
  "Colpo Sicuro",
  "Compagno Draconico",
  "Concentrazione del Monaco",
  "Concentrazione Elevata",
  "Confondimento",
  "Conoscenze Leggendarie",
  "Contattare Altro Piano",
  "Contattare il Patrono",
  "Corazza",
  "Corazza Nanica",
  "Corazza di Piastre della Forma Eterea",
  "Corda dell'Arrampicata",
  "Corda dell'Intrappolamento",
  "Corno del Boato",
  "Corporatura Possente",
  "Cotta di Maglia Elfica",
  "Cotta di Scaglie di Drago",
  "Cuoio Borchiato Glamour",
  "Destriero Fedele",
  "Deviare Attacchi",
  "Difensore",
  "Difesa della Natura",
  "Difesa Superiore del Cacciatore",
  "Discendenza dei Giganti",
  "Dominare Mostro",
  "Donnola gigante",
  "Dono dei Protettori",
  "Dono della Prodezza in Combattimento",
  "Dono delle Profondità",
  "Dotazione da Esploratore di Dungeon",
  "Due Mani (se non in sella)",
  "Elmo di Brilliance",
  "Elmo di Telepatia",
  "Elmo di Teleportation",
  "Errante",
  "Espansione dell'Aura",
  "Esperto di Rituali",
  "Esploratore Agile",
  "Esplosione Stregonesca",
  "Evocare Animali",
  "Evocare Celestiale",
  "Evocare Drago",
  "Evocare Elementale",
  "Evocare Elementali Minori",
  "Evocare Esseri dei Boschi",
  "Evocare Fatato",
  "Falco insanguinato",
  "Ferri di Cavallo della Velocità",
  "Ferri di Cavallo dello Zefiro",
  "Fiamma Continua",
  "Figurina del Potere Meraviglioso",
  "Flagello",
  "Forza Fantasmatica",
  "Forza Indomabile",
  "Frantuma",
  "Fulmine a Catena",
  "Furtività Naturale",
  "Gemma di Brightness",
  "Gergo dei Ladri",
  "Glifo di Protezione",
  "Gravità Invertita",
  "Guanti del Ladrocinio",
  "Guanti della Forza dell'Orco",
  "Guardie e Protezioni",
  "Guscio Antivita",
  "Idioma Profondo",
  "Imposizione",
  "Imprigionamento",
  "Incantesimo Accentuato",
  "Incantesimo Attento",
  "Incantesimo Localizzante",
  "Incantesimo Sdoppiato",
  "Incantesimo Sottile",
  "Individuazione di Veleni e Malattie",
  "Indomito",
  "Insegnamenti dei Primigeni",
  "Interezza del Corpo",
  "Investitura del Signore della Catena",
  "Invocazione Potenziata",
  "Ira Inconsapevole",
  "Kit da Scalatore",
  "Kit del Guaritore",
  "Lama Divorante",
  "Lama Solare",
  "Lancia Esoterica",
  "Lanciatore Nanico",
  "Lanterna del Rivelare",
  "Lanterna Direzionale",
  "Legame Protettivo",
  "Lingua di Fiamma",
  "Linguaggio dei Segni Comune",
  "Localizzare Animali o Piante",
  "Localizzare Creatura",
  "Localizzare Oggetto",
  "Lucchetto",
  "Lupo terribile",
  "Maestro Tattico",
  "Mani Rapide",
  "Mantello del Ciarlatano",
  "Mantello dello Spostamento",
  "Mantello di Arachnida",
  "Mantello di Invisibilità",
  "Manto di Resistenza agli Incantesimi",
  "Manuale dell'Esercizio Proficuo",
  "Manuale della Prontezza d'Azione",
  "Manuale della Salute Fisica",
  "Marchio del Gelo",
  "Martello delle Folgori",
  "Maschera dai Mille Volti",
  "Mazza del Castigo",
  "Mazza della Disgregazione",
  "Mazzo di Illusioni",
  "Memorizzare Incantesimo",
  "Mente Mistica",
  "Mente Vuota",
  "Messaggero Animale",
  "Metabolismo Inquietante",
  "Miglioramento dei Punteggi di Caratteristica",
  "Munizione, +1, +2 o +3",
  "Muovere Terra",
  "Nimbo Sacro",
  "Non Individuazione",
  "Oathbow",
  "Occhi dell'Ammaliamento",
  "Occhi dell'Aquila",
  "Occhi della Vista Minuta",
  "Orca",
  "Orrore",
  "Padronanza delle Armi",
  "Palla di Fuoco a Scoppio Ritardato",
  "Pantofole della Scalata del Ragno",
  "Parlare con le Piante",
  "Parola del Potere: Guarire",
  "Parola del Potere: Stordire",
  "Parola del Potere: Uccidere",
  "Parola del Richiamo",
  "Passo Arboreo",
  "Passo Rapido",
  "Pendente della Salute",
  "Pendente di Protezione dal Veleno",
  "Pergamena degli Incantesimi",
  "Periapt della Chiusura delle Ferite",
  "Perlina di Force",
  "Perlina di Nutrimento",
  "Pieno di Risorse",
  "Pietra della Buona Fortuna",
  "Pietra della Buona Sorte",
  "Pietre dell'Inviare",
  "Polpo",
  "Polvere di Aridità",
  "Polvere di Sparizione",
  "Polvere di Starnuti e Soffocamento",
  "Portale Cubico",
  "Potenziare Caratteristica",
  "Pozione della Lettura del Pensiero",
  "Pozione di Forza del Gigante",
  "Pozione di Respirare sott'Acqua",
  "Pozione di Rimpicciolimento",
  "Pozione di Scalata",
  "Pozione di Veleno",
  "Pozione di Volo",
  "Pozzo dei Mille Mondi",
  "Preda Superiore del Cacciatore",
  "Presa Folgorante",
  "Preservare la Vita",
  "Proiettare Immagine",
  "Protezione dal Veleno",
  "Pugnale del Veleno",
  "Punizione Bruciante",
  "Punizione di Protezione",
  "Raggio Lunare",
  "Raggio Solare",
  "Raggio di Malattia",
  "Randello Pesante Tonante",
  "Ratto",
  "Ratto gigante",
  "Resilienza Demoniaca",
  "Riflessi del Furfante",
  "Rimprovero Infernale",
  "Rintocco dell'Apertura",
  "Risorgere Selvatico",
  "Rubavite",
  "Sacco a Pelo",
  "Saggio",
  "Saltare",
  "Salto Ultraterreno",
  "Santuario della Natura",
  "Sapiente dell'Invocazione",
  "Scagliare nell'Inferno",
  "Scalata del Ragno",
  "Scarabeo della Protezione",
  "Scimmia",
  "Scimmia gigante",
  "Scudo Acchiappa-Frecce",
  "Scudo Antimagia",
  "Scudo di Missile Attraction",
  "Scudo, +1",
  "Scudo, +2",
  "Scudo, +3",
  "Segno del Cacciatore",
  "Sentiero del Berserker",
  "Serpente costrittore",
  "Serpente costrittore gigante",
  "Set da Gioco",
  "Sfera Fiammeggiante",
  "Sfera Vetriolica",
  "Sfera dell'Annichilimento",
  "Sfera di Cristallo della Vista Pura",
  "Sguardo Malefico",
  "Shillelagh",
  "Signore delle Mille Forme",
  "Sopravvissuto Disciplinato",
  "Sovracanalizzare",
  "Spada Lacerante",
  "Spada Ruba-Vita",
  "Specchio Intrappola-Vita",
  "Spilla di Schermatura",
  "Spina Mentale",
  "Spruzzo Acido",
  "Squalo di scogliera",
  "Stella del Mattino",
  "Stirpe Elfica",
  "Stirpe Gnomesca",
  "Stivali di Andatura e Salto",
  "Stivali di Terre Invernali",
  "Sussurri della Tomba",
  "Talismano di Pure Good",
  "Talismano di Ultimate Evil",
  "Tiro con Arco",
  "Tocco Risanante",
  "Tomo del Pensiero Lucido",
  "Trappola da Caccia",
  "Trasporto tramite Piante",
  "Trucchetto Druidico",
  "Turibolo del Controllo degli Elementali dell'Aria",
  "Usare Oggetti Magici",
  "Vedere il Vero",
  "Vendicatore Sacro",
  "Ventaglio del Vento",
  "Verga della Vigilanza",
  "Verga di Assorbimento",
  "Verga di Lordly Might",
  "Verga di Resurrection",
  "Verga di Rulership",
  "Verga di Security",
  "Versatile nelle Abilità",
  "Veste",
  "Veste dell'Arcimago",
  "Veste delle Stelle",
  "Veste di Eyes",
  "Veste di Useful Items",
  "Vincolo Planare",
  "Visioni Nebbiose",
  "Visioni di Reami Distanti",
  "Vista della Strega",
  "Vita Falsa",
  "Zampogna dell'Ossessione",
  "Zampogna delle Fogne",
];
/** Distinctive retired public SRD cross-reference lexemes — never valid in prose again. */
export const RETIRED_IN_PROSE_SRD: readonly string[] = [
  "Aiuto della Terra",
  "Ammaliare Mostri",
  "Arma Sacra",
  "Assassino Fantasma",
  "Astuzia Magica",
  "Attaccante Selvaggio",
  "Bagliore Stellare",
  "Bevitrice di Vita",
  "Cacciatore Preciso",
  "Cambio Forma",
  // PS-J sweep — the paladin/cleric feature is canonically "Incanalare Divinità"
  // (its own `name`); two action blurbs had drifted to this variant.
  "Canalizzare Divinità",
  "Cognizioni del Cacciatore",
  "Colonna di Fuoco",
  "Colpi Ingannevoli",
  "Colpi Radianti",
  "Colpo Mistico",
  "Colpo Sicuro",
  "Compagno Draconico",
  "Concentrazione Elevata",
  "Conoscenze Leggendarie",
  "Destriero Fedele",
  "Difesa della Natura",
  "Dono della Prodezza in Combattimento",
  "Dono delle Profondità",
  "Due Mani (se non in sella)",
  "Espansione dell'Aura",
  "Esperto di Rituali",
  "Esploratore Agile",
  "Esplosione Stregonesca",
  "Fiamma Continua",
  "Forza Fantasmatica",
  "Forza Indomabile",
  "Fulmine a Catena",
  "Glifo di Protezione",
  "Gravità Invertita",
  "Guardie e Protezioni",
  "Incantesimo Accentuato",
  "Incantesimo Attento",
  "Incantesimo Localizzante",
  "Incantesimo Sdoppiato",
  "Incantesimo Sottile",
  "Individuazione di Veleni e Malattie",
  "Insegnamenti dei Primigeni",
  "Interezza del Corpo",
  "Invocazione Potenziata",
  "Ira Inconsapevole",
  "Lama Divorante",
  "Lancia Esoterica",
  "Legame Protettivo",
  "Maestro Tattico",
  "Mani Rapide",
  "Maschera dai Mille Volti",
  "Mente Mistica",
  "Mente Vuota",
  "Messaggero Animale",
  "Metabolismo Inquietante",
  "Miglioramento dei Punteggi di Caratteristica",
  "Nimbo Sacro",
  "Non Individuazione",
  "Palla di Fuoco a Scoppio Ritardato",
  "Parola del Richiamo",
  "Passo Arboreo",
  "Passo Rapido",
  "Potenziare Caratteristica",
  "Presa Folgorante",
  "Proiettare Immagine",
  "Punizione Bruciante",
  "Punizione di Protezione",
  "Raggio Lunare",
  "Raggio Solare",
  "Raggio di Malattia",
  "Resilienza Demoniaca",
  "Rimprovero Infernale",
  "Risorgere Selvatico",
  "Salto Ultraterreno",
  "Santuario della Natura",
  "Sapiente dell'Invocazione",
  "Scalata del Ragno",
  "Segno del Cacciatore",
  "Sfera Fiammeggiante",
  "Sfera Vetriolica",
  // Never a canonical lexeme: the Exhaustion condition is INDEBOLIMENTO in the official IT SRD
  // 5.2.1. "Sfinimento" shipped once in the combat turn-limiter chrome and collided with the rail's
  // rubric on the SAME screen (post-sweep defect PS-B) — locked out of prose AND of the UI shards.
  "Sfinimento",
  "Sguardo Malefico",
  "Signore delle Mille Forme",
  "Sopravvissuto Disciplinato",
  "Spina Mentale",
  "Spruzzo Acido",
  "Tiro con Arco",
  "Tocco Risanante",
  "Trasporto tramite Piante",
  "Trucchetto Druidico",
  "Vedere il Vero",
  "Vincolo Planare",
  "Visioni Nebbiose",
  "Visioni di Reami Distanti",
  "Vita Falsa",
];

export type Ent = {
  kind: string;
  id: string;
  en: string;
  it: string;
  itFields: string[];
};

const KINDS = [
  "spells",
  "feats",
  "class-features",
  "magic-items",
  "conditions",
  "races",
  "backgrounds",
  "subclasses",
  "invocations",
  "metamagic",
  "maneuvers",
  "weapon-masteries",
  "weapon-properties",
  "equipment",
  "beasts",
  "monsters",
  "languages",
  "proficiencies",
  "classes",
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function proseStrings(v: unknown, out: string[]): void {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) proseStrings(x, out);
  else if (v && typeof v === "object")
    for (const [k, val] of Object.entries(v as Record<string, unknown>))
      if (k !== "name") proseStrings(val, out);
}

/**
 * One SRD kind's catalogue for a locale under `root` — the COMPOSED shape. Reads the
 * single `srd/<kind>.json` file AND, when present, merges every `srd/<kind>/*.json`
 * fragment. The content pack PARTITIONS its monster catalogue into per-tranche
 * fragments (`content-pack/i18n/<locale>/srd/monsters/<tranche>.json`) for
 * parallel-safe authoring, so this guard must merge them or it would silently stop
 * checking pack monster names. `undefined` = the kind has neither file nor fragment
 * directory under this root (skip it for this root).
 */
function readSrdKind(
  root: string,
  locale: string,
  kind: string
): Record<string, unknown> | undefined {
  const file = resolve(root, locale, "srd", kind + ".json");
  const dir = resolve(root, locale, "srd", kind);
  let out: Record<string, unknown> | undefined;
  if (existsSync(file)) {
    out = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  }
  if (existsSync(dir)) {
    out ??= {};
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      Object.assign(
        out,
        JSON.parse(readFileSync(resolve(dir, f), "utf8")) as Record<string, unknown>
      );
    }
  }
  return out;
}

/** Load every entity across the given i18n roots (e.g. [".../src/i18n", ".../content-pack/i18n"]). */
export function loadEntities(roots: string[]): Ent[] {
  const ents: Ent[] = [];
  for (const root of roots) {
    for (const kind of KINDS) {
      const en = readSrdKind(root, "en", kind);
      const it = readSrdKind(root, "it", kind);
      if (en === undefined || it === undefined) continue;
      for (const [id, evRaw] of Object.entries(en)) {
        if (id.includes(".") || typeof evRaw !== "object" || evRaw === null) continue;
        const ev = evRaw as Record<string, unknown>;
        const enName = ev.name;
        if (typeof enName !== "string") continue;
        const itRaw = it[id];
        const iv =
          typeof itRaw === "object" && itRaw !== null
            ? (itRaw as Record<string, unknown>)
            : undefined;
        const fields: string[] = [];
        if (iv) proseStrings(iv, fields);
        ents.push({
          kind,
          id,
          en: enName,
          it: iv && typeof iv.name === "string" ? iv.name : "",
          itFields: fields,
        });
      }
    }
  }
  return ents;
}

/**
 * The SUB-KEYED catalogue rows — `<entityId>.grants.<seg>`, `<entityId>.mechanics.actions.<n>`,
 * `<entityId>.traits.<id>` — which {@link loadEntities} deliberately skips (they carry no entity
 * `name` to collide or leave untranslated). Their `description` / `summary` / `label` strings ARE
 * user-visible prose (the action-card blurb, the rail's grant line), so they obey the SAME
 * cross-reference lexeme rule (D2), and NOTHING was scanning them: the PS-J sweep found two action
 * blurbs reading "Canalizzare Divinità" while the feature's own name is "Incanalare Divinità".
 *
 * Returned as `Ent`s with empty `en`/`it` names so they feed ONLY the prose scan — never the
 * name-collision / untranslated / retired-NAME checks, which need a real entity name.
 */
export function loadSubEntityProse(roots: string[]): Ent[] {
  const ents: Ent[] = [];
  for (const root of roots) {
    for (const kind of KINDS) {
      const it = readSrdKind(root, "it", kind);
      if (it === undefined) continue;
      for (const [id, ivRaw] of Object.entries(it)) {
        if (!id.includes(".") || typeof ivRaw !== "object" || ivRaw === null) continue;
        const fields: string[] = [];
        proseStrings(ivRaw, fields);
        if (fields.length > 0) ents.push({ kind, id, en: "", it: "", itFields: fields });
      }
    }
  }
  return ents;
}

/**
 * DISTINCT-English entities sharing one Italian name, minus the sanctioned exact-pair collisions
 * (ALLOWED_COLLISIONS). A group is exempt only when its shared IT name and its FULL `kind:id` member
 * set match an allowlist entry exactly — an extra colliding member re-flags the group.
 */
export function findCollisions(
  ents: Ent[],
  allowed: Iterable<AllowedCollision> = ALLOWED_COLLISIONS
): { it: string; members: string[] }[] {
  const allowList = [...allowed];
  const byIt = new Map<string, Ent[]>();
  for (const e of ents) {
    if (!e.it.trim()) continue;
    const k = norm(e.it);
    const g = byIt.get(k);
    if (g) g.push(e);
    else byIt.set(k, [e]);
  }
  const out: { it: string; members: string[] }[] = [];
  for (const group of byIt.values()) {
    const distinctEn = new Set(group.map((e) => norm(e.en)));
    if (distinctEn.size <= 1) continue;
    const ids = new Set(group.map((e) => e.kind + ":" + e.id));
    const sanctioned = allowList.some(
      (a) =>
        norm(a.itName) === norm(group[0]?.it ?? "") &&
        ids.size === a.members.length &&
        a.members.every((m) => ids.has(m))
    );
    if (sanctioned) continue;
    out.push({
      it: group[0]?.it ?? "",
      members: group.map((e) => e.kind + ":" + e.id + " (" + e.en + ")"),
    });
  }
  return out;
}

/** Italian name byte-equal to English, outside the keep-English allowlist. */
export function findUntranslated(
  ents: Ent[],
  keepEnglish: Iterable<string> = KEEP_ENGLISH_SRD
): string[] {
  const keep = new Set(keepEnglish);
  return ents
    .filter((e) => e.it.trim() && norm(e.it) === norm(e.en) && !keep.has(e.en))
    .map((e) => e.kind + ":" + e.id + ' ("' + e.en + '")');
}

/** Entities whose canonical name is a retired variant. */
export function findRetiredNames(
  ents: Ent[],
  retired: Iterable<string> = RETIRED_NAMES_SRD
): string[] {
  const set = new Set(retired);
  return ents
    .filter((e) => set.has(e.it.trim()))
    .map((e) => e.kind + ":" + e.id + ' -> "' + e.it + '"');
}

/** Every string value in a shard (chrome has no `name` convention — take them all). */
function allStrings(v: unknown, out: string[]): void {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) allStrings(x, out);
  else if (v && typeof v === "object")
    for (const val of Object.values(v as Record<string, unknown>)) allStrings(val, out);
}

/** One localized CHROME string: the shard it lives in + its value. */
export type UiString = { file: string; value: string };

/**
 * Every Italian CHROME string under `<root>/it/ui/*.json` (the app's own copy, as opposed to the
 * `srd/` content catalogues `loadEntities` walks). The chrome cross-references SRD entities too —
 * conditions, actions, damage types — so the closed-set glossary has to hold HERE as well: the
 * Exhaustion collision (PS-B, 2026-07-24) was a chrome string reading "Sfinimento" while the rail
 * rubric rendered the canonical "Indebolimento" on the same screen.
 */
export function loadUiStrings(root: string, locale = "it"): UiString[] {
  const dir = resolve(root, locale, "ui");
  if (!existsSync(dir)) return [];
  const out: UiString[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const values: string[] = [];
    allStrings(JSON.parse(readFileSync(resolve(dir, file), "utf8")), values);
    for (const value of values) out.push({ file: locale + "/ui/" + file, value });
  }
  return out;
}

/**
 * Chrome strings reviving a distinctive retired lexeme — the {@link findRetiredInProse} check
 * applied to the UI shards (same Title-Case-sensitive matching, same list).
 */
export function findRetiredInUi(
  strings: ReadonlyArray<UiString>,
  retired: Iterable<string> = RETIRED_IN_PROSE_SRD
): string[] {
  const pats = [...retired].map((v) => ({
    v,
    re: new RegExp("(?<!\\p{L})" + escapeRegex(v) + "(?!\\p{L})", "u"),
  }));
  const hits: string[] = [];
  for (const s of strings)
    for (const { v, re } of pats)
      if (re.test(s.value)) hits.push(s.file + ' revives "' + v + '": ' + s.value);
  return hits;
}

/**
 * Prose fields reviving a distinctive retired lexeme. CASE-SENSITIVE by design: a genuine
 * cross-reference names the entity in Title Case ("...l'incantesimo Fiamma Continua..."), whereas an
 * ordinary descriptive phrase is lowercase ("...crea una fiamma continua..."). Matching the exact
 * Title-Case form catches real references without flagging natural Italian prose.
 */
export function findRetiredInProse(
  ents: Ent[],
  retired: Iterable<string> = RETIRED_IN_PROSE_SRD
): string[] {
  const pats = [...retired].map((v) => ({
    v,
    re: new RegExp("(?<!\\p{L})" + escapeRegex(v) + "(?!\\p{L})", "u"),
  }));
  const hits: string[] = [];
  for (const e of ents)
    for (const f of e.itFields)
      for (const { v, re } of pats)
        if (re.test(f)) {
          hits.push(e.kind + ":" + e.id + ' prose revives "' + v + '"');
          break;
        }
  return hits;
}

/**
 * Every string in every JSON shard under `<root>/<locale>/` (catalogues, their per-tranche
 * fragments and the chrome alike), tagged with its shard. Feeds the whole-corpus wording checks
 * below, which care about every sentence a player can read, not about entity names.
 */
export function loadLocaleStrings(root: string, locale = "it"): UiString[] {
  const out: UiString[] = [];
  const walk = (dir: string, rel: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(path, rel + "/" + entry.name);
      else if (entry.name.endsWith(".json")) {
        const values: string[] = [];
        allStrings(JSON.parse(readFileSync(path, "utf8")), values);
        for (const value of values) out.push({ file: rel + "/" + entry.name, value });
      }
    }
  };
  walk(resolve(root, locale), locale);
  return out;
}

/**
 * Italian strings that measure a distance in feet ("entro 30 piedi"). The Italian app measures in
 * metres like the official IT SRD 5.2.1 (5 ft = 1,5 metri), so a number followed by "piedi" is an
 * unconverted English figure, and it can sit beside a converted one in the same sentence ("un Cubo
 * di 4,5 metri entro 120 piedi"). "in piedi" (standing) has no number and is never flagged.
 */
export function findFeetDistances(strings: ReadonlyArray<UiString>): string[] {
  const re = /\d[\d.,]*\s*pied[ei](?!\p{L})/giu;
  const hits: string[] = [];
  for (const s of strings)
    for (const m of s.value.matchAll(re)) hits.push(s.file + ': "' + m[0] + '"');
  return hits;
}

/**
 * The three degrees of cover as the official IT SRD 5.2.1 prints them (the "Copertura" table and
 * glossary entry): "mezza copertura", "tre quarti di copertura", "copertura totale".
 */
export const COVER_DEGREES_IT = [
  "mezza copertura",
  "tre quarti di copertura",
  "copertura totale",
] as const;

/**
 * Every cover-degree phrase in the strings, in any word order ("Mezza Copertura", "Copertura
 * Parziale", "Copertura per Tre Quarti", "tre quarti di copertura"), whose lowercased form is not
 * one of {@link COVER_DEGREES_IT}. Letter case is free (the app titles a named state, the SRD prose
 * prints it lowercase); the words are not.
 */
export function findCoverDrift(strings: ReadonlyArray<UiString>): string[] {
  const degree = "(?:mezza|parziale|tre\\s+quarti|totale|completa|piena)";
  const re = new RegExp(
    `(?<!\\p{L})(?:${degree}\\s+(?:di\\s+)?copertura|copertura\\s+(?:(?:per|di|a)\\s+)?${degree})(?!\\p{L})`,
    "giu"
  );
  const official = new Set<string>(COVER_DEGREES_IT);
  const hits: string[] = [];
  for (const s of strings)
    for (const m of s.value.matchAll(re)) {
      const phrase = m[0].toLowerCase().replace(/\s+/g, " ");
      if (!official.has(phrase)) hits.push(s.file + ': "' + m[0] + '"');
    }
  return hits;
}
