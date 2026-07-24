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
import { readFileSync, existsSync } from "node:fs";
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
  "Clone",
  "Costume",
  "Dulcimer",
  "Goblin",
  "Goliath",
  "Halfling",
  "Piranha",
  "Pony",
  "Ranger",
  "Tiefling",
  "Tsunami",
  "Versatile ({{die}})",
  "Warlock",
];
/** Superseded public SRD names — never valid as an entity `name` again. */
export const RETIRED_NAMES_SRD: readonly string[] = [
  "Abiti Raffinati",
  "Abiti da Viaggio",
  "Accetta",
  "Acciarino",
  "Affascinare",
  "Aiuto della Terra",
  "Ammaliare Mostri",
  "Anello dell'Evocazione del Djinni",
  "Arma Crudele",
  "Arma Sacra",
  "Armatura Completa",
  "Armatura a Scaglie",
  "Armatura a Strisce",
  "Armatura ad Anelli",
  "Armi marziali",
  "Armi marziali (Accurata o Leggere)",
  "Armi marziali (Leggere)",
  "Armi marziali a distanza",
  "Assassino Fantasma",
  "Astuzia Magica",
  "Attaccante Selvaggio",
  "Auto-Ripristino",
  "Bacchetta del Vincolo",
  "Bacchetta dello Stupore",
  "Bagliore Stellare",
  "Bandire",
  "Bastone del Colpire",
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
  "Cappello di Disguise",
  "Cappello di Many Spells",
  "Caprone gigante",
  "Caraffa dell'Acqua Infinita",
  "Cavallo da corsa",
  "Ceppi Dimensionali",
  "Cervo",
  "Cintura di Dwarvenkind",
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
  "Concentrazione Elevata",
  "Confondimento",
  "Conoscenze Leggendarie",
  "Corazza",
  "Corazza Nanica",
  "Corazza di Piastre della Forma Eterea",
  "Corda dell'Arrampicata",
  "Corda dell'Intrappolamento",
  "Corno del Boato",
  "Cotta di Maglia Elfica",
  "Cotta di Scaglie di Drago",
  "Cuoio Borchiato Glamour",
  "Destriero Fedele",
  "Difensore",
  "Difesa della Natura",
  "Donnola gigante",
  "Dono della Prodezza in Combattimento",
  "Dono delle Profondità",
  "Dotazione da Esploratore di Dungeon",
  "Due Mani (se non in sella)",
  "Elmo di Brilliance",
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
  "Fiamma Continua",
  "Figurina del Potere Meraviglioso",
  "Flagello",
  "Forza Fantasmatica",
  "Forza Indomabile",
  "Frantuma",
  "Fulmine a Catena",
  "Gemma di Brightness",
  "Gergo dei Ladri",
  "Glifo di Protezione",
  "Gravità Invertita",
  "Guanti della Forza dell'Orco",
  "Guardie e Protezioni",
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
  "Invocazione Potenziata",
  "Ira Inconsapevole",
  "Kit da Scalatore",
  "Kit del Guaritore",
  "Lama Divorante",
  "Lancia Esoterica",
  "Lanciatore Nanico",
  "Lanterna Direzionale",
  "Legame Protettivo",
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
  "Manto di Resistenza agli Incantesimi",
  "Manuale dell'Esercizio Proficuo",
  "Manuale della Prontezza d'Azione",
  "Marchio del Gelo",
  "Martello delle Folgori",
  "Maschera dai Mille Volti",
  "Mazza del Castigo",
  "Mazza della Disgregazione",
  "Mente Mistica",
  "Mente Vuota",
  "Messaggero Animale",
  "Metabolismo Inquietante",
  "Miglioramento dei Punteggi di Caratteristica",
  "Muovere Terra",
  "Nimbo Sacro",
  "Non Individuazione",
  "Oathbow",
  "Occhi dell'Ammaliamento",
  "Occhi dell'Aquila",
  "Occhi della Vista Minuta",
  "Orca",
  "Orrore",
  "Palla di Fuoco a Scoppio Ritardato",
  "Parlare con le Piante",
  "Parola del Richiamo",
  "Passo Arboreo",
  "Passo Rapido",
  "Pendente della Salute",
  "Pendente di Protezione dal Veleno",
  "Pergamena degli Incantesimi",
  "Periapt della Chiusura delle Ferite",
  "Perlina di Force",
  "Perlina di Nutrimento",
  "Pietra della Buona Sorte",
  "Pietre dell'Inviare",
  "Polpo",
  "Polvere di Aridità",
  "Polvere di Sparizione",
  "Portale Cubico",
  "Potenziare Caratteristica",
  "Pozione della Lettura del Pensiero",
  "Pozione di Rimpicciolimento",
  "Presa Folgorante",
  "Proiettare Immagine",
  "Punizione Bruciante",
  "Punizione di Protezione",
  "Raggio Lunare",
  "Raggio Solare",
  "Raggio di Malattia",
  "Ratto",
  "Ratto gigante",
  "Resilienza Demoniaca",
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
  "Scalata del Ragno",
  "Scimmia",
  "Scimmia gigante",
  "Scudo Acchiappa-Frecce",
  "Scudo Antimagia",
  "Scudo di Missile Attraction",
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
  "Stivali di Andatura e Salto",
  "Talismano di Pure Good",
  "Talismano di Ultimate Evil",
  "Tiro con Arco",
  "Tocco Risanante",
  "Tomo del Pensiero Lucido",
  "Trappola da Caccia",
  "Trasporto tramite Piante",
  "Trucchetto Druidico",
  "Turibolo del Controllo degli Elementali dell'Aria",
  "Vedere il Vero",
  "Verga della Vigilanza",
  "Verga di Lordly Might",
  "Verga di Resurrection",
  "Verga di Rulership",
  "Verga di Security",
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

/** Load every entity across the given i18n roots (e.g. [".../src/i18n", ".../content-pack/i18n"]). */
export function loadEntities(roots: string[]): Ent[] {
  const ents: Ent[] = [];
  for (const root of roots) {
    for (const kind of KINDS) {
      const enP = resolve(root, "en", "srd", kind + ".json");
      const itP = resolve(root, "it", "srd", kind + ".json");
      if (!existsSync(enP) || !existsSync(itP)) continue;
      const en = JSON.parse(readFileSync(enP, "utf8")) as Record<string, unknown>;
      const it = JSON.parse(readFileSync(itP, "utf8")) as Record<string, unknown>;
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

/** DISTINCT-English entities sharing one Italian name. */
export function findCollisions(ents: Ent[]): { it: string; members: string[] }[] {
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
    if (distinctEn.size > 1)
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
